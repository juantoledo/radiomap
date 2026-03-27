#!/usr/bin/env python3
"""
Convierte data/curated_stations.csv a data/data.js (NODES, VERSION, REGION_COLORS).
Se ejecuta en CI antes del deploy para generar data.js desde el CSV fuente.
"""
from __future__ import annotations

import csv
import json
import math
import re
from pathlib import Path
from typing import Optional

# ── Alcance teórico (coherente con la barra metodológica del mapa) ─────────
# Referencia: 10 W y 6 dBi → 55 km (VHF) / 25 km (UHF).
# EIRP (dBW) = 10·log10(P_W) + G_dBi. Variación de alcance ∝ √(P_ef) en línea
# de vista → factor 10^((EIRP − EIRP_ref)/20).
# Sin dato de altura de antena: factor 1 (no se aplica ×1,65).
# Tope: 2,5× el radio base de la banda. Ganancia se acota a [0, 25] dBi.
REF_P_W = 10.0
REF_G_DBI = 6.0
BASE_VHF_KM = 55.0
BASE_UHF_KM = 25.0
HEIGHT_FACTOR_ASSUMED = 1.0
CAP_MULT = 2.5
GAIN_MIN_DBI = 0.0
GAIN_MAX_DBI = 25.0

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "curated_stations.csv"
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "data.js"

# Orden norte → sur (misma lógica que sortRegionKeysChile en location-filter.js)
DEFAULT_REGION_COLORS = {
    "REGIÓN DE ARICA Y PARINACOTA": "#e53935",
    "REGIÓN DE TARAPACÁ": "#e91e8c",
    "REGIÓN DE ANTOFAGASTA": "#ff6b35",
    "REGIÓN DE ATACAMA": "#f7931e",
    "REGIÓN DE COQUIMBO": "#ffcd05",
    "REGIÓN DE VALPARAÍSO": "#00bcd4",
    "REGIÓN METROPOLITANA DE SANTIAGO": "#5e35b1",
    "REGIÓN DEL LIBERTADOR GENERAL BERNARDO O'HIGGINS": "#43a047",
    "REGIÓN DEL MAULE": "#1e88e5",
    "REGIÓN DE NUBLE": "#9b59b6",
    "REGIÓN DEL BIOBÍO": "#00897b",
    "REGIÓN DE LA ARAUCANÍA": "#8dc63f",
    "REGIÓN DE LOS RÍOS": "#00d4ff",
    "REGIÓN DE LOS LAGOS": "#29abe2",
    "REGIÓN DE AYSÉN DEL GENERAL CARLOS IBÁÑEZ DEL CAMPO": "#00838f",
    "REGIÓN DE MAGALLANES Y DE LA ANTÁRTICA CHILENA": "#1565c0",
    "ATC — NACIONAL (Chile)": "#546e7a",
}

# Mismo orden que CHILE_REGIONS_ADMIN_ORDER en scripts/location-filter.js
CHILE_REGION_ORDER = list(DEFAULT_REGION_COLORS.keys())


def ordered_region_colors(region_colors: dict) -> dict:
    """Orden administrativo norte → sur; regiones desconocidas al final por nombre."""
    rank = {k: i for i, k in enumerate(CHILE_REGION_ORDER)}
    keys = sorted(
        region_colors.keys(),
        key=lambda k: (rank.get(k, 10000), k),
    )
    return {k: region_colors[k] for k in keys}


NUMERIC_KEYS = ("lat", "lon", "range_km")


def _float_field(d: dict, key: str) -> Optional[float]:
    v = d.get(key)
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


def _band_base_km(banda: str) -> Optional[float]:
    u = (banda or "").upper()
    if "VHF" in u:
        return BASE_VHF_KM
    if "UHF" in u:
        return BASE_UHF_KM
    return None


def _eirp_dbw(p_w: float, g_dbi: float) -> float:
    return 10.0 * math.log10(p_w) + g_dbi


