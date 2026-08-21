/*
 * Categorieën (criteria) voor het raster.
 * Elke categorie heeft een label (getoond op het bord) en een test(speler)
 * die true geeft wanneer die speler aan het criterium voldoet.
 *
 * Generiek gemaakt: de categorieën worden opgebouwd uit een gegeven
 * spelerspool (de roster van de gekozen club, of de samengevoegde roster
 * van twee clubs bij "Heel België"), in plaats van één vaste database.
 */

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];

const POSITION_LABELS = {
  GK:  "Doelman",
  DEF: "Verdediger",
  MID: "Middenvelder",
  FWD: "Aanvaller",
};

function buildCategories(players) {
  const cats = [];

  // Positie-criteria
  Object.keys(POSITION_LABELS).forEach((pos) => {
    cats.push({
      id: "pos:" + pos,
      label: POSITION_LABELS[pos],
      kind: "pos",
      test: (p) => p.pos === pos,
    });
  });

  // Nationaliteit-criteria (voor elke nationaliteit in de pool)
  const nats = [...new Set(players.map((p) => p.nat))];
  nats.forEach((nat) => {
    cats.push({
      id: "nat:" + nat,
      label: nat,
      kind: "nat",
      test: (p) => p.nat === nat,
    });
  });

  // Club-criteria ("speelde ook voor ...")
  const clubNames = [...new Set(players.flatMap((p) => p.clubs))];
  clubNames.forEach((club) => {
    cats.push({
      id: "club:" + club,
      label: "Ook bij " + club,
      kind: "club",
      test: (p) => p.clubs.includes(club),
    });
  });

  /*
   * Interland-criteria. "Rode Duivel" is het bekendste vakje dat er bestaat in
   * dit spel; voor andere landen wordt het "Interland voor Nigeria".
   */
  const landen = [...new Set(players.flatMap((p) => p.intl || []))];
  landen.forEach((land) => {
    cats.push({
      id: "intl:" + land,
      label: land === "België" ? "Rode Duivel" : "Interland voor " + land,
      kind: "intl",
      test: (p) => (p.intl || []).includes(land),
    });
  });

  /*
   * Trainer-criteria. Veel sprekender dan een decennium: "Speelde onder Francky
   * Dury" roept meteen een periode op, met een gezicht erbij.
   */
  const trainers = [...new Set(players.flatMap((p) => p.coaches || []))];
  trainers.forEach((naam) => {
    cats.push({
      id: "coach:" + naam,
      label: "Speelde onder " + naam,
      kind: "coach",
      test: (p) => (p.coaches || []).includes(naam),
    });
  });

  // Tijdvak-criteria ("speelde er in de jaren ...") — dit maakt het verschil
  // tussen de oude garde en de huidige kern.
  DECADES.forEach((decade) => {
    if (!players.some((p) => playedInDecade(p, decade))) return;
    cats.push({
      id: "era:" + decade,
      label: "Jaren " + decade,
      kind: "era",
      test: (p) => playedInDecade(p, decade),
    });
  });

  return cats;
}

/*
 * Speelde deze speler ergens in het decennium dat op `decade` start?
 * from/to zijn de jaren bij de club waarvoor de pool gemaakt is; ze mogen
 * null zijn (onbekend bij Wikidata) — dan telt de speler niet mee.
 */
function playedInDecade(p, decade) {
  const from = p.from != null ? p.from : p.to;
  const to = p.to != null ? p.to : p.from;
  if (from == null || to == null) return false;
  return from <= decade + 9 && to >= decade;
}

/*
 * Categorieën terugzoeken op hun id, in de gegeven volgorde.
 *
 * Nodig voor online potjes: de database bewaart alleen de id's van de zes
 * criteria ("pos:GK", "club:KAA Gent", "era:2010"). Beide browsers bouwen
 * daaruit hetzelfde raster op uit hun eigen spelersdata. Ontbreekt er één,
 * dan geven we null terug — dan lopen de databases van beide spelers uiteen
 * en heeft doorspelen geen zin.
 */
function categoriesByIds(players, ids) {
  const byId = new Map(buildCategories(players).map((c) => [c.id, c]));
  const found = ids.map((id) => byId.get(id) || null);
  return found.every(Boolean) ? found : null;
}

/* Spelers uit een pool die aan een categorie voldoen. */
function playersForCategory(cat, players) {
  return players.filter((p) => cat.test(p));
}

/*
 * Enkel categorieën met genoeg spelers zijn "eligible" om als as van het
 * raster te dienen. Zo blijven de rasters eerlijk en oplosbaar.
 */
function eligibleCategories(players, minPlayers = 3) {
  return buildCategories(players).filter(
    (c) => playersForCategory(c, players).length >= minPlayers
  );
}
