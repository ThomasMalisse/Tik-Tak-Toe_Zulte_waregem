/* =========================================================================
 *  Online potjes  —  praat met Supabase
 *
 *  Verantwoordelijkheid van dit bestand: een potje aanmaken, eraan meedoen,
 *  zetten doorsturen, en wijzigingen van de tegenstander binnenkrijgen.
 *  Het weet niets van spelregels of van het scherm — dat blijft in game.js.
 *
 *  Wat er NIET in staat: de beslissing of een zet mag. Die neemt de database,
 *  in play_move(). Deze code kan dus liegen zoveel ze wil; ze krijgt gewoon
 *  een foutmelding terug. Zie SECURITY.md.
 * ========================================================================= */

const ONLINE = {
  client: null,     // supabase-js client
  channel: null,    // realtime-abonnement
  code: null,       // code van het huidige potje
  token: null,      // ons geheim voor dit potje
  seat: null,       // "X" of "O" — welke speler zijn wij?
  game: null,       // laatst bekende toestand uit de database
  heartbeat: null,  // timer die naast Realtime af en toe zelf gaat kijken
  onUpdate: null,   // callback naar game.js
};

/* ---------- Verbinding ---------- */

function onlineClient() {
  if (!ONLINE_ENABLED) throw new Error("Supabase is niet ingesteld (zie config.js)");
  if (!ONLINE.client) {
    ONLINE.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },   // we loggen niet in; niets te bewaren
    });
  }
  return ONLINE.client;
}

/* ---------- Codes en geheimen ---------- */

// Leesbare code zonder tekens die je kan verwarren (0/O, 1/I).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomFrom(alphabet, length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function newCode() {
  return "ESSV-" + randomFrom(CODE_ALPHABET, 5);
}

/*
 * Het token bewijst wie je bent bij een zet. Het wordt met crypto-sterke
 * willekeur gemaakt (niet Math.random, dat is voorspelbaar) en gaat nooit
 * over de lijn behalve als bewijs bij een eigen zet.
 */
function newToken() {
  return randomFrom("abcdefghijklmnopqrstuvwxyz0123456789", 32);
}

function tokenKey(code) {
  return "bke-token:" + code;
}

function rememberToken(code, token) {
  try { localStorage.setItem(tokenKey(code), token); } catch (e) { /* niet erg */ }
}

function recallToken(code) {
  try {
    const t = localStorage.getItem(tokenKey(code));
    return t && /^[a-z0-9]{32}$/.test(t) ? t : null;
  } catch (e) { return null; }
}

/* ---------- Een potje starten of eraan meedoen ---------- */

// `wantedCode` is optioneel; zonder wordt er een willekeurige gemaakt.
async function onlineCreate(clubIds, rowIds, colIds, wantedCode, opties = {}) {
  const code = wantedCode || newCode();
  const token = newToken();
  const { data, error } = await onlineClient().rpc("create_game", {
    p_code: code, p_club_ids: clubIds,
    p_row_ids: rowIds, p_col_ids: colIds, p_token: token,
    p_steals: Boolean(opties.steals), p_open: Boolean(opties.open),
  });
  if (error) throw new Error(error.message);

  rememberToken(code, token);
  Object.assign(ONLINE, { code, token, seat: "X", game: data });
  await onlineSubscribe(code);
  return data;
}

async function onlineJoin(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,16}$/.test(code)) throw new Error("Dat is geen geldige code.");

  // Kom je terug in een potje waar je al in zat, dan hergebruiken we je token.
  const token = recallToken(code) || newToken();
  const { data, error } = await onlineClient().rpc("join_game", {
    p_code: code, p_token: token,
  });
  if (error) throw new Error(error.message);

  rememberToken(code, token);
  // Wie X is, weten we uit wie het potje aanmaakte: als wij het token van bij
  // het aanmaken hebben, zijn we X, anders O.
  const seat = ONLINE.code === code && ONLINE.seat ? ONLINE.seat : "O";
  Object.assign(ONLINE, { code, token, seat, game: data });
  await onlineSubscribe(code);
  return data;
}

/* ---------- Live meekijken ---------- */

async function onlineSubscribe(code) {
  await onlineLeave(false);
  ONLINE.channel = onlineClient()
    .channel("game:" + code)
    .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: "code=eq." + code },
        (payload) => {
          ONLINE.game = payload.new;
          if (typeof ONLINE.onUpdate === "function") ONLINE.onUpdate(payload.new);
        })
    .subscribe();
  onlineStartHeartbeat();
}

