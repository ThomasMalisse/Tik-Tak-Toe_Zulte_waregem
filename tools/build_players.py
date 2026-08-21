#!/usr/bin/env python3
"""
Genereert esseveetictactoe/data/*.json uit Wikidata.

Haalt voor elke club uit CLUBS alle spelers op die er ooit onder contract lagen
(Wikidata-property P54 "lid van sportteam"), met hun positie, nationaliteit,
actieve jaren bij die club en de andere clubs uit hun carriere.

Gebruik:  python3 tools/build_players.py
"""

import json
import re
import subprocess
import sys
import time
import urllib.parse
from collections import defaultdict
from pathlib import Path

ENDPOINT = "https://query.wikidata.org/sparql"
UA = "EsseveeTicTacToe/1.0 (https://github.com/ThomasMalisse; malissethomas@gmail.com)"

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "esseveetictactoe" / "data"
CACHE = Path(__file__).resolve().parent / ".cache"
OVERRIDES = Path(__file__).resolve().parent / "overrides.json"
# Ophogen zodra een van de query's verandert, anders blijft de cache oude data
# teruggeven die niet meer overeenkomt met wat het script nu zou ophalen.
CACHE_VERSION = 2

# id, weergavenaam, Wikidata-QID, clubkleuren, en de categorie op de Engelse
# Wikipedia die de spelers van die club opsomt (tweede bron, zie fetch_extra).
CLUBS = [
    ("zulte-waregem", "Zulte Waregem",    "Q376635",  ["#d81f2a", "#1a7a3c"],
     "SV Zulte Waregem players"),
    ("club-brugge",   "Club Brugge",      "Q190916",  ["#0f56a3", "#111111"],
     "Club Brugge KV players"),
    ("anderlecht",    "Anderlecht",       "Q187528",  ["#6f2c91", "#f0b90b"],
     "RSC Anderlecht players"),
    ("krc-genk",      "KRC Genk",         "Q216032",  ["#0c3f91", "#4fb8e8"],
     "KRC Genk players"),
    ("standard",      "Standard Luik",    "Q190561",  ["#d81f2a", "#111111"],
     "Standard Liège players"),
    ("antwerp",       "Royal Antwerp",    "Q732002",  ["#a3121a", "#111111"],
     "Royal Antwerp FC players"),
    ("kaa-gent",      "KAA Gent",         "Q18232",   ["#0c3f91", "#111111"],
     "KAA Gent players"),
    ("charleroi",     "Charleroi",        "Q19585",   ["#111111", "#c8102e"],
     "Royal Charleroi SC players"),
    ("cercle-brugge", "Cercle Brugge",    "Q364698",  ["#1a7a3c", "#111111"],
     "Cercle Brugge KSV players"),
    ("union-sg",      "Union SG",         "Q196160",  ["#f0b90b", "#0c3f91"],
     "Royale Union Saint-Gilloise players"),
    ("stvv",          "STVV",             "Q138248",  ["#f0d80b", "#111111"],
     "Sint-Truidense VV players"),
    ("westerlo",      "KV Westerlo",      "Q849544",  ["#f0b90b", "#0c3f91"],
     "KVC Westerlo players"),
    ("mechelen",      "KV Mechelen",      "Q113000",  ["#f0d80b", "#c8102e"],
     "KV Mechelen players"),
    ("ohl",           "OH Leuven",        "Q916199",  ["#0c3f91", "#111111"],
     "Oud-Heverlee Leuven players"),
    ("raal",          "RAAL La Louvière", "Q536651",  ["#c8102e", "#f0b90b"],
     "RAAL La Louvière players"),
    ("dender",        "FCV Dender",       "Q1065328", ["#f0913a", "#111111"],
     "FCV Dender EH players"),
]

# Wikidata-positielabels (nl/en) -> onze vier posities. In deze volgorde
# afgetoetst: de eerste die past, wint. Vandaar dat "centre-half" bij DEF staat
# en boven MID komt, anders vangt de losse naald "half" hem af.
#
# "wing half" (Q8025128) staat bewust bij FWD. Wikidata modelleert het als
# subklasse van middenvelder, maar hetzelfde item heet in het Frans "milieu
# excentre" en in het Russisch "flankmiddenvelder", en het hangt hier aan
# spelers als Knockaert, Jahanbakhsh, Limbombe en Bongonda — vleugelspelers.
# In een quiz telt wat een supporter zou antwoorden, niet hoe Wikidata de
# klassenboom bouwt. Wil je ze toch als middenvelder, verhuis dan die ene naald.
POSITION_MAP = {
    "GK":  ["keeper", "doelman", "goalkeeper"],
    "FWD": ["aanvaller", "forward", "striker", "spits", "winger", "vleugelspeler",
            "buitenspeler", "centre-forward", "wing half"],
    "DEF": ["verdediger", "defender", "back", "libero", "sweeper",
            "centre-half", "centrale verdediger", "vleugelverdediger"],
    "MID": ["middenvelder", "midfielder", "midfield", "inside forward",
            "half", "playmaker", "spelverdeler"],
}

