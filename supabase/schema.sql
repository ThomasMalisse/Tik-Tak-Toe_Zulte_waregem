-- =========================================================================
--  Boter Kaas & Eieren — online potjes
--
--  Draai dit één keer in de SQL Editor van je Supabase-project.
--  Zie SECURITY.md voor de uitleg bij de keuzes hieronder.
--
--  Kern van het ontwerp: de browser krijgt de anon-sleutel, en die is
--  publiek — iedereen kan hem uit de broncode lezen. De beveiliging komt dus
--  NIET van het geheimhouden van die sleutel, maar van Row Level Security:
--
--    * `games`        : iedereen mag lezen, niemand mag rechtstreeks schrijven
--    * `game_tokens`  : niemand mag lezen of schrijven, ook niet met de sleutel
--    * de functies    : de enige weg naar binnen, en ze controleren eerst
--
--  De geheime tokens staan bewust in een APARTE tabel. Zaten ze in `games`,
--  dan zou de leespolicy op die tabel ze mee teruggeven en kon je tegenstander
--  jouw token lezen en in jouw plaats spelen.
-- =========================================================================

drop function if exists public.finish_game(text, text, text);
drop function if exists public.play_move(text, text, int, text);
drop function if exists public.join_game(text, text);
drop function if exists public.create_game(text, text[], jsonb, jsonb, text);
drop table if exists public.game_tokens;
drop table if exists public.games;

-- -------------------------------------------------------------------------
--  Het potje zelf. Hier staat niets geheims in.
-- -------------------------------------------------------------------------
create table public.games (
  id          uuid primary key default gen_random_uuid(),

  -- Korte code die je deelt, bv. "ESSV-4821"
  code        text not null unique,

  -- Welke club(s) dit potje gebruikt, en welke criteria op de assen staan.
  -- We bewaren enkel de id's van de categorieen ("pos:GK", "club:KAA Gent");
  -- beide browsers bouwen daaruit hetzelfde raster op uit hun eigen data.
  club_ids    text[] not null,
  row_ids     jsonb  not null,
  col_ids     jsonb  not null,

  -- Negen vakjes: null of {"player":"X","name":"Sven Kums"}
  board       jsonb  not null default '[null,null,null,null,null,null,null,null,null]'::jsonb,

  turn        text    not null default 'X' check (turn in ('X','O')),
  finished    boolean not null default false,
  winner      text    check (winner in ('X','O','draw')),
  joined      boolean not null default false,   -- is de tweede speler er al?

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index games_code_idx on public.games (code);

-- -------------------------------------------------------------------------
--  De geheimen. Eén rij per speler; bewijst wie je bent bij een zet.
-- -------------------------------------------------------------------------
create table public.game_tokens (
  game_id  uuid not null references public.games(id) on delete cascade,
  player   text not null check (player in ('X','O')),
  token    text not null,
  primary key (game_id, player)
);

-- =========================================================================
--  Row Level Security
-- =========================================================================

alter table public.games       enable row level security;
alter table public.game_tokens enable row level security;

-- `games`: lezen mag. Je hebt de code nodig om iets te vinden, en er staat
-- niets persoonlijks in. Schrijven mag niet — er is bewust GEEN policy voor
-- insert, update of delete. Zonder policy weigert Postgres.
create policy "iedereen mag een potje lezen"
  on public.games for select
  to anon, authenticated
  using (true);

-- `game_tokens`: RLS staat aan en er is GEEN ENKELE policy. Met de anon-sleutel
-- kan je deze tabel dus niet lezen, niet schrijven, niet verwijderen. Alleen
-- de functies hieronder komen erbij, want die draaien als de eigenaar.
-- Te testen: select * from game_tokens;  -> levert nul rijen op vanuit de app.

-- =========================================================================
--  Functies — de enige manier om iets te wijzigen
--
--  security definer : de functie draait met de rechten van de eigenaar en mag
--                     dus wel schrijven, terwijl de aanroeper dat niet mag.
--  set search_path  : vastgezet, zodat niemand via een eigen schema kan
--                     omleiden welke tabel er geraakt wordt.
-- =========================================================================

create or replace function public.create_game(
  p_code     text,
  p_club_ids text[],
  p_row_ids  jsonb,
  p_col_ids  jsonb,
  p_token    text
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

  insert into public.games (code, club_ids, row_ids, col_ids)
  values (p_code, p_club_ids, p_row_ids, p_col_ids)
  returning * into v_game;

  insert into public.game_tokens (game_id, player, token)
  values (v_game.id, 'X', p_token);

  return v_game;
end;
$$;

create or replace function public.join_game(p_code text, p_token text)
returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_game public.games;
  v_mine text;
begin
  select * into v_game from public.games where code = p_code for update;
  if not found then
    raise exception 'potje niet gevonden';
  end if;
  if p_token is null or length(p_token) not between 20 and 100 then
    raise exception 'ongeldig token';
  end if;

  -- Hoor je hier al bij? Dan gewoon opnieuw binnenlaten (refresh, ander tabblad).
  select player into v_mine from public.game_tokens
   where game_id = v_game.id and token = p_token;
  if v_mine is not null then
    return v_game;
  end if;

  if v_game.joined then
    raise exception 'dit potje heeft al twee spelers';
  end if;

  insert into public.game_tokens (game_id, player, token)
  values (v_game.id, 'O', p_token);

  update public.games set joined = true, updated_at = now()
   where id = v_game.id
  returning * into v_game;

  return v_game;
end;
$$;

create or replace function public.play_move(
  p_code  text,
  p_token text,
  p_idx   int,
  p_name  text          -- null = fout geraden, beurt gaat over zonder vakje
) returns public.games
language plpgsql security definer set search_path = public
as $$
declare
  v_game   public.games;
  v_player text;
  v_board  jsonb;
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
  if v_game.board -> p_idx <> 'null'::jsonb then
    raise exception 'dat vakje is al bezet';
  end if;
  if p_name is not null and length(p_name) > 120 then
    raise exception 'naam te lang';
  end if;

  -- Elke speler mag maar één keer in het raster.
  if p_name is not null and exists (
    select 1 from jsonb_array_elements(v_game.board) cell
     where cell -> 'name' = to_jsonb(p_name)
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
         updated_at = now()
   where id = v_game.id
  returning * into v_game;

  return v_game;
end;
$$;

-- De uitslag volgt uit het bord, dus elke deelnemer mag het einde vastleggen.
create or replace function public.finish_game(
  p_code text, p_token text, p_winner text
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
  if p_winner is not null and p_winner not in ('X', 'O', 'draw') then
    raise exception 'ongeldige uitslag';
  end if;

  update public.games
     set finished = true, winner = p_winner, updated_at = now()
   where id = v_game.id
  returning * into v_game;

  return v_game;
end;
$$;

grant execute on function public.create_game(text, text[], jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.join_game(text, text)                          to anon, authenticated;
grant execute on function public.play_move(text, text, int, text)               to anon, authenticated;
grant execute on function public.finish_game(text, text, text)                  to anon, authenticated;

-- =========================================================================
--  Realtime: beide browsers volgen wijzigingen op `games`.
--  Realtime respecteert RLS, en die tabel bevat geen geheimen meer — de
--  tokens staan in game_tokens, dat niemand mag lezen. Veilig dus.
-- =========================================================================

alter publication supabase_realtime add table public.games;

-- Oude potjes opruimen. Roep dit af en toe aan, of zet er een cron op via
-- de Supabase-extensie pg_cron.
create or replace function public.cleanup_old_games() returns void
language sql security definer set search_path = public as $$
  delete from public.games where created_at < now() - interval '2 days';
$$;
