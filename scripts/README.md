# Scripts — Cobertura Radial Chile

Scripts para el pipeline de datos de repetidoras. La fuente de verdad es `data/curated_stations.csv`.

---

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `csv-to-datajs.py` | Convierte `data/curated_stations.csv` a `data/data.js` (usado en CI) |
| `sync-data.sh` | Wrapper: ejecuta `csv-to-datajs.py` desde la raíz del repo (cualquier cwd) |
| `serve.sh` | Servidor HTTP estático local (`python3 -m http.server`, puerto por defecto 8080) |
| `data/curated_stations.csv` | Fuente de datos (curated) |

---

## sync-data.sh y serve.sh

```bash
./scripts/sync-data.sh      # regenerar data.js
./scripts/serve.sh 8080     # preview en http://localhost:8080/
```

---

## csv-to-datajs.py

**Uso:**
```bash
python scripts/csv-to-datajs.py
```

**Qué hace:**
- Lee `data/curated_stations.csv`
- Genera `data/data.js` con NODES, VERSION y REGION_COLORS
- Añade flags y archivos inline de **propagación** por estación cuando existen en `data/propagation/`
- Preserva VERSION y REGION_COLORS del `data/data.js` existente

**Propagación:** motor [Signal-Server](https://github.com/juantoledo/Signal-Server), elevación SRTM (cita en [`propagacion.html`](../propagacion.html)); feature experimental — ver [`data/propagation/README.md`](../data/propagation/README.md) y [`data/README.md`](../data/README.md#mapas-de-propagación-datapropagation).

Se ejecuta automáticamente en CI antes del deploy.

---

## Formato de curated_stations.csv

Columnas (orden): ver `data/README.md` — incluye `isEcholink`, `conference`, `isDMR`, `color`, `slot`, `tg`, `website`, etc.

Los datos parten de registros públicos de regulación del espectro en Chile y pueden curarse para corregir errores de la fuente.
