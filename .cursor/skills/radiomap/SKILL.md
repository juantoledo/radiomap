---
name: radiomap
description: >-
  Radiomap.cl static site (Leaflet map + lista). Vanilla JS, data from
  curated_stations.csv via csv-to-datajs.py; CI regenerates data.js and bumps
  VERSION. Use for edits to scripts/, data/, HTML, css/theme.css, deploy
  workflow, or station display rules.
---

# Radiomap — project skill

**More detail:** [`reference.md`](reference.md) (URL params, CSV one-liner, script map). **Repo entrypoint for agents:** [`AGENTS.md`](../../AGENTS.md). **Commands:** `./scripts/sync-data.sh`, `./scripts/serve.sh [PORT]`.

## Stack and layout

- **Static site**: no app bundler. Entry pages are [`index.html`](index.html) (mapa) and [`lista.html`](lista.html) (lista).
- **Map**: Leaflet from CDN; global `NODES` and related constants come from [`data/data.js`](data/data.js).
- **Cache bust**: script/link tags use `?v=__VERSION__`; GitHub Actions replaces `__VERSION__` on deploy.
- **Local dev**: serve over HTTP (e.g. `python -m http.server`) — not `file://` — so theme and storage behave correctly (see root [`README.md`](README.md)).

## Data pipeline

- **Source of truth**: [`data/curated_stations.csv`](data/curated_stations.csv). Column order and semantics: [`data/README.md`](data/README.md).
- **Generated file**: [`data/data.js`](data/data.js) is produced by [`scripts/csv-to-datajs.py`](scripts/csv-to-datajs.py). Do not treat hand-edits to `data.js` as the long-term source; regenerate after CSV changes.
- **Map circles**: fixed illustrative radius in [`scripts/map.js`](scripts/map.js) (not per-station from CSV). **Propagation** overlays come from `data/propagation/` when present; engine [Signal-Server](https://github.com/juantoledo/Signal-Server), SRTM-style terrain (citation in [`propagacion.html`](propagacion.html)); experimental — see [`data/propagation/README.md`](data/propagation/README.md) and [`data/README.md`](data/README.md#mapas-de-propagación-datapropagation).
- **Regenerate locally**: `python scripts/csv-to-datajs.py` from repo root before manual testing after CSV edits.

## UI surfaces (keep in sync)

Station behavior should stay consistent across:

- [`scripts/map.js`](scripts/map.js) — map, markers, sidebar, tooltips, neighbors
- [`scripts/list.js`](scripts/list.js) — tabla / detalle / móvil
- [`scripts/dmr-ui.js`](scripts/dmr-ui.js) — bloques DMR y chips

Shared URL / filtros / “cerca de mí” / export: [`scripts/share-view.js`](scripts/share-view.js), [`scripts/location-filter.js`](scripts/location-filter.js), [`scripts/export-csv.js`](scripts/export-csv.js). Help overlay: [`scripts/help.js`](scripts/help.js).

## Station fields and empty values

- Central logic lives in [`scripts/station-display.js`](scripts/station-display.js): **`hasStationFieldValue`**, **`stationFieldEmptyClass`**, and the same rules any `fieldShown`-style checks use.
- **Do not** show placeholder text or extra UI for fields that are empty for that station type; apply `cell-empty` (or equivalent) on lista where rows use table cells.
- If you add user-visible strings built from station data (including share/copy flows), align with the same rules — see [`scripts/share-view.js`](scripts/share-view.js) if it builds text from nodes.

## Styling

- Global styles: [`css/theme.css`](css/theme.css). Lista/mapa share tokens; mobile lista layout may hide empty cells — avoid breaking grid assumptions when changing `.cell-empty` or card tables.

## Commits and deploy

- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs `csv-to-datajs.py`, bumps **`VERSION`** in `data/data.js`, replaces `__VERSION__` in HTML, and deploys to GitHub Pages.
- **Conventional commits affect semver**: `feat(...)` → minor bump; breaking / `BREAKING CHANGE` → major; otherwise patch (see workflow `grep` logic).

## Quick checklist for agents

1. CSV-only data change → edit `curated_stations.csv` → run `csv-to-datajs.py` → verify map + lista + DMR.
2. UI change that shows a station field → update `station-display.js` if needed, then map + list + `dmr-ui.js` as applicable.
3. New URL parameter or filter → `share-view.js` + any filter UI in both pages.
4. If you change circle radius or neighbor distance, keep [`scripts/map.js`](scripts/map.js) consistent (constants at top of the map IIFE).
