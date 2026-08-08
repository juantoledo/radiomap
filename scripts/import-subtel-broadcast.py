#!/usr/bin/env python3
"""
Importa estaciones de radiodifusión AM/FM desde un CSV de SUBTEL (registro de
concesiones) y las agrega a data/curated_stations.csv con serviceType=broadcast.

Uso:
    python scripts/import-subtel-broadcast.py <ruta-al-csv-subtel>

Filtra T S (AM|FM) y descarta filas con NOMBRERADIO = "No Informado".
Convierte coordenadas DMS -> grados decimales (sin transformación de datum) y
frecuencia con coma decimal chilena -> punto. Región se mapea a los 16 nombres
de región ya usados en curated_stations.csv.
"""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

CURATED_PATH = Path(__file__).resolve().parent.parent / "data" / "curated_stations.csv"

CURATED_HEADER = [
    "signal", "nombre", "comuna", "ubicacion", "lat", "lon", "potencia", "ganancia",
    "banda", "rx", "tx", "tono", "region", "otorga", "vence", "isEcholink",
    "conference", "isDMR", "serviceType", "color", "slot", "tg", "website",
    "notes", "labels",
]

# REG (fuente SUBTEL) -> region (curated_stations.csv), mismos 16 nombres que
# scripts/csv-to-datajs.py DEFAULT_REGION_COLORS.
REGION_MAP = {
    "DE ARICA Y PARINACOTA": "REGIÓN DE ARICA Y PARINACOTA",
    "DE TARAPACÁ": "REGIÓN DE TARAPACÁ",
    "DE ANTOFAGASTA": "REGIÓN DE ANTOFAGASTA",
    "DE ATACAMA": "REGIÓN DE ATACAMA",
    "DE COQUIMBO": "REGIÓN DE COQUIMBO",
    "DE VALPARAÍSO": "REGIÓN DE VALPARAÍSO",
    "METROPOLITANA DE SANTIAGO": "REGIÓN METROPOLITANA DE SANTIAGO",
    "DEL LIBERTADOR GENERAL BERNARDO O'HIGGINS": "REGIÓN DEL LIBERTADOR GENERAL BERNARDO O'HIGGINS",
    "DEL MAULE": "REGIÓN DEL MAULE",
    "DE ÑUBLE": "REGIÓN DE NUBLE",
    "DEL BIOBÍO": "REGIÓN DEL BIOBÍO",
    "DE LA ARAUCANÍA": "REGIÓN DE LA ARAUCANÍA",
    "DE LOS RÍOS": "REGIÓN DE LOS RÍOS",
    "DE LOS LAGOS": "REGIÓN DE LOS LAGOS",
    "DE AYSÉN DEL GENERAL CARLOS IBÁÑEZ DEL CAMPO": "REGIÓN DE AYSÉN DEL GENERAL CARLOS IBÁÑEZ DEL CAMPO",
    "DE MAGALLANES Y DE LA ANTÁRTICA CHILENA": "REGIÓN DE MAGALLANES Y DE LA ANTÁRTICA CHILENA",
}

DMS_RE = re.compile(r"^\s*(\d+)[°�]\s*(\d+)'\s*([\d,.]+)''\s*$")

# El CSV fuente ya trae U+FFFD en lugar de cada vocal acentuada / ñ (pérdida de
# codificación previa, irrecuperable). Para matchear contra REGION_MAP se
# comparan ambos lados quitando esos caracteres (no reemplazándolos por su
# base), ya que el propio U+FFFD reemplaza -un- carácter 1:1.
_ACCENT_STRIP_RE = re.compile("[ÁÉÍÓÚÑÜáéíóúñü�]")


def _region_key(s: str) -> str:
    return _ACCENT_STRIP_RE.sub("", s.strip().upper())


REGION_MAP_NORMALIZED = {_region_key(k): v for k, v in REGION_MAP.items()}


def dms_to_decimal(dms: str, hemisphere_negative: bool) -> str:
    """Convierte "18° 28' 57''" a grados decimales (string). No aplica shift de datum."""
    m = DMS_RE.match(dms)
    if not m:
        raise ValueError(f"formato DMS no reconocido: {dms!r}")
    deg, minutes, seconds = m.groups()
    seconds = seconds.replace(",", ".")
    value = float(deg) + float(minutes) / 60 + float(seconds) / 3600
    if hemisphere_negative:
        value = -value
    return f"{value:.6f}"