/*
 * Vangnet naast Realtime.
 *
 * Realtime is snel maar niet gegarandeerd: een bericht kan wegvallen bij een
 * haperende verbinding, en vlak na het abonneren is er een klein venster waarin
 * wijzigingen nog niet doorkomen (gemeten: een update binnen ~2s na het
 * aanmaken van de rij mist). Zonder vangnet blijft het wachtscherm dan hangen.
 *
 * Daarom vragen we er elke paar seconden ook gewoon zelf naar. Dat is goedkoop
 * — één rij — en het maakt het verschil tussen "meestal" en "altijd".
 */
const HEARTBEAT_MS = 3000;

function onlineStartHeartbeat() {
  onlineStopHeartbeat();
  ONLINE.heartbeat = setInterval(async () => {
    try {
      const before = ONLINE.game && ONLINE.game.updated_at;
      const now = await onlineRefresh();
      if (now && now.updated_at !== before && typeof ONLINE.onUpdate === "function") {
        ONLINE.onUpdate(now);
      }
    } catch (e) { /* volgende keer beter */ }
  }, HEARTBEAT_MS);
}

function onlineStopHeartbeat() {
  if (ONLINE.heartbeat) {
    clearInterval(ONLINE.heartbeat);
    ONLINE.heartbeat = null;
  }
}

async function onlineLeave(forget = true) {
  onlineStopHeartbeat();
  if (ONLINE.channel) {
    try { await onlineClient().removeChannel(ONLINE.channel); } catch (e) { /* weg is weg */ }
    ONLINE.channel = null;
  }
  if (forget) {
    Object.assign(ONLINE, { code: null, token: null, seat: null, game: null });
  }
}

/* ---------- Zetten ---------- */

// `name` is null als er fout geraden is: de beurt gaat over zonder vakje.
async function onlineMove(idx, name) {
  const { data, error } = await onlineClient().rpc("play_move", {
    p_code: ONLINE.code, p_token: ONLINE.token, p_idx: idx, p_name: name,
  });
  if (error) throw new Error(error.message);
  ONLINE.game = data;
  return data;
}

async function onlineFinish(winner) {
  const { data, error } = await onlineClient().rpc("finish_game", {
    p_code: ONLINE.code, p_token: ONLINE.token, p_winner: winner,
  });
  if (error) throw new Error(error.message);
  ONLINE.game = data;
  return data;
}

// Nieuwste toestand ophalen, bv. na terugkeren uit een slapend tabblad.
async function onlineRefresh() {
  if (!ONLINE.code) return null;
  const { data, error } = await onlineClient()
    .from("games").select("*").eq("code", ONLINE.code).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) ONLINE.game = data;
  return data;
}

/* ---------- Rematch ---------- */

/*
 * De ene speler maakt een nieuw potje aan en hangt de nieuwe code aan het oude.
 * De ander ziet dat via Realtime binnenkomen en kan met één klik mee.
 */
async function onlineOfferRematch(newCode) {
  const { error } = await onlineClient().rpc("offer_rematch", {
    p_code: ONLINE.code, p_token: ONLINE.token, p_new_code: newCode,
  });
  if (error) throw new Error(error.message);
}

/* ---------- Tegen een onbekende ---------- */

/*
 * Eerst kijken of er iemand staat te wachten. Zo niet, dan geeft dit null terug
 * en zet de client zelf een potje open.
 */
async function onlineFindOpen() {
  const token = newToken();
  const { data, error } = await onlineClient().rpc("find_open_game", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  if (!data) return null;

  rememberToken(data.code, token);
  Object.assign(ONLINE, { code: data.code, token, seat: "O", game: data });
  await onlineSubscribe(data.code);
  return data;
}

/* ---------- Deelbare link ---------- */

function onlineShareUrl(code) {
  const url = new URL(location.href);
  url.hash = "";
  url.search = "?potje=" + encodeURIComponent(code);
  return url.toString();
}

// Code uit de URL halen als iemand via een uitnodiging binnenkomt.
function onlineCodeFromUrl() {
  const raw = new URLSearchParams(location.search).get("potje");
  const code = String(raw || "").trim().toUpperCase();
  return /^[A-Z0-9-]{4,16}$/.test(code) ? code : null;
}
