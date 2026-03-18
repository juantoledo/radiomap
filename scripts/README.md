# Scripts — Cobertura Radial Chile

Scripts técnicos para importar y depurar datos de repetidoras desde el listado oficial SUBTEL.

---

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `excel-to-nodes.py` | Convierte el Excel SUBTEL a `data/data.js` (NODES) |
| `excel-to-csv.py` | Convierte el Excel SUBTEL a `data/curated_stations.csv` |
| `csv-to-datajs.py` | Convierte `data/curated_stations.csv` a `data/data.js` (usado en CI) |
| `debug-coords.py` | Detecta filas con coordenadas que fallan al parsear |
| `test-dms.py` | Pruebas unitarias del parser DMS → decimal |
| `Listado_RAF_Repetidoras.xlsx` | Listado oficial SUBTEL (fuente de datos) |

---

## excel-to-nodes.py

**Uso:**
```bash
python scripts/excel-to-nodes.py
```

**Dependencia:** `openpyxl` (`pip install openpyxl`)

**Qué hace:**
- Lee `Listado_RAF_Repetidoras.xlsx` (en este directorio)
- Convierte coordenadas DMS a grados decimales
- Escribe `data/data.js`

**Mapeo Rx/Tx:** El Excel se asume con columnas invertidas respecto a la convención usuario:
- `rx` = valor de la columna **Tx** del Excel
- `tx` = valor de la columna **Rx** del Excel

**Coordenadas:** Parsea formatos DMS como `27° 13' 33"`, `30° 1° 57,27"`, etc. Corrige minutos/segundos > 59 (typos en el Excel).

**range_km:** Se conserva del `data/data.js` previo si el `signal` coincide; si no, usa 50 km por defecto.

**Preserva:** `VERSION` y `REGION_COLORS` del `data/data.js` existente.

---

## debug-coords.py

**Uso:**
```bash
python scripts/debug-coords.py
```

**Qué hace:** Lista las filas del Excel cuyas coordenadas no se pudieron parsear (lat/lon inválidos o formato no reconocido).

---

## test-dms.py

**Uso:**
```bash
python scripts/test-dms.py
```

**Qué hace:** Prueba el parser DMS con ejemplos conocidos. Útil para validar cambios en el regex.

---

## Estructura del Excel

Columnas esperadas (por nombre o índice):

| Columna | Uso |
|---------|-----|
| Nombre | Club / titular |
| Banda | VHF/FM, UHF/FM |
| Señal | Identificador (ej. CE1RCD RPR-B) |
| Tx | Frecuencia transmisión (en Excel) → mapea a **rx** |
| Rx | Frecuencia recepción (en Excel) → mapea a **tx** |
| Tono | CTCSS (Hz) |
| Potencia, Ganancia | Watts, dBi |
| Región, Comuna | Ubicación administrativa |
| Ubicación RPT | Dirección o sitio |
| Latitud, Longitud | DMS (ej. `27° 13' 33"`) |
| Otorga, Vence | Fechas de resolución |

---

## Formato de salida (data.js)

```javascript
const VERSION = '1.6.1';
const NODES = [{ signal, nombre, comuna, ubicacion, lat, lon, range_km, potencia, ganancia, banda, rx, tx, tono, region, otorga, vence }, ...];
const REGION_COLORS = { "": "#5e35b1", "REGIÓN DE ...": "#hex", ... };
```