def computed_range_km(node: dict) -> Optional[float]:
    """Alcance modelado desde P, G y banda; None si no aplica."""
    p_w = _float_field(node, "potencia")
    g_raw = _float_field(node, "ganancia")
    if p_w is None or g_raw is None or p_w <= 0:
        return None
    g_dbi = max(GAIN_MIN_DBI, min(GAIN_MAX_DBI, g_raw))
    r0 = _band_base_km(str(node.get("banda", "")))
    if r0 is None:
        return None
    eirp_ref = _eirp_dbw(REF_P_W, REF_G_DBI)
    eirp = _eirp_dbw(p_w, g_dbi)
    delta_db = eirp - eirp_ref
    r_km = r0 * (10.0 ** (delta_db / 20.0)) * HEIGHT_FACTOR_ASSUMED
    r_km = min(r_km, r0 * CAP_MULT)
    return round(r_km, 1)


def apply_effective_range_km(node: dict) -> None:
    """Sobrescribe range_km con el modelo EIRP si hay potencia y ganancia válidas."""
    calc = computed_range_km(node)
    if calc is not None:
        node["range_km"] = calc


def normalize_rx_tx_mhz_fields(d: dict) -> None:
    """Format rx/tx to three decimal places for VHF/UHF bands (MHz)."""
    banda = str(d.get("banda", ""))
    u = banda.upper()
    if "VHF" not in u and "UHF" not in u:
        return
    for key in ("rx", "tx"):
        v = d.get(key, "")
        if v == "" or v is None:
            continue
        if not isinstance(v, str):
            v = str(v)
        v = v.strip()
        if not v:
            continue
        try:
            mhz = float(v.replace(",", "."))
            d[key] = f"{mhz:.3f}"
        except ValueError:
            pass


def parse_row(row: dict) -> dict:
    """Convierte fila CSV a objeto NODE."""
    row = {k: v for k, v in row.items()}
    normalize_rx_tx_mhz_fields(row)
    node = {}
    for k, v in row.items():
        if k is None:
            continue
        if not isinstance(v, str):
            v = ""
        else:
            v = v.strip()
        if k in NUMERIC_KEYS and v:
            try:
                node[k] = float(v)
            except ValueError:
                node[k] = v
        elif k in ("isEcholink", "isDMR", "isAir"):
            node[k] = v.lower() in ("1", "true", "yes")
        else:
            node[k] = v
    return node


def rewrite_csv_rx_tx_normalized() -> None:
    """Reescribe curated_stations.csv con rx/tx normalizados (3 decimales VHF/UHF)."""
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV no encontrado: {CSV_PATH}")
    with open(CSV_PATH, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise SystemExit("CSV sin cabecera")
        rows = []
        for row in reader:
            normalize_rx_tx_mhz_fields(row)
            rows.append(row)
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Actualizado {CSV_PATH} (rx/tx MHz con 3 decimales donde aplica)")


def read_version_and_colors() -> tuple[str, dict]:
    """Lee VERSION y REGION_COLORS de data.js existente."""
    version = "1.0.0"
    region_colors = DEFAULT_REGION_COLORS.copy()
    for path in (OUT_PATH,):
        if path.exists():
            txt = path.read_text(encoding="utf-8")
            vm = re.search(r"const VERSION = '([^']+)'", txt)
            if vm:
                version = vm.group(1)
            rc = re.search(r"const REGION_COLORS = (\{[^;]+\});", txt, re.DOTALL)
            if rc:
                try:
                    region_colors = json.loads(rc.group(1))
                    region_colors.pop("", None)
                    # Merge any missing regions from default (e.g. new regions from CSV)
                    for k, v in DEFAULT_REGION_COLORS.items():
                        if k not in region_colors:
                            region_colors[k] = v
                except json.JSONDecodeError:
                    pass
            break
    return version, region_colors


def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV no encontrado: {CSV_PATH}")

    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        nodes = [parse_row(row) for row in reader]

    for node in nodes:
        apply_effective_range_km(node)

    version, region_colors = read_version_and_colors()
    region_colors.pop("", None)
    region_colors = ordered_region_colors(region_colors)

    out = f"""// Repetidoras Chile — datos centralizados (generado desde curated_stations.csv)
const VERSION = '{version}';

const NODES = {json.dumps(nodes, ensure_ascii=False)};

const REGION_COLORS = {json.dumps(region_colors, ensure_ascii=False)};
"""

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(out, encoding="utf-8")
    print(f"Generado {OUT_PATH} ({len(nodes)} nodos)")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--normalize-csv-freqs":
        rewrite_csv_rx_tx_normalized()
    else:
        main()
