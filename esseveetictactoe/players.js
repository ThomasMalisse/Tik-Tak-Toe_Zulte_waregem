/*
 * Clubs & spelersdata — laden op aanvraag
 * --------------------------------------
 * De volledige database is bijna een megabyte; een potje gebruikt daar één of
 * twee clubs van. Daarom staat de data in `data/`, per club een bestand, en
 * halen we alleen op wat nodig is.
 *
 * `data/clubs.json`     : de 16 clubs (id, naam, clubkleuren)
 * `data/<club-id>.json` : de (oud-)spelers van die club
 * `data/bundle.js`      : alles in één, enkel voor file:// (zie hieronder)
 *
 * Beide worden gegenereerd door `python3 tools/build_players.py` — zie README.
 *
 * Per speler:
 *   name  : volledige naam (zo wordt hij getoond)
 *   pos   : positie  -> "GK" | "DEF" | "MID" | "FWD"
 *   nat   : nationaliteit (label in het Nederlands)
 *   from  : eerste jaar bij deze club (null als onbekend)
 *   to    : laatste jaar bij deze club (null = nog actief of onbekend)
 *   clubs : andere clubs uit zijn carriere (voor het "Ook bij ..."-criterium)
 */

let CLUBS = [];
const ROSTERS = {};   // club-id -> spelerslijst, gevuld zodra ze opgehaald is

/* -------------------------------------------------------------------------
 *  Validatie van binnenkomende data  —  zie SECURITY.md, punt "Datavalidatie"
 *
 *  De JSON komt over het netwerk binnen. Ook al genereren wij die bestanden
 *  zelf, het spel hoort niet blind te vertrouwen wat er terugkomt: een verkeerd
 *  bestand, een half doorgekomen antwoord of een tussenpersoon die knoeit mag
 *  hooguit tot "geen data" leiden, niet tot rare toestanden in het spel.
 *
 *  We laten alleen door wat we verwachten, en gooien de rest weg.
 * ------------------------------------------------------------------------- */

const POSITIONS = ["GK", "DEF", "MID", "FWD"];
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const CLUB_ID = /^[a-z0-9-]{1,40}$/;
const MAX_TEXT = 120;          // langste naam/nationaliteit die we accepteren
const MAX_CLUBS = 60;          // "ook bij"-lijst per speler
const MAX_ROSTER = 5000;       // spelers per club

function cleanText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MAX_TEXT) return null;
  return text;
}

function cleanYear(value) {
  return Number.isInteger(value) && value >= 1850 && value <= 2100 ? value : null;
}

function cleanClub(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && CLUB_ID.test(raw.id) ? raw.id : null;
  const name = cleanText(raw.name);
  const colors = Array.isArray(raw.colors)
    ? raw.colors.filter((c) => typeof c === "string" && HEX_COLOR.test(c)).slice(0, 2)
    : [];
  if (!id || !name || colors.length !== 2) return null;
  return { id, name, colors };
}

function cleanPlayer(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = cleanText(raw.name);
  const nat = cleanText(raw.nat);
  if (!name || !nat || !POSITIONS.includes(raw.pos)) return null;
  const clubs = Array.isArray(raw.clubs)
    ? raw.clubs.map(cleanText).filter(Boolean).slice(0, MAX_CLUBS)
    : [];
  const intl = Array.isArray(raw.intl)
    ? raw.intl.map(cleanText).filter(Boolean).slice(0, 5)
    : [];
  return { name, pos: raw.pos, nat, from: cleanYear(raw.from), to: cleanYear(raw.to),
           clubs, intl };
}

function cleanClubs(raw) {
  if (!Array.isArray(raw)) throw new Error("clubs.json heeft niet de verwachte vorm");
  const clubs = raw.map(cleanClub).filter(Boolean);
  if (!clubs.length) throw new Error("clubs.json bevat geen bruikbare clubs");
  return clubs;
}

function cleanRoster(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ROSTER).map(cleanPlayer).filter(Boolean);
}

/*
 * Open je index.html rechtstreeks vanaf schijf, dan blokkeert de browser elke
 * fetch naar een lokaal bestand. Een <script>-tag mag daar wél, dus laden we
 * in dat geval data/bundle.js — alles in één keer. Via een webserver blijven
 * we per club laden, wat een pak lichter is.
 */
const LOCAL_FILE = typeof location !== "undefined" && location.protocol === "file:";

let bundlePromise = null;

function loadBundle() {
  if (!bundlePromise) {
    bundlePromise = new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = "data/bundle.js";
      tag.onload = () => {
        if (window.__BKE_DATA) resolve(window.__BKE_DATA);
        else reject(new Error("data/bundle.js bevat geen data"));
      };
      tag.onerror = () => reject(new Error("data/bundle.js niet gevonden"));
      document.head.appendChild(tag);
    });
  }
  return bundlePromise;
}

/*
 * Alleen eigen bestanden onder data/ ophalen. `credentials: "omit"` en
 * `mode: "same-origin"` maken expliciet wat we willen: geen cookies mee,
 * en niets van een andere host — ook niet als er ooit een omleiding tussen komt.
 */
function dataUrl(file) {
  if (!/^[a-z0-9-]{1,40}\.json$/.test(file)) {
    throw new Error("ongeldige databestandsnaam: " + file);
  }
  return "data/" + file;
}

async function fetchJson(path) {
  const res = await fetch(path, {
    cache: "no-cache", credentials: "omit", mode: "same-origin", redirect: "error",
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// Onthoudt de lopende aanvraag, zodat wie sneller doorklikt dan het netwerk
// gewoon op dezelfde belofte wacht in plaats van op een lege clublijst te botsen.
let clubsPromise = null;

function loadClubs() {
  if (!clubsPromise) {
    clubsPromise = LOCAL_FILE
      ? loadBundle().then((data) => (CLUBS = cleanClubs(data.clubs)))
      : fetchJson(dataUrl("clubs.json")).then((clubs) => (CLUBS = cleanClubs(clubs)));
  }
  return clubsPromise;
}

function clubById(id) {
  return CLUBS.find((c) => c.id === id) || null;
}

// Haalt de rosters op die nog niet in het geheugen zitten.
async function loadRosters(clubIds) {
  const missing = clubIds.filter((id) => !ROSTERS[id]);
  if (!missing.length) return;
  if (LOCAL_FILE) {
    const data = await loadBundle();
    missing.forEach((id) => { ROSTERS[id] = cleanRoster(data.rosters[id]); });
    return;
  }
  await Promise.all(
    missing.map(async (id) => {
      ROSTERS[id] = cleanRoster(await fetchJson(dataUrl(id + ".json")));
    })
  );
}

function rosterFor(clubId) {
  return ROSTERS[clubId] || [];
}
