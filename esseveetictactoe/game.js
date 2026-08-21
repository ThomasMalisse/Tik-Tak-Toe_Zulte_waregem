/* =========================================================================
 *  Boter Kaas & Eieren — Belgische editie
 *  Start -> Overzicht (3 spelmodi) -> [Clubkeuze] -> Spel
 *  Twee spelers (X en O) claimen om beurten een vakje door een speler te
 *  noemen die voor de gekozen club(s) speelde én aan het rij-/kolomcriterium
 *  voldoet.
 * ========================================================================= */

const $ = (sel) => document.querySelector(sel);

/* ---------- Hulpfuncties: naam-normalisatie & matching ---------- */

function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accenten weg
    .replace(/[^a-z0-9]+/g, " ")     // leestekens -> spatie
    .trim()
    .replace(/\s+/g, " ");
}

// Geeft de speler terug die bij de ingetypte naam past, uit een toegestane set.
function matchPlayer(input, allowed) {
  const q = normalize(input);
  if (!q) return null;
  const qCompact = q.replace(/ /g, "");

  for (const p of allowed) {
    const full = normalize(p.name);
    const fullCompact = full.replace(/ /g, "");
    if (full === q || fullCompact === qCompact) return p;
  }
  // Achternaam-match (bv. "kums", "hazard", "de sart") — minstens 4 tekens
  if (qCompact.length >= 4) {
    for (const p of allowed) {
      const fullCompact = normalize(p.name).replace(/ /g, "");
      if (fullCompact.endsWith(qCompact)) return p;
    }
  }
  return null;
}

// Spelers uit de pool waarvan de naam op de invoer lijkt, voor de suggestielijst.
// Bewust de hele pool — niet enkel de juiste antwoorden, anders verklap je het vakje.
function suggestPlayers(input, allowed, limit = 8) {
  const q = normalize(input);
  if (q.length < 2) return [];
  const exact = [];    // precies deze naam
  const starts = [];   // naam of een woord daarin begint ermee
  const contains = []; // komt ergens in de naam voor
  for (const p of allowed) {
    const full = normalize(p.name);
    if (full === q) {
      exact.push(p);
    } else if (full.startsWith(q) || full.split(" ").some((w) => w.startsWith(q))) {
      starts.push(p);
    } else if (full.includes(q)) {
      contains.push(p);
    }
  }
  return exact.concat(starts, contains).slice(0, limit);
}

/* =========================================================================
 *  DOM-opbouw  —  zie SECURITY.md, punt "XSS"
 *
 *  Spelersnamen, nationaliteiten en clublabels komen van Wikidata en Wikipedia.
 *  Dat is data van derden die wij niet controleren: er staan echt dingen in als
 *  "Brighton & Hove Albion FC" en 'Hendricus "Henk" Heijt', en er kan morgen
 *  iets ergers in staan omdat iedereen die pagina's kan bewerken.
 *
 *  Daarom bouwen we het scherm op met createElement + textContent, en nooit
 *  door zulke tekst in een HTML-string te plakken. Tekst die via textContent
 *  binnenkomt wordt door de browser per definitie als tekst behandeld en nooit
 *  als markup — er valt dus niets te ontsnappen. Dat is sterker dan escapen,
 *  want je kan niet vergeten te escapen wat je nooit als HTML aanbiedt.
 * ========================================================================= */

// <tag class="..">tekst</tag>. `text` gaat altijd via textContent.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

