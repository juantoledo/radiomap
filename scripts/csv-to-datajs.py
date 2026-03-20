#!/usr/bin/env python3
"""
Convierte data/curated_stations.csv a data/data.js (NODES, VERSION, REGION_COLORS).
Se ejecuta en CI antes del deploy para generar data.js desde el CSV fuente.
"""
import csv
import json
import re
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "curated_stations.csv"
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "data.js"

DEFAULT_REGION_COLORS = {
    "REGIÓN DE ARICA Y PARINACOTA": "#e53935",
    "REGIÓN DE ANTOFAGASTA": "#ff6b35",
    "REGIÓN DE ATACAMA": "#f7931e",
    "REGIÓN DE COQUIMBO": "#ffcd05",
    "REGIÓN DE LA ARAUCANÍA": "#8dc63f",
    "REGIÓN DE LOS LAGOS": "#29abe2",
    "REGIÓN DE LOS RÍOS": "#00d4ff",
    "REGIÓN DE NUBLE": "#9b59b6",
    "REGIÓN DE TARAPACÁ": "#e91e8c",
    "REGIÓN DE VALPARAÍSO": "#00bcd4",
    "REGIÓN DEL BIOBÍO": "#00897b",
    "REGIÓN DEL LIBERTADOR GENERAL BERNARDO O'HIGGINS": "#43a047",
    "REGIÓN DEL MAULE": "#1e88e5",
    "REGIÓN METROPOLITANA DE SANTIAGO": "#5e35b1",
    "REGIÓN DE MAGALLANES Y DE LA ANTÁRTICA CHILENA": "#1565c0",
}

NUMERIC_KEYS = ("lat", "lon", "range_km")


def parse_row(row: dict) -> dict:
    """Convierte fila CSV a objeto NODE."""
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
        else:
            node[k] = v
    return node


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

    version, region_colors = read_version_and_colors()
    region_colors.pop("", None)

    out = f"""// Repetidoras Chile — datos centralizados (generado desde curated_stations.csv)
const VERSION = '{version}';

const NODES = {json.dumps(nodes, ensure_ascii=False)};

const REGION_COLORS = {json.dumps(region_colors, ensure_ascii=False)};
"""

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(out, encoding="utf-8")
    print(f"Generado {OUT_PATH} ({len(nodes)} nodos)")


if __name__ == "__main__":
    main()
