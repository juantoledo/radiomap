#!/usr/bin/env python3
"""
Convierte data/curated_stations.csv a data/data.js (NODES, VERSION, REGION_COLORS).
Se ejecuta en CI antes del deploy para generar data.js desde el CSV fuente.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "curated_stations.csv"
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "data.js"
PROPAGATION_ROOT = Path(__file__).resolve().parent.parent / "data" / "propagation"

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


NUMERIC_KEYS = ("lat", "lon")

# Servicios / iconos especiales (CSV `serviceType`); vacío = repetidor genérico
SERVICE_TYPE_ALLOWED = frozenset({"atc", "fire", "ambulance", "sea"})


def normalize_signal_field(d: dict) -> None:
    """Cada «/» en la señal → un espacio (las barras rompen rutas URL/carpetas p. ej. propagación)."""
    v = d.get("signal")
    if v is None or not isinstance(v, str):
        return
    d["signal"] = v.strip().replace("/", " ")


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
    normalize_signal_field(row)
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
        elif k in ("isEcholink", "isDMR"):
            node[k] = v.lower() in ("1", "true", "yes")
        elif k == "serviceType":
            st = v.lower() if v else ""
            node[k] = st if st in SERVICE_TYPE_ALLOWED else ""
        else:
            node[k] = v
    # Compat: propagación y lógica JS que aún usa `isAir` para ATC
    node["isAir"] = node.get("serviceType") == "atc"
    return node


def rewrite_csv_signal_slashes() -> None:
    """Reescribe curated_stations.csv reemplazando «/» por espacio en la columna signal."""
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV no encontrado: {CSV_PATH}")
    with open(CSV_PATH, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise SystemExit("CSV sin cabecera")
        rows = []
        for row in reader:
            normalize_signal_field(row)
            rows.append(row)
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Actualizado {CSV_PATH} (signal: / → espacio)")


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


def propagation_signals_with_overlay() -> set[str]:
    """Señales con PNG + .pgw (world file); sin PGW el overlay no puede georreferenciarse."""
    out: set[str] = set()
    if not PROPAGATION_ROOT.is_dir():
        return out
    for d in PROPAGATION_ROOT.iterdir():
        if not d.is_dir():
            continue
        name = d.name
        if (d / f"{name}.png").is_file() and (d / f"{name}.pgw").is_file():
            out.add(name)
    return out


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

    prop_signals = propagation_signals_with_overlay()
    for node in nodes:
        sig = str(node.get("signal", "")).strip()
        node["hasPropagation"] = sig in prop_signals
        if sig in prop_signals:
            pgw_path = PROPAGATION_ROOT / sig / f"{sig}.pgw"
            if pgw_path.is_file():
                # Inline world file so the map need not fetch() .pgw (avoids CORS/file:// issues).
                node["propagationPgw"] = pgw_path.read_text(encoding="utf-8")
            dcf_path = PROPAGATION_ROOT / sig / f"{sig}.dcf"
            if dcf_path.is_file():
                node["propagationDcf"] = dcf_path.read_text(encoding="utf-8")

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
    elif len(sys.argv) > 1 and sys.argv[1] == "--normalize-signal-slashes":
        rewrite_csv_signal_slashes()
    else:
        main()