// Maakt een element leeg zonder innerHTML te gebruiken.
function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function replaceChildren(node, ...children) {
  clear(node);
  children.filter(Boolean).forEach((c) => node.appendChild(c));
  return node;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Rastergeneratie ---------- */

// Zijn er (minstens `min`) spelers die aan beide criteria voldoen en nog vrij zijn?
function cellSolvable(rowCat, colCat, players, usedNames, min = 1) {
  let n = 0;
  for (const p of players) {
    if (rowCat.test(p) && colCat.test(p) && !usedNames.has(p.name)) {
      if (++n >= min) return true;
    }
  }
  return false;
}

/*
 * Kies 3 rij- en 3 kolomcategorieën zodat elk vakje minstens één oplossing heeft.
 *
 * Blind 6 categorieën trekken werkt niet meer nu er honderden criteria zijn:
 * de meeste daarvan hebben maar een handvol spelers en snijden elkaar zelden.
 * Daarom eerst de ruimste categorieën als kandidaten nemen, en de kolommen
 * er één voor één bij zoeken zodat ze tegen álle drie de rijen oplosbaar zijn.
 */
/*
 * Hoeveel van de ruimste categorieën per soort mogen meedoen. Zonder quotum
 * verdringen de "Ook bij ..."-criteria de rest: er zijn honderden clubs maar
 * maar vier posities.
 */
const KIND_QUOTA = { pos: 4, era: 8, nat: 10, club: 16 };
const GRID_ATTEMPTS = 400;
const MIN_SOLUTIONS = 2;   // liefst geen vakje met maar één mogelijke naam

function gridCandidates(pool, players) {
  const size = new Map(pool.map((c) => [c.id, playersForCategory(c, players).length]));
  const byKind = {};
  pool.forEach((c) => (byKind[c.kind] = byKind[c.kind] || []).push(c));
  return Object.keys(byKind).flatMap((kind) =>
    byKind[kind]
      .sort((a, b) => size.get(b.id) - size.get(a.id))
      .slice(0, KIND_QUOTA[kind] || 10)
  );
}

function tryGrid(candidates, players, min) {
  const empty = new Set();
  for (let attempt = 0; attempt < GRID_ATTEMPTS; attempt++) {
    const order = shuffle(candidates);
    const rows = order.slice(0, 3);
    const cols = [];
    for (const c of order.slice(3)) {
      if (rows.every((r) => cellSolvable(r, c, players, empty, min))) cols.push(c);
      if (cols.length === 3) return { rows, cols };
    }
  }
  return null;
}

function generateGrid(players) {
  const pool = eligibleCategories(players, 3);
  if (pool.length < 6) return null;
  const candidates = gridCandidates(pool, players);
  // Kleine clubs halen de twee-oplossingen-eis niet altijd; dan toch maar één.
  return tryGrid(candidates, players, MIN_SOLUTIONS) ||
         tryGrid(candidates, players, 1);
}

/* ---------- Spelstatus ---------- */

const state = {
  mode: null,        // "essevee" | "club" | "belgium"
  clubIds: [],        // 1 club, of 2 bij "Heel België"
  players: [],         // actieve spelerspool voor dit potje
  rows: [],
  cols: [],
  board: [],       // 9 cellen: null of { player: "X"/"O", name: "Speler" }
  current: "X",
  usedNames: new Set(),
  finished: false,
  winner: null,    // "X" | "O" | "draw" | null
  stuck: false,    // geeindigd omdat geen enkel open vakje nog oplosbaar was
  playable: true,  // false als er geen oplosbaar raster gemaakt kon worden
  score: { X: 0, O: 0, draw: 0 },
  online: false,     // potje via Supabase, tegen iemand op een ander toestel
  seat: null,        // welke speler zijn wij online: "X" of "O"
  solo: false,       // in je eentje: negen pogingen voor negen vakjes
  guessesLeft: 0,
  best: 0,           // beste aantal vakjes ooit met deze club(s)
};

// In je eentje krijg je evenveel pogingen als vakjes — juist of fout, elke gok
// telt. Dat is de druk die in de tweespelersmodus van de tegenstander komt.
const SOLO_GUESSES = 9;

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rijen
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // kolommen
  [0, 4, 8], [2, 4, 6],            // diagonalen
];

function checkWinner() {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (
      state.board[a] && state.board[b] && state.board[c] &&
      state.board[a].player === state.board[b].player &&
      state.board[b].player === state.board[c].player
    ) {
      return { player: state.board[a].player, line };
    }
  }
  if (state.board.every((cell) => cell !== null)) return { player: "draw", line: null };
  return null;
}

/* ---------- Thema (clubkleuren toepassen) ---------- */

function applyTheme(colors) {
  document.documentElement.style.setProperty("--gc1", colors[0]);
  document.documentElement.style.setProperty("--gc2", colors[1]);
}

/* ---------- Potje starten ---------- */

function headerInfoFor(mode, clubIds) {
  if (mode === "essevee") {
    const club = clubById("zulte-waregem");
    return { title: club.name, eyebrow: "Boter kaas & eieren", colors: club.colors };
  }
  if (mode === "club") {
    const club = clubById(clubIds[0]);
    return { title: club.name, eyebrow: "Boter kaas & eieren", colors: club.colors };
  }
  // belgium
  const a = clubById(clubIds[0]);
  const b = clubById(clubIds[1]);
  return { title: `${a.name} vs ${b.name}`, eyebrow: "Belgische clash", colors: [a.colors[0], b.colors[0]] };
}

async function startGame(mode, clubIds) {
  state.mode = mode;
  state.clubIds = clubIds;

  try {
    await loadClubs();   // kan al binnen zijn; anders wachten we hier
  } catch (err) {
    showLoadError(err);
    return;
  }

  const info = headerInfoFor(mode, clubIds);
  applyTheme(info.colors);
  $("#game-eyebrow").textContent = info.eyebrow;
  $("#game-title").textContent = info.title;
  renderGameKits(clubIds);
  showScreen("game");

  // De rosters staan per club in data/; die van dit potje halen we nu op.
  const loading = el("div", "empty-state");
  loading.appendChild(el("p", null, "Spelers laden…"));
  replaceChildren($("#board-wrap"), loading);
  clear($("#turn"));
  try {
    await loadRosters(clubIds);
  } catch (err) {
    showLoadError(err);
    return;
  }

  state.players = clubIds.length === 1
    ? rosterFor(clubIds[0])
    : dedupePlayers(clubIds.flatMap(withOwnClub));

  state.score = loadScore(mode, clubIds);
  state.best = loadBest(mode, clubIds);

  renderSoloButton();
  newGame();
}

/*
 * De data komt uit data/. Ontbreekt die map, dan is het spel leeg — zeg dat
 * dan ook, in plaats van een leeg scherm te tonen.
 */
