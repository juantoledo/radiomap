# Radiomap

Static site for Chile ham repeaters (map + list). **No bundler**; Leaflet + vanilla JS; data ships as [`data/data.js`](data/data.js).

Scopes: `scripts/*.js`, `data/*`, `css/theme.css`, `*.html`, `.github/workflows/*.yml`

## Before you change things

1. **Data** — Source of truth is [`data/curated_stations.csv`](data/curated_stations.csv). After CSV edits run **`./scripts/sync-data.sh`** (or `python scripts/csv-to-datajs.py` from repo root). Do not hand-edit `data.js` long term. **`signal` must not use `/`** (it breaks paths, e.g. propagation); the pipeline maps each `/` to a space — run **`python scripts/csv-to-datajs.py --normalize-signal-slashes`** once to rewrite the CSV, or rely on **`parse_row`** normalization when generating `data.js`.
2. **Propagation raster (mapa)** — Optional per station under `data/propagation/{signal}/`: **`{signal}.png`**, **`{signal}.pgw`**, and optionally **`{signal}.dcf`** (dBm palette for the floating legend). **Engine:** [Signal-Server](https://github.com/juantoledo/Signal-Server). **Terrain:** typically **SRTM** (dataset citation in [`propagacion.html`](propagacion.html) and [`data/propagation/README.md`](data/propagation/README.md)). Run **`csv-to-datajs.py`** after changes: sets **`hasPropagation`**, inlines **`propagationPgw`** and **`propagationDcf`** when those files exist. On the map, the **Propagación** toggle sits in the controls row beside **`filter-count-wrap`**; the **dBm legend** is a thin floating panel at mid-height on the left (`index.html` + `propagation-map.js` + `map.js`). Overlay is **`L.imageOverlay`**. Serve over HTTP (e.g. `./scripts/serve.sh`), not `file://`.
3. **Station UI** — Visible fields and empties: [`scripts/station-display.js`](scripts/station-display.js) (`hasStationFieldValue`, `stationFieldEmptyClass`). Keep **map + list + DMR** aligned: [`scripts/map.js`](scripts/map.js), [`scripts/list.js`](scripts/list.js), [`scripts/dmr-ui.js`](scripts/dmr-ui.js).
4. **Share URLs / filters** — Query parsing and state: [`scripts/share-view.js`](scripts/share-view.js), [`scripts/location-filter.js`](scripts/location-filter.js). New params need both encoding and decoding paths. See [`.claude/radiomap-reference.md`](.claude/radiomap-reference.md) for param list.
5. **Map / conferencias** — Colores estables por nombre en [`scripts/conference-colors.js`](scripts/conference-colors.js) (`buildConferenceColorMap`); el desplegable de conferencia muestra un círculo de color junto a cada opción. Con filtros explícitos (no «Todas»), marcadores y círculos usan ese color en [`scripts/map.js`](scripts/map.js). No hay polilíneas por conferencia.
6. **Deploy** — Push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): regenerates `data.js`, bumps `VERSION`, replaces `__VERSION__` in HTML. Conventional commits drive semver (`feat` → minor, breaking → major). To publish **an existing tag** to Pages (no version bump), run [`.github/workflows/deploy-tag.yml`](.github/workflows/deploy-tag.yml) manually (**Actions** → **Deploy tag to Pages** → **Run workflow**) and enter the tag (e.g. `v1.2.3`). [`.github/workflows/sync-node-sources.yml`](.github/workflows/sync-node-sources.yml) runs daily (and via manual dispatch): for each `name,url` row in [`.github/sync-sources.csv`](.github/sync-sources.csv) it renders that source, has Claude propose `curated_stations.csv` updates for that network only, validates structure with `scripts/ci/validate-csv.py`, and opens one combined PR (never pushes to `main` directly) — review bot PRs like any other CSV change. To add a source, add a row to `.github/sync-sources.csv`. Requires the `ANTHROPIC_API_KEY` secret; the step passes `github_token` explicitly so `claude-code-action` uses this workflow's own token instead of requiring the Claude Code GitHub App to be installed.
7. **Security (CSP / SRI)** — [`index.html`](index.html) and [`lista.html`](lista.html) set a **Content-Security-Policy** (meta) and `referrer`. GA4 bootstraps from [`scripts/gtag-init.js`](scripts/gtag-init.js) (not inline). **Leaflet** and dynamically loaded **html2canvas** use **SRI** (`integrity` + `crossorigin`) against fixed cdnjs versions. `script-src` still includes **`'unsafe-inline'`** because of legacy **`onclick=`** attributes in HTML; removing those would allow tightening CSP. If GA or cdnjs change endpoints or file bytes, update CSP **`connect-src`** / **`script-src`** or SRI hashes accordingly.

## Stack and layout

- **Static site**: no app bundler. Entry pages are [`index.html`](index.html) (mapa) and [`lista.html`](lista.html) (lista).
- **Map**: Leaflet from CDN; global `NODES` and related constants come from [`data/data.js`](data/data.js).
- **Cache bust**: script/link tags use `?v=__VERSION__`; GitHub Actions replaces `__VERSION__` on deploy.
- **Local dev**: serve over HTTP (e.g. `./scripts/serve.sh 8080`) — not `file://` — so theme and storage behave correctly.

## Data pipeline

