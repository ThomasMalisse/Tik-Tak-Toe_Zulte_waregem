/*
 * Categorieën (criteria) voor het raster.
 * Elke categorie heeft een label (getoond op het bord) en een test(speler)
 * die true geeft wanneer die speler aan het criterium voldoet.
 *
 * Generiek gemaakt: de categorieën worden opgebouwd uit een gegeven
 * spelerspool (de roster van de gekozen club, of de samengevoegde roster
 * van twee clubs bij "Heel België"), in plaats van één vaste database.
 */

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

  return cats;
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