function showLoadError(err) {
  const box = el("div", "load-error-box");
  box.appendChild(el("h3", null, "Spelersdata niet geladen"));
  box.appendChild(el("p", null,
    "Kon de map data/ niet lezen. Draai python3 tools/build_players.py " +
    "om de database aan te maken."));
  // Foutteksten kunnen van buitenaf komen (netwerk, server) -> als tekst tonen.
  box.appendChild(el("p", "load-error-detail",
    err && err.message ? err.message : String(err)));
  replaceChildren($("#load-error"), box);
  $("#load-error").classList.add("open");
}

/*
 * In de mix-modus staan twee clubs samen in de pool, en dan is de eigen club
 * van een speler ook een zinnig "Ook bij ..."-criterium. In de rosters is die
 * eigen club er net uit gefilterd, dus voegen we hem hier weer toe — anders
 * matcht "Ook bij Zulte Waregem" wel de Anderlecht-spelers die er ooit
 * speelden, maar niet wie zijn hele carriere bij Zulte bleef.
 */
function withOwnClub(clubId) {
  const club = clubById(clubId);
  return rosterFor(clubId).map((p) => ({ ...p, clubs: [...p.clubs, club.name] }));
}

// Bij twee clubs kan dezelfde speler in beide rosters zitten. We houden hem
// een keer over, maar met de jaren en clubs van allebei — anders klopt het
// decennium-criterium niet voor wie bij beide clubs speelde.
function dedupePlayers(players) {
  const byName = new Map();
  for (const p of players) {
    const seen = byName.get(p.name);
    if (!seen) {
      byName.set(p.name, { ...p, clubs: [...p.clubs] });
      continue;
    }
    seen.from = minYear(seen.from, p.from);
    seen.to = maxYear(seen.to, p.to);
    seen.clubs = [...new Set([...seen.clubs, ...p.clubs])];
  }
  return [...byName.values()];
}

