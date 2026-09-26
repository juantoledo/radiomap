#!/usr/bin/env python3
"""
Convierte el horario EiBi (data/shortwave/source/sked-*.csv) a data/shortwave.js (SHORTWAVE).

Fuente: http://www.eibispace.de/dx/  (listas libres de uso; se muestra atribución en la UI).
Coordenadas de transmisores, nombres de idioma/país/zona objetivo: README.TXT de EiBi (misma carpeta).

El mapeo de columnas es por NOMBRE de cabecera (ver COLUMN_ALIASES), no por posición, para tolerar
columnas reordenadas / renombradas / nuevas. Solo onda corta de radiodifusión (sin utilitarias).

Uso:
  python scripts/eibi-to-shortwavejs.py            # genera data/shortwave.js
  python scripts/eibi-to-shortwavejs.py --strict   # además falla si faltan columnas o hay muchas filas inválidas
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW_DIR = ROOT / "data" / "shortwave"
SOURCE_DIR = SW_DIR / "source"
OUT_PATH = ROOT / "data" / "shortwave.js"
OVERRIDES_PATH = SW_DIR / "site_overrides.csv"
UTILITY_PATTERNS_PATH = SW_DIR / "utility_patterns.txt"

SOURCE_URL = "http://www.eibispace.de/dx/"

# --- Column mapping (single place to edit if EiBi renames a column) ---------------------------
COLUMN_ALIASES = {
    "khz": "freq", "freq": "freq", "frequency": "freq",
    "time": "time", "utc": "time",
    "days": "days", "day": "days",
    "itu": "itu", "country": "itu",
    "station": "station",
    "lng": "lang", "lang": "lang", "language": "lang",
    "target": "target",
    "remarks": "site", "site": "site", "tx site": "site",
    "p": "persistence", "persistence": "persistence",
    "start": "start",
    "stop": "stop", "end": "stop",
}
REQUIRED = {"freq", "time", "itu", "station", "site", "persistence"}

# --- Filters ---------------------------------------------------------------------------------
SW_MIN_KHZ = 1711.0  # por encima de la banda de onda media
SW_MAX_KHZ = 30000.0
NOT_A_BROADCAST_DAYS = {"alt", "harm", "imod", "spur", "lsb", "usb"}
IRREGULAR_DAYS = {"irr", "test", "tests", "tent", "ram", "haj", "mf-15"}
MAX_BAD_ROW_RATIO = 0.02

DAY_NAMES = ["mo", "tu", "we", "th", "fr", "sa", "su"]
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

COORD_RE = re.compile(
    r"(\d{1,2})([NS])(\d{2})(?:'(\d{2})\")?-(\d{1,3})([EW])(\d{2})(?:'(\d{2})\")?"
)

# Nombres en español para lo más común (el resto queda en inglés, desde el README de EiBi).
LANG_ES = {
    "A": "Árabe", "BE": "Bengalí", "BR": "Birmano", "CA": "Cantonés", "D": "Alemán",
    "DR": "Dari", "E": "Inglés", "F": "Francés", "FS": "Persa (farsi)", "HA": "Hausa",
    "HI": "Hindi", "I": "Italiano", "IN": "Indonesio", "J": "Japonés", "K": "Coreano",
    "KH": "Jemer", "M": "Mandarín", "P": "Portugués", "PS": "Pastún", "R": "Ruso",
    "RO": "Rumano", "S": "Español", "SWA": "Suajili", "T": "Tailandés", "TB": "Tibetano",
    "TU": "Turco", "UI": "Uigur", "UK": "Ucraniano", "UR": "Urdu", "VN": "Vietnamita",
    "Q": "Quechua", "AM": "Amoy", "AY": "Aimara", "EO": "Esperanto", "L": "Latín",
    "-MX": "Música",
    "MO": "Mongol", "KZ": "Kazajo", "HK": "Hakka", "SO": "Somalí", "AH": "Amhárico",
    "NL": "Neerlandés", "OO": "Oromo", "TIG": "Tigriña", "TAM": "Tamil", "FI": "Finés",
    "NE": "Nepalí", "LAO": "Lao", "TAG": "Tagalo", "SR": "Serbio", "CR": "Criollo haitiano",
    "SEF": "Ladino (judeoespañol)", "AL": "Albanés", "TJ": "Tayiko", "HU": "Húngaro",
    "ML": "Malayo", "BU": "Búlgaro", "KG": "Kirguís", "AR": "Armenio", "CZ": "Checo",
    "HR": "Croata", "HB": "Hebreo", "SK": "Eslovaco", "PO": "Polaco", "NO": "Noruego",
    "GE": "Georgiano", "BY": "Bielorruso", "AZ": "Azerí", "UZ": "Uzbeko", "TT": "Tártaro",
    "TK": "Turcomano", "KU": "Kurdo", "JV": "Javanés", "TEL": "Telugu", "MAL": "Malayalam",
    "MAR": "Maratí", "PJ": "Panyabí", "SI": "Cingalés", "C": "Chino", "AFG": "Pastún y dari",
    "SUD": "Árabe sudanés", "JU": "Árabe de Juba", "CHE": "Checheno", "TO": "Tongano",
    "SM": "Samoano", "MSY": "Malgache", "LIN": "Lingala", "FU": "Fula", "YO": "Yoruba",
    "IG": "Igbo", "KNK": "Kinyarwanda-Kirundi", "D-P": "Bajo alemán", "TP": "Tok Pisin",
    "SLM": "Pijin (Islas Salomón)", "BSL": "Bislama", "Ros": "Rosario (Radio Vaticano)",
    "LTO": "Liturgia oriental (Radio Vaticano)", "KNU": "Kanuri", "TAH": "Tashelhit",
    "UD": "Udmurto", "COF": "Cofán", "SUA": "Shuar", "WAO": "Huaorani", "CHA": "Chachi",
}
TARGET_ES = {
    "Af": "África", "Am": "América", "As": "Asia", "Car": "Caribe", "Cau": "Cáucaso",
    "Eu": "Europa", "FE": "Lejano Oriente", "Glo": "Global", "In": "Subcontinente indio",
    "LAm": "Latinoamérica", "ME": "Medio Oriente", "Oc": "Oceanía", "SEA": "Sudeste asiático",
    "Sib": "Siberia", "Tib": "Tíbet", "SAm": "Sudamérica", "NAm": "Norteamérica",
    "CAm": "Centroamérica", "ENA": "Este de Norteamérica", "WNA": "Oeste de Norteamérica",
    "CNA": "Centro de Norteamérica", "WEu": "Europa occidental", "EEu": "Europa oriental",
    "CEu": "Europa central", "NEu": "Europa del norte", "SEu": "Europa del sur",
    "SEE": "Sudeste de Europa", "NAf": "África del norte", "WAf": "África occidental",
    "EAf": "África oriental", "CAf": "África central", "SAf": "África austral",
    "CAs": "Asia central", "SAs": "Asia del sur", "NAO": "Atlántico norte",
    "SAO": "Atlántico sur", "WOc": "Oceanía occidental", "EOc": "Oceanía oriental",
    "CIS": "Ex URSS",
}
COMPASS_ES = {"N": "Norte de", "S": "Sur de", "E": "Este de", "W": "Oeste de", "C": "Centro de"}


class MapperError(Exception):
    """Estructura de CSV no utilizable (p. ej. falta una columna requerida)."""


# --- Decoding / header -----------------------------------------------------------------------
def decode_bytes(raw: bytes) -> str:
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    return text.replace("\r\n", "\n").replace("\r", "\n")


def normalize_header_cell(cell: str) -> str:
    c = re.sub(r":\d+\s*$", "", cell.strip())
    c = re.sub(r"\(.*?\)", "", c)
    return c.strip().lower()


def map_header(header: list[str], warnings: list[str]) -> dict[str, int]:
    """Devuelve {campo_canónico: índice}. Lanza MapperError si falta un requerido."""
    mapping: dict[str, int] = {}
    for i, cell in enumerate(header):
        name = normalize_header_cell(cell)
        if not name:
            continue
        key = COLUMN_ALIASES.get(name)
        if key is None:
            warnings.append(f"columna desconocida ignorada: {cell!r}")
            continue
        if key in mapping:
            warnings.append(f"columna duplicada ignorada: {cell!r}")
            continue
        mapping[key] = i
    missing = REQUIRED - mapping.keys()
    if missing:
        raise MapperError(f"faltan columnas requeridas: {', '.join(sorted(missing))} (cabecera: {header})")
    return mapping


# --- Field parsers ---------------------------------------------------------------------------
def parse_time(value: str) -> tuple[int, int] | None:
    m = re.match(r"^\s*(\d{4})-(\d{4})\s*$", value or "")
    if not m:
        return None
    out = []
    for hhmm in m.groups():
        h, mi = int(hhmm[:2]), int(hhmm[2:])
        if h > 24 or mi > 59 or (h == 24 and mi):
            return None
        out.append(h * 60 + mi)
    return out[0], out[1]


def parse_persistence(value: str) -> tuple[int, bool] | None:
    """(código base, es_utilitaria)."""
    m = re.match(r"^\s*(\d+)", value or "")
    if not m:
        return None
    p = int(m.group(1))
    if p >= 90:
        return p - 90, True
    return p, False


def parse_ddmm(value: str) -> tuple[int, int] | None:
    m = re.match(r"^\s*(\d{2})(\d{2})", value or "")
    if not m:
        return None
    d, mo = int(m.group(1)), int(m.group(2))
    if not (1 <= d <= 31 and 1 <= mo <= 12):
        return None
    return d, mo


def parse_last_heard(*values: str) -> str | None:
    for v in values:
        m = re.search(r"\[(\d{4})\]", v or "")
        if m:
            return m.group(1)
    return None


def _day_index(token: str) -> int | None:
    t = token.lower()
    return DAY_NAMES.index(t) if t in DAY_NAMES else None


def parse_days(value: str) -> dict | None:
    """Descriptor de días; None = no es una emisión real (alt/harm/imod/spur/LSB/USB)."""
    v = (value or "").strip()
    if not v:
        return {"t": "d"}
    low = v.lower()
    if low in NOT_A_BROADCAST_DAYS:
        return None
    if low in IRREGULAR_DAYS:
        return {"t": "irr"}
    if re.fullmatch(r"[1-7]+", v):
        mask = 0
        for ch in v:
            mask |= 1 << (int(ch) - 1)
        return {"t": "w", "m": mask}
    m = re.fullmatch(r"([1-5])\.([A-Za-z]{2})", v)
    if m and _day_index(m.group(2)) is not None:
        return {"t": "n", "n": int(m.group(1)), "wd": _day_index(m.group(2))}
    m = re.fullmatch(r"Last([1-7])", v, re.IGNORECASE)
    if m:
        return {"t": "l", "wd": int(m.group(1)) - 1}
    m = re.fullmatch(r"(\d{1,2})([A-Za-z]{3})", v)
    if m and m.group(2).lower() in MONTHS:
        return {"t": "date", "d": int(m.group(1)), "m": MONTHS.index(m.group(2).lower()) + 1}
    # Días de la semana: listas separadas por coma, rangos (con vuelta) y concatenaciones (SaSu).
    mask = 0
    for part in v.split(","):
        part = part.strip()
        rng = re.fullmatch(r"([A-Za-z]{2})-([A-Za-z]{2})", part)
        if rng:
            a, b = _day_index(rng.group(1)), _day_index(rng.group(2))
            if a is None or b is None:
                return {"t": "irr", "raw": v}
            i = a
            while True:
                mask |= 1 << i
                if i == b:
                    break
                i = (i + 1) % 7
            continue
        if part and len(part) % 2 == 0:
            idxs = [_day_index(part[i:i + 2]) for i in range(0, len(part), 2)]
            if all(x is not None for x in idxs):
                for x in idxs:
                    mask |= 1 << x
                continue
        return {"t": "irr", "raw": v}
    return {"t": "w", "m": mask} if mask else {"t": "irr", "raw": v}


def parse_site_code(remarks: str, home_itu: str) -> tuple[str, str | None]:
    """'' / 'k' / '-k' / '/CYP' / '/OMA-a' → (país_del_transmisor, código|None)."""
    r = (remarks or "").strip()
    if not r:
        return home_itu, None
    m = re.fullmatch(r"/([A-Z]{1,3})(?:-([A-Za-z0-9]{1,3}))?", r)
    if m:
        return m.group(1), m.group(2)
    m = re.fullmatch(r"-?([A-Za-z0-9]{1,3})", r)
    if m:
        return home_itu, m.group(1)
    return home_itu, None


def parse_coord(text: str) -> tuple[float, float] | None:
    m = COORD_RE.search(text or "")
    if not m:
        return None
    lat = int(m.group(1)) + int(m.group(3)) / 60 + int(m.group(4) or 0) / 3600
    lon = int(m.group(5)) + int(m.group(7)) / 60 + int(m.group(8) or 0) / 3600
    if m.group(2) == "S":
        lat = -lat
    if m.group(6) == "W":
        lon = -lon
    return round(lat, 4), round(lon, 4)


# --- README tables ---------------------------------------------------------------------------
def _section(lines: list[str], title: str, next_title_re: str) -> list[str]:
    """Líneas de la ÚLTIMA ocurrencia de `title` (la primera es el índice) hasta el siguiente título."""
    starts = [i for i, l in enumerate(lines) if l.strip() == title]
    if not starts:
        return []
    start = starts[-1] + 1
    for j in range(start, len(lines)):
        if re.match(next_title_re, lines[j].strip()):
            return lines[start:j]
    return lines[start:]


def parse_readme(text: str) -> dict:
    lines = text.split("\n")
    langs: dict[str, str] = {}
    for l in _section(lines, "I) Language codes.", r"^II\) Country codes\.$"):
        m = re.match(r"^   (\S{1,4})\s{2,}(.+?)\s*$", l)
        if m:
            name = re.split(r"[:(\[]", m.group(2))[0].strip()
            if name:
                langs[m.group(1)] = name
    countries: dict[str, str] = {}
    for l in _section(lines, "II) Country codes.", r"^III\) Target-area codes\.$"):
        m = re.match(r"^   ([A-Z]{1,3})\s{1,}(.+?)\s*\*?\s*$", l)
        if m:
            countries[m.group(1)] = m.group(2).rstrip(" *")
    targets: dict[str, str] = {}
    for l in _section(lines, "III) Target-area codes.", r"^IV\) Transmitter site codes\.$"):
        m = re.match(r"^   (\S{1,3})\s+-\s+(.+?)\s*$", l)
        if m:
            targets[m.group(1)] = m.group(2)
    sites: dict[tuple[str, str], dict] = {}
    defaults: dict[str, dict] = {}
    first_site: dict[str, dict] = {}
    cur = None
    for l in _section(lines, "IV) Transmitter site codes.", r"(?!)"):
        m = re.match(r"^   ([A-Z]{1,3}):\s*(.*)$", l)
        if m:
            cur, rest = m.group(1), m.group(2)
        elif cur and re.match(r"^\s{6,}\S", l):
            rest = l.strip()
        else:
            if l.strip() and not l.startswith(" "):
                cur = None
            continue
        coord = parse_coord(rest)
        sm = re.match(r"^([A-Za-z0-9]{1,3})-(.*)$", rest)
        name_src = sm.group(2) if sm else rest
        name = re.split(r"\s\d{1,2}[NS]\d{2}", name_src)[0]
        name = re.sub(r"\s*except:?\s*$", "", name).strip().strip(",")
        entry = {"name": name, "coord": coord}
        if sm:
            sites.setdefault((cur, sm.group(1)), entry)
        else:
            defaults.setdefault(cur, entry)
        if coord and cur not in first_site:
            first_site[cur] = entry
    return {"langs": langs, "countries": countries, "targets": targets,
            "sites": sites, "defaults": defaults, "first_site": first_site}


def load_overrides(path: Path) -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    if not path.exists():
        return out
    rows = [l for l in path.read_text(encoding="utf-8").splitlines() if l.strip() and not l.lstrip().startswith("#")]
    for row in csv.DictReader(rows):
        try:
            coord = (float(row["lat"]), float(row["lon"]))
        except (KeyError, TypeError, ValueError):
            continue
        out[(row["itu"].strip(), (row.get("code") or "").strip())] = {"name": (row.get("name") or "").strip(), "coord": coord}
    return out


def load_utility_patterns(path: Path) -> list[re.Pattern]:
    if not path.exists():
        return []
    pats = []
    for l in path.read_text(encoding="utf-8").splitlines():
        l = l.strip()
        if l and not l.startswith("#"):
            pats.append(re.compile(l, re.IGNORECASE))
    return pats


def resolve_site(itu: str, code: str | None, readme: dict, overrides: dict) -> tuple[dict, str] | None:
    """(sitio, precisión) o None si no hay coordenadas para ese país."""
    ov = overrides.get((itu, code or ""))
    if ov:
        return ov, "site"
    if code:
        s = readme["sites"].get((itu, code))
        if s and s["coord"]:
            return s, "site"
    else:
        d = readme["defaults"].get(itu)
        if d and d["coord"]:
            return d, "site"
    fs = readme["first_site"].get(itu)
    if fs:
        return fs, "country"
    return None


def target_name(code: str, readme: dict) -> str:
    if code in TARGET_ES:
        return TARGET_ES[code]
    if code in readme["targets"]:
        return readme["targets"][code]
    if len(code) >= 3 and code[0] in COMPASS_ES and code[1:] in TARGET_ES:
        return f"{COMPASS_ES[code[0]]} {TARGET_ES[code[1:]]}"
    return readme["countries"].get(code, code)


def season_from_filename(name: str) -> tuple[str, int] | None:
    m = re.search(r"sked-([ab])(\d{2})", name, re.IGNORECASE)
    if not m:
        return None
    return m.group(1).upper(), 2000 + int(m.group(2))


def iso_date(ddmm: tuple[int, int] | None, season: tuple[str, int] | None) -> str | None:
    if not ddmm or not season:
        return None
    d, mo = ddmm
    letter, year = season
    if letter == "B" and mo < 7:  # temporada B cruza el año nuevo (oct → mar)
        year += 1
    return f"{year:04d}-{mo:02d}-{d:02d}"


# --- Main conversion -------------------------------------------------------------------------
def convert(csv_text: str, readme: dict, overrides: dict, utility: list[re.Pattern],
            season: tuple[str, int] | None) -> dict:
    warnings: list[str] = []
    rows = list(csv.reader(io.StringIO(csv_text), delimiter=";"))
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        raise MapperError("CSV vacío")
    col = map_header(rows[0], warnings)
    width = max(col.values()) + 1

    skipped = {"band": 0, "inactive": 0, "utility": 0, "notBroadcast": 0, "noSite": 0, "invalid": 0}
    unknown_days: dict[str, int] = {}
    unresolved: dict[str, int] = {}
    parsed: list[dict] = []

    for row in rows[1:]:
        row = (row + [""] * width)[:max(width, len(row))]
        get = lambda k: row[col[k]].strip() if k in col else ""
        try:
            freq = float(get("freq").replace(",", "."))
        except ValueError:
            skipped["invalid"] += 1
            continue
        times = parse_time(get("time"))
        pers = parse_persistence(get("persistence"))
        if times is None or pers is None:
            skipped["invalid"] += 1
            continue
        if not (SW_MIN_KHZ <= freq <= SW_MAX_KHZ):
            skipped["band"] += 1
            continue
        p, is_util = pers
        if p == 8:
            skipped["inactive"] += 1
            continue
        station, lang = get("station"), get("lang")
        if is_util or lang.startswith("-") and lang != "-MX" or any(u.search(station) for u in utility):
            skipped["utility"] += 1
            continue
        days = parse_days(get("days"))
        if days is None:
            skipped["notBroadcast"] += 1
            continue
        if "raw" in days:
            unknown_days[days["raw"]] = unknown_days.get(days["raw"], 0) + 1
            days = {"t": "irr"}
        home = get("itu")
        tx_itu, code = parse_site_code(get("site"), home)
        site = resolve_site(tx_itu, code, readme, overrides)
        if site is None:
            key = f"{tx_itu}-{code}" if code else tx_itu
            unresolved[key] = unresolved.get(key, 0) + 1
            skipped["noSite"] += 1
            continue
        s, precision = site
        # Sitio no identificado: se ubica en un transmisor conocido del país, pero se rotula con el país.
        site_name = s["name"] if precision == "site" else readme["countries"].get(tx_itu, tx_itu)
        parsed.append({
            "freq": freq, "start": times[0], "end": times[1], "days": days,
            "station": station, "home": home, "lang": lang, "target": get("target"),
            "site": (tx_itu, code if precision == "site" else None, site_name, s["coord"][0], s["coord"][1], precision),
            "season": p if p in (4, 5) else 0,
            "from": iso_date(parse_ddmm(get("start")), season) if p == 6 else None,
            "to": iso_date(parse_ddmm(get("stop")), season) if p == 6 else None,
            "heard": parse_last_heard(get("stop"), get("start")),
        })

    # Diccionarios ordenados → salida determinista
    sites = sorted({e["site"] for e in parsed}, key=lambda s: (s[0], s[1] or "", s[2]))
    site_idx = {s: i for i, s in enumerate(sites)}
    stations = sorted({(e["station"], e["home"]) for e in parsed})
    station_idx = {s: i for i, s in enumerate(stations)}
    days_list = sorted({json.dumps(e["days"], sort_keys=True) for e in parsed})
    days_idx = {d: i for i, d in enumerate(days_list)}
    entries = sorted(
        [[
            int(e["freq"]) if e["freq"].is_integer() else e["freq"],
            e["start"], e["end"],
            days_idx[json.dumps(e["days"], sort_keys=True)],
            station_idx[(e["station"], e["home"])],
            e["lang"], e["target"], site_idx[e["site"]],
            e["season"], e["from"], e["to"], e["heard"],
        ] for e in parsed],
        key=lambda x: (x[0], x[1], x[4], x[7]),
    )
    # Códigos combinados (p. ej. «S,Q» = español y quechua): se emiten los nombres de cada parte.
    used_langs = sorted({c.strip() for e in parsed for c in e["lang"].split(",") if c.strip()})
    used_targets = sorted({e["target"] for e in parsed if e["target"]})
    used_countries = sorted({s[0] for s in sites} | {s[1] for s in stations})
    total = len(rows) - 1
    return {
        "data": {
            "langs": {c: LANG_ES.get(c, readme["langs"].get(c, c)) for c in used_langs},
            "targets": {c: target_name(c, readme) for c in used_targets},
            "countries": {c: readme["countries"].get(c, c) for c in used_countries},
            "sites": [list(s) for s in sites],
            "stations": [list(s) for s in stations],
            "days": [json.loads(d) for d in days_list],
            "entries": entries,
        },
        "report": {
            "totalRows": total, "kept": len(entries), "skipped": skipped,
            "unknownDays": unknown_days, "unresolvedSites": unresolved, "warnings": warnings,
        },
    }


def find_source_csv() -> Path:
    files = sorted(SOURCE_DIR.glob("sked-*.csv"))
    if len(files) != 1:
        raise MapperError(f"se espera exactamente un sked-*.csv en {SOURCE_DIR}, hay {len(files)}")
    return files[0]


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    try:
        src = find_source_csv()
        raw = src.read_bytes()
        readme_path = SOURCE_DIR / "README.TXT"
        if not readme_path.exists():
            raise MapperError(f"falta {readme_path} (coordenadas de transmisores)")
        readme = parse_readme(decode_bytes(readme_path.read_bytes()))
        season = season_from_filename(src.name)
        result = convert(decode_bytes(raw), readme, load_overrides(OVERRIDES_PATH),
                         load_utility_patterns(UTILITY_PATTERNS_PATH), season)
    except MapperError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    rep = result["report"]
    print(f"EiBi {src.name}: {rep['totalRows']} filas, {rep['kept']} emisiones de onda corta conservadas")
    print(f"  omitidas: {rep['skipped']}")
    if rep["unknownDays"]:
        print(f"  días no reconocidos (tratados como irregulares): {rep['unknownDays']}")
    if rep["unresolvedSites"]:
        top = sorted(rep["unresolvedSites"].items(), key=lambda kv: -kv[1])[:15]
        print(f"  sitios sin coordenadas (omitidos): {dict(top)}")
    for w in rep["warnings"]:
        print(f"  aviso: {w}")

    bad = rep["skipped"]["invalid"]
    if strict and rep["totalRows"] and bad / rep["totalRows"] > MAX_BAD_ROW_RATIO:
        print(f"ERROR: {bad} filas inválidas (> {MAX_BAD_ROW_RATIO:.0%})", file=sys.stderr)
        return 1
    if strict and rep["kept"] == 0:
        print("ERROR: no quedó ninguna emisión", file=sys.stderr)
        return 1

    meta = {
        "source": "EiBi", "url": SOURCE_URL,
        "season": f"{season[0]}{str(season[1])[2:]}" if season else None,
        "sourceFile": src.name, "sha256": hashlib.sha256(raw).hexdigest(),
        "rows": rep["kept"], "skipped": rep["skipped"],
    }
    payload = {"meta": meta, **result["data"]}
    out = (
        "// Onda corta — generado desde EiBi (data/shortwave/source) por scripts/eibi-to-shortwavejs.py; no editar a mano\n"
        "// entries: [kHz, inicioMin, finMin, díasIdx, emisoraIdx, idioma, zonaObjetivo, sitioIdx, soloTemporada(0|4|5), válidoDesde, válidoHasta, últimaEscucha(MMYY)]\n"
        "// sites: [itu, código, nombre, lat, lon, precisión('site'|'country')] · stations: [nombre, itu]\n"
        f"const SHORTWAVE = {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))};\n"
    )
    OUT_PATH.write_text(out, encoding="utf-8")
    print(f"Generado {OUT_PATH} ({len(out) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
