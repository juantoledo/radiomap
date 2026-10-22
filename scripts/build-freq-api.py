#!/usr/bin/env python3
"""
API estática por frecuencia: data/data.js (NODES) + data/shortwave.js (SHORTWAVE) → api/v1/.

  api/v1/index.json          { version, generated, units, counts, freqs: [kHz…] }
  api/v1/freq/{kHz}.json     { kHz, version, stations: […], shortwave: […] }

Clave = kHz entero (redondeo al kHz más cercano). Frecuencia sin datos → 404 de GitHub Pages.
Se genera en el deploy (no se versiona). Contrato documentado en README.md («API por frecuencia»).

Uso (desde la raíz del repo, después de csv-to-datajs.py y eibi-to-shortwavejs.py):
  python scripts/build-freq-api.py [--out api/v1]
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
DATA_JS = ROOT / "data" / "data.js"
SHORTWAVE_JS = ROOT / "data" / "shortwave.js"
OUT_DIR = ROOT / "api" / "v1"
SITE_URL = "https://www.radiomap.cl/"

# Campos de NODE publicados (lista blanca: un campo nuevo del CSV no se expone hasta agregarlo aquí)
STATION_FIELDS = (
    "signal", "nombre", "banda", "tono", "potencia", "ganancia",
    "region", "comuna", "ubicacion", "lat", "lon",
    "otorga", "vence", "conference", "website", "notes", "labels",
)

# Rango aceptado en kHz por unidad de origen; fuera de rango = dato sospechoso → falla el build
AM_KHZ_RANGE = (500, 1800)
MHZ_BANDS_KHZ_RANGE = (1700, 3_000_000)
BAND_KHZ_RANGES = {"FM": (87_500, 108_000), "HF": (1_700, 30_000)}

# entry de SHORTWAVE: ver cabecera de data/shortwave.js
SW_KHZ, SW_START, SW_END, SW_DAYS, SW_STATION, SW_LANG, SW_TARGET, SW_SITE, SW_SEASON, SW_FROM, SW_TO, SW_HEARD = range(12)


def load_js_json(path: Path, const_name: str):
    """Extrae el literal JSON de `const NAME = …;` de un .js generado."""
    text = path.read_text(encoding="utf-8")
    marker = f"const {const_name} = "
    start = text.index(marker) + len(marker)
    value, _ = json.JSONDecoder().raw_decode(text, start)
    return value


def load_version(path: Path) -> str:
    m = re.search(r"const VERSION = '([^']*)'", path.read_text(encoding="utf-8"))
    return m.group(1) if m else "dev"


def round_khz(khz: float) -> int:
    """Redondeo al kHz más cercano, mitades hacia arriba (no bancario)."""
    return int(math.floor(khz + 0.5))


def node_value_khz(node: dict, key: str) -> float | None:
    """rx/tx del NODE en kHz. Banda «AM» viene en kHz; el resto (HF, VHF, UHF, FM) en MHz."""
    raw = node.get(key)
    if raw is None or str(raw).strip() == "":
        return None
    v = float(str(raw).strip().replace(",", "."))
    banda = str(node.get("banda", "")).strip().upper()
    if banda == "AM":
        khz, lo_hi = v, AM_KHZ_RANGE
    else:
        khz, lo_hi = v * 1000, BAND_KHZ_RANGES.get(banda, MHZ_BANDS_KHZ_RANGE)
    khz = round(khz, 3)
    if not lo_hi[0] <= khz <= lo_hi[1]:
        raise ValueError(f"{node.get('signal')!r}: {key}={raw!r} ({khz} kHz) fuera de rango {lo_hi} para banda {node.get('banda')!r}")
    return khz


def category_of(node: dict) -> str:
    """Igual que categoryOf en scripts/stats-page.js."""
    if node.get("isAir") or node.get("serviceType") == "atc":
        return "atc"
    if node.get("serviceType") == "broadcast":
        return "broadcast"
    if node.get("region") == "GLOBAL":
        return "global"
    return "amateur"


def _filled(v) -> bool:
    return v is not None and not (isinstance(v, str) and v.strip() == "")


def _num(khz: float) -> int | float:
    return int(khz) if khz == int(khz) else khz


def station_payload(node: dict, rx_khz: float | None, tx_khz: float | None, matched_on: list[str]) -> dict:
    out: dict = {}
    for k in STATION_FIELDS:
        v = node.get(k)
        if _filled(v):
            out[k] = v
    out["category"] = category_of(node)
    out["matchedOn"] = matched_on
    if rx_khz is not None:
        out["rxKHz"] = _num(rx_khz)
    if tx_khz is not None:
        out["txKHz"] = _num(tx_khz)
    out["isEcholink"] = bool(node.get("isEcholink"))
    out["isDMR"] = bool(node.get("isDMR"))
    if out["isDMR"]:
        dmr = {k_out: node.get(k_in) for k_in, k_out in (("color", "colorCode"), ("slot", "slot"), ("tg", "tg")) if _filled(node.get(k_in))}
        if dmr:
            out["dmr"] = dmr
    if node.get("hasPropagation"):
        out["hasPropagation"] = True
    out["url"] = SITE_URL + "?signal=" + quote(str(node.get("signal", "")), safe="")
    return out


def index_nodes(nodes: list[dict]) -> dict[int, list[dict]]:
    """kHz → estaciones. Cada NODE entra por rx y por tx (una sola vez si caen en el mismo kHz)."""
    by_khz: dict[int, list[dict]] = {}
    errors = []
    for node in nodes:
        try:
            rx = node_value_khz(node, "rx")
            tx = node_value_khz(node, "tx")
        except ValueError as e:
            errors.append(str(e))
            continue
        hits: dict[int, list[str]] = {}
        for key, khz in (("rx", rx), ("tx", tx)):
            if khz is not None:
                hits.setdefault(round_khz(khz), []).append(key)
        for k, matched in hits.items():
            by_khz.setdefault(k, []).append(station_payload(node, rx, tx, matched))
    if errors:
        raise SystemExit("Frecuencias inválidas en NODES:\n  " + "\n  ".join(errors))
    return by_khz


def hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}{minutes % 60:02d}"


def shortwave_payload(entry: list, sw: dict) -> dict:
    station_name, station_itu = sw["stations"][entry[SW_STATION]]
    site = sw["sites"][entry[SW_SITE]]
    site_itu, _site_code, site_name, site_lat, site_lon, site_precision = site
    lang = entry[SW_LANG]
    target = entry[SW_TARGET]
    out = {
        "station": station_name,
        "itu": station_itu,
        "country": sw["countries"].get(station_itu, station_itu),
        "kHz": _num(entry[SW_KHZ]),
        "startUTC": hhmm(entry[SW_START]),
        "endUTC": hhmm(entry[SW_END]),
        "days": sw["days"][entry[SW_DAYS]],
        "season": entry[SW_SEASON],
        "site": {
            "name": site_name,
            "itu": site_itu,
            "lat": site_lat,
            "lon": site_lon,
            "precision": site_precision,
        },
    }
    if _filled(lang):
        out["lang"] = lang
        out["langLabel"] = sw["langs"].get(lang, lang)
    if _filled(target):
        out["target"] = target
        out["targetLabel"] = sw["targets"].get(target, target)
    for key, idx in (("validFrom", SW_FROM), ("validTo", SW_TO), ("lastHeard", SW_HEARD)):
        if _filled(entry[idx]):
            out[key] = entry[idx]
    return out


def index_shortwave(sw: dict | None) -> dict[int, list[dict]]:
    by_khz: dict[int, list[dict]] = {}
    if not sw:
        return by_khz
    for entry in sorted(sw["entries"], key=lambda e: (e[SW_KHZ], e[SW_START])):
        by_khz.setdefault(round_khz(entry[SW_KHZ]), []).append(shortwave_payload(entry, sw))
    return by_khz


def build(nodes: list[dict], sw: dict | None, version: str, out_dir: Path, generated: str | None = None) -> dict:
    stations = index_nodes(nodes)
    shortwave = index_shortwave(sw)
    freqs = sorted(set(stations) | set(shortwave))

    if out_dir.exists():
        shutil.rmtree(out_dir)
    freq_dir = out_dir / "freq"
    freq_dir.mkdir(parents=True)

    def dump(path: Path, obj) -> None:
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    for k in freqs:
        dump(freq_dir / f"{k}.json", {
            "kHz": k,
            "version": version,
            "stations": stations.get(k, []),
            "shortwave": shortwave.get(k, []),
        })

    index = {
        "version": version,
        "generated": generated or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "units": "kHz",
        "shortwaveSeason": (sw or {}).get("meta", {}).get("season"),
        "counts": {
            "freqs": len(freqs),
            "stations": sum(len(v) for v in stations.values()),
            "shortwave": sum(len(v) for v in shortwave.values()),
        },
        "freqs": freqs,
    }
    dump(out_dir / "index.json", index)
    return index


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=DATA_JS)
    ap.add_argument("--shortwave", type=Path, default=SHORTWAVE_JS)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args()

    nodes = load_js_json(args.data, "NODES")
    version = load_version(args.data)
    sw = None
    if args.shortwave.exists():
        sw = load_js_json(args.shortwave, "SHORTWAVE")
    else:
        print(f"Aviso: {args.shortwave} no existe; API sin onda corta", file=sys.stderr)

    index = build(nodes, sw, version, args.out)
    c = index["counts"]
    print(f"API {version}: {c['freqs']} frecuencias ({c['stations']} estaciones, {c['shortwave']} emisiones OC) → {args.out}")


if __name__ == "__main__":
    main()