function minYear(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function maxYear(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/* ---------- Online potjes ---------- */

/*
 * Een online potje wordt niet lokaal gegenereerd: het raster staat in de
 * database. Wij halen de rosters van de juiste club(s) op en zoeken de zes
 * criteria terug op hun id, zodat beide spelers exact hetzelfde bord zien.
 */
async function startOnlineGame(record) {
  state.online = true;
  state.solo = false;
  state.seat = ONLINE.seat;
  state.mode = "online";
  state.clubIds = record.club_ids;

  const info = headerInfoFor(record.club_ids.length === 1 ? "club" : "belgium",
                             record.club_ids);
  applyTheme(info.colors);
  $("#game-eyebrow").textContent = "Samen online · " + ONLINE.code;
  $("#game-title").textContent = info.title;
  renderGameKits(record.club_ids);
  showScreen("game");

  await loadRosters(record.club_ids);
  state.players = record.club_ids.length === 1
    ? rosterFor(record.club_ids[0])
    : dedupePlayers(record.club_ids.flatMap(withOwnClub));

  const rows = categoriesByIds(state.players, record.row_ids);
  const cols = categoriesByIds(state.players, record.col_ids);
  if (!rows || !cols) {
    state.playable = false;
    render();
    return;
  }
  state.rows = rows;
  state.cols = cols;
  state.playable = true;
  state.score = { X: 0, O: 0, draw: 0 };

  ONLINE.onUpdate = applyRemoteGame;
  applyRemoteGame(record);
}

// Toestand uit de database overnemen. Dit is de enige plek waar het bord
// verandert tijdens een online potje — ook onze eigen zet komt zo terug.
function applyRemoteGame(record) {
  if (!state.online) return;
  state.board = (record.board || []).map((cell) =>
    cell && typeof cell === "object" && typeof cell.name === "string"
      ? { player: cell.player === "O" ? "O" : "X", name: cell.name }
      : null);
  while (state.board.length < 9) state.board.push(null);

  state.usedNames = new Set(state.board.filter(Boolean).map((c) => c.name));
  state.current = record.turn === "O" ? "O" : "X";
  state.finished = Boolean(record.finished);
  state.winner = record.winner || null;
  state.opponentJoined = Boolean(record.joined);
  render();

  // Wie als eerste ziet dat het potje beslist is, legt de uitslag vast.
  if (!state.finished) {
    const res = checkWinner();
    const winner = res ? res.player : (gameStuck() ? leader() : null);
    if (winner) onlineFinish(winner).catch(() => { /* de ander doet het wel */ });
  }
}

// Mogen wij nu iets doen?
function myTurn() {
  return !state.online || (state.seat === state.current && state.opponentJoined);
}

function newGame() {
  const grid = generateGrid(state.players);
  state.board = new Array(9).fill(null);
  state.current = "X";
  state.usedNames = new Set();
  state.finished = false;
  state.winner = null;
  state.stuck = false;
  state.guessesLeft = SOLO_GUESSES;

  if (!grid) {
    state.playable = false;
    state.rows = [];
    state.cols = [];
  } else {
    state.playable = true;
    state.rows = grid.rows;
    state.cols = grid.cols;
  }
  render();
}

/*
 * "Nieuw potje". Bij een vaste club is dat een nieuw raster; bij "Heel België"
 * horen er ook twee andere ploegen tegenover elkaar te staan, anders speel je
 * de hele avond dezelfde clash.
 */
function nextGame() {
  if (state.mode !== "belgium") return newGame();

  const current = state.clubIds.slice().sort().join("+");
  let pair;
  do {
    const ids = shuffle(CLUBS.map((c) => c.id));
    pair = [ids[0], ids[1]];
  } while (pair.slice().sort().join("+") === current);
  return startGame("belgium", pair);
}

function resetScore() {
  state.score = { X: 0, O: 0, draw: 0 };
  state.best = 0;
  saveScore();
  saveBest();
  renderScoreboard();
}

/* ---------- Score bewaren, per affiche ---------- */

/*
 * Elke club(combinatie) houdt zijn eigen stand bij, zodat je na een refresh of
 * na even een andere ploeg te spelen terugkomt op je 3-2.
 * localStorage kan gooien (privemodus, geblokkeerde site-data) — dan speelt het
 * spel gewoon door zonder te bewaren.
 */
/*
 * "Heel België" trekt elk potje een nieuwe affiche, dus daar heeft een stand
 * per clubduo geen zin — die zou telkens op 0-0 springen. Daar loopt één stand
 * door over alle clashes heen; bij een vaste club blijft het per ploeg.
 */
function storageKey(prefix, mode, clubIds) {
  return mode === "belgium"
    ? prefix + ":belgium"
    : prefix + ":" + clubIds.slice().sort().join("+");
}

function scoreKey(mode, clubIds) {
  return storageKey("bke-score", mode, clubIds);
}

function bestKey(mode, clubIds) {
  return storageKey("bke-best", mode, clubIds);
}

/*
 * localStorage staat in de browser van de speler en is daar vrij te bewerken
 * (dev tools -> Application). Wat eruit komt is dus input, geen waarheid: we
 * accepteren alleen gehele getallen binnen een zinnig bereik. Zie SECURITY.md.
 */
const MAX_SCORE = 9999;

function cleanCount(value, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : 0;
}

function loadBest(mode, clubIds) {
  try {
    return cleanCount(localStorage.getItem(bestKey(mode, clubIds)), 9);
  } catch (e) { return 0; }
}

function saveBest() {
  try {
    localStorage.setItem(bestKey(state.mode, state.clubIds), String(state.best));
  } catch (e) { /* niets te doen */ }
}

function loadScore(mode, clubIds) {
  const blank = { X: 0, O: 0, draw: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(scoreKey(mode, clubIds)) || "null");
    if (!saved || typeof saved !== "object") return blank;
    ["X", "O", "draw"].forEach((k) => { blank[k] = cleanCount(saved[k], MAX_SCORE); });
  } catch (e) { /* geen bruikbare bewaarde score */ }
  return blank;
}

function saveScore() {
  try {
    localStorage.setItem(scoreKey(state.mode, state.clubIds), JSON.stringify(state.score));
  } catch (e) { /* niets te doen */ }
}

/* ---------- Rendering ---------- */

function renderSoloButton() {
  $("#toggle-solo").textContent = state.solo ? "Met z'n tweeën" : "Solo";
}

function loadSolo() {
  try { return localStorage.getItem("bke-solo") === "1"; } catch (e) { return false; }
}

function saveSolo() {
  try { localStorage.setItem("bke-solo", state.solo ? "1" : "0"); } catch (e) { /* niets */ }
}

function filledCells() {
  return state.board.filter((c) => c !== null).length;
}

// Eén vakje van het scorebord: bovenlabel of speelmerk, getal, onderlabel.
function scoreBox(className, top, value, bottom, topIsMark) {
  const box = el("div", "score-box " + className);
  if (top) box.appendChild(el("span", topIsMark ? "score-mark" : "score-label-top", top));
  box.appendChild(el("span", "score-num", value));
  if (bottom) box.appendChild(el("span", "score-label", bottom));
  return box;
}

function renderScoreboard() {
  const board = $("#scoreboard");
  if (state.solo) {
    replaceChildren(board,
      scoreBox("score-x", "Vakjes", filledCells() + "/9"),
      scoreBox("score-draw", "Pogingen", state.guessesLeft),
      scoreBox("score-o", "Record", state.best));
    return;
  }
  if (state.online) {
    replaceChildren(board,
      scoreBox("score-x", "X", state.board.filter((c) => c && c.player === "X").length,
               state.seat === "X" ? "Jij" : "Tegenstander", true),
      scoreBox("score-draw", "Vakjes", filledCells() + "/9"),
      scoreBox("score-o", "O", state.board.filter((c) => c && c.player === "O").length,
               state.seat === "O" ? "Jij" : "Tegenstander", true));
    return;
  }
  replaceChildren(board,
    scoreBox("score-x", "X", state.score.X, "Speler 1", true),
    scoreBox("score-draw", "Gelijk", state.score.draw),
    scoreBox("score-o", "O", state.score.O, "Speler 2", true));
}

function render() {
  const boardWrap = $("#board-wrap");

  if (!state.playable) {
    const box = el("div", "empty-state");
    box.appendChild(el("p", null,
      "Geen speelbaar raster te maken voor deze club(s)."));
    box.appendChild(el("p", "empty-hint",
      "Er zijn te weinig spelers met bruikbare gegevens. Draai " +
      "python3 tools/build_players.py opnieuw om de database te verversen."));
    replaceChildren(boardWrap, box);
    clear($("#turn"));
    renderScoreboard();
    return;
  }

  const scroll = el("div", "grid-scroll");
  const grid = el("div", "grid");
  const colHead = el("div", "col-headers");
  const boardEl = el("div", "board");
  grid.appendChild(colHead);
  grid.appendChild(boardEl);
  scroll.appendChild(grid);
  replaceChildren(boardWrap, scroll);

  // Kolomkoppen. De labels bevatten clubnamen uit Wikidata -> textContent.
  colHead.appendChild(el("div", "corner"));
  state.cols.forEach((c) => colHead.appendChild(el("div", "head col-head", c.label)));

  // Rijen met rijkop + 3 cellen
  for (let r = 0; r < 3; r++) {
    boardEl.appendChild(el("div", "head row-head", state.rows[r].label));
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const cell = state.board[idx];
      const btn = el("button", "cell" +
        (cell ? " claimed " + (cell.player === "X" ? "x" : "o") : ""));
      btn.type = "button";
      btn.dataset.idx = String(idx);
      btn.disabled = Boolean(cell) || state.finished || !myTurn();

      if (cell) {
        btn.appendChild(el("span", "mark", state.solo ? "✓" : cell.player));
        btn.appendChild(el("span", "who", cell.name));
      } else if (state.finished) {
        // Potje gedaan: laten zien wat hier had gekund, anders leer je niets
        // van de vakjes die niemand wist.
        btn.appendChild(el("span", "solutions", solutionsLabel(idx)));
      } else {
        btn.appendChild(el("span", "plus", "+"));
      }
      boardEl.appendChild(btn);
    }
  }

  boardEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".cell");
    if (btn && !btn.disabled) openGuess(Number(btn.dataset.idx));
  });

  // Beurt / status
  const turnEl = $("#turn");
  const mark = (p) => (p === "X" ? "x" : "o");
  if (state.solo) {
    const n = filledCells();
    if (state.finished) {
      const record = n >= state.best && n > 0 ? " — nieuw record!" : "";
      replaceChildren(turnEl,
        el("span", "badge " + (n === 9 ? "win-x" : "draw"), `${n}/9 vakjes${record}`));
    } else {
      replaceChildren(turnEl, document.createTextNode("Nog "),
        el("span", "badge turn-x", `${state.guessesLeft} pogingen`));
    }
  } else if (state.finished) {
    const stuck = state.stuck ? " — geen zetten meer" : "";
    replaceChildren(turnEl, state.winner === "draw"
      ? el("span", "badge draw", "Gelijkspel!" + stuck)
      : el("span", "badge win-" + mark(state.winner),
           `Speler ${state.winner} wint!${stuck}`));
  } else if (state.online) {
    if (!state.opponentJoined) {
      replaceChildren(turnEl, el("span", "badge draw", "Wachten op je tegenstander…"));
    } else {
      replaceChildren(turnEl,
        el("span", "badge turn-" + mark(state.current),
           myTurn() ? "Jij bent aan zet" : "Tegenstander is aan zet"));
    }
  } else {
    replaceChildren(turnEl, document.createTextNode("Beurt: "),
      el("span", "badge turn-" + mark(state.current), "Speler " + state.current));
  }

  // Winnende lijn markeren
  if (state.finished && state.winner && state.winner !== "draw") {
    const res = checkWinner();
    if (res && res.line) {
      res.line.forEach((i) => {
        const btn = boardEl.querySelector(`.cell[data-idx="${i}"]`);
        if (btn) btn.classList.add("win-line");
      });
    }
  }

  renderScoreboard();
}