# Nationaliteiten die Wikidata anders schrijft dan wij op het bord willen.
NAT_FIXES = {
    "Democratische Republiek Congo": "DR Congo",
    "Congo-Kinshasa": "DR Congo",
    "Centraal-Afrikaanse Republiek": "Centraal-Afrikaanse Rep.",
    "Verenigde Staten van Amerika": "Verenigde Staten",
    "Ivoorkust": "Ivoorkust",
}

# Een speler telt pas mee als hij een naam, positie en nationaliteit heeft.
# Een "ook bij"-club telt pas mee als minstens zoveel spelers er ooit speelden.
MIN_PLAYERS_PER_OTHER_CLUB = 3


def sparql(query, tries=6):
    """Voert een SPARQL-query uit en geeft de bindings terug.

    Via curl, zodat we niet afhangen van de certificaten van de Python-installatie.
    """
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    cmd = ["curl", "-sS", "--fail", "--max-time", "180", "-A", UA,
           "-H", "Accept: application/sparql-results+json", url]
    for attempt in range(tries):
        try:
            out = subprocess.run(cmd, capture_output=True, check=True).stdout
            # strict=False: enkele Wikidata-labels bevatten een letterlijke newline
            return json.loads(out, strict=False)["results"]["bindings"]
        except Exception as exc:  # rate limiting / timeout -> even wachten
            if attempt == tries - 1:
                raise
            wait = 5 * 2 ** attempt
            # De foutmelding bevat de hele query-URL; die willen we niet zien.
            print(f"    ! {type(exc).__name__} — opnieuw over {wait}s", file=sys.stderr)
            time.sleep(wait)


def val(row, key):
    return row[key]["value"] if key in row else None


def year(iso):
    if not iso:
        return None
    m = re.match(r"(-?\d{4})", iso)
    return int(m.group(1)) if m else None


def map_position(labels):
    """Kiest de beste van onze vier posities uit de ruwe Wikidata-labels."""
    low = [l.lower() for l in labels]
    for code, needles in POSITION_MAP.items():   # volgorde van POSITION_MAP telt
        for needle in needles:
            if any(needle in l for l in low):
                return code
    return None


# P21 = geslacht. Een handvol speelsters hangt in Wikidata aan de mannenclub
# in plaats van aan de aparte vrouwenploeg; het spel gaat over de A-kern.
ATTR_QUERY = """
SELECT ?p ?pLabel ?posLabel ?natLabel ?start ?end WHERE {
  ?p p:P54 ?st .
  ?st ps:P54 wd:%s .
  ?p wdt:P21 wd:Q6581097 .
  OPTIONAL { ?st pq:P580 ?start. }
  OPTIONAL { ?st pq:P582 ?end. }
  OPTIONAL { ?p wdt:P413 ?pos. }
  OPTIONAL { ?p wdt:P27 ?nat. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }
}
"""

# Andere clubs uit de carriere. Alleen echte clubs (geen nationale ploegen).
# In blokken van CAREER_CHUNK spelers: de query in een keer over de hele club
# laten lopen is te zwaar voor de Wikidata-server (502 / timeout).
CAREER_QUERY = """
SELECT ?p ?otherLabel WHERE {
  VALUES ?p { %s }
  ?p wdt:P54 ?other .
  FILTER(?other != wd:%s)
  ?other wdt:P31 wd:Q476028 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }
}
"""

CAREER_CHUNK = 40


WIKI_API = "https://en.wikipedia.org/w/api.php"


def wiki_api(**params):
    """Roept de MediaWiki-API aan; geeft de JSON terug."""
    params["format"] = "json"
    url = WIKI_API + "?" + urllib.parse.urlencode(params)
    cmd = ["curl", "-sS", "--fail", "--max-time", "90", "-A", UA, url]
    for attempt in range(5):
        try:
            return json.loads(subprocess.run(cmd, capture_output=True, check=True).stdout,
                              strict=False)
        except Exception as exc:
            if attempt == 4:
                raise
            wait = 3 * 2 ** attempt
            print(f"    ! wikipedia: {type(exc).__name__} — opnieuw over {wait}s",
                  file=sys.stderr)
            time.sleep(wait)


