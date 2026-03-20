# Scripts — Cobertura Radial Chile

Scripts para el pipeline de datos de repetidoras. La fuente de verdad es `data/curated_stations.csv`.

---

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `csv-to-datajs.py` | Convierte `data/curated_stations.csv` a `data/data.js` (usado en CI) |
| `data/curated_stations.csv` | Fuente de datos (curated) |

---

## csv-to-datajs.py

**Uso:**
```bash
python scripts/csv-to-datajs.py
```

**Qué hace:**
- Lee `data/curated_stations.csv`
- Genera `data/data.js` con NODES, VERSION y REGION_COLORS
- Preserva VERSION y REGION_COLORS del `data/data.js` existente

Se ejecuta automáticamente en CI antes del deploy.

---

## Formato de curated_stations.csv

Columnas (orden): ver `data/README.md` — incluye `isEcholink`, `conference`, `isDMR`, `color`, `slot`, `tg`, `website`, etc.

Los datos provienen del [listado oficial SUBTEL](https://www.subtel.gob.cl/) y pueden curarse para corregir errores de la fuente.