/* ---------- Interactie: een vakje spelen ---------- */

let activeIdx = null;
let suggestions = [];      // huidige suggestielijst
let suggestionIdx = -1;    // welke suggestie is met de pijltjes gemarkeerd

function renderSuggestions() {
  const box = $("#guess-suggestions");
  clear(box);
  if (!suggestions.length) {
    box.classList.remove("open");
    return;
  }
  suggestions.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "suggestion" + (i === suggestionIdx ? " active" : "");
    li.setAttribute("role", "option");
    li.appendChild(el("span", "s-name", p.name));
    li.appendChild(el("span", "s-meta", `${POSITION_LABELS[p.pos]} · ${p.nat}`));
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();          // niet de focus uit het invoerveld halen
      pickSuggestion(i);
    });
    box.appendChild(li);
  });
  box.classList.add("open");
}

function updateSuggestions() {
  const pool = state.players.filter((p) => !state.usedNames.has(p.name));
  suggestions = suggestPlayers($("#guess-input").value, pool);
  suggestionIdx = -1;
  renderSuggestions();
}

function clearSuggestions() {
  suggestions = [];
  suggestionIdx = -1;
  renderSuggestions();
}

// Suggestie kiezen: naam invullen en meteen bevestigen.
function pickSuggestion(i) {
  const p = suggestions[i];
  if (!p) return;
  $("#guess-input").value = p.name;
  clearSuggestions();
  submitGuess();
}

