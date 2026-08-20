/*
 * Categorieën (criteria) voor het raster.
 * Elke categorie heeft een label (getoond op het bord) en een test(speler)
 * die true geeft wanneer die speler aan het criterium voldoet.
 */

const POSITION_LABELS = {
  GK:  "Doelman",
  DEF: "Verdediger",
  MID: "Middenvelder",
  FWD: "Aanvaller",
};

function buildCategories() {
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

  // Nationaliteit-criteria (voor elke nationaliteit in de database)
  const nats = [...new Set(PLAYERS.map((p) => p.nat))];
  nats.forEach((nat) => {
    cats.push({
      id: "nat:" + nat,
      label: nat,
      kind: "nat",
      test: (p) => p.nat === nat,
    });
  });

  // Club-criteria ("speelde ook voor ...")
  CLUB_VOCAB.forEach((club) => {
    cats.push({
      id: "club:" + club,
      label: "Ook bij " + club,
      kind: "club",
      test: (p) => p.clubs.includes(club),
    });
  });

  return cats;
}

const ALL_CATEGORIES = buildCategories();

/* Spelers die aan een categorie voldoen. */
function playersForCategory(cat) {
  return PLAYERS.filter((p) => cat.test(p));
}

/*
 * Enkel categorieën met genoeg spelers zijn "eligible" om als as van het
 * raster te dienen. Zo blijven de rasters eerlijk en oplosbaar.
 */
function eligibleCategories(minPlayers = 3) {
  return ALL_CATEGORIES.filter((c) => playersForCategory(c).length >= minPlayers);
}
