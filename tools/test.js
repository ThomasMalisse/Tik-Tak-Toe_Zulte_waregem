/*
 * Headless test: laadt de spelscripts met een minimale DOM- en fetch-stub,
 * genereert voor elke club een raster en speelt potjes uit in beide modi.
 *
 * Draaien:  node tools/test.js
 * Geen dependencies; enkel node en een gegenereerde data/-map.
 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const dir = path.join(__dirname, "..", "esseveetictactoe") + path.sep;

// Minimale maar echte DOM-stub: elk element is een apart object met kinderen,
// zodat de opbouw via createElement/appendChild ook echt uitgevoerd wordt.
function makeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    children: [], value: "", textContent: "", className: "", disabled: false,
    type: "", dataset: {}, attrs: {}, style: {},
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {}, focus() {},
    querySelector() { return null; },
    closest() { return null; },
    classList: { add() {}, remove() {}, toggle() {} },
  };
}

function makeCtx() {
  const store = {};
  const el = makeElement("div");     // gedeelde stub voor $("...")-lookups
  const ctx = {
    console, __testEl: el,
    document: { querySelector: () => el, querySelectorAll: () => [],
                createElement: (t) => makeElement(t),
                createElementNS: (_ns, t) => makeElement(t),
                createTextNode: (t) => ({ textContent: String(t), children: [] }),
                addEventListener: () => {},
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
  for (const f of ["bot.js", "players.js", "categories.js", "game.js"])
    vm.runInContext(fs.readFileSync(dir + f, "utf8"), ctx, { filename: f });
  vm.runInContext(`globalThis.api = { state, startGame, newGame, openGuess,
    submitGuess, allowedForCell, filledCells, dedupePlayers, withOwnClub,
    suggestPlayers, eligibleCategories, generateGrid, loadClubs, loadRosters,
    rosterFor, clubById, loadBest, gameStuck, nextGame, saveScore, botMove,
    botPickCell, BOT_LEVELS, playersForCategory, todayKey, withSeed, dailyShareText,
    getClubs: () => CLUBS, shuffleForTest: shuffle }`, ctx);
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
    ctx.__testEl.value = wrong || !options.length ? "zzz onbestaande naam" : options[0].name;
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

  console.log("\n--- interland-criterium ---");
  const ictx = makeCtx();
  await ictx.api.loadClubs();
  await ictx.api.loadRosters(["zulte-waregem"]);
  const iPool = ictx.api.rosterFor("zulte-waregem");
  const iCats = ictx.api.eligibleCategories(iPool, 3);
  const duivel = iCats.find((c) => c.id === "intl:België");
  check("criterium 'Rode Duivel' bestaat", Boolean(duivel),
        duivel ? duivel.label + ", " + ictx.api.playersForCategory(duivel, iPool).length + " spelers" : "niet gevonden");
  const anders = iCats.filter((c) => c.kind === "intl" && c.id !== "intl:België");
  check("ook andere landen als criterium", anders.length > 0,
        anders.slice(0, 4).map((c) => c.label).join(", "));

  // Komt het ook echt op een bord terecht?
  let gezien = 0;
  for (let i = 0; i < 60; i++) {
    const g = ictx.api.generateGrid(iPool);
    if (g && [...g.rows, ...g.cols].some((c) => c.kind === "intl")) gezien++;
  }
  check("interlandcriterium komt op het bord", gezien > 10,
        gezien + " van 60 rasters");

  console.log("\n--- trainer-criterium ---");
  const tCats = ictx.api.eligibleCategories(iPool, 3).filter((c) => c.kind === "coach");
  check("trainers als criterium", tCats.length > 0,
        tCats.map((c) => c.label.replace("Speelde onder ", "") +
                 " (" + ictx.api.playersForCategory(c, iPool).length + ")").join(", "));

  // Verschijnen ze ook echt, en verdringen ze de decennia?
  let metCoach = 0, metEra = 0;
  for (let i = 0; i < 100; i++) {
    const g = ictx.api.generateGrid(iPool);
    if (!g) continue;
    const soorten = [...g.rows, ...g.cols].map((c) => c.kind);
    if (soorten.includes("coach")) metCoach++;
    if (soorten.includes("era")) metEra++;
  }
  console.log(`       van 100 rasters: ${metCoach} met een trainer, ${metEra} met een decennium`);
  check("trainer komt vaker dan een decennium", metCoach > metEra,
        metCoach + " tegen " + metEra);

  console.log("\n--- puzzel van vandaag ---");
  // De hele belofte: dezelfde dag = hetzelfde raster, voor iedereen. We doen
  // alsof twee verschillende bezoekers hem openen (twee losse contexten).
  const dagKey = ictx.api.todayKey();
  const dagA = makeCtx(), dagB = makeCtx();
  await dagA.api.loadClubs();
  await dagB.api.loadClubs();
  const club1 = dagA.api.withSeed(dagKey, () => dagA.api.shuffleForTest(dagA.api.getClubs().map((c) => c.id))[0]);
  const club2 = dagB.api.withSeed(dagKey, () => dagB.api.shuffleForTest(dagB.api.getClubs().map((c) => c.id))[0]);
  check("zelfde club voor iedereen", Boolean(club1) && club1 === club2, club1);

  await dagA.api.loadRosters([club1]); await dagB.api.loadRosters([club2]);
  const g1 = dagA.api.withSeed(dagKey, () => dagA.api.generateGrid(dagA.api.rosterFor(club1)));
  const g2 = dagB.api.withSeed(dagKey, () => dagB.api.generateGrid(dagB.api.rosterFor(club2)));
  const sleutel = (g) => g ? [...g.rows, ...g.cols].map((c) => c.id).join("|") : "geen";
  check("zelfde raster voor iedereen", sleutel(g1) === sleutel(g2) && g1,
        sleutel(g1).slice(0, 70) + "…");

  // En morgen moet het een ánder raster zijn.
  const g3 = dagA.api.withSeed(dagKey + 1, () => dagA.api.generateGrid(dagA.api.rosterFor(club1)));
  check("morgen een ander raster", sleutel(g3) !== sleutel(g1));

  console.log("\n--- de bot ---");
  const botCtx = makeCtx();
  await botCtx.api.loadClubs();
  await botCtx.api.loadRosters(["zulte-waregem"]);
  const botPool = botCtx.api.rosterFor("zulte-waregem");
  const alles = (i) => botPool.slice(0, 30);   // altijd oplossingen beschikbaar

  // Alle bottests zijn statistisch: de bot blundert en past met opzet, dus één
  // enkele worp zegt niets over of hij het goed doet.
  const hoeVaak = (bord, level, idx, n = 600) => {
    let raak = 0;
    for (let i = 0; i < n; i++) {
      const z = botCtx.api.botMove(bord, level, "O", alles);
      if (z && z.idx === idx) raak++;
    }
    return Math.round(100 * raak / n);
  };

  // 1. Wint hij als hij kan winnen?
  const winbord = [ {player:"O",name:"a"}, {player:"O",name:"b"}, null,
                    null, {player:"X",name:"c"}, null, null, null, null ];
  const winPct = hoeVaak(winbord, "moeilijk", 2);
  check("bot maakt drie op een rij af", winPct > 80, winPct + "% van de keren");

  // 2. Blokkeert hij?
  const blokbord = [ {player:"X",name:"a"}, {player:"X",name:"b"}, null,
                     null, {player:"O",name:"c"}, null, null, null, null ];
  const blokPct = hoeVaak(blokbord, "moeilijk", 2);
  check("bot blokkeert drie op een rij", blokPct > 80, blokPct + "% van de keren");

  // 3. Neemt hij op een leeg bord meestal het midden? (Eén worp zegt niets:
  //    ook een sterke bot blundert of past af en toe.)
  const leeg = new Array(9).fill(null);
  const middenPct = hoeVaak(leeg, "moeilijk", 4);
  check("bot neemt meestal het midden", middenPct > 80, middenPct + "% van de keren");

  // 4. Verschillen de niveaus echt? Meet hoe vaak hij een dreiging blokkeert.
  const blokkeerKans = (level) => hoeVaak(blokbord, level, 2);
  const m = blokkeerKans("makkelijk"), n = blokkeerKans("normaal"), z = blokkeerKans("moeilijk");
  console.log(`       blokkeert een dreiging: makkelijk ${m}%, normaal ${n}%, moeilijk ${z}%`);
  check("moeilijker = scherper spel", m < n && n < z, `${m} < ${n} < ${z}`);

  // 5. En laat hij op makkelijk vaker zijn beurt lopen?
  const passKans = (level) => {
    let gepast = 0;
    for (let i = 0; i < 600; i++) {
      if (!botCtx.api.botMove(leeg, level, "O", alles)) gepast++;
    }
    return Math.round(100 * gepast / 600);
  };
  const pm = passKans("makkelijk"), pz = passKans("moeilijk");
  console.log(`       laat zijn beurt lopen: makkelijk ${pm}%, moeilijk ${pz}%`);
  check("makkelijke bot past vaker", pm > pz, `${pm}% tegen ${pz}%`);

  // 6. Geeft hij altijd een geldige naam terug?
  let ongeldig = 0;
  for (let i = 0; i < 200; i++) {
    const z2 = botCtx.api.botMove(leeg, "moeilijk", "O", (idx) => botPool.slice(0, 5));
    if (z2 && !botPool.slice(0, 5).some((p) => p.name === z2.name)) ongeldig++;
  }
  check("bot noemt alleen geldige spelers", ongeldig === 0, ongeldig + " fout");

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