def category_qids(category):
    """Wikidata-QID's van alle spelers in een Wikipedia-categorie.

    Wikidata's P54 ("lid van sportteam") is lang niet volledig — Cameron Puertas
    heeft er bijvoorbeeld geen enkele club in staan. De categorieen op de Engelse
    Wikipedia worden veel trouwer bijgehouden, dus die gebruiken we erbij om te
    weten *wie* er gespeeld heeft. De gegevens zelf komen daarna weer uit Wikidata.
    """
    qids = set()
    cont = {}
    while True:
        d = wiki_api(action="query", generator="categorymembers",
                     gcmtitle="Category:" + category, gcmlimit="500",
                     gcmnamespace="0", prop="pageprops", ppprop="wikibase_item",
                     **cont)
        for page in d.get("query", {}).get("pages", {}).values():
            item = page.get("pageprops", {}).get("wikibase_item")
            if item:
                qids.add(item)
        if "continue" not in d:
            return qids
        cont = d["continue"]
        time.sleep(0.5)


# Gegevens van spelers die we via de categorie vonden maar niet via P54. Ze
# krijgen geen jaartallen: die staan alleen in de P54-kwalificaties, en die
# ontbreken nu net. Wel positie, nationaliteit en hun andere clubs.
EXTRA_QUERY = """
SELECT ?p ?pLabel ?posLabel ?natLabel WHERE {
  VALUES ?p { %s }
  ?p wdt:P21 wd:Q6581097 .
  OPTIONAL { ?p wdt:P413 ?pos. }
  OPTIONAL { ?p wdt:P27 ?nat. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }
}
"""

EXTRA_CHUNK = 100


def fetch_extra(club_qid, category, known):
    """Spelers uit de Wikipedia-categorie die nog niet uit P54 kwamen."""
    cached = CACHE / f"{club_qid}-cat-v{CACHE_VERSION}.json"
    if cached.exists():
        raw = json.loads(cached.read_text(encoding="utf-8"))
    else:
        wanted = sorted(category_qids(category) - set(known))
        raw = {}
        for i in range(0, len(wanted), EXTRA_CHUNK):
            chunk = " ".join("wd:" + q for q in wanted[i:i + EXTRA_CHUNK])
            for row in sparql(EXTRA_QUERY % chunk):
                pid = val(row, "p").rsplit("/", 1)[-1]
                name = val(row, "pLabel")
                if not name or re.fullmatch(r"Q\d+", name):
                    continue
                e = raw.setdefault(pid, {"name": name, "positions": [], "nats": [],
                                         "from": None, "to": None, "clubs": []})
                if val(row, "posLabel") and val(row, "posLabel") not in e["positions"]:
                    e["positions"].append(val(row, "posLabel"))
                if val(row, "natLabel") and val(row, "natLabel") not in e["nats"]:
                    e["nats"].append(val(row, "natLabel"))
            time.sleep(0.5)

        # Hun overige clubs, voor het "Ook bij ..."-criterium.
        ids = list(raw)
        for i in range(0, len(ids), CAREER_CHUNK):
            chunk = " ".join("wd:" + pid for pid in ids[i:i + CAREER_CHUNK])
            for row in sparql(CAREER_QUERY % (chunk, club_qid)):
                pid = val(row, "p").rsplit("/", 1)[-1]
                other = val(row, "otherLabel")
                if pid in raw and other and not re.fullmatch(r"Q\d+", other) \
                        and other not in raw[pid]["clubs"]:
                    raw[pid]["clubs"].append(other)
            time.sleep(0.5)
        cached.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")

    return {pid: {**p, "positions": set(p["positions"]), "nats": set(p["nats"]),
                  "clubs": set(p["clubs"])}
            for pid, p in raw.items()}


# ---------------------------------------------------------------------------
# Derde bron: de carriere-infobox op de Engelse Wikipedia.
#
# Wikidata's P54-kwalificaties bevatten de jaartallen, maar juist voor de
# spelers die we via de categorie vonden ontbreken die. De infobox van hun
# artikel heeft ze wel ("years2 = 2022-2024 | clubs2 = [[...Union...]]").
# Datzelfde blok geeft ook een veel specifiekere positie ("Attacking
# midfielder", "Centre-back") dan de vier grove waarden van P413.
# ---------------------------------------------------------------------------

