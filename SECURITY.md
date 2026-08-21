# Beveiliging

Dit document loopt de checklist van **Les 9 — Security** af en zegt per punt
wat er in dit project gebeurt, en **waar het staat**.

## Eerst: wat voor soort applicatie is dit?

Belangrijk om te weten voor je verder leest:

> Dit is een **volledig statische site**. Er is geen server, geen database, geen
> login, geen formulier dat iets verstuurt, en geen enkele gebruiker die data
> achterlaat die een andere gebruiker te zien krijgt.

De browser haalt HTML, CSS, JavaScript en een paar JSON-bestanden op, en verder
gebeurt alles lokaal in die browser. Vercel serveert die bestanden van zijn CDN.

Dat heeft gevolgen voor de checklist. Een aantal punten uit de les gaat over een
dynamische Node/Express-app met Supabase erachter, en die onderdelen *bestaan
hier niet*. Ze "toevoegen" zou betekenen dat we een server, een database en een
loginsysteem verzinnen die niets doen — dat is geen beveiliging maar decor.
Hieronder staat per punt eerlijk of het van toepassing is.

---

## Overzicht

| Uit de les | Van toepassing? | Waar |
|---|---|---|
| **XSS** | **Ja** — data van derden op het scherm | [`game.js`](esseveetictactoe/game.js) — DOM-opbouw |
| **Datavalidatie** | **Ja** — JSON over het netwerk | [`players.js`](esseveetictactoe/players.js) |
| **HTTPS / HSTS** | **Ja** | [`vercel.json`](vercel.json) |
| **Security headers / CSP** | **Ja** | [`vercel.json`](vercel.json) |
| **localStorage** | **Ja** | [`game.js`](esseveetictactoe/game.js) — `cleanCount` |
| **Geheimen / .env** | **Ja** (preventief) | geen sleutels in de repo |
| SQL Injection | Nee — geen database, geen SQL | — |
| CSRF | Nee — geen server, geen POST, geen sessie | — |
| Supabase RLS | Nee — geen Supabase | — |
| Wachtwoorden / bcrypt | Nee — geen accounts | — |
| Cookies / sessions | Nee — geen cookies, geen server-state | — |
| DoS / rate limiting | Deels — buiten ons bereik | CDN van Vercel |
| GDPR | Nee — geen persoonsgegevens van bezoekers | — |

---

## Wat er wél gedaan is

### 1. XSS — het echte risico in dit project

Dit is het enige punt uit de les dat hier scherp staat, en het is subtiel: de
site heeft **geen invulvelden waarvan de inhoud bewaard wordt**, dus de klassieke
"hacker plaatst een comment met `<script>`" bestaat hier niet. Maar er is wél
data van derden op het scherm:

> **Alle spelersnamen, nationaliteiten en clubnamen komen van Wikidata en
> Wikipedia.** Dat zijn wiki's — iedereen ter wereld kan die bewerken. Wij halen
> die tekst op en tonen ze. Dat is precies dezelfde situatie als user generated
> content uit de les, alleen komt de gebruiker van buiten onze site.

Dat het geen theorie is, blijkt uit de data zelf: er staat een club in met de
naam `Brighton & Hove Albion FC` en een speler `Hendricus "Henk" Heijt`. Dat zijn
tekens die HTML kapotmaken. De volgende die iets in Wikipedia zet kan `<script>`
schrijven.

**Aanpak: het scherm wordt opgebouwd met `createElement` + `textContent`, nooit
met `innerHTML`.**

De les noemt escapen als oplossing. Escapen wérkt, maar het is een pleister: je
moet er élke keer aan denken, en één vergeten plek volstaat. Tekst die via
`textContent` binnenkomt wordt door de browser per definitie als tekst
behandeld en nooit als markup — er valt niets te ontsnappen, en je kan het niet
vergeten. Dat is het equivalent van de `<%= %>` uit de les, maar dan met de
garantie ingebouwd in plaats van in een gewoonte.

In [`game.js`](esseveetictactoe/game.js) staan bovenaan drie helpers:

```js
el(tag, className, text)          // text gaat altijd via textContent
clear(node)                       // leegmaken zonder innerHTML
replaceChildren(node, ...kinderen)
```

`innerHTML` komt in de hele codebase **nergens** meer voor. Dat is te
controleren:

```bash
grep -rn "innerHTML" esseveetictactoe/*.js
```

Ook de clubshirts (SVG) worden zo gebouwd, via `createElementNS` — zie
`clubKit()`. En de kleuren die daarin gaan, worden eerst gecontroleerd:

