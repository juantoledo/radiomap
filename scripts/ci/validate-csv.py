#!/usr/bin/env python3
"""
Valida la estructura de data/curated_stations.csv (no la reescribe).
Falla (exit 1) ante filas con conteo de columnas incorrecto u otros errores
de esquema conocidos, para detectar el tipo de error de coma-de-menos que
csv-to-datajs.py absorbe en silencio como null/"".
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "curated_stations.csv"

SERVICE_TYPE_ALLOWED = {"", "atc", "fire", "ambulance", "sea"}
BOOL_ALLOWED = {"", "1", "true", "yes"}


def main() -> int:
    if not CSV_PATH.exists():
        print(f"CSV no encontrado: {CSV_PATH}")
        return 1

    errors: list[str] = []

    with open(CSV_PATH, encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            print("CSV vacío / sin cabecera")
            return 1

        ncols = len(header)
        col_index = {name: i for i, name in enumerate(header)}

        for lineno, row in enumerate(reader, start=2):
            if not row or (len(row) == 1 and row[0].strip() == ""):
                continue  # línea en blanco al final del archivo

            signal = row[col_index.get("signal", 0)] if row else ""

            if len(row) != ncols:
                errors.append(
                    f"línea {lineno} (signal={signal!r}): {len(row)} columnas, "
                    f"se esperaban {ncols} (revisar comas faltantes/sobrantes)"
                )
                continue

            def field(name: str) -> str:
                return row[col_index[name]].strip()

            lat, lon = field("lat"), field("lon")
            for name, v in (("lat", lat), ("lon", lon)):
                if v == "":
                    continue
                try:
                    float(v)
                except ValueError:
                    errors.append(f"línea {lineno} (signal={signal!r}): {name}={v!r} no es numérico")

            service_type = field("serviceType").lower()
            if service_type not in SERVICE_TYPE_ALLOWED:
                errors.append(
                    f"línea {lineno} (signal={signal!r}): serviceType={service_type!r} "
                    f"no está en {sorted(SERVICE_TYPE_ALLOWED)}"
                )

            for name in ("isEcholink", "isDMR"):
                v = field(name).lower()
                if v not in BOOL_ALLOWED:
                    errors.append(
                        f"línea {lineno} (signal={signal!r}): {name}={v!r} "
                        f"no está en {sorted(BOOL_ALLOWED)}"
                    )

            if "/" in field("signal"):
                errors.append(f"línea {lineno}: signal={signal!r} contiene '/' (no permitido)")

    if errors:
        print(f"{len(errors)} error(es) de validación en {CSV_PATH}:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"OK: {CSV_PATH} válido ({ncols} columnas).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