function openGuess(idx) {
  if (state.finished || state.board[idx]) return;
  if (!myTurn()) return;
  activeIdx = idx;
  const r = Math.floor(idx / 3);
  const c = idx % 3;
  $("#modal-title").textContent = `${state.rows[r].label}  ✕  ${state.cols[c].label}`;
  $("#modal-sub").textContent = state.solo
    ? `Nog ${state.guessesLeft} pogingen — noem een speler die aan beide voldoet`
    : `Speler ${state.current} — noem een speler die aan beide voldoet`;
  $("#guess-input").value = "";
  clearSuggestions();
  $("#guess-feedback").textContent = "";
  $("#guess-feedback").className = "feedback";
  $("#modal").classList.add("open");
  setTimeout(() => $("#guess-input").focus(), 50);
}

/*
 * Hint op aanvraag: hoeveel spelers passen er nog in dit vakje? Dat zegt of
 * je voor een cadeautje of voor een gemeen vakje staat, zonder een naam te
 * verklappen. Bewust achter een knop — automatisch getoond neemt het het
 * spel uit handen.
 */
function showHint() {
  if (activeIdx === null) return;
  const n = allowedForCell(activeIdx).length;
  const fb = $("#guess-feedback");
  fb.textContent = n === 1
    ? "Nog 1 speler past hier."
    : `Nog ${n} spelers passen hier.`;
  fb.className = "feedback hint";
  $("#guess-input").focus();
}

function closeGuess() {
  clearSuggestions();
  $("#modal").classList.remove("open");
  activeIdx = null;
}

// Spelers die dit vakje nog kunnen claimen (voldoen aan rij en kolom, nog vrij).
function allowedForCell(idx) {
  const rowCat = state.rows[Math.floor(idx / 3)];
  const colCat = state.cols[idx % 3];
  return state.players.filter(
    (p) => rowCat.test(p) && colCat.test(p) && !state.usedNames.has(p.name)
  );
}

function submitGuess() {
  if (activeIdx === null) return;
  const idx = activeIdx;
  const allowed = allowedForCell(idx);

  clearSuggestions();
  const val = $("#guess-input").value;
  const match = matchPlayer(val, state.players.filter((p) => !state.usedNames.has(p.name)));

  const fb = $("#guess-feedback");

  if (!match) {
    fb.textContent = state.solo
      ? "Onbekende speler — poging kwijt."
      : "Onbekende speler — check de spelling of probeer een andere naam.";
    fb.className = "feedback bad";
    if (state.online) {
      onlineMove(idx, null).then(() => setTimeout(closeGuess, 900)).catch(() => {});
    } else {
      passTurnAfterWrong();
    }
    return;
  }

  const valid = allowed.some((p) => p.name === match.name);

  // Online: niet zelf het bord aanpassen, maar de zet doorsturen. De database
  // beslist of hij mag; het resultaat komt via Realtime terug bij allebei.
  if (state.online) {
    fb.textContent = valid ? `✔ Juist! ${match.name} telt.`
                           : `✖ ${match.name} voldoet niet aan dit vakje.`;
    fb.className = valid ? "feedback good" : "feedback bad";
    onlineMove(idx, valid ? match.name : null)
      .then(() => setTimeout(closeGuess, valid ? 650 : 900))
      .catch((err) => {
        fb.textContent = "Zet geweigerd: " + err.message;
        fb.className = "feedback bad";
      });
    return;
  }

  if (valid) {
    // Vakje geclaimd door huidige speler
    state.board[idx] = { player: state.current, name: match.name };
    state.usedNames.add(match.name);
    fb.textContent = `✔ Juist! ${match.name} telt.`;
    fb.className = "feedback good";
    setTimeout(() => {
      closeGuess();
      finishTurn();
    }, 650);
  } else {
    fb.textContent = `✖ ${match.name} voldoet niet aan dit vakje. ` +
      (state.solo ? "Poging kwijt." : "Beurt gaat over.");
    fb.className = "feedback bad";
    passTurnAfterWrong();
  }
}

function passTurnAfterWrong() {
  setTimeout(() => {
    closeGuess();
    finishTurn();
  }, 900);
}

/*
 * Elke speler mag maar één keer gebruikt worden, dus een vakje kan onderweg
 * zonder oplossingen komen te zitten. Staan álle open vakjes zo vast, dan is
 * het potje gedaan — anders blijven beide spelers eeuwig om de beurt gokken
 * op iets wat niet meer bestaat.
 */
function gameStuck() {
  return state.board.every((cell, idx) => cell !== null || !allowedForCell(idx).length);
}

// Wie heeft de meeste vakjes? Beslist een vastgelopen potje.
function leader() {
  let x = 0, o = 0;
  for (const cell of state.board) {
    if (!cell) continue;
    if (cell.player === "X") x++; else o++;
  }
  return x === o ? "draw" : x > o ? "X" : "O";
}

// Na een beurt: winnaar checken en van speler wisselen.
function finishTurn() {
  if (state.solo) return finishSoloTurn();

  const res = checkWinner();
  const winner = res ? res.player : (gameStuck() ? leader() : null);
  if (winner) {
    state.finished = true;
    state.stuck = !res;
    state.winner = winner;
    state.score[winner]++;
    saveScore();
    render();
    return;
  }
  // Wissel altijd van speler (juist of fout)
  state.current = state.current === "X" ? "O" : "X";
  render();
}

