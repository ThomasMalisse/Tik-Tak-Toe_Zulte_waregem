/* =========================================================================
 *  Essevee Tic-Tac-Toe  —  spellogica
 *  Twee spelers (X en O) claimen om beurten een vakje door een SV Zulte
 *  Waregem-speler te noemen die aan het rij- én kolomcriterium voldoet.
 * ========================================================================= */

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

/* ---------- Rastergeneratie ---------- */

// Bestaat er een speler die aan beide criteria voldoet (en nog niet gebruikt is)?
function cellSolvable(rowCat, colCat, usedNames) {
  return PLAYERS.some(
    (p) => rowCat.test(p) && colCat.test(p) && !usedNames.has(p.name)
  );
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Kies 3 rij- en 3 kolomcategorieën zodat elk vakje minstens één oplossing heeft.
function generateGrid() {
  const pool = eligibleCategories(3);
  const empty = new Set();

  for (let attempt = 0; attempt < 4000; attempt++) {
    const pick = shuffle(pool).slice(0, 6);
    const rows = pick.slice(0, 3);
    const cols = pick.slice(3, 6);

    let ok = true;
    for (const r of rows) {
      for (const c of cols) {
        // Twee criteria van dezelfde "soort" snijden vaak nooit
        // (een speler heeft één positie/nationaliteit) -> cellSolvable vangt dat op.
        if (!cellSolvable(r, c, empty)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (ok) return { rows, cols };
  }
  return null; // zou vrijwel nooit gebeuren
}

/* ---------- Spelstatus ---------- */

const state = {
  rows: [],
  cols: [],
  board: [],       // 9 cellen: null of { player: "X"/"O", name: "Speler" }
  current: "X",
  usedNames: new Set(),
  finished: false,
  winner: null,    // "X" | "O" | "draw" | null
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

function newGame() {
  const grid = generateGrid();
  state.rows = grid.rows;
  state.cols = grid.cols;
  state.board = new Array(9).fill(null);
  state.current = "X";
  state.usedNames = new Set();
  state.finished = false;
  state.winner = null;
  render();
}

/* ---------- Rendering ---------- */

const $ = (sel) => document.querySelector(sel);

function render() {
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
}

/* ---------- Interactie: een vakje spelen ---------- */

let activeIdx = null;

function openGuess(idx) {
  if (state.finished || state.board[idx]) return;
  activeIdx = idx;
  const r = Math.floor(idx / 3);
  const c = idx % 3;
  $("#modal-title").textContent = `${state.rows[r].label}  ✕  ${state.cols[c].label}`;
  $("#modal-sub").textContent = `Speler ${state.current} — noem een SV Zulte Waregem-speler die aan beide voldoet`;
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
  const allowed = PLAYERS.filter(
    (p) => rowCat.test(p) && colCat.test(p) && !state.usedNames.has(p.name)
  );

  const val = $("#guess-input").value;
  const match = matchPlayer(val, PLAYERS.filter((p) => !state.usedNames.has(p.name)));

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
      finishTurn(true);
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
    finishTurn(false);
  }, 900);
}

// Na een beurt: winnaar checken en van speler wisselen.
function finishTurn(claimed) {
  const res = checkWinner();
  if (res) {
    state.finished = true;
    state.winner = res.player;
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
  const sorted = [...PLAYERS].sort((a, b) => a.name.localeCompare(b.name));
  list.innerHTML = sorted
    .map((p) => `<li><strong>${p.name}</strong> <span class="meta">${POSITION_LABELS[p.pos]} · ${p.nat}</span></li>`)
    .join("");
  $("#player-count").textContent = PLAYERS.length;
}

/* ---------- Event-koppeling ---------- */

document.addEventListener("DOMContentLoaded", () => {
  renderPlayerList();
  newGame();

  $("#board").addEventListener("click", (e) => {
    const btn = e.target.closest(".cell");
    if (btn && !btn.disabled) openGuess(Number(btn.dataset.idx));
  });

  $("#new-game").addEventListener("click", newGame);
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
    $("#players-panel").classList.toggle("open");
  });
});
