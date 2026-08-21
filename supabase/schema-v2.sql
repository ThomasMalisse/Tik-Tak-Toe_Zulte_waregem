-- =========================================================================
--  Uitbreiding v2 — rematch, steals en matchmaking
--
--  Draai dit ná schema.sql in de SQL Editor. Het is veilig om opnieuw te
--  draaien: bestaande potjes blijven staan.
--
--  Drie dingen komen erbij:
--    * rematch    : na een potje kan je de ander een nieuw potje aanbieden
--    * steals     : drie per speler, om een vakje van de ander over te nemen
--    * matchmaking: een potje openzetten voor een willekeurige tegenstander
-- =========================================================================

alter table public.games
  add column if not exists steals_on     boolean not null default false,
  add column if not exists x_steals      int     not null default 3,
  add column if not exists o_steals      int     not null default 3,
  add column if not exists rematch_code  text,
  add column if not exists is_open       boolean not null default false;

-- Wachtende open potjes vind je zo meteen terug.
create index if not exists games_open_idx
  on public.games (is_open, joined, created_at)
  where is_open and not joined;

-- -------------------------------------------------------------------------
--  create_game opnieuw, nu met steals en "openzetten voor iedereen"
-- -------------------------------------------------------------------------
drop function if exists public.create_game(text, text[], jsonb, jsonb, text);
drop function if exists public.create_game(text, text[], jsonb, jsonb, text, boolean, boolean);

create or replace function public.create_game(
  p_code      text,
  p_club_ids  text[],
  p_row_ids   jsonb,
  p_col_ids   jsonb,
  p_token     text,
  p_steals    boolean default false,
  p_open      boolean default false
) returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_game public.games;
begin
  if p_code !~ '^[A-Z0-9-]{4,16}$' then
    raise exception 'ongeldige code';
  end if;
  if p_token is null or length(p_token) not between 20 and 100 then
    raise exception 'ongeldig token';
  end if;
  if array_length(p_club_ids, 1) not between 1 and 2 then
    raise exception 'een potje gebruikt één of twee clubs';
  end if;
  if jsonb_array_length(p_row_ids) <> 3 or jsonb_array_length(p_col_ids) <> 3 then
    raise exception 'een raster heeft 3 rijen en 3 kolommen';
  end if;

  insert into public.games (code, club_ids, row_ids, col_ids, steals_on, is_open)
  values (p_code, p_club_ids, p_row_ids, p_col_ids, p_steals, p_open)
  returning * into v_game;

  insert into public.game_tokens (game_id, player, token)
  values (v_game.id, 'X', p_token);

  return v_game;
end;
$$;

-- -------------------------------------------------------------------------
--  play_move opnieuw: een bezet vakje mag je stelen als je er nog over hebt
-- -------------------------------------------------------------------------
create or replace function public.play_move(
  p_code  text,
  p_token text,
  p_idx   int,
  p_name  text          -- null = fout geraden, beurt gaat over zonder vakje
) returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_game    public.games;
  v_player  text;
  v_board   jsonb;
  v_bezet   jsonb;
  v_steal   boolean := false;