// In je eentje: geen winnaar, maar hoeveel vakjes haal je met negen pogingen?
function finishSoloTurn() {
  state.guessesLeft--;
  const n = filledCells();
  if (state.guessesLeft <= 0 || n === 9 || gameStuck()) {
    state.finished = true;
    state.stuck = state.guessesLeft > 0 && n < 9;
    if (n > state.best) {
      state.best = n;
      saveBest();
    }
  }
  render();
}

// Een paar namen die dit vakje hadden kunnen oplossen, plus hoeveel er nog waren.
const SOLUTIONS_SHOWN = 3;

function solutionsLabel(idx) {
  const options = allowedForCell(idx);
  if (!options.length) return "—";
  const shown = shuffle(options).slice(0, SOLUTIONS_SHOWN);
  const rest = options.length - shown.length;
  return shown.map((p) => p.name).join(", ") + (rest > 0 ? ` +${rest}` : "");
}

/* ---------- Scherm-navigatie ---------- */

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  $("#screen-" + name).classList.add("active");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ---------- Clubkeuze-grid ---------- */

/*
 * Clubmarkering: een shirt in de twee kleuren van de ploeg, met een witte
 * omtrek. Bewust geen clubwapens — die zijn merk- en auteursrechtelijk
 * beschermd en mogen hier niet mee de wereld in. Kleuren zijn dat niet, en
 * ze stonden al in data/clubs.json.
 */
const KIT_PATH = "M18 5 L22 4 C24 7.5 24 7.5 26 4 L30 5 L44 11 L40 21 " +
                 "L34 18.5 L34 44 L14 44 L14 18.5 L8 21 L4 11 Z";
const KIT_STRIPES = 5;

// Alleen echte hex-kleuren doorlaten; de rest gaat rechtstreeks in een
// style-attribuut van de SVG.
function safeColor(c) {
  return /^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : "#888888";
}

const SVG_NS = "http://www.w3.org/2000/svg";

// <tag attr=".."> in de SVG-namespace. Attributen worden als string gezet,
// nooit als markup samengeplakt.
function svg(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, String(attrs[k])));
  return node;
}

function clubKit(club, size = 44) {
  const id = "kit-" + club.id;
  const a = safeColor(club.colors[0]);
  const b = safeColor(club.colors[1]);
  const w = 48 / KIT_STRIPES;

  const root = svg("svg", { class: "kit", viewBox: "0 0 48 48",
                            width: size, height: size, "aria-hidden": "true" });
  const clip = svg("clipPath", { id });
  clip.appendChild(svg("path", { d: KIT_PATH }));
  root.appendChild(clip);

  const stripes = svg("g", { "clip-path": `url(#${id})` });
  for (let i = 0; i < KIT_STRIPES; i++) {
    stripes.appendChild(svg("rect", {
      x: (i * w).toFixed(2), width: w.toFixed(2), height: 48,
      fill: i % 2 ? b : a,
    }));
  }
  root.appendChild(stripes);
  root.appendChild(svg("path", { d: KIT_PATH, fill: "none", stroke: "#fff",
                                 "stroke-width": "2.5", "stroke-linejoin": "round" }));
  return root;
}

function renderClubGrid() {
  const grid = clear($("#club-grid"));
  CLUBS.forEach((club) => {
    const card = el("button", "club-card");
    card.type = "button";
    card.dataset.club = club.id;
    card.appendChild(clubKit(club));
    card.appendChild(el("span", "club-name", club.name));
    grid.appendChild(card);
  });
}

// De shirts van de club(s) van dit potje, boven het bord.
function renderGameKits(clubIds) {
  const box = clear($("#game-kits"));
  clubIds.map((id) => clubById(id)).filter(Boolean)
    .forEach((club) => box.appendChild(clubKit(club, 56)));
}

/* ---------- Online-scherm ---------- */

function showOnlineScreen() {
  const setup = $("#online-setup");
  const waiting = $("#online-waiting");
  const unavailable = $("#online-unavailable");

  unavailable.style.display = ONLINE_ENABLED ? "none" : "";
  setup.style.display = ONLINE_ENABLED ? "" : "none";
  waiting.style.display = "none";
  $("#online-feedback").textContent = "";

  if (ONLINE_ENABLED) renderOnlineClubGrid();
  showScreen("online");
}

// Zelfde clubkaarten als bij "Ploegen België", maar ze starten een online potje.
function renderOnlineClubGrid() {
  const grid = clear($("#online-club-grid"));
  CLUBS.forEach((club) => {
    const card = el("button", "club-card");
    card.type = "button";
    card.dataset.club = club.id;
    card.appendChild(clubKit(club, 34));
    card.appendChild(el("span", "club-name", club.name));
    grid.appendChild(card);
  });
}

function onlineFeedback(text, ok) {
  const fb = $("#online-feedback");
  fb.textContent = text;
  fb.className = "feedback" + (text ? (ok ? " good" : " bad") : "");
}

/*
 * Een potje aanmaken: wij genereren het raster (met de gewone generator), en
 * sturen alleen de id's van de zes criteria mee. De tegenstander bouwt daar
 * hetzelfde bord uit op.
 */
