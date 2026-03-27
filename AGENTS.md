# Agent notes — Radiomap

Static site for Chile ham repeaters (map + list). **No bundler**; Leaflet + vanilla JS; data ships as [`data/data.js`](data/data.js).

## Before you change things

1. **Data** — Source of truth is [`data/curated_stations.csv`](data/curated_stations.csv). After CSV edits, run **`./scripts/sync-data.sh`** (or `python scripts/csv-to-datajs.py` from repo root). Do not rely on hand-editing `data.js` long term.
2. **Station UI** — Visible fields and empties: [`scripts/station-display.js`](scripts/station-display.js) (`hasStationFieldValue`, `stationFieldEmptyClass`). Keep **map + list + DMR** aligned: [`scripts/map.js`](scripts/map.js), [`scripts/list.js`](scripts/list.js), [`scripts/dmr-ui.js`](scripts/dmr-ui.js).
3. **Share URLs / filters** — Query parsing and state: [`scripts/share-view.js`](scripts/share-view.js), [`scripts/location-filter.js`](scripts/location-filter.js). New params need both encoding and decoding paths.
4. **Map / conferencias** — Colores estables por nombre en [`scripts/conference-colors.js`](scripts/conference-colors.js) (`buildConferenceColorMap`); el desplegable de conferencia muestra un círculo de color junto a cada opción. Con filtros explícitos (no «Todas»), marcadores y círculos usan ese color en [`scripts/map.js`](scripts/map.js). No hay polilíneas por conferencia.
5. **Deploy** — Push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): regenerates `data.js`, bumps `VERSION`, replaces `__VERSION__` in HTML. Conventional commits drive semver (`feat` → minor, breaking → major).

## Deeper context

- Cursor skill: [`.cursor/skills/radiomap/SKILL.md`](.cursor/skills/radiomap/SKILL.md)
- Tables / URL params / globals: [`.cursor/skills/radiomap/reference.md`](.cursor/skills/radiomap/reference.md)

## Local preview

```bash
./scripts/serve.sh 8080
```

Open `http://localhost:8080/` (map) or `/lista.html` (not `file://`).