# Infoboxlabels -> onze vier posities. Volgorde telt: "Defensive midfielder"
# moet MID worden, niet DEF, en "wing-back" juist wel DEF.
INFOBOX_POSITIONS = {
    "GK":  ["goalkeeper"],
    "MID": ["midfielder", "midfield", "playmaker"],
    "DEF": ["back", "defender", "sweeper", "libero", "stopper"],
    "FWD": ["winger", "forward", "striker", "wing"],
}


def infobox_body(text):
    """Het blok van {{Infobox football biography ...}}, met genest haakjeswerk."""
    i = text.lower().find("{{infobox football biography")
    if i < 0:
        return ""
    depth, j = 0, i
    while j < len(text):
        if text.startswith("{{", j):
            depth += 1
            j += 2
        elif text.startswith("}}", j):
            depth -= 1
            j += 2
            if depth == 0:
                return text[i:j]
        else:
            j += 1
    return text[i:]


def infobox_fields(text):
    """{veldnaam: waarde} uit de infobox; sjablonen en links blijven intact."""
    body = infobox_body(text)
    if not body:
        return {}
    fields, depth, link, buf = {}, 0, 0, []
    parts = []
    k = 0
    while k < len(body):
        two = body[k:k + 2]
        if two == "{{":
            depth += 1; buf.append(two); k += 2
        elif two == "}}":
            depth -= 1; buf.append(two); k += 2
        elif two == "[[":
            link += 1; buf.append(two); k += 2
        elif two == "]]":
            link -= 1; buf.append(two); k += 2
        elif body[k] == "|" and depth == 1 and link == 0:
            parts.append("".join(buf)); buf = []; k += 1
        else:
            buf.append(body[k]); k += 1
    parts.append("".join(buf))
    for part in parts[1:]:
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        fields[key.strip().lower()] = value.strip()
    return fields


LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")
REF_RE = re.compile(r"<ref[^>]*?/>|<ref.*?</ref>", re.S | re.I)


def parse_years(value):
    """'2022-2024' -> (2022, 2024); '2024-' -> (2024, None); '2020-21' -> (2020, 2021)."""
    v = REF_RE.sub("", value).replace("&ndash;", "-").replace("\u2013", "-").replace("\u2014", "-")
    m = re.search(r"(\d{4})\s*(-)?\s*(\d{2,4})?", v)
    if not m:
        return None
    start, dash, end = int(m.group(1)), m.group(2), m.group(3)
    if end is None:
        return (start, None) if dash else (start, start)
    end = int(end)
    if end < 100:                       # seizoensnotatie: 2020-21
        end += start - start % 100
        if end < start:
            end += 100
    return (start, end)


def infobox_position(fields):
    raw = LINK_RE.sub(r"\1", REF_RE.sub("", fields.get("position", ""))).lower()
    for code, needles in INFOBOX_POSITIONS.items():
        if any(n in raw for n in needles):
            return code
    return None


def infobox_career(fields, accepted):
    """(van, tot) voor de eerste periode bij een van de `accepted` clubtitels."""
    spells = []
    for key, value in fields.items():
        m = re.fullmatch(r"years(\d+)", key)
        if not m:
            continue
        clubs = fields.get("clubs" + m.group(1), "")
        targets = {t.strip().replace("_", " ") for t in LINK_RE.findall(clubs)}
        if not targets & accepted:
            continue
        years = parse_years(value)
        if years:
            spells.append(years)
    if not spells:
        return None
    start = min(s for s, _ in spells)
    ends = [e for _, e in spells]
    return (start, None if any(e is None for e in ends) else max(ends))


def club_title_aliases(title):
    """De artikeltitel plus alles wat ernaar doorverwijst."""
    names = {title.replace("_", " ")}
    d = wiki_api(action="query", prop="redirects", titles=title, rdlimit="500")
    for page in d.get("query", {}).get("pages", {}).values():
        for r in page.get("redirects", []):
            names.add(r["title"].replace("_", " "))
    return names


def wiki_titles(qids):
    """{Wikidata-QID: titel op de Engelse Wikipedia}"""
    out = {}
    qids = list(qids)
    for i in range(0, len(qids), 50):
        url = ("https://www.wikidata.org/w/api.php?action=wbgetentities"
               "&props=sitelinks&sitefilter=enwiki&format=json&ids=" +
               "|".join(qids[i:i + 50]))
        d = json.loads(subprocess.run(
            ["curl", "-sS", "--fail", "--max-time", "90", "-A", UA, url],
            capture_output=True, check=True).stdout, strict=False)
        for qid, e in d.get("entities", {}).items():
            sl = e.get("sitelinks", {}).get("enwiki")
            if sl:
                out[qid] = sl["title"]
        time.sleep(0.4)
    return out


