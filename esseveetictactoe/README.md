# Essevee Tic-Tac-Toe 🟩🟥

Boter-kaas-en-eieren (tic-tac-toe) met een twist: elk vakje win je door een
speler te noemen die **ooit voor SV Zulte Waregem** speelde én aan het rij- en
kolomcriterium voldoet (positie, nationaliteit, een andere club of het
decennium waarin hij er speelde).

## Zo speel je

Er zijn twee manieren: **met z'n tweeën** (standaard) of **solo**, te wisselen
met de knop `👤 Solo` op het spelscherm.

### Met z'n tweeën

- Twee spelers, **X** en **O**, spelen om beurten (hotseat op één toestel).
- Klik op een vakje. Je krijgt een rij- en een kolomcriterium te zien.
- Typ de naam van een Essevee-speler die aan **beide** voldoet.
  - **Juist** → het vakje is van jou, beurt gaat over.
  - **Fout / onbekend** → beurt gaat over zonder vakje.
- Elke speler mag maar **één keer** in het hele raster gebruikt worden.
- **Drie op een rij** (horizontaal, verticaal of diagonaal) wint. Vol bord zonder
  winnaar = gelijkspel.
- Raakt er geen enkel open vakje meer oplosbaar — spelers zijn immers op na
  gebruik — dan stopt het potje en wint wie de meeste vakjes heeft.

De stand wordt per affiche bewaard: kom je later terug bij dezelfde club, dan
staat je 3-2 er weer. `Reset` wist hem.

In **Heel België** trekt elk nieuw potje twee andere ploegen tegenover elkaar —
nooit twee keer na elkaar dezelfde clash. De stand loopt daar dan wel door over
alle affiches heen; per toevallig duo bijhouden zou telkens op 0-0 springen.

### Solo

Negen pogingen voor negen vakjes. Elke gok telt, juist of fout. Hoeveel vakjes
haal je? Je record per club blijft bewaard.

### Namen invoeren

Vanaf twee letters verschijnt een **suggestielijst** met spelers uit de pool
(niet enkel de juiste antwoorden — die verklappen we niet). Kies met de pijltjes
en `Enter`, of klik. Achternamen zijn niet uniek — er zijn twee Hazards — dus
`Enter` kiest altijd een concrete suggestie in plaats van te raden welke je
bedoelt. Accenten en hoofdletters maken niet uit.

Met **`💡 Hint`** zie je hoeveel spelers dit vakje nog kunnen oplossen. Dat zegt
of je voor een cadeautje of een gemeen vakje staat, zonder een naam te
verklappen — daarom staat het achter een knop en niet automatisch in beeld.

Na afloop tonen de lege vakjes wat er had gekund.


## Clubmarkering — geen clubwapens

Elke club wordt getoond als een **shirt in zijn twee kleuren**, met een witte
omtrek (`clubKit()` in `game.js`). Bewust geen officiële clublogo's: die zijn
merk- en auteursrechtelijk beschermd, en van de zestien clubs staat er maar een
handvol vrij op Wikimedia Commons — die vier zijn daar bovendien expliciet als
merk gemarkeerd. Kleuren zijn niet beschermd, en ze stonden al in `clubs.json`.

Wil je een ander patroon, pas dan `KIT_PATH` of `KIT_STRIPES` aan.

## Techniek

Pure HTML/CSS/JavaScript, geen build-stap, geen dependencies.

- `index.html` — pagina & structuur
- `styles.css` — rood-groene Essevee-look
- `players.js` — laadt de clubs en rosters op aanvraag
- `data/` — gegenereerde data: `clubs.json`, één bestand per club, en
  `bundle.js` (alles in één, voor wie de pagina vanaf schijf opent)
- `categories.js` — criteria die rijen/kolommen kunnen zijn
- `game.js` — rastergeneratie, naamherkenning en spellogica
- `tools/build_players.py` — genereert `data/` uit Wikidata
- `tools/test.js` — headless test (`node tools/test.js`)

De volledige database is bijna een megabyte, en een potje gebruikt daar één of
twee clubs van. Daarom staat de data per club in `data/` en haalt de pagina
alleen op wat nodig is: bij het opstarten `clubs.json` (1,5 KB), en pas bij een
potje de roster van de gekozen club (15-90 KB).

Open je `index.html` rechtstreeks vanaf schijf (`file://`), dan blokkeert de
browser elke fetch naar een lokaal bestand. Daarvoor is er `data/bundle.js`:
alles in één script-bestand, dat wél geladen mag worden. Je hoeft dus niets te
doen — dubbelklikken werkt, en via een webserver wordt automatisch het lichtere
pad per club gebruikt.

Het spel genereert alleen rasters waarvoor **elk vakje minstens twee oplossingen**
heeft, dus je krijgt nooit een onmogelijk vakje — en een vakje wordt ook niet
onspeelbaar doordat de enige juiste naam al elders gebruikt is.

