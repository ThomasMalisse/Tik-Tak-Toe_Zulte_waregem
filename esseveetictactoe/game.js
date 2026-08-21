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

/*
 * Namen, nationaliteiten en clublabels komen uit Wikidata en gaan via innerHTML
 * het scherm op. Ze horen als tekst gelezen te worden, niet als HTML — er staan
 * echt dingen als "Brighton & Hove Albion FC" en 'Hendricus "Henk" Heijt' in.
 */
function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
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
  showScreen("game");

  // De rosters staan per club in data/; die van dit potje halen we nu op.
  $("#board-wrap").innerHTML = '<div class="empty-state"><p>Spelers laden…</p></div>';
  $("#turn").innerHTML = "";
  try {
    await loadRosters(clubIds);
  } catch (err) {
    showLoadError(err);
    return;
  }

  state.players = clubIds.length === 1
    ? rosterFor(clubIds[0])
    : dedupePlayers(clubIds.flatMap(withOwnClub));

  state.score = loadScore(clubIds);
  state.best = loadBest(clubIds);

  renderSoloButton();
  newGame();
}

/*
 * De data komt uit data/. Ontbreekt die map, dan is het spel leeg — zeg dat
 * dan ook, in plaats van een leeg scherm te tonen.
 */
function showLoadError(err) {
  $("#load-error").innerHTML = `
    <div class="load-error-box">
      <h3>Spelersdata niet geladen</h3>
      <p>Kon de map <code>data/</code> niet lezen. Draai
        <code>python3 tools/build_players.py</code> om de database aan te maken.</p>
      <p class="load-error-detail">${escapeHtml(String(err && err.message ? err.message : err))}</p>
    </div>`;
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
function scoreKey(clubIds) {
  return "bke-score:" + clubIds.slice().sort().join("+");
}

function bestKey(clubIds) {
  return "bke-best:" + clubIds.slice().sort().join("+");
}

function loadBest(clubIds) {
  try {
    const n = Number(localStorage.getItem(bestKey(clubIds)));
    return Number.isFinite(n) ? n : 0;
  } catch (e) { return 0; }
}

function saveBest() {
  try {
    localStorage.setItem(bestKey(state.clubIds), String(state.best));
  } catch (e) { /* niets te doen */ }
}

function loadScore(clubIds) {
  const blank = { X: 0, O: 0, draw: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(scoreKey(clubIds)) || "null");
    if (!saved) return blank;
    ["X", "O", "draw"].forEach((k) => {
      if (Number.isFinite(saved[k])) blank[k] = saved[k];
    });
  } catch (e) { /* geen bruikbare bewaarde score */ }
  return blank;
}

