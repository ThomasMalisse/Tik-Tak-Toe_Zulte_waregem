/*
 * Online potjes testen tegen de ECHTE Supabase-database.
 *
 * Draaien:  node tools/test-online.js
 * Vereist een ingevulde config.js. Het laat een testpotje achter in de
 * database; die worden na twee dagen opgeruimd door cleanup_old_games().
 *
 * Wat hier gecontroleerd wordt is vooral de beveiliging: dat je niet buiten je
 * beurt kan spelen, geen bezet vakje kan innemen en geen speler twee keer kan
 * gebruiken. Zie ook SECURITY.md.
 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const dir = path.join(__dirname, "..", "esseveetictactoe") + path.sep;

// De bibliotheek en de config in Node's eigen context draaien: die heeft
// fetch, WebSocket, crypto en URL al, precies zoals een browser.
vm.runInThisContext(fs.readFileSync(dir + "vendor/supabase.js", "utf8"));
vm.runInThisContext(fs.readFileSync(dir + "config.js", "utf8"));
const cfg = vm.runInThisContext("({url: SUPABASE_URL, key: SUPABASE_ANON_KEY})");

function loadLib() {
  return supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false } });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (label, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${extra ? "  — " + extra : ""}`);
};

(async () => {
  const A = loadLib(), B = loadLib();
  const code = "ESSV-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const tokA = "a".repeat(32), tokB = "b".repeat(32);
  console.log("potje:", code);

  // A abonneert zich VOOR er iets gebeurt
  let received = [];
  const chan = A.channel("game:" + code).on("postgres_changes",
    { event: "UPDATE", schema: "public", table: "games", filter: "code=eq." + code },
    (p) => received.push(p.new));
  await new Promise((res) => chan.subscribe((s) => s === "SUBSCRIBED" && res()));
  check("realtime-abonnement actief", true);

  const r1 = await A.rpc("create_game", { p_code: code, p_club_ids: ["stvv"],
    p_row_ids: ["pos:GK", "pos:DEF", "pos:MID"],
    p_col_ids: ["nat:België", "era:2010", "era:2000"], p_token: tokA });
  check("potje aangemaakt", !r1.error && r1.data.code === code, r1.error?.message);

  const r2 = await B.rpc("join_game", { p_code: code, p_token: tokB });
  check("tegenstander doet mee", !r2.error && r2.data.joined === true, r2.error?.message);

  await wait(2500);
  const liveJoined = received.some((g) => g.joined === true);
  if (!liveJoined) {
    // Vangnet zoals in online.js: gewoon zelf gaan kijken.
    const { data } = await A.from("games").select("*").eq("code", code).maybeSingle();
    check("vangnet ving de gemiste 'joined' op", Boolean(data && data.joined),
          "realtime miste hem");
  } else {
    check("A kreeg 'joined' live binnen", true, received.length + " updates");
  }

  received = [];
  const r3 = await B.rpc("play_move", { p_code: code, p_token: tokB, p_idx: 0, p_name: "Test" });
  check("B mag niet beginnen (X is aan zet)", Boolean(r3.error), r3.error?.message);

  const r4 = await A.rpc("play_move", { p_code: code, p_token: tokA, p_idx: 0, p_name: "Speler Een" });
  check("A zet en beurt gaat over", !r4.error && r4.data.turn === "O", r4.error?.message);

  await wait(2500);
  const zag = received.find((g) => g.board[0] && g.board[0].name === "Speler Een");
  check("zet kwam live door", Boolean(zag), received.length + " updates");

  const r5 = await B.rpc("play_move", { p_code: code, p_token: tokB, p_idx: 1, p_name: "Speler Een" });
  check("dezelfde speler twee keer geweigerd", Boolean(r5.error), r5.error?.message);

  const r6 = await B.rpc("play_move", { p_code: code, p_token: tokB, p_idx: 0, p_name: "Iets" });
  check("bezet vakje geweigerd", Boolean(r6.error), r6.error?.message);

  const r7 = await A.rpc("finish_game", { p_code: code, p_token: tokA, p_winner: "X" });
  check("potje afsluiten", !r7.error && r7.data.finished === true, r7.error?.message);

  await A.removeChannel(chan);
  console.log(fails ? `\n${fails} gefaald` : "\nalles ok");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("EXCEPTIE:", e.message); process.exit(1); });