def chilean_number_to_plain(raw: str) -> str:
    """"93,5" -> "93.5"; "1.000,0000" -> "1000" (miles con punto, decimales con coma)."""
    s = raw.strip().replace(".", "").replace(",", ".")
    value = float(s)
    if value == int(value):
        return str(int(value))
    return f"{value:g}"


def normalize_region(reg_raw: str) -> str:
    key = _region_key(reg_raw)
    if key not in REGION_MAP_NORMALIZED:
        raise ValueError(f"región no reconocida: {reg_raw!r}")
    return REGION_MAP_NORMALIZED[key]


def fix_source_encoding_loss(s: str) -> str:
    """El CSV fuente reemplaza cada Ñ/ñ por U+FFFD (pérdida de codificación previa
    en origen). En los campos de texto libre (nombre, comuna) es siempre Ñ: no se
    observan vocales acentuadas en estos campos, solo la eñe."""
    return s.replace("�", "Ñ")


def convert_row(row: list[str]) -> dict:
    signal = row[0].strip()
    nombre = fix_source_encoding_loss(row[7].strip())
    comuna = fix_source_encoding_loss(row[16].strip())
    freq_raw = row[5].strip()
    region_raw = row[3]
    lat_raw = row[18].strip()
    lon_raw = row[19].strip()

    banda = row[1].strip().upper()
    tx = chilean_number_to_plain(freq_raw)
    # LATPTA en Chile siempre S (negativo); LONGPTA siempre W (negativo).
    lat = dms_to_decimal(lat_raw, hemisphere_negative=True)
    lon = dms_to_decimal(lon_raw, hemisphere_negative=True)
    region = normalize_region(region_raw)

    values = {
        "signal": signal,
        "nombre": nombre,
        "comuna": comuna,
        "ubicacion": "",
        "lat": lat,
        "lon": lon,
        "potencia": "",
        "ganancia": "",
        "banda": banda,
        "rx": "",
        "tx": tx,
        "tono": "",
        "region": region,
        "otorga": "",
        "vence": "",
        "isEcholink": "",
        "conference": "",
        "isDMR": "",
        "serviceType": "broadcast",
        "color": "",
        "slot": "",
        "tg": "",
        "website": "",
        "notes": "",
        "labels": "",
    }
    return values


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: python scripts/import-subtel-broadcast.py <ruta-al-csv-subtel>")
        return 1
    source_path = Path(sys.argv[1])
    if not source_path.exists():
        print(f"No encontrado: {source_path}")
        return 1

    with open(source_path, encoding="utf-8") as f:
        lines = f.readlines()
    reader = csv.reader(lines[1:])  # salta la línea "Nota :" inicial
    rows = list(reader)
    data_rows = rows[1:]  # salta encabezado real

    with open(CURATED_PATH, encoding="utf-8") as f:
        existing_header = next(csv.reader(f))
    if existing_header != CURATED_HEADER:
        print("El encabezado de curated_stations.csv no coincide con el esperado; abortando.")
        return 1

    converted: list[dict] = []
    errors: list[str] = []
    skipped_type = 0
    skipped_no_informado = 0

    for lineno, row in enumerate(data_rows, start=3):
        if not row or not row[0].strip():
            continue
        t_s = row[1].strip().upper()
        nombre = row[7].strip()
        if nombre.upper() == "NO INFORMADO":
            skipped_no_informado += 1
            continue
        if t_s not in ("AM", "FM"):
            skipped_type += 1
            continue
        try:
            converted.append(convert_row(row))
        except ValueError as e:
            errors.append(f"línea {lineno} (signal={row[0]!r}): {e}")

    if errors:
        print(f"{len(errors)} error(es) de conversión, abortando sin escribir:")
        for e in errors:
            print(f"  - {e}")
        return 1

    with open(CURATED_PATH, "rb") as f:
        f.seek(0, 2)
        size = f.tell()
        if size == 0:
            ends_with_newline = True
        else:
            f.seek(-1, 2)
            ends_with_newline = f.read(1) in (b"\n", b"\r")

    with open(CURATED_PATH, "a", encoding="utf-8", newline="") as f:
        if not ends_with_newline:
            f.write("\n")
        writer = csv.writer(f)
        for values in converted:
            writer.writerow([values[col] for col in CURATED_HEADER])

    print(f"Agregadas {len(converted)} estaciones de radiodifusión AM/FM a {CURATED_PATH}")
    print(f"Omitidas: {skipped_no_informado} (No Informado), {skipped_type} (otro T S)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
