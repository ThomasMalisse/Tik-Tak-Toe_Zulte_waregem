# Essevee Tic-Tac-Toe 🟩🟥

Boter-kaas-en-eieren (tic-tac-toe) met een twist: elk vakje win je door een
speler te noemen die **ooit voor SV Zulte Waregem** speelde én aan het rij- en
kolomcriterium voldoet (positie, nationaliteit of een andere club).

## Zo speel je

- Twee spelers, **X** en **O**, spelen om beurten (hotseat op één toestel).
- Klik op een vakje. Je krijgt een rij- en een kolomcriterium te zien.
- Typ de naam van een Essevee-speler die aan **beide** voldoet.
  - **Juist** → het vakje is van jou, beurt gaat over.
  - **Fout / onbekend** → beurt gaat over zonder vakje.
- Elke speler mag maar **één keer** in het hele raster gebruikt worden.
- **Drie op een rij** (horizontaal, verticaal of diagonaal) wint. Vol bord zonder
  winnaar = gelijkspel.

Namen worden soepel herkend: enkel de achternaam volstaat meestal, en accenten/
hoofdletters maken niet uit. Klik op **"Wie zit in de database?"** voor de volledige lijst.

## Techniek

Pure HTML/CSS/JavaScript, geen build-stap, geen dependencies.

- `index.html` — pagina & structuur
- `styles.css` — rood-groene Essevee-look
- `players.js` — spelersdatabase (positie, nationaliteit, andere clubs)
- `categories.js` — criteria die rijen/kolommen kunnen zijn
- `game.js` — rastergeneratie, naamherkenning en spellogica

Het spel genereert alleen rasters waarvoor **elk vakje oplosbaar** is met de data
in `players.js`, dus je krijgt nooit een onmogelijk vakje.

### Database uitbreiden

Voeg gewoon een regel toe aan de `PLAYERS`-array in `players.js`:

```js
{ name: "Voornaam Achternaam", pos: "MID", nat: "België", clubs: ["Anderlecht"] },
```

`pos` is `GK`, `DEF`, `MID` of `FWD`. `clubs` mag enkel clubs uit `CLUB_VOCAB`
bevatten (voeg daar eerst een club toe als je een nieuwe wil gebruiken).

## Lokaal draaien

Gewoon `index.html` openen in je browser. Of met een simpel servertje:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

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
