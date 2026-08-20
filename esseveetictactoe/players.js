/*
 * Spelersdatabase — SV Zulte Waregem ("Essevee")
 * -------------------------------------------------
 * Een zorgvuldig samengestelde selectie van (oud-)spelers.
 * Per speler:
 *   name  : volledige naam (zo wordt hij getoond)
 *   pos   : positie  -> "GK" | "DEF" | "MID" | "FWD"
 *   nat   : nationaliteit (label in het Nederlands)
 *   clubs : andere profclubs waar hij speelde (enkel clubs uit CLUB_VOCAB)
 *
 * Enkel gegevens die met redelijke zekerheid kloppen zijn opgenomen.
 * Het spel genereert alleen rasters waarvoor elk vakje oplosbaar is,
 * dus een onvolledige "clubs"-lijst maakt het spel nooit onspeelbaar.
 */

const PLAYERS = [
  { name: "Sammy Bossut",          pos: "GK",  nat: "België",                    clubs: [] },
  { name: "Davino Verhulst",       pos: "GK",  nat: "België",                    clubs: [] },
  { name: "Sven Kums",             pos: "MID", nat: "België",                    clubs: ["Anderlecht", "KAA Gent"] },
  { name: "Thorgan Hazard",        pos: "MID", nat: "België",                    clubs: ["Anderlecht"] },
  { name: "Mbaye Leye",            pos: "FWD", nat: "Senegal",                   clubs: ["Standard", "Charleroi"] },
  { name: "Teddy Chevalier",       pos: "FWD", nat: "Frankrijk",                 clubs: ["KV Kortrijk"] },
  { name: "Hamdi Harbaoui",        pos: "FWD", nat: "Tunesië",                   clubs: ["Anderlecht"] },
  { name: "Franck Berrier",        pos: "MID", nat: "Frankrijk",                 clubs: ["KV Oostende"] },
  { name: "Timothy Derijck",       pos: "DEF", nat: "België",                    clubs: ["KAA Gent", "KRC Genk"] },
  { name: "Nill De Pauw",          pos: "MID", nat: "België",                    clubs: [] },
  { name: "Damien Marcq",          pos: "MID", nat: "Frankrijk",                 clubs: ["Anderlecht", "Charleroi"] },
  { name: "Idriss Saadi",          pos: "FWD", nat: "Algerije",                  clubs: ["KV Kortrijk"] },
  { name: "Jean-Luc Dompé",        pos: "MID", nat: "Frankrijk",                 clubs: [] },
  { name: "Saido Berahino",        pos: "FWD", nat: "Burundi",                   clubs: [] },
  { name: "Gianni Bruno",          pos: "FWD", nat: "België",                    clubs: ["Standard", "KRC Genk"] },
  { name: "Zinho Gano",            pos: "FWD", nat: "België",                    clubs: ["KRC Genk", "KV Oostende"] },
  { name: "Thomas Buffel",         pos: "MID", nat: "België",                    clubs: ["KRC Genk"] },
  { name: "Julien De Sart",        pos: "MID", nat: "België",                    clubs: ["Standard", "KAA Gent"] },
  { name: "Jelle Vossen",          pos: "FWD", nat: "België",                    clubs: ["KRC Genk"] },
  { name: "Bernd Thijs",           pos: "MID", nat: "België",                    clubs: ["KAA Gent"] },
  { name: "Davy De fauw",          pos: "DEF", nat: "België",                    clubs: [] },
  { name: "Peter Balette",         pos: "DEF", nat: "België",                    clubs: [] },
  { name: "Marvin Baudry",         pos: "DEF", nat: "DR Congo",                  clubs: [] },
  { name: "Onur Kaya",             pos: "MID", nat: "België",                    clubs: [] },
  { name: "Kevin Vandendriessche", pos: "MID", nat: "België",                    clubs: ["KAA Gent", "KV Oostende"] },
  { name: "Sander Coopman",        pos: "MID", nat: "België",                    clubs: ["KV Oostende"] },
  { name: "Louis Verstraete",      pos: "MID", nat: "België",                    clubs: [] },
  { name: "Cristian Ceballos",     pos: "MID", nat: "Spanje",                    clubs: [] },
  { name: "Karim Belhocine",       pos: "MID", nat: "Algerije",                  clubs: ["KV Kortrijk", "Charleroi"] },
  { name: "Habib Habibou",         pos: "FWD", nat: "Centraal-Afrikaanse Rep.",  clubs: ["Charleroi"] },
];

/* Vaste lijst van clubs die als criterium kunnen dienen. */
const CLUB_VOCAB = [
  "Anderlecht",
  "Standard",
  "KRC Genk",
  "KAA Gent",
  "KV Kortrijk",
  "KV Oostende",
  "Charleroi",
];
