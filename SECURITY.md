# Beveiliging

Dit document loopt de checklist van **Les 9 — Security** af en zegt per punt
wat er in dit project gebeurt, en **waar het staat**.

## Eerst: wat voor soort applicatie is dit?

Het spel bestaat uit **twee delen**, en dat bepaalt welke punten van toepassing zijn:

1. **Het spel zelf** — een volledig statische site. HTML, CSS, JS en JSON-bestanden,
   verder gebeurt alles in de browser. Geen server, geen login.
2. **Online samen spelen** — praat met een **Supabase-database** (Postgres).
   Hier zijn SQL, RLS en toegangscontrole wél aan de orde.

Voor deel 1 zijn een aantal punten uit de les niet van toepassing, en ze
"toevoegen" zou decor zijn. Voor deel 2 zijn ze dat wél. Hieronder staat per
punt eerlijk wat waar geldt.

> Onderdeel 1 blijft de kern: ook zonder Supabase werkt het spel volledig.
> Laat je `config.js` leeg, dan is enkel de knop "Samen online" uitgeschakeld.

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
| **SQL Injection** | **Ja** — sinds online spelen | [`supabase/schema.sql`](supabase/schema.sql) |
| **Supabase RLS** | **Ja** — sinds online spelen | [`supabase/schema.sql`](supabase/schema.sql) |
| **Toegangscontrole** | **Ja** — wie mag welke zet doen | `play_move()` |
| CSRF | Nee — geen cookies, dus niets te vervalsen | zie uitleg |
| Wachtwoorden / bcrypt | Nee — geen accounts | — |
| Cookies / sessions | Nee — geen cookies, geen server-sessie | — |
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

### 6. De database — RLS, SQL-injectie en toegangscontrole

Alles hierover staat in [`supabase/schema.sql`](supabase/schema.sql).

**Het uitgangspunt:** de browser krijgt de **anon-sleutel**, en die is publiek.
Iedereen kan hem uit de broncode lezen — zo is hij bedoeld. De beveiliging mag
dus niet afhangen van het geheimhouden van die sleutel. Ze komt van RLS:

| Tabel | Lezen | Schrijven |
|---|---|---|
| `games` | iedereen (je hebt de code nodig om iets te vinden) | **niemand** |
| `game_tokens` | **niemand** | **niemand** |

`game_tokens` heeft RLS aan en **geen enkele policy**. Zonder policy weigert
Postgres alles. Met de anon-sleutel is die tabel dus onzichtbaar, ook al ken je
de tabelnaam.

Waarom staan die tokens apart? Eerst had ik ze als kolom in `games`. Maar de
leespolicy op die tabel geeft de **hele rij** terug — dus kon je tegenstander
jouw token lezen en in jouw plaats spelen. Dat is precies het soort fout dat RLS
hoort te voorkomen en die je makkelijk over het hoofd ziet. Ze staan nu in een
aparte tabel die niemand mag lezen.

**Schrijven kan alleen via vier functies:** `create_game`, `join_game`,
`play_move` en `finish_game`. Die zijn `security definer` (ze draaien met de
rechten van de eigenaar, dus ze mogen wél schrijven) met een vastgezet
`search_path` (zodat niemand via een eigen schema kan omleiden welke tabel
geraakt wordt).

`play_move()` controleert, in deze volgorde:

1. bestaat het potje, en loopt het nog?
2. **wie ben jij** — bepaald door je token, niet door wat de browser beweert
3. ben je wel aan zet?
4. bestaat dat vakje, en is het nog leeg?
5. is die speler niet al elders in het raster gebruikt?

Pas dan wordt het bord aangepast en de beurt doorgegeven. De client kan dus
liegen zoveel hij wil — hij krijgt een foutmelding terug.

**SQL Injection.** Alle aanroepen gaan via `supabase.rpc(...)`, dat
geparametriseerde queries gebruikt: de waarden gaan apart van de query naar de
database en worden nooit als SQL uitgevoerd. Dat is exact het `sql\`...\``-
mechanisme uit de les, en het equivalent van Prisma's aanpak. Nergens in dit
project wordt een query samengeplakt uit tekst.

Daarnaast controleert elke functie de vorm van wat binnenkomt: de code moet
`^[A-Z0-9-]{4,16}$` zijn, het token 20-100 tekens, het raster exact 3 rijen en
3 kolommen, de uitslag `X`, `O` of `draw`.

**Wat de database níét controleert:** of het voetbalantwoord juist is. Dat zou
betekenen dat de hele spelersdatabase in Postgres moet staan. De server bewaakt
dus *wie* wat *wanneer* mag doen, niet of Sven Kums echt bij Zulte Waregem
speelde. Voor een spelletje onder vrienden is dat de juiste afweging; wil je het
waterdicht, dan moeten de rosters mee de database in.

**Het token zelf** wordt gemaakt met `crypto.getRandomValues()`, niet met
`Math.random()` — dat laatste is voorspelbaar en dus ongeschikt voor iets dat
als bewijs dient.

---

## Wat er níét gedaan is, en waarom niet

### CSRF — niet van toepassing

CSRF betekent: een aanvaller laat jouw browser een actie uitvoeren op een server
waar je ingelogd bent, doordat de browser **automatisch** je cookie meestuurt.

Dat kan hier niet, want er is geen cookie en geen sessie. Wie mag spelen wordt
bepaald door een token dat de app expliciet meestuurt bij een zet, en dat in
`localStorage` staat. `localStorage` wordt nooit vanzelf meegestuurd, en een
andere site kan er niet aan (same-origin policy). Er valt dus niets te
vervalsen.

Zou je later een backoffice met login toevoegen (zie onderaan), dan komt er wél
een sessiecookie en is CSRF-bescherming wél nodig.

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

Met het online spelen erbij staat het er zo voor:

| | |
|---|---|
| SQL Injection | **Afgedekt** — geparametriseerde RPC, nergens samengeplakte queries |
| XSS | **Afgedekt** — geen `innerHTML`, alles via `textContent` |
| RLS | **Afgedekt** — aan op beide tabellen, `game_tokens` zonder enkele policy |
| CSRF | **Niet van toepassing** — geen cookies, dus niets te vervalsen |

Voor het laatste punt heb je een **login met een sessiecookie** nodig, en dan
volgt CSRF-bescherming er vanzelf uit. De natuurlijke plek daarvoor is een
**backoffice**: een scherm waar jij spelers en correcties beheert in plaats van
`tools/overrides.json` met de hand te bewerken. Dan krijg je in één keer een
loginformulier (bcrypt), een sessie, formulieren die iets versturen (CSRF-token)
en een tweede rol in je RLS-policies (admin mag schrijven, bezoeker niet).

Dat is meteen ook praktisch nuttig, dus het is geen kunstje. Zeg het als je dat
erbij wil.

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
