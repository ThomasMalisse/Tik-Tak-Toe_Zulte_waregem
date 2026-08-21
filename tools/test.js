/*
 * Headless test: laadt de spelscripts met een minimale DOM- en fetch-stub,
 * genereert voor elke club een raster en speelt potjes uit in beide modi.
 *
 * Draaien:  node tools/test.js
 * Geen dependencies; enkel node en een gegenereerde data/-map.
 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const dir = path.join(__dirname, "..", "esseveetictactoe") + path.sep;

function makeCtx() {
  const store = {};
  const el = {
    value: "", innerHTML: "", textContent: "", className: "", disabled: false,
    dataset: {}, addEventListener(){}, appendChild(){}, setAttribute(){},
    insertAdjacentHTML(){}, querySelector(){ return el; }, focus(){},
    classList: { add(){}, remove(){}, toggle(){} },
  };
  const ctx = {
    console, el,
    document: { querySelector: () => el, querySelectorAll: () => [],
                createElement: () => el, addEventListener: () => {},
                documentElement: { style: { setProperty(){} } } },
    window: { scrollTo(){} },
    location: { protocol: "http:" },
    setTimeout: (fn) => fn(),
    localStorage: { getItem: (k) => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); } },
    // fetch leest gewoon van schijf
    fetch: async (p) => {
      const file = path.join(dir, p);
      if (!fs.existsSync(file)) return { ok: false, status: 404 };
      return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
    },
  };
  vm.createContext(ctx);
  for (const f of ["players.js", "categories.js", "game.js"])
    vm.runInContext(fs.readFileSync(dir + f, "utf8"), ctx, { filename: f });
  vm.runInContext(`globalThis.api = { state, startGame, newGame, openGuess,
    submitGuess, allowedForCell, filledCells, dedupePlayers, withOwnClub,
    suggestPlayers, eligibleCategories, generateGrid, loadClubs, loadRosters,
    rosterFor, clubById, loadBest, gameStuck, nextGame, saveScore }`, ctx);
  return ctx;
}

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? "  — " + detail : ""}`);
}

async function playGame(ctx, { solo, mode, clubIds, wrongEvery }) {
  const api = ctx.api;
  await api.loadClubs();
  api.state.solo = solo;
  await api.startGame(mode, clubIds);
  if (!api.state.playable) return { error: "geen raster" };
  let turns = 0;
  while (!api.state.finished && turns < 40) {
    const free = api.state.board.map((c, i) => (c ? null : i)).filter((i) => i !== null);
    if (!free.length) break;
    const idx = free[0];
    api.openGuess(idx);
    const options = api.allowedForCell(idx);
    const wrong = wrongEvery && turns % wrongEvery === 0;
    ctx.el.value = wrong || !options.length ? "zzz onbestaande naam" : options[0].name;
    api.submitGuess();
    turns++;
  }
  return { finished: api.state.finished, filled: api.filledCells(),
           guessesLeft: api.state.guessesLeft, winner: api.state.winner,
           best: api.state.best, turns };
}

(async () => {
  const ctx = makeCtx(), api = ctx.api;
  const clubs = await api.loadClubs();
  check("clubs.json geladen", clubs.length === 16, `${clubs.length} clubs`);

  console.log("\n--- raster per club ---");
  for (const club of clubs) {
    await api.loadRosters([club.id]);
    const players = api.rosterFor(club.id);
    const cats = api.eligibleCategories(players, 3);
    let grid = null;
    for (let i = 0; i < 5 && !grid; i++) grid = api.generateGrid(players);
    check(`${club.name.padEnd(18)} ${String(players.length).padStart(4)} spelers, ${String(cats.length).padStart(3)} criteria`, !!grid);
  }

  console.log("\n--- potjes uitspelen ---");
  for (const c of [{solo:true, label:"solo, altijd juist"},
                   {solo:true, wrongEvery:2, label:"solo, elke 2e fout"},
                   {solo:false, label:"duo, altijd juist"}]) {
    const r = await playGame(makeCtx(), {...c, mode:"essevee", clubIds:["zulte-waregem"]});
    check(c.label, r.finished === true, JSON.stringify(r));
  }
  const mix = await playGame(makeCtx(), {solo:false, mode:"belgium", clubIds:["zulte-waregem","anderlecht"]});
  check("mix, altijd juist", mix.finished === true, JSON.stringify(mix));

  console.log("\n--- mix-modus: eigen club telt mee als criterium ---");
  const c2 = makeCtx();
  await c2.api.loadClubs();
  await c2.api.loadRosters(["zulte-waregem", "anderlecht"]);
  const pool = c2.api.dedupePlayers(["zulte-waregem","anderlecht"].flatMap(c2.api.withOwnClub));
  const bossut = pool.find((p) => p.name === "Sammy Bossut");
  const kums = pool.find((p) => p.name === "Sven Kums");
  check("Bossut voldoet aan 'Ook bij Zulte Waregem'", !!bossut && bossut.clubs.includes("Zulte Waregem"));
  check("Kums voldoet aan 'Ook bij Zulte Waregem'", !!kums && kums.clubs.includes("Zulte Waregem"));

  console.log("\n--- Heel Belgie: nieuw potje = nieuwe affiche ---");
  const bctx0 = makeCtx();
  await bctx0.api.loadClubs();
  await bctx0.api.startGame("belgium", ["zulte-waregem", "anderlecht"]);
  bctx0.api.state.score.X = 3;
  bctx0.api.saveScore();   // in het spel gebeurt dit als een potje eindigt
  const eerste = bctx0.api.state.clubIds.slice().sort().join("+");
  const paren = new Set([eerste]);
  for (let i = 0; i < 4; i++) {
    const vorige = bctx0.api.state.clubIds.slice().sort().join("+");
    await bctx0.api.nextGame();
    const nu = bctx0.api.state.clubIds.slice().sort().join("+");
    check(`potje ${i + 2}: andere ploegen dan daarnet`, nu !== vorige, nu);
    paren.add(nu);
  }
  check("stand loopt door over de affiches", bctx0.api.state.score.X === 3,
        "X=" + bctx0.api.state.score.X);
  check("meerdere verschillende affiches gezien", paren.size >= 3, paren.size + " unieke");

  // Bij een vaste club moet "nieuw potje" juist dezelfde ploeg houden.
  const cctx = makeCtx();
  await cctx.api.loadClubs();
  await cctx.api.startGame("club", ["stvv"]);
  await cctx.api.nextGame();
  check("vaste club blijft dezelfde ploeg", cctx.api.state.clubIds.join() === "stvv",
        cctx.api.state.clubIds.join());

  console.log("\n--- bundel voor file:// ---");
  // Bij file:// blokkeert de browser fetch en laden we data/bundle.js in plaats
  // van de losse bestanden. Beide moeten dus hetzelfde bevatten.
  const bundleSrc = fs.readFileSync(path.join(dir, "data", "bundle.js"), "utf8");
  const bctx = { window: {} };
  vm.createContext(bctx);
  vm.runInContext(bundleSrc, bctx);
  const bundle = bctx.window.__BKE_DATA;
  check("bundle.js bevat de clubs", bundle && bundle.clubs.length === clubs.length);
  let mismatch = null;
  for (const club of clubs) {
    const fromFile = JSON.parse(fs.readFileSync(path.join(dir, "data", club.id + ".json"), "utf8"));
    if (JSON.stringify(fromFile) !== JSON.stringify(bundle.rosters[club.id])) mismatch = club.id;
  }
  check("bundel en losse bestanden zijn gelijk", !mismatch, mismatch || "alle 16 clubs");

  console.log("\n--- suggesties ---");
  const zw = c2.api.rosterFor("zulte-waregem");
  for (const [q, expect] of [["hazard", 2], ["kums", 1], ["bossu", 1]]) {
    const s = c2.api.suggestPlayers(q, zw, 8);
    check(`"${q}" -> ${s.map((p) => p.name).join(", ") || "(geen)"}`, s.length >= expect);
  }

  console.log(failures ? `\n${failures} controle(s) gefaald` : "\nalles ok");
  process.exit(failures ? 1 : 0);
})();