Omdat er honderden "Ook bij …"-clubs zijn maar maar vier posities, geldt er een
quotum per soort criterium (`KIND_QUOTA` in `game.js`). Zonder dat quotum bestond
zowat elk raster uit clubcriteria.

### Database: gegenereerd uit Wikidata

De inhoud van `data/` wordt **automatisch gegenereerd** — pas het niet met de hand aan.
De data komt van [Wikidata](https://www.wikidata.org) (property `P54`, "lid van
sportteam"), dat per club alle spelers uit heel zijn geschiedenis bijhoudt, met
de jaren waarin ze er speelden. Wikidata staat onder CC0, dus vrij te gebruiken.

Opnieuw ophalen (duurt enkele minuten; enkel `curl` en `python3` nodig):

```bash
python3 tools/build_players.py
```

Het script:

1. vraagt per club (via de QID's bovenaan `tools/build_players.py`) alle spelers
   op met positie, nationaliteit en de jaren bij die club;
2. haalt in blokken van 100 spelers hun volledige clubcarrière op, voor het
   "Ook bij …"-criterium;
3. gooit spelers weg zonder bruikbare positie of nationaliteit, en clubs waar
   minder dan 3 spelers uit de database ooit speelden;
4. schrijft `esseveetictactoe/data/clubs.json`, per club een
   `esseveetictactoe/data/<club-id>.json`, en `data/bundle.js` met alles samen.

Per speler: `name`, `pos` (`GK`/`DEF`/`MID`/`FWD`), `nat`, `from` en `to`
(eerste/laatste jaar bij die club, `null` als Wikidata het niet weet) en `clubs`
(de rest van zijn carrière).

Antwoorden worden gecachet in `tools/.cache/` (niet in git), zodat een
afgebroken run niet opnieuw alles ophaalt. Verander je een van de query's,
verhoog dan `CACHE_VERSION` — anders blijft de oude data terugkomen.

Een club toevoegen = één regel in de `CLUBS`-lijst van het script, met de
Wikidata-QID van die club. Positielabels van Wikidata (`aanvaller`, `wing half`,
…) worden via `POSITION_MAP` op `GK`/`DEF`/`MID`/`FWD` gemapt; kom je een label
tegen dat er niet in zit, voeg het daar toe.

### Fouten in de data rechtzetten

Wikidata is niet volledig en niet altijd juist. Twee dingen vallen op:

- **Posities zijn grof.** Er zijn in de praktijk maar vier waarden (keeper,
  verdediger, middenvelder, aanvaller), dus een vleugelspeler belandt willekeurig
  bij middenvelder of aanvaller. Wie het invulde bepaalt het.
- **Passages ontbreken.** Jelle Vossen speelt sinds 2020 bij Zulte Waregem, maar
  Wikidata heeft daar geen enkele vermelding van.

Corrigeer dat in **`tools/overrides.json`** — dat bestand wordt niet gegenereerd:

```json
{
  "positions": { "Thorgan Hazard": "FWD" },
  "extra": {
    "zulte-waregem": [
      { "name": "Jelle Vossen", "pos": "FWD", "nat": "België",
        "from": 2020, "to": null, "clubs": ["KRC Genk", "Club Brugge"] }
    ]
  },
  "remove": { "club-brugge": ["Iemand Die Er Nooit Speelde"] }
}
```

Draai daarna `python3 tools/build_players.py` opnieuw. Dat gaat volledig uit de
cache, dus het duurt seconden. Een speler die je via `extra` toevoegt, krijgt die
club ook automatisch in zijn "ook bij"-lijst bij zijn andere ploegen. Namen die
nergens op passen worden gemeld, zodat een correctie die niet meer nodig is niet
stilletjes blijft staan.

Om te zien wát er twijfelachtig is:

```bash
python3 tools/build_players.py --report
```

Dat lijst de spelers op wier positie uit een onbetrouwbaar label komt, en de
spelers zonder jaartallen (die vallen buiten elk "Jaren …"-criterium).

Nationaliteiten die je anders geschreven wil, horen in `NAT_FIXES` in het script.

## Lokaal draaien

`esseveetictactoe/index.html` openen in je browser volstaat. Wil je het lichtere
laadpad (per club in plaats van alles in één keer), draai dan een servertje:

```bash
cd esseveetictactoe
python3 -m http.server 8000
# open http://localhost:8000
```

Even controleren of alles nog werkt, zonder browser:

```bash
node tools/test.js
```

Die genereert voor elke club een raster en speelt potjes uit in beide modi.

## Hosten op Vercel

Dit is een statische site, dus deployen is triviaal:

1. Push deze repo naar GitHub.
2. Ga naar [vercel.com](https://vercel.com) → **Add New… → Project** → importeer de repo.
3. Framework Preset: **Other** (geen build command, output = root). Klik **Deploy**.

Of via de CLI vanuit deze map:

```bash
npm i -g vercel
vercel        # preview
vercel --prod # productie
```

Klaar — je krijgt een deelbare `*.vercel.app`-link. 💚❤️