function saveScore() {
  try {
    localStorage.setItem(scoreKey(state.clubIds), JSON.stringify(state.score));
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

function renderScoreboard() {
  const board = $("#scoreboard");
  if (state.solo) {
    board.innerHTML = `
      <div class="score-box score-x">
        <span class="score-label-top">Vakjes</span>
        <span class="score-num">${filledCells()}/9</span>
      </div>
      <div class="score-box score-draw">
        <span class="score-label-top">Pogingen</span>
        <span class="score-num">${state.guessesLeft}</span>
      </div>
      <div class="score-box score-o">
        <span class="score-label-top">Record</span>
        <span class="score-num">${state.best}</span>
      </div>`;
    return;
  }
  board.innerHTML = `
    <div class="score-box score-x">
      <span class="score-mark">X</span>
      <span class="score-num">${state.score.X}</span>
      <span class="score-label">Speler 1</span>
    </div>
    <div class="score-box score-draw">
      <span class="score-label-top">Gelijk</span>
      <span class="score-num">${state.score.draw}</span>
    </div>
    <div class="score-box score-o">
      <span class="score-mark">O</span>
      <span class="score-num">${state.score.O}</span>
      <span class="score-label">Speler 2</span>
    </div>`;
}

function render() {
  const boardWrap = $("#board-wrap");

  if (!state.playable) {
    boardWrap.innerHTML = `
      <div class="empty-state">
        <p>Geen speelbaar raster te maken voor deze club(s).</p>
        <p class="empty-hint">Er zijn te weinig spelers met bruikbare gegevens. Draai <code>python3 tools/build_players.py</code> opnieuw om de database te verversen.</p>
      </div>`;
    $("#turn").innerHTML = "";
    renderScoreboard();
    return;
  }

  boardWrap.innerHTML = `
    <div class="grid-scroll">
      <div class="grid">
        <div id="col-headers" class="col-headers"></div>
        <div id="board" class="board"></div>
      </div>
    </div>`;

  // Kolomkoppen
  const colHead = $("#col-headers");
  colHead.innerHTML = '<div class="corner"></div>' +
    state.cols.map((c) => `<div class="head col-head">${escapeHtml(c.label)}</div>`).join("");

  // Rijen met rijkop + 3 cellen
  const boardEl = $("#board");
  boardEl.innerHTML = "";
  for (let r = 0; r < 3; r++) {
    boardEl.insertAdjacentHTML(
      "beforeend",
      `<div class="head row-head">${escapeHtml(state.rows[r].label)}</div>`
    );
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const cell = state.board[idx];
      const claimed = cell ? ` claimed ${cell.player === "X" ? "x" : "o"}` : "";
      let inner;
      if (cell) {
        const mark = state.solo ? "✓" : cell.player;
        inner = `<span class="mark">${mark}</span><span class="who">${escapeHtml(cell.name)}</span>`;
      } else if (state.finished) {
        // Potje gedaan: laten zien wat hier had gekund, anders leer je niets
        // van de vakjes die niemand wist.
        inner = `<span class="solutions">${solutionsLabel(idx)}</span>`;
      } else {
        inner = `<span class="plus">+</span>`;
      }
      boardEl.insertAdjacentHTML(
        "beforeend",
        `<button class="cell${claimed}" data-idx="${idx}" ${cell || state.finished ? "disabled" : ""}>${inner}</button>`
      );
    }
  }

  boardEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".cell");
    if (btn && !btn.disabled) openGuess(Number(btn.dataset.idx));
  });

  // Beurt / status
  const turnEl = $("#turn");
  if (state.solo) {
    const n = filledCells();
    if (state.finished) {
      const record = n >= state.best && n > 0 ? " — nieuw record!" : "";
      turnEl.innerHTML = `<span class="badge ${n === 9 ? "win-x" : "draw"}">${n}/9 vakjes${record}</span>`;
    } else {
      turnEl.innerHTML = `Nog <span class="badge turn-x">${state.guessesLeft} pogingen</span>`;
    }
  } else if (state.finished) {
    const stuck = state.stuck ? " — geen zetten meer" : "";
    if (state.winner === "draw") {
      turnEl.innerHTML = `<span class="badge draw">Gelijkspel!${stuck}</span>`;
    } else {
      turnEl.innerHTML = `<span class="badge win-${state.winner === "X" ? "x" : "o"}">Speler ${state.winner} wint!${stuck}</span>`;
    }
  } else {
    turnEl.innerHTML = `Beurt: <span class="badge turn-${state.current === "X" ? "x" : "o"}">Speler ${state.current}</span>`;
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
  box.innerHTML = "";
  if (!suggestions.length) {
    box.classList.remove("open");
    return;
  }
  suggestions.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "suggestion" + (i === suggestionIdx ? " active" : "");
    li.setAttribute("role", "option");
    li.innerHTML =
      `<span class="s-name"></span><span class="s-meta">${POSITION_LABELS[p.pos]} · ${escapeHtml(p.nat)}</span>`;
    li.querySelector(".s-name").textContent = p.name;
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
    passTurnAfterWrong();
    return;
  }

  const valid = allowed.some((p) => p.name === match.name);
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
  return escapeHtml(shown.map((p) => p.name).join(", ")) + (rest > 0 ? ` +${rest}` : "");
}

/* ---------- Scherm-navigatie ---------- */

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  $("#screen-" + name).classList.add("active");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ---------- Clubkeuze-grid ---------- */

function renderClubGrid() {
  const grid = $("#club-grid");
  grid.innerHTML = CLUBS.map((club) => `
    <button class="club-card" data-club="${club.id}">
      <span class="swatch-row">
        <span class="swatch" style="background:${club.colors[0]}"></span>
        <span class="swatch" style="background:${club.colors[1]}"></span>
      </span>
      <span class="club-name">${escapeHtml(club.name)}</span>
    </button>
  `).join("");
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

  // Spelscherm
  state.solo = loadSolo();
  $("#new-game").addEventListener("click", newGame);
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
  }
});