def fetch_infoboxes(club_qid, club_title, qids):
    """{QID: {"pos": .., "from": .., "to": ..}} uit de Wikipedia-infoboxen."""
    cached = CACHE / f"{club_qid}-box-v{CACHE_VERSION}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))

    accepted = club_title_aliases(club_title)
    titles = wiki_titles(qids)
    by_title = {t: q for q, t in titles.items()}
    result = {}
    names = list(by_title)
    for i in range(0, len(names), 25):
        # rvsection=0 haalt enkel de kop van het artikel op — daar zit de
        # infobox in, en het scheelt een veelvoud aan verkeer.
        d = wiki_api(action="query", titles="|".join(names[i:i + 25]),
                     prop="revisions", rvprop="content", rvslots="main",
                     rvsection="0", redirects="1")
        norm = {}
        for n in d.get("query", {}).get("normalized", []) + d.get("query", {}).get("redirects", []):
            norm[n["to"]] = n["from"]
        for page in d.get("query", {}).get("pages", {}).values():
            try:
                text = page["revisions"][0]["slots"]["main"]["*"]
            except (KeyError, IndexError):
                continue
            title = page["title"]
            qid = by_title.get(title) or by_title.get(norm.get(title, ""))
            if not qid:
                continue
            fields = infobox_fields(text)
            if not fields:
                continue
            entry = {}
            pos = infobox_position(fields)
            if pos:
                entry["pos"] = pos
            span = infobox_career(fields, accepted)
            if span:
                entry["from"], entry["to"] = span
            if entry:
                result[qid] = entry
        time.sleep(0.4)

    cached.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


# ---------------------------------------------------------------------------
#  Interlands: speelde hij voor een nationale ploeg?
#
#  Bij het opbouwen van de "ook bij"-lijst filteren we nationale ploegen er juist
#  uit (die zijn geen club). Maar "Rode Duivel" is wel een van de leukste
#  criteria die er bestaan, dus halen we ze apart op.
#
#  Q6979593 = nationale voetbalploeg. Daar vallen ook de jeugdploegen onder
#  (onder 21, onder 19, ...); die filteren we op hun naam weg, want "Rode
#  Duivel" slaat op de A-ploeg.
# ---------------------------------------------------------------------------

NATIONAL_QUERY = """
SELECT ?p ?teamLabel ?countryLabel WHERE {
  VALUES ?p { %s }
  ?p wdt:P54 ?team .
  ?team wdt:P31/wdt:P279* wd:Q6979593 ;
        wdt:P17 ?country .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }
}
"""

YOUTH_RE = re.compile(
    r"\bonder\b|\bunder\b|\bU-?\d|\bjeugd|\byouth|olympisch|olympic|"
    r"\bB-?elftal|\bamateur|\bmilitair|\bfutsal|\bbeach|\bvrouwen|\bwomen",
    re.I)


def fetch_national(club_qid, qids):
    """{QID: [landen waarvoor hij een A-interland speelde]}"""
    cached = CACHE / f"{club_qid}-nat-v{CACHE_VERSION}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))

    result = {}
    ids = list(qids)
    for i in range(0, len(ids), CAREER_CHUNK):
        chunk = " ".join("wd:" + q for q in ids[i:i + CAREER_CHUNK])
        for row in sparql(NATIONAL_QUERY % chunk):
            pid = val(row, "p").rsplit("/", 1)[-1]
            team = val(row, "teamLabel") or ""
            land = val(row, "countryLabel")
            if not land or YOUTH_RE.search(team) or re.fullmatch(r"Q\d+", land):
                continue
            result.setdefault(pid, [])
            if land not in result[pid]:
                result[pid].append(land)
        time.sleep(0.5)

    cached.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