async function createOnlineGame(clubId, wantedCode) {
  onlineFeedback("Potje aanmaken…", true);
  try {
    await loadRosters([clubId]);
    const players = rosterFor(clubId);
    const grid = generateGrid(players);
    if (!grid) throw new Error("Geen speelbaar raster voor deze club.");

    const record = await onlineCreate([clubId],
      grid.rows.map((c) => c.id), grid.cols.map((c) => c.id), wantedCode);

    $("#online-code-shown").textContent = ONLINE.code;
    $("#online-link").value = onlineShareUrl(ONLINE.code);
    $("#online-setup").style.display = "none";
    $("#online-waiting").style.display = "";
    $("#online-copy-note").textContent = "";

    // Zodra de tegenstander meedoet, springen we naar het bord.
    ONLINE.onUpdate = (rec) => { if (rec.joined) startOnlineGame(rec); };
    await startOnlineGame(record);
    showScreen("online");   // eerst nog het wachtscherm tonen
  } catch (err) {
    onlineFeedback(err.message, false);
  }
}

async function joinOnlineGame(code) {
  onlineFeedback("Meedoen…", true);
  try {
    const record = await onlineJoin(code);
    await startOnlineGame(record);
  } catch (err) {
    onlineFeedback(err.message, false);
  }
}

/* ---------- Event-koppeling ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  showScreen("start");

  // Start -> Overzicht
  $("#go-overview").addEventListener("click", () => showScreen("overview"));
  $("#back-to-start").addEventListener("click", (e) => { e.preventDefault(); showScreen("start"); });

  // Overzicht -> spelmodus kiezen
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode;
      if (mode === "essevee") {
        startGame("essevee", ["zulte-waregem"]);
      } else if (mode === "club") {
        showScreen("clubs");
      } else if (mode === "online") {
        showOnlineScreen();
      } else if (mode === "belgium") {
        const shuffled = shuffle(CLUBS.map((c) => c.id));
        startGame("belgium", [shuffled[0], shuffled[1]]);
      }
    });
  });

  // Clubkeuze -> spel
  $("#club-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".club-card");
    if (!btn) return;
    startGame("club", [btn.dataset.club]);
  });
  $("#back-to-overview").addEventListener("click", (e) => { e.preventDefault(); showScreen("overview"); });
  $("#back-to-overview-2").addEventListener("click", (e) => {
    e.preventDefault();
    onlineLeave();
    state.online = false;
    showScreen("overview");
  });

  $("#online-club-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".club-card");
    if (btn) createOnlineGame(btn.dataset.club);
  });
  $("#online-join").addEventListener("click", () => joinOnlineGame($("#online-code").value));
  $("#online-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinOnlineGame($("#online-code").value);
  });
  // Tabblad weer actief? Meteen de laatste stand ophalen — tijdens het slapen
  // kunnen er berichten gemist zijn.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.online && ONLINE.code) {
      onlineRefresh().then((rec) => rec && applyRemoteGame(rec)).catch(() => {});
    }
  });

  $("#online-copy").addEventListener("click", async () => {
    const note = $("#online-copy-note");
    try {
      await navigator.clipboard.writeText($("#online-link").value);
      note.textContent = "Link gekopieerd.";
      note.className = "feedback good";
    } catch (err) {
      $("#online-link").select();
      note.textContent = "Kopiëren lukte niet — selecteer de link en kopieer hem zelf.";
      note.className = "feedback bad";
    }
  });

  // Spelscherm
  state.solo = loadSolo();
  $("#new-game").addEventListener("click", nextGame);
  $("#toggle-solo").addEventListener("click", () => {
    state.solo = !state.solo;
    saveSolo();
    renderSoloButton();
    newGame();
  });
  $("#reset-score").addEventListener("click", resetScore);
  $("#switch-team").addEventListener("click", () => showScreen("overview"));

  $("#guess-submit").addEventListener("click", submitGuess);
  $("#guess-hint").addEventListener("click", showHint);
  $("#guess-cancel").addEventListener("click", closeGuess);
  $("#guess-input").addEventListener("input", updateSuggestions);
  $("#guess-input").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      suggestionIdx = (suggestionIdx + step + suggestions.length) % suggestions.length;
      renderSuggestions();
      return;
    }
    if (e.key === "Enter") {
      // Achternamen zijn niet uniek ("Hazard"), dus laat Enter altijd een
      // concrete suggestie kiezen in plaats van te gokken welke bedoeld is.
      if (suggestions.length) pickSuggestion(Math.max(suggestionIdx, 0));
      else submitGuess();
    }
    if (e.key === "Escape") {
      if (suggestions.length) clearSuggestions();
      else closeGuess();
    }
  });
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeGuess();
  });


  // De clublijst hebben we meteen nodig (clubkeuze, kleuren); de rosters pas
  // zodra er een potje start.
  try {
    await loadClubs();
    renderClubGrid();
  } catch (err) {
    showLoadError(err);
    return;
  }

  // Binnengekomen via een uitnodigingslink? Dan meteen meedoen.
  const invite = ONLINE_ENABLED ? onlineCodeFromUrl() : null;
  if (invite) {
    showOnlineScreen();
    $("#online-code").value = invite;
    joinOnlineGame(invite);
  }
});
