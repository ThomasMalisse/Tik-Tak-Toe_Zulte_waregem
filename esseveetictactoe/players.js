/*
 * Clubs & spelersdatabase — Boter Kaas & Eieren, Belgische editie
 * -------------------------------------------------------------
 * CLUBS       : de 16 Jupiler Pro League-clubs (seizoen 2025-26), elk met
 *               een id, weergavenaam en twee clubkleuren (voor de theming).
 * ROSTERS     : per club-id een lijst (oud-)spelers. Enkel "zulte-waregem"
 *               is momenteel ingevuld. De andere clubs starten leeg — voeg
 *               gewoon spelers toe volgens hetzelfde patroon (zie README).
 *
 * Per speler:
 *   name  : volledige naam (zo wordt hij getoond)
 *   pos   : positie  -> "GK" | "DEF" | "MID" | "FWD"
 *   nat   : nationaliteit (label in het Nederlands)
 *   clubs : andere clubs waar hij ooit speelde (vrije tekst, voor het
 *           "Ook bij ..."-criterium)
 */

const CLUBS = [
  { id: "zulte-waregem", name: "Zulte Waregem",   colors: ["#d81f2a", "#1a7a3c"] },
  { id: "club-brugge",   name: "Club Brugge",     colors: ["#0f56a3", "#111111"] },
  { id: "anderlecht",    name: "Anderlecht",      colors: ["#6f2c91", "#f0b90b"] },
  { id: "krc-genk",      name: "KRC Genk",        colors: ["#0c3f91", "#4fb8e8"] },
  { id: "standard",      name: "Standard Luik",   colors: ["#d81f2a", "#111111"] },
  { id: "antwerp",       name: "Royal Antwerp",   colors: ["#a3121a", "#111111"] },
  { id: "kaa-gent",      name: "KAA Gent",        colors: ["#0c3f91", "#111111"] },
  { id: "charleroi",     name: "Charleroi",       colors: ["#111111", "#c8102e"] },
  { id: "cercle-brugge", name: "Cercle Brugge",   colors: ["#1a7a3c", "#111111"] },
  { id: "union-sg",      name: "Union SG",        colors: ["#f0b90b", "#0c3f91"] },
  { id: "stvv",          name: "STVV",            colors: ["#f0d80b", "#111111"] },
  { id: "westerlo",      name: "KV Westerlo",     colors: ["#f0b90b", "#0c3f91"] },
  { id: "mechelen",      name: "KV Mechelen",     colors: ["#f0d80b", "#c8102e"] },
  { id: "ohl",           name: "OH Leuven",       colors: ["#0c3f91", "#111111"] },
  { id: "raal",          name: "RAAL La Louvière", colors: ["#c8102e", "#f0b90b"] },
  { id: "dender",        name: "FCV Dender",      colors: ["#f0913a", "#111111"] },
];

function clubById(id) {
  return CLUBS.find((c) => c.id === id) || null;
}

const ROSTERS = {
  "zulte-waregem": [
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
  ],

  /* Nog leeg — voeg spelers toe volgens hetzelfde patroon als hierboven. */
  "club-brugge": [],
  "anderlecht": [],
  "krc-genk": [],
  "standard": [],
  "antwerp": [],
  "kaa-gent": [],
  "charleroi": [],
  "cercle-brugge": [],
  "union-sg": [],
  "stvv": [],
  "westerlo": [],
  "mechelen": [],
  "ohl": [],
  "raal": [],
  "dender": [],
};

function rosterFor(clubId) {
  return ROSTERS[clubId] || [];
}