def fetch_club(qid):
    """Geeft {qid: speler-dict} voor een club, met cache op schijf.

    Een volledige run duurt minuten en Wikidata knijpt af; zonder cache begint
    een afgebroken run weer van nul. Verwijder tools/.cache om te verversen.
    """
    cached = CACHE / f"{qid}-v{CACHE_VERSION}.json"
    if cached.exists():
        raw = json.loads(cached.read_text(encoding="utf-8"))
        print("   (uit cache)", file=sys.stderr)
        return {pid: {**p, "positions": set(p["positions"]),
                      "nats": set(p["nats"]), "clubs": set(p["clubs"])}
                for pid, p in raw.items()}

    players = {}
    for row in sparql(ATTR_QUERY % qid):
        pid = val(row, "p").rsplit("/", 1)[-1]
        name = val(row, "pLabel")
        if not name or re.fullmatch(r"Q\d+", name):
            continue  # geen leesbaar label in nl/en
        p = players.setdefault(pid, {
            "name": name, "positions": set(), "nats": set(),
            "from": None, "to": None, "clubs": set(),
        })
        if val(row, "posLabel"):
            p["positions"].add(val(row, "posLabel"))
        if val(row, "natLabel"):
            p["nats"].add(val(row, "natLabel"))
        y0, y1 = year(val(row, "start")), year(val(row, "end"))
        if y0 and (p["from"] is None or y0 < p["from"]):
            p["from"] = y0
        if y1 and (p["to"] is None or y1 > p["to"]):
            p["to"] = y1

    ids = list(players)
    for i in range(0, len(ids), CAREER_CHUNK):
        chunk = " ".join("wd:" + pid for pid in ids[i:i + CAREER_CHUNK])
        for row in sparql(CAREER_QUERY % (chunk, qid)):
            pid = val(row, "p").rsplit("/", 1)[-1]
            other = val(row, "otherLabel")
            if pid in players and other and not re.fullmatch(r"Q\d+", other):
                players[pid]["clubs"].add(other)
        time.sleep(0.5)  # niet te hard op de Wikidata-server rammen

    cached.write_text(json.dumps(
        {pid: {**p, "positions": sorted(p["positions"]),
               "nats": sorted(p["nats"]), "clubs": sorted(p["clubs"])}
         for pid, p in players.items()}, ensure_ascii=False), encoding="utf-8")
    return players


LABEL_QUERY = """
SELECT ?club ?clubLabel WHERE {
  VALUES ?club { %s }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }
}
"""


def club_aliases():
    """{Wikidata-label: onze weergavenaam} voor de 16 clubs uit CLUBS."""
    values = " ".join("wd:" + c[2] for c in CLUBS)
    display = {qid: name for _id, name, qid, _c, _cat in CLUBS}
    aliases = {}
    for row in sparql(LABEL_QUERY % values):
        qid = val(row, "club").rsplit("/", 1)[-1]
        label = val(row, "clubLabel")
        if label and qid in display:
            aliases[label] = display[qid]
    return aliases


POSITIONS = ("GK", "DEF", "MID", "FWD")


def load_overrides():
    if not OVERRIDES.exists():
        return {}
    return json.loads(OVERRIDES.read_text(encoding="utf-8"))


def apply_overrides(rosters, ov):
    """Zet handmatige correcties door en meldt wat nergens op paste.

    Wikidata kent maar vier grove posities en zit er soms gewoon naast, en
    lang niet elke passage staat erin. Die gaten repareren we hier in plaats
    van in de gegenereerde bestanden, zodat ze een volgende run overleven.
    """
    display = {cid: name for cid, name, _q, _c, _cat in CLUBS}

    # 1. Spelers verwijderen die bij een club niet thuishoren.
    for club_id, names in (ov.get("remove") or {}).items():
        wanted = set(names)
        before = len(rosters.get(club_id, []))
        rosters[club_id] = [p for p in rosters.get(club_id, []) if p["name"] not in wanted]
        gone = {p for p in wanted}
        if before - len(rosters[club_id]) != len(wanted):
            print(f"   ! remove: niet elke naam gevonden bij {club_id}: {sorted(gone)}",
                  file=sys.stderr)

    # 2. Ontbrekende passages toevoegen.
    for club_id, players in (ov.get("extra") or {}).items():
        if club_id not in rosters:
            print(f"   ! extra: onbekende club '{club_id}'", file=sys.stderr)
            continue
        for entry in players:
            if entry["pos"] not in POSITIONS:
                print(f"   ! extra: {entry['name']} heeft ongeldige positie "
                      f"'{entry['pos']}'", file=sys.stderr)
                continue
            if any(p["name"] == entry["name"] for p in rosters[club_id]):
                print(f"   ! extra: {entry['name']} stond al bij {club_id} — "
                      f"regel mag weg", file=sys.stderr)
                continue
            rosters[club_id].append({
                "id": "extra:" + entry["name"],
                "name": entry["name"], "pos": entry["pos"], "nat": entry["nat"],
                "from": entry.get("from"), "to": entry.get("to"),
                "clubs": list(entry.get("clubs") or []),
                "intl": list(entry.get("intl") or []),
            })
            # Ook bij zijn andere clubs moet deze passage meetellen, anders
            # matcht "Ook bij <club>" hem daar niet.
            for other_id, roster in rosters.items():
                if other_id == club_id:
                    continue
                for p in roster:
                    if p["name"] == entry["name"] and display[club_id] not in p["clubs"]:
                        p["clubs"] = sorted(p["clubs"] + [display[club_id]])

    # 3. Posities rechtzetten.
    unseen = set()
    for name, pos in (ov.get("positions") or {}).items():
        if pos not in POSITIONS:
            print(f"   ! positions: {name} heeft ongeldige positie '{pos}'", file=sys.stderr)
            continue
        hit = False
        for roster in rosters.values():
            for p in roster:
                if p["name"] == name:
                    p["pos"] = pos
                    hit = True
        if not hit:
            unseen.add(name)
    if unseen:
        print(f"   ! positions: geen speler gevonden voor {sorted(unseen)}", file=sys.stderr)

    for roster in rosters.values():
        roster.sort(key=lambda r: r["name"])


