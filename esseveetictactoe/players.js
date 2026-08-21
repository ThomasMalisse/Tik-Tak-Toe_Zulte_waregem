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

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// Onthoudt de lopende aanvraag, zodat wie sneller doorklikt dan het netwerk
// gewoon op dezelfde belofte wacht in plaats van op een lege clublijst te botsen.
let clubsPromise = null;

function loadClubs() {
  if (!clubsPromise) {
    clubsPromise = LOCAL_FILE
      ? loadBundle().then((data) => (CLUBS = data.clubs))
      : fetchJson("data/clubs.json").then((clubs) => (CLUBS = clubs));
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
    missing.forEach((id) => { ROSTERS[id] = data.rosters[id] || []; });
    return;
  }
  await Promise.all(
    missing.map(async (id) => { ROSTERS[id] = await fetchJson(`data/${id}.json`); })
  );
}

function rosterFor(clubId) {
  return ROSTERS[clubId] || [];
}
