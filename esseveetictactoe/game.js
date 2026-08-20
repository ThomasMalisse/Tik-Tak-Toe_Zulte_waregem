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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Rastergeneratie ---------- */

// Bestaat er een speler die aan beide criteria voldoet (en nog niet gebruikt is)?
function cellSolvable(rowCat, colCat, players, usedNames) {
  return players.some(
    (p) => rowCat.test(p) && colCat.test(p) && !usedNames.has(p.name)
  );
}

// Kies 3 rij- en 3 kolomcategorieën zodat elk vakje minstens één oplossing heeft.
function generateGrid(players) {
  const pool = eligibleCategories(players, 3);
  const empty = new Set();
  if (pool.length < 6) return null;

  for (let attempt = 0; attempt < 4000; attempt++) {
    const pick = shuffle(pool).slice(0, 6);
    const rows = pick.slice(0, 3);
    const cols = pick.slice(3, 6);

    let ok = true;
    for (const r of rows) {
      for (const c of cols) {
        if (!cellSolvable(r, c, players, empty)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (ok) return { rows, cols };
  }
  return null; // te weinig data voor een oplosbaar raster
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
  playable: true,  // false als er geen oplosbaar raster gemaakt kon worden
  score: { X: 0, O: 0, draw: 0 },
};

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

function startGame(mode, clubIds) {
  state.mode = mode;
  state.clubIds = clubIds;
  state.players = clubIds.length === 1
    ? rosterFor(clubIds[0])
    : dedupePlayers([...rosterFor(clubIds[0]), ...rosterFor(clubIds[1])]);

  const info = headerInfoFor(mode, clubIds);
  applyTheme(info.colors);
  $("#game-eyebrow").textContent = info.eyebrow;
  $("#game-title").textContent = info.title;

  newGame();
  showScreen("game");
}

function dedupePlayers(players) {
  const seen = new Set();
  return players.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

function newGame() {
  const grid = generateGrid(state.players);
  state.board = new Array(9).fill(null);
  state.current = "X";
  state.usedNames = new Set();
  state.finished = false;
  state.winner = null;

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
  renderScoreboard();
}

/* ---------- Rendering ---------- */

function renderScoreboard() {
  $("#score-x").textContent = state.score.X;
  $("#score-o").textContent = state.score.O;
  $("#score-draw").textContent = state.score.draw;
}

function render() {
  const boardWrap = $("#board-wrap");

  if (!state.playable) {
    boardWrap.innerHTML = `
      <div class="empty-state">
        <p>Nog geen spelers in de database voor deze club(s).</p>
        <p class="empty-hint">Voeg spelers toe in <code>players.js</code> om dit potje speelbaar te maken.</p>
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
    state.cols.map((c) => `<div class="head col-head">${c.label}</div>`).join("");

  // Rijen met rijkop + 3 cellen
  const boardEl = $("#board");
  boardEl.innerHTML = "";
  for (let r = 0; r < 3; r++) {
    boardEl.insertAdjacentHTML(
      "beforeend",
      `<div class="head row-head">${state.rows[r].label}</div>`
    );
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const cell = state.board[idx];
      const claimed = cell ? ` claimed ${cell.player === "X" ? "x" : "o"}` : "";
      boardEl.insertAdjacentHTML(
        "beforeend",
        `<button class="cell${claimed}" data-idx="${idx}" ${cell || state.finished ? "disabled" : ""}>
           ${cell
             ? `<span class="mark">${cell.player}</span><span class="who">${cell.name}</span>`
             : `<span class="plus">+</span>`}
         </button>`
      );
    }
  }

  boardEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".cell");
    if (btn && !btn.disabled) openGuess(Number(btn.dataset.idx));
  });

  // Beurt / status
  const turnEl = $("#turn");
  if (state.finished) {
    if (state.winner === "draw") {
      turnEl.innerHTML = `<span class="badge draw">Gelijkspel!</span>`;
    } else {
      turnEl.innerHTML = `<span class="badge win-${state.winner === "X" ? "x" : "o"}">Speler ${state.winner} wint! 🏆</span>`;
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

function openGuess(idx) {
  if (state.finished || state.board[idx]) return;
  activeIdx = idx;
  const r = Math.floor(idx / 3);
  const c = idx % 3;
  $("#modal-title").textContent = `${state.rows[r].label}  ✕  ${state.cols[c].label}`;
  $("#modal-sub").textContent = `Speler ${state.current} — noem een speler die aan beide voldoet`;
  $("#guess-input").value = "";
  $("#guess-feedback").textContent = "";
  $("#guess-feedback").className = "feedback";
  $("#modal").classList.add("open");
  setTimeout(() => $("#guess-input").focus(), 50);
}

function closeGuess() {
  $("#modal").classList.remove("open");
  activeIdx = null;
}

function submitGuess() {
  if (activeIdx === null) return;
  const idx = activeIdx;
  const r = Math.floor(idx / 3);
  const c = idx % 3;
  const rowCat = state.rows[r];
  const colCat = state.cols[c];

  // Toegestane spelers voor dit vakje, minus de reeds gebruikte
  const allowed = state.players.filter(
    (p) => rowCat.test(p) && colCat.test(p) && !state.usedNames.has(p.name)
  );

  const val = $("#guess-input").value;
  const match = matchPlayer(val, state.players.filter((p) => !state.usedNames.has(p.name)));

  const fb = $("#guess-feedback");

  if (!match) {
    fb.textContent = "Onbekende speler — check de spelling of probeer een andere naam.";
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
    fb.textContent = `✖ ${match.name} voldoet niet aan dit vakje. Beurt gaat over.`;
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

// Na een beurt: winnaar checken en van speler wisselen.
function finishTurn() {
  const res = checkWinner();
  if (res) {
    state.finished = true;
    state.winner = res.player;
    state.score[res.player]++;
    render();
    return;
  }
  // Wissel altijd van speler (juist of fout)
  state.current = state.current === "X" ? "O" : "X";
  render();
}

/* ---------- "Wie zit in de database?" ---------- */

function renderPlayerList() {
  const list = $("#player-list");
  const sorted = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
  list.innerHTML = sorted
    .map((p) => `<li><strong>${p.name}</strong> <span class="meta">${POSITION_LABELS[p.pos]} · ${p.nat}</span></li>`)
    .join("");
  $("#player-count").textContent = state.players.length;
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
      <span class="club-name">${club.name}</span>
    </button>
  `).join("");
}

/* ---------- Event-koppeling ---------- */

document.addEventListener("DOMContentLoaded", () => {
  renderClubGrid();
  showScreen("start");

  // Start -> Overzicht
  $("#go-overview").addEventListener("click", () => showScreen("overview"));
  $("#back-to-start").addEventListener("click", (e) => { e.preventDefault(); showScreen("start"); });

  // Overzicht -> spelmodus kiezen
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode;
      if (mode === "essevee") {
        resetScore();
        startGame("essevee", ["zulte-waregem"]);
      } else if (mode === "club") {
        showScreen("clubs");
      } else if (mode === "belgium") {
        const shuffled = shuffle(CLUBS.map((c) => c.id));
        resetScore();
        startGame("belgium", [shuffled[0], shuffled[1]]);
      }
    });
  });

  // Clubkeuze -> spel
  $("#club-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".club-card");
    if (!btn) return;
    resetScore();
    startGame("club", [btn.dataset.club]);
  });
  $("#back-to-overview").addEventListener("click", (e) => { e.preventDefault(); showScreen("overview"); });

  // Spelscherm
  $("#new-game").addEventListener("click", newGame);
  $("#reset-score").addEventListener("click", resetScore);
  $("#switch-team").addEventListener("click", () => showScreen("overview"));

  $("#guess-submit").addEventListener("click", submitGuess);
  $("#guess-cancel").addEventListener("click", closeGuess);
  $("#guess-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
    if (e.key === "Escape") closeGuess();
  });
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeGuess();
  });

  $("#toggle-players").addEventListener("click", () => {
    renderPlayerList();
    $("#players-panel").classList.toggle("open");
  });
});