- **Source of truth**: [`data/curated_stations.csv`](data/curated_stations.csv). Column order and semantics: [`data/README.md`](data/README.md).
- **Generated file**: [`data/data.js`](data/data.js) is produced by [`scripts/csv-to-datajs.py`](scripts/csv-to-datajs.py). Do not treat hand-edits to `data.js` as the long-term source; regenerate after CSV changes.
- **Map circles**: fixed illustrative radius in [`scripts/map.js`](scripts/map.js) (not per-station from CSV). **Propagation** overlays come from `data/propagation/` when present; see [`data/propagation/README.md`](data/propagation/README.md) and [`data/README.md`](data/README.md).
- **Regenerate locally**: `python scripts/csv-to-datajs.py` from repo root before manual testing after CSV edits.

## UI surfaces (keep in sync)

Station behavior should stay consistent across:

- [`scripts/map.js`](scripts/map.js) — map, markers, sidebar, tooltips, neighbors
- [`scripts/list.js`](scripts/list.js) — tabla / detalle / móvil
- [`scripts/dmr-ui.js`](scripts/dmr-ui.js) — bloques DMR y chips

Shared URL / filtros / "cerca de mí" / export: [`scripts/share-view.js`](scripts/share-view.js), [`scripts/location-filter.js`](scripts/location-filter.js), [`scripts/export-csv.js`](scripts/export-csv.js). Help overlay: [`scripts/help.js`](scripts/help.js).

## Station fields and empty values

- Central logic lives in [`scripts/station-display.js`](scripts/station-display.js): **`hasStationFieldValue`**, **`stationFieldEmptyClass`**, and the same rules any `fieldShown`-style checks use.
- Do not show placeholder text or extra UI for fields that are empty for that station type; apply `cell-empty` (or equivalent) on lista where rows use table cells.
- If you add user-visible strings built from station data (including share/copy flows), align with the same rules — see [`scripts/share-view.js`](scripts/share-view.js) if it builds text from nodes.

## Styling

- Global styles: [`css/theme.css`](css/theme.css). Lista/mapa share tokens; mobile lista layout may hide empty cells — avoid breaking grid assumptions when changing `.cell-empty` or card tables.

## Commits and deploy

- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs `csv-to-datajs.py`, bumps **`VERSION`** in `data/data.js`, replaces `__VERSION__` in HTML, and deploys to GitHub Pages.
- **Conventional commits affect semver**: `feat(...)` → minor bump; breaking / `BREAKING CHANGE` → major; otherwise patch (see workflow `grep` logic).

## GA4 analytics

Measurement ID is in [`index.html`](index.html) / [`lista.html`](lista.html) / [`propagacion.html`](propagacion.html) / [`estadisticas.html`](estadisticas.html). Custom events are sent from [`scripts/analytics.js`](scripts/analytics.js). `page_type` is derived from the `<body>` class: `page-map`→`map`, `page-list`→`list`, `page-propagacion`→`propagacion`, `page-stats`→`stats`, anything else→`other`.

**Reports to pin or bookmark** (built-in dimensions, no code): Page path and query string, engagement rate, average engagement time, session default channel group, country/region, device category.

**Custom dimensions** (GA4 Admin → Data display → Custom definitions): register these as **event-scoped** parameters on the events below (parameter name must match):

| Event | Parameters |
|-------|------------|
| `radiomap_station_select` | `page_type`, `interaction`, `callsign` |
| `radiomap_filter_apply` | `page_type`, `filter_mode`, `conference` |
| `radiomap_share` | `page_type`, `share_method` |
| `radiomap_csv_download` | `page_type` |
| `radiomap_exporter_download` | `page_type`, `exporter` |
| `radiomap_support_click` | `page_type`, `source` |
| `radiomap_propagation_toggle` | `page_type`, `state`, `signal` |
| `radiomap_geolocation_error` | `page_type`, `error_code` |

`radiomap_station_select`'s `interaction` uses a fixed set of values — reuse one of these rather than inventing a new one: `select` (default), `map_marker`, `list_row` (default on lista), `list_nav`, `neighbor`, `near_me`, `url_signal`.

`radiomap_propagation_toggle`'s `state` is `on`/`off`; `signal` is only present when `state` is `on`. `radiomap_geolocation_error`'s `error_code` is `denied`, `unavailable`, `timeout`, or `unknown`.

**Key events (conversions)** — mark in GA4 only for the events you care about (e.g. `radiomap_station_select`, `radiomap_share`); avoid marking every micro-event.

## Local preview

```bash
./scripts/serve.sh 8080
```

Open `http://localhost:8080/` (map) or `/lista.html` (not `file://`).

## Quick checklist

1. CSV-only data change → edit `curated_stations.csv` → run `csv-to-datajs.py` → verify map + lista + DMR.
2. UI change that shows a station field → update `station-display.js` if needed, then map + list + `dmr-ui.js` as applicable.
3. New URL parameter or filter → `share-view.js` + any filter UI in both pages.
4. If you change circle radius or neighbor distance, keep [`scripts/map.js`](scripts/map.js) consistent (constants at top of the map IIFE).

## Reference

Tables for URL query parameters, `data/data.js` globals, CSV column order, and script roles: [`.claude/radiomap-reference.md`](.claude/radiomap-reference.md).