begin
  select * into v_game from public.games where code = p_code for update;
  if not found then
    raise exception 'potje niet gevonden';
  end if;
  if v_game.finished then
    raise exception 'dit potje is afgelopen';
  end if;

  -- Wie ben jij? Alleen je token bepaalt dat, niet wat de browser beweert.
  select player into v_player from public.game_tokens
   where game_id = v_game.id and token = p_token;
  if v_player is null then
    raise exception 'je hoort niet bij dit potje';
  end if;
  if v_player <> v_game.turn then
    raise exception 'je bent niet aan zet';
  end if;
  if p_idx < 0 or p_idx > 8 then
    raise exception 'vakje bestaat niet';
  end if;
  if p_name is not null and length(p_name) > 120 then
    raise exception 'naam te lang';
  end if;

  v_bezet := v_game.board -> p_idx;

  if v_bezet <> 'null'::jsonb then
    -- Een bezet vakje: dat kan alleen met een steal, en alleen van de ander.
    if not v_game.steals_on then
      raise exception 'dat vakje is al bezet';
    end if;
    if v_bezet ->> 'player' = v_player then
      raise exception 'dat vakje is al van jou';
    end if;
    if (v_player = 'X' and v_game.x_steals < 1)
       or (v_player = 'O' and v_game.o_steals < 1) then
      raise exception 'je hebt geen steals meer';
    end if;
    if p_name is null then
      raise exception 'om te stelen moet je een speler noemen';
    end if;
    -- Je moet een ándere speler noemen dan wie er staat.
    if v_bezet ->> 'name' = p_name then
      raise exception 'noem een andere speler dan wie er al staat';
    end if;
    v_steal := true;
  end if;

  -- Elke speler mag maar één keer in het raster staan. Bij een steal telt de
  -- naam die we vervangen niet mee, want die verdwijnt.
  if p_name is not null and exists (
    select 1 from jsonb_array_elements(v_game.board) with ordinality as t(cell, i)
     where t.cell -> 'name' = to_jsonb(p_name)
       and (not v_steal or t.i - 1 <> p_idx)
  ) then
    raise exception 'die speler is al gebruikt';
  end if;

  v_board := v_game.board;
  if p_name is not null then
    v_board := jsonb_set(v_board, array[p_idx::text],
                         jsonb_build_object('player', v_player, 'name', p_name));
  end if;

  update public.games
     set board = v_board,
         turn = case when turn = 'X' then 'O' else 'X' end,
         x_steals = x_steals - (case when v_steal and v_player = 'X' then 1 else 0 end),
         o_steals = o_steals - (case when v_steal and v_player = 'O' then 1 else 0 end),
         updated_at = now()
   where id = v_game.id
  returning * into v_game;

  return v_game;
end;
$$;

-- -------------------------------------------------------------------------
--  Rematch: de ene maakt een nieuw potje en wijst er vanuit het oude naar
-- -------------------------------------------------------------------------
create or replace function public.offer_rematch(
  p_code text, p_token text, p_new_code text
) returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where code = p_code for update;
  if not found then
    raise exception 'potje niet gevonden';
  end if;
  if not exists (select 1 from public.game_tokens
                  where game_id = v_game.id and token = p_token) then
    raise exception 'je hoort niet bij dit potje';
  end if;
  if p_new_code !~ '^[A-Z0-9-]{4,16}$' then
    raise exception 'ongeldige code';
  end if;
  if not exists (select 1 from public.games where code = p_new_code) then
    raise exception 'dat nieuwe potje bestaat niet';
  end if;

  update public.games
     set rematch_code = p_new_code, updated_at = now()
   where id = v_game.id
  returning * into v_game;

  return v_game;
end;
$$;

-- -------------------------------------------------------------------------
--  Matchmaking: pak het oudste open potje dat nog op iemand wacht
-- -------------------------------------------------------------------------
create or replace function public.find_open_game(p_token text)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_game public.games;
begin
  if p_token is null or length(p_token) not between 20 and 100 then
    raise exception 'ongeldig token';
  end if;

  -- skip locked: twee mensen die tegelijk zoeken pakken niet hetzelfde potje.
  select * into v_game
    from public.games
   where is_open and not joined and not finished
     and created_at > now() - interval '15 minutes'
     and id not in (select game_id from public.game_tokens where token = p_token)
   order by created_at
   for update skip locked
   limit 1;

  if not found then
    return null;    -- niets vrij; de client maakt er zelf een aan
  end if;

  insert into public.game_tokens (game_id, player, token)
  values (v_game.id, 'O', p_token);

  update public.games set joined = true, is_open = false, updated_at = now()
   where id = v_game.id
  returning * into v_game;

  return v_game;
end;
$$;

grant execute on function public.create_game(text, text[], jsonb, jsonb, text, boolean, boolean) to anon, authenticated;
grant execute on function public.offer_rematch(text, text, text)  to anon, authenticated;
grant execute on function public.find_open_game(text)             to anon, authenticated;
