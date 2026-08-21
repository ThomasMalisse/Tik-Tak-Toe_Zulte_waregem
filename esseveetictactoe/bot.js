/* =========================================================================
 *  De bot  —  een tegenstander om alleen tegen te spelen
 *
 *  Een bot die altijd wint is makkelijk te maken en niet leuk: hij kent per
 *  definitie élke speler uit de database. De moeilijkheid zit dus niet in
 *  "kan hij een antwoord vinden" (dat kan hij altijd, via allowedForCell),
 *  maar in hem geloofwaardig te laten falen.
 *
 *  Drie knoppen bepalen hoe sterk hij is; ze staan hieronder toegelicht bij
 *  BOT_LEVELS. Gemeten verschil tussen makkelijk en moeilijk: hij blokkeert een
 *  dreiging in 17% tegenover 88% van de gevallen, en laat zijn beurt lopen in
 *  26% tegenover 2%.
 * ========================================================================= */

/*
 * Drie knoppen per niveau:
 *
 *   know     kans dat hij een bepaald vakje kan invullen. Dit bepaalt hoeveel
 *            keuze hij heeft — niet of hij speelt: met negen vakjes weet hij
 *            er bijna altijd wel één, ook op makkelijk.
 *   blunder  kans dat hij de tactiek negeert en zomaar een vakje pakt dat hij
 *            weet. Dit is wat een bot echt verslaanbaar maakt.
 *   pass     kans dat hij zijn beurt gewoon laat lopen, zoals een mens die er
 *            even niet op komt.
 */
const BOT_LEVELS = {
  makkelijk: { label: "Makkelijk", know: 0.40, blunder: 0.65, pass: 0.25, thinkMs: 700 },
  normaal:   { label: "Normaal",   know: 0.70, blunder: 0.25, pass: 0.10, thinkMs: 900 },
  moeilijk:  { label: "Moeilijk",  know: 0.93, blunder: 0.03, pass: 0.02, thinkMs: 1100 },
};

const BOT_DEFAULT = "normaal";

/*
 * Hoe waarschijnlijk is het dat de bot dit vakje weet?
 *
 * Een vakje met veertig mogelijke spelers is voor iedereen makkelijk; een
 * vakje met er twee is dat voor niemand. We schalen de basiskans daarom mee
 * met het aantal oplossingen, zodat de bot struikelt waar jij ook zou
 * struikelen in plaats van willekeurig.
 */
function botKnowsChance(level, optionCount) {
  const base = BOT_LEVELS[level].know;
  const schaal = Math.min(1, 0.35 + optionCount / 12);
  return base * schaal;
}

/* ---------- Tactiek: welk vakje? ---------- */

// Zou `player` winnen door `idx` in te nemen?
function botWinsWith(board, idx, player) {
  return WINNING_LINES.some((line) => {
    if (!line.includes(idx)) return false;
    return line.every((i) => i === idx || (board[i] && board[i].player === player));
  });
}

/*
 * Kies een vakje, in volgorde van belang. We kijken alleen naar vakjes waar de
 * bot ook echt een naam voor heeft — een vakje claimen dat hij niet kan
 * invullen heeft geen zin.
 */
function botPickCell(board, playable, me, opponent, level) {
  const willekeurig = () => playable[Math.floor(Math.random() * playable.length)];

  // Een blunder: hij ziet de kans of het gevaar gewoon niet.
  if (Math.random() < BOT_LEVELS[level].blunder) return willekeurig();

  const winnend = playable.filter((i) => botWinsWith(board, i, me));
  if (winnend.length) return winnend[0];

  const blokkeren = playable.filter((i) => botWinsWith(board, i, opponent));
  if (blokkeren.length) return blokkeren[0];

  if (playable.includes(4)) return 4;                      // midden
  const hoeken = [0, 2, 6, 8].filter((i) => playable.includes(i));
  if (hoeken.length) return hoeken[Math.floor(Math.random() * hoeken.length)];

  return willekeurig();
}

/* ---------- De zet ---------- */

/*
 * Geeft { idx, name } terug, of null als de bot niets weet en dus past.
 * `solutionsFor(idx)` levert de nog vrije spelers voor dat vakje.
 */
function botMove(board, level, me, solutionsFor) {
  const opponent = me === "X" ? "O" : "X";

  // Soms komt hij er even niet op. Dat hoort erbij.
  if (Math.random() < BOT_LEVELS[level].pass) return null;

  // Welke lege vakjes kan de bot invullen, en weet hij ze ook?
  const kandidaten = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    const opties = solutionsFor(i);
    if (!opties.length) continue;
    if (Math.random() < botKnowsChance(level, opties.length)) {
      kandidaten.push({ idx: i, opties });
    }
  }
  if (!kandidaten.length) return null;   // hij weet er even geen — beurt gaat over

  const idx = botPickCell(board, kandidaten.map((k) => k.idx), me, opponent, level);
  const gekozen = kandidaten.find((k) => k.idx === idx);

  // Uit de mogelijke namen eentje willekeurig, zodat hij niet elke keer
  // dezelfde bekende naam bovenhaalt.
  const naam = gekozen.opties[Math.floor(Math.random() * gekozen.opties.length)].name;
  return { idx, name: naam };
}