def report():
    """Lijst op wat er verdacht uitziet in de opgehaalde data.

    Wikidata kent maar een grove positiewoordenschat, en sommige labels zijn
    aantoonbaar onbetrouwbaar. Dit toont waar je het best eerst kijkt; corrigeren
    doe je in tools/overrides.json.
    """
    # Labels waar we weinig vertrouwen in hebben: verouderd of te vaag om er een
    # moderne positie uit af te leiden.
    # "wing half" leest de generator bewust als aanvaller (zie POSITION_MAP);
    # het blijft hier staan omdat het veruit de grootste hoop twijfelgevallen is.
    SHAKY = {"wing half", "aanvoerder", "vleugel", "voetballer", "sportman"}

    per_label = defaultdict(list)
    no_year = defaultdict(list)
    rows = 0
    for club_id, name, qid, _colors, _cat in CLUBS:
        # Beide bronnen: P54 en de Wikipedia-categorie.
        for suffix in ("", "-cat"):
            cached = CACHE / f"{qid}{suffix}-v{CACHE_VERSION}.json"
            if not cached.exists():
                continue
            for pid, p in json.loads(cached.read_text(encoding="utf-8")).items():
                poss = set(p["positions"])
                if poss & SHAKY and not (poss - SHAKY):
                    per_label[", ".join(sorted(poss))].append((p["name"], name))

        # Jaartallen lezen we uit de gegenereerde data: daar zitten ook de
        # handmatige correcties in verwerkt.
        out = DATA / f"{club_id}.json"
        if not out.exists():
            print(f"! nog geen data/{club_id}.json; draai eerst build_players.py",
                  file=sys.stderr)
            return
        for p in json.loads(out.read_text(encoding="utf-8")):
            rows += 1
            if p["from"] is None and p["to"] is None:
                no_year[name].append(p["name"])

    print("=== posities uit een onbetrouwbaar label ===")
    print("Deze spelers hebben geen bruikbare positie in Wikidata; wat het spel")
    print("toont is een gok. Zet ze recht in tools/overrides.json.\n")
    total = 0
    for label, rows in sorted(per_label.items(), key=lambda kv: -len(kv[1])):
        print(f"-- {label} ({len(rows)} spelers)")
        for pname, club in sorted(rows)[:400]:
            print(f"   {pname}  ({club})")
        total += len(rows)
    print(f"\ntotaal: {total} spelers met een twijfelachtige positie")

    print("\n=== zonder jaartallen ===")
    print("Deze spelers vallen buiten elk 'Jaren ...'-criterium.\n")
    n = sum(len(v) for v in no_year.values())
    for club, names in sorted(no_year.items(), key=lambda kv: -len(kv[1])):
        print(f"   {club}: {len(names)}")
    print(f"\ntotaal: {n} van de {rows} rijen "
          f"({100 * n // max(rows, 1)}%) — vooral spelers die enkel via de "
          f"Wikipedia-categorie gevonden zijn, want jaartallen zitten alleen in "
          f"de P54-kwalificaties van Wikidata")