```js
function safeColor(c) {
  return /^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : "#888888";
}
```

### 2. Datavalidatie — vertrouw je eigen bestanden niet

Nieuw in [`players.js`](esseveetictactoe/players.js): alles wat via `fetch`
binnenkomt gaat door een filter voor het het spel in mag.

```js
cleanClub(raw)    // id moet [a-z0-9-] zijn, kleuren echte hexcodes
cleanPlayer(raw)  // pos moet GK/DEF/MID/FWD zijn, namen max 120 tekens
cleanYear(v)      // geheel getal tussen 1850 en 2100
```

Wat niet aan de vorm voldoet, wordt weggegooid in plaats van doorgegeven. Een
kapot of half doorgekomen bestand leidt zo hooguit tot "geen data", niet tot
rare toestanden in het spel.

De `fetch` zelf is ook dichtgezet:

```js
fetch(path, { cache: "no-cache", credentials: "omit",
              mode: "same-origin", redirect: "error" })
```

- `credentials: "omit"` — nooit cookies meesturen
- `mode: "same-origin"` — alleen onze eigen host
- `redirect: "error"` — een omleiding naar elders is een fout, geen verrassing

En de bestandsnaam wordt gecontroleerd voor hij in een URL belandt
(`dataUrl()`), zodat een club-id nooit uit de map `data/` kan breken. Dat is
hetzelfde principe als de les bij SQL toepast — input hoort nooit rechtstreeks
in een opdracht (daar een query, hier een pad) geplakt te worden.

### 3. Content-Security-Policy en de andere headers

In [`vercel.json`](vercel.json). Dit is de sterkste laag: het CSP bepaalt wat de
pagina überhaupt **mág**, ook als er ooit toch iets doorglipt.

```
default-src 'none'          niets mag, tenzij hieronder toegestaan
script-src 'self'           alleen onze eigen scripts — geen inline, geen extern
style-src 'self' + fonts.googleapis.com
font-src fonts.gstatic.com
img-src 'self' data:        data: voor het favicon
connect-src 'self'          fetch mag alleen naar onze eigen host
frame-ancestors 'none'      de site mag niet in een iframe (clickjacking)
form-action 'none'          er is niets om te versturen
base-uri 'none'             geen <base>-tag die alle links kan omleiden
object-src 'none'           geen plugins
```

Merk op: `script-src 'self'` **zonder** `'unsafe-inline'`. Als iemand er ooit
in slaagt een `<script>` in de pagina te krijgen, weigert de browser die uit te
voeren. Om dat te kunnen doen zijn alle `style="..."`-attributen uit de HTML
gehaald en vervangen door klassen in `styles.css` (`.sw-red`, `.sw-blue`, …).

Verder:

| Header | Waarom |
|---|---|
| `Strict-Transport-Security` | Dwingt HTTPS af, ook bij een volgende keer. Dit is het punt "HTTPS" uit de les — Vercel doet TLS zelf, deze header zorgt dat de browser nooit meer via http probeert |
| `X-Content-Type-Options: nosniff` | De browser mag het bestandstype niet zelf raden |
| `X-Frame-Options: DENY` | Zelfde als `frame-ancestors`, voor oudere browsers |
| `Referrer-Policy: no-referrer` | Bij het wegklikken lekt niet welke pagina je bekeek |
| `Permissions-Policy` | Camera, microfoon, locatie enzovoort uitgezet |
| `Cross-Origin-Opener-Policy` | Andere tabbladen kunnen niet aan ons venster |

Te controleren na een deploy:

```bash
curl -sI https://<jouw-site>.vercel.app | grep -i "content-security\|strict-transport\|x-content"
```

### 4. localStorage

De stand en het solo-record staan in `localStorage`. De les zegt daarover
terecht: *"Minder veilig (data zichtbaar)"* — en het is niet alleen zichtbaar,
het is **bewerkbaar** via de dev tools. Wat eruit komt is dus input, geen
waarheid.

In [`game.js`](esseveetictactoe/game.js):

```js
function cleanCount(value, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : 0;
}
```

Elke lezing gaat hier doorheen, en staat in een `try/catch` — in een privévenster
of met geblokkeerde site-data gooit `localStorage` namelijk gewoon een fout, en
dan hoort het spel door te spelen zonder te bewaren.

Merk op dat een speler zijn eigen score kan opblazen door de waarde aan te
passen. Dat is geen lek: die score staat alleen in zijn eigen browser en er hangt
niets aan vast. Zou er ooit een klassement komen, dan moet het tellen op een
server gebeuren — zie hieronder.