def main():
    if "--report" in sys.argv:
        return report()
    CACHE.mkdir(exist_ok=True)
    aliases = club_aliases()
    rosters = {}

    for club_id, name, qid, _colors, category in CLUBS:
        print(f"-> {name} ({qid})", file=sys.stderr)
        raw = fetch_club(qid)
        n_p54 = len(raw)
        extra = fetch_extra(qid, category, raw.keys())
        raw.update(extra)
        roster = []
        for pid, p in raw.items():
            pos = map_position(p["positions"])
            nat = sorted(p["nats"])[0] if p["nats"] else None
            if not pos or not nat:
                continue  # onbruikbaar voor de criteria
            # Eigen clubnamen normaliseren; het label kan na omzetting samenvallen
            # met een andere, dus daarna nog eens ontdubbelen.
            others = sorted({aliases.get(c, c) for c in p["clubs"]} - {name})
            roster.append({
                "id": pid,
                "name": p["name"],
                "pos": pos,
                "nat": NAT_FIXES.get(nat, nat),
                "from": p["from"],
                "to": p["to"],
                "clubs": others,
            })
        # Interlands erbij (nationale A-ploegen).
        caps = fetch_national(qid, [p["id"] for p in roster
                                    if not p["id"].startswith("extra:")])
        for p in roster:
            p["intl"] = caps.get(p["id"], [])

        # Derde bron: de Wikipedia-infobox. Die geeft de jaartallen die in
        # Wikidata ontbreken, en een specifiekere positie dan P413.
        club_title = category[: -len(" players")]
        boxes = fetch_infoboxes(qid, club_title,
                                [p["id"] for p in roster if not p["id"].startswith("extra:")])
        gained_pos = gained_years = 0
        for p in roster:
            box = boxes.get(p["id"])
            if not box:
                continue
            if box.get("pos") and box["pos"] != p["pos"]:
                p["pos"] = box["pos"]
                gained_pos += 1
            if "from" in box:
                if p["from"] is None and p["to"] is None:
                    gained_years += 1
                p["from"], p["to"] = box["from"], box["to"]

        roster.sort(key=lambda r: r["name"])
        rosters[club_id] = roster
        print(f"   {len(roster)} spelers  (Wikidata {n_p54} + Wikipedia {len(extra)} "
              f"= {len(raw)} ruw)  infobox: {gained_years} jaartallen, "
              f"{gained_pos} posities bijgesteld", file=sys.stderr)
        time.sleep(1)

    print("-> handmatige correcties (tools/overrides.json)", file=sys.stderr)
    apply_overrides(rosters, load_overrides())

    # Zeldzame clubs uit de "ook bij"-lijsten gooien; die leveren toch nooit
    # een bruikbaar criterium op en maken het bestand alleen groter.
    other_club_counts = defaultdict(set)
    for roster in rosters.values():
        for p in roster:
            for c in p["clubs"]:
                other_club_counts[c].add(p["id"])
    keep = {c for c, ids in other_club_counts.items()
            if len(ids) >= MIN_PLAYERS_PER_OTHER_CLUB}
    for roster in rosters.values():
        for p in roster:
            p["clubs"] = [c for c in p["clubs"] if c in keep]

    write_data(rosters)
    total = sum(len(r) for r in rosters.values())
    uniq = len({p["id"] for r in rosters.values() for p in r})
    print(f"\n{DATA}: {total} rijen, {uniq} unieke spelers, "
          f"{len(keep)} bruikbare 'ook bij'-clubs", file=sys.stderr)


def write_data(rosters):
    """Schrijft data/clubs.json en per club een data/<id>.json."""
    DATA.mkdir(exist_ok=True)
    clubs = [{"id": cid, "name": name, "colors": colors}
             for cid, name, _qid, colors, _cat in CLUBS]
    (DATA / "clubs.json").write_text(
        json.dumps(clubs, ensure_ascii=False, indent=1), encoding="utf-8")

    trimmed = {}
    for cid, name, _qid, _colors, _cat in CLUBS:
        roster = [{k: p.get(k) for k in
                   ("name", "pos", "nat", "from", "to", "clubs", "intl")}
                  for p in rosters.get(cid, [])]
        trimmed[cid] = roster
        path = DATA / f"{cid}.json"
        path.write_text(json.dumps(roster, ensure_ascii=False), encoding="utf-8")
        print(f"   {path.name}: {len(roster)} spelers, "
              f"{path.stat().st_size // 1024} KB", file=sys.stderr)

    # Alles in één script-bestand, voor wie index.html rechtstreeks vanaf schijf
    # opent: browsers blokkeren daar fetch, maar een <script>-tag mag wel.
    bundle = DATA / "bundle.js"
    bundle.write_text(
        "window.__BKE_DATA = " +
        json.dumps({"clubs": clubs, "rosters": trimmed}, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print(f"   {bundle.name}: {bundle.stat().st_size // 1024} KB "
          f"(alleen gebruikt bij file://)", file=sys.stderr)


if __name__ == "__main__":
    main()