### 5. Geen geheimen in de repo

Er zit geen API-sleutel, wachtwoord of `.env` in dit project, want er is niets
dat er een nodig heeft. `tools/.cache/` staat in `.gitignore`.

Dit is preventief het belangrijkst als je later een betaalde voetbal-API zou
gebruiken: **zo'n sleutel mag nooit in de browser-JavaScript staan**, want
iedereen kan die lezen. Dan heb je een klein stukje server nodig dat de sleutel
bewaart.

---

## Wat er níét gedaan is, en waarom niet

### SQL Injection — niet van toepassing

Er is geen database en geen SQL. De data zit in statische JSON-bestanden die wij
zelf genereren.

Het principe uit de les is wél toegepast waar het hier telt: input hoort nooit
rechtstreeks in een opdracht geplakt te worden. Zie `dataUrl()` hierboven.

### CSRF — niet van toepassing

CSRF betekent: een aanvaller laat jouw browser een **actie** uitvoeren op een
server waar je ingelogd bent. Dat vraagt drie dingen die hier geen van alle
bestaan: een server die acties uitvoert, een sessie of cookie die je herkent, en
een actie die iets wijzigt.

Deze site heeft geen enkele POST-route en zet geen enkele cookie. Er is niets te
vervalsen. Een CSRF-token toevoegen zou een token zijn die nergens naartoe gaat
en door niemand gecontroleerd wordt.

### Supabase RLS — niet van toepassing

Er is geen Supabase en geen database, dus er zijn geen tabellen, rollen of
policies.

### Wachtwoorden, bcrypt, sessies, cookies — niet van toepassing

Er zijn geen accounts en geen login. Er wordt geen enkele cookie gezet — te
controleren in de dev tools onder Application → Cookies.

Omdat er geen cookies zijn en geen persoonsgegevens verzameld worden, is er ook
geen cookiebanner nodig. Dat is geen omissie maar het gevolg van
**dataminimalisatie**, precies wat de GDPR-slide vraagt: we vragen niets omdat we
niets nodig hebben.

### DoS / DDoS — grotendeels buiten ons bereik

Er is geen server van ons om te overbelasten. De bestanden staan op het CDN van
Vercel, dat zijn eigen bescherming en limieten heeft. `express-rate-limit` uit de
les veronderstelt een Express-server; die is er niet.

Wat wij wel doen: het ophaalscript in `tools/build_players.py` gaat zélf
respectvol om met Wikidata en Wikipedia — pauzes tussen aanvragen, een
herkenbare user-agent, en een cache zodat we niet telkens opnieuw dezelfde data
ophalen. Dat is de andere kant van dezelfde medaille: niet de veroorzaker zijn.

---

## Let op als dit je eindopdracht is

De slide **"Security bij eindopdracht"** eist vier dingen verplicht:

- SQL Injection mag niet mogelijk zijn
- XSS mag niet mogelijk zijn
- CSRF moet geïmplementeerd zijn
- RLS moet correct enabled zijn

**Drie van die vier kan je op een statische site niet aantonen**, simpelweg omdat
er geen database en geen server is. Enkel XSS is hier van toepassing, en dat zit
goed.

Als dit spel je eindopdracht moet worden, heb je dus een back-end nodig: Express
met een Supabase-database erachter. Dat is niet alleen een formaliteit — er zijn
echte functies die zo'n back-end zouden rechtvaardigen:

- **Multiplayer** — twee spelers op verschillende toestellen in hetzelfde potje
- **Een klassement** — nu staat je record alleen in je eigen browser
- **Een backoffice** — spelers en correcties beheren via een scherm in plaats van
  via `tools/overrides.json`, met een login erop

Met die drie krijg je vanzelf een loginformulier (bcrypt, sessies), formulieren
die iets versturen (CSRF-token), een database met tabellen (SQL injection, RLS)
en gebruikersgegevens (GDPR). Dan is de checklist geen kunstje meer maar volgt
hij uit wat de app doet.

---

## Zelf nakijken

```bash
# 1. innerHTML mag nergens voorkomen
grep -rn "innerHTML" esseveetictactoe/*.js

# 2. geen inline styles of scripts in de HTML
grep -n 'style="' esseveetictactoe/index.html
grep -n "<script>" esseveetictactoe/index.html

# 3. headers na een deploy
curl -sI https://<jouw-site>.vercel.app | grep -i "content-security\|strict-transport"

# 4. de spellogica blijft werken
node tools/test.js
```
