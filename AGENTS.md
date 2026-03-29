# Agent notes — Radiomap

Static site for Chile ham repeaters (map + list). **No bundler**; Leaflet + vanilla JS; data ships as [`data/data.js`](data/data.js).

## Before you change things

1. **Data** — Source of truth is [`data/curated_stations.csv`](data/curated_stations.csv). After CSV edits, run **`./scripts/sync-data.sh`** (or `python scripts/csv-to-datajs.py` from repo root). Do not rely on hand-editing `data.js` long term. **`signal` must not use `/`** (it breaks paths, e.g. propagation); the pipeline maps each `/` to a space—run **`python scripts/csv-to-datajs.py --normalize-signal-slashes`** once to rewrite the CSV, or rely on **`parse_row`** normalization when generating `data.js`.
2. **Propagation raster (mapa)** — Optional per station under `data/propagation/{signal}/`: **`{signal}.png`**, **`{signal}.pgw`**, and optionally **`{signal}.dcf`** (dBm palette for the floating legend). **Engine:** [Signal-Server](https://github.com/juantoledo/Signal-Server). **Terrain:** typically **SRTM** (dataset citation in [`propagacion.html`](propagacion.html) and [`data/propagation/README.md`](data/propagation/README.md)). **Experimental:** quality improves as club TX/antenna inputs, legend thresholds (dBm/colors), and engine setup are refined. **User doc:** [`propagacion.html`](propagacion.html) (linked from the map as «Sobre propagación»). Run **`csv-to-datajs.py`** after changes: sets **`hasPropagation`**, inlines **`propagationPgw`** and **`propagationDcf`** when those files exist. On the map, the **Propagación** toggle sits in the controls row beside **`filter-count-wrap`**; the **dBm legend** is a thin floating panel at **mid-height on the left** of the map (values drawn on the color strip) (`index.html` + `propagation-map.js` + `map.js`). Overlay is **`L.imageOverlay`**. Per-signal README/PPM in that folder document individual runs; see **`data/propagation/README.md`** for repo-level propagation notes. Serve over HTTP (e.g. `./scripts/serve.sh`), not `file://`.
3. **Station UI** — Visible fields and empties: [`scripts/station-display.js`](scripts/station-display.js) (`hasStationFieldValue`, `stationFieldEmptyClass`). Keep **map + list + DMR** aligned: [`scripts/map.js`](scripts/map.js), [`scripts/list.js`](scripts/list.js), [`scripts/dmr-ui.js`](scripts/dmr-ui.js).
4. **Share URLs / filters** — Query parsing and state: [`scripts/share-view.js`](scripts/share-view.js), [`scripts/location-filter.js`](scripts/location-filter.js). New params need both encoding and decoding paths.
5. **Map / conferencias** — Colores estables por nombre en [`scripts/conference-colors.js`](scripts/conference-colors.js) (`buildConferenceColorMap`); el desplegable de conferencia muestra un círculo de color junto a cada opción. Con filtros explícitos (no «Todas»), marcadores y círculos usan ese color en [`scripts/map.js`](scripts/map.js). No hay polilíneas por conferencia.
6. **Deploy** — Push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): regenerates `data.js`, bumps `VERSION`, replaces `__VERSION__` in HTML. Conventional commits drive semver (`feat` → minor, breaking → major). To publish **an existing tag** to Pages (no version bump), run [`.github/workflows/deploy-tag.yml`](.github/workflows/deploy-tag.yml) manually (**Actions** → **Deploy tag to Pages** → **Run workflow**) and enter the tag (e.g. `v1.2.3`).

7. **Security (CSP / SRI)** — [`index.html`](index.html) and [`lista.html`](lista.html) set a **Content-Security-Policy** (meta) and `referrer`. GA4 bootstraps from [`scripts/gtag-init.js`](scripts/gtag-init.js) (not inline). **Leaflet** and dynamically loaded **html2canvas** use **SRI** (`integrity` + `crossorigin`) against fixed cdnjs versions. `script-src` still includes **`'unsafe-inline'`** because of legacy **`onclick=`** attributes in HTML; removing those would allow tightening CSP. If GA or cdnjs change endpoints or file bytes, update CSP **`connect-src`** / **`script-src`** or SRI hashes accordingly (browser console / Tag Assistant for CSP violations).

## Deeper context

- Cursor skill: [`.cursor/skills/radiomap/SKILL.md`](.cursor/skills/radiomap/SKILL.md)
- Tables / URL params / globals: [`.cursor/skills/radiomap/reference.md`](.cursor/skills/radiomap/reference.md)

## Local preview

```bash
./scripts/serve.sh 8080
```

Open `http://localhost:8080/` (map) or `/lista.html` (not `file://`).

## GA4

Measurement ID is in [`index.html`](index.html) / [`lista.html`](lista.html). Custom events are sent from [`scripts/analytics.js`](scripts/analytics.js).

**Reports to pin or bookmark** (built-in dimensions, no code): Page path and query string, engagement rate, average engagement time, session default channel group, country/region, device category.

**Custom dimensions** (GA4 Admin → Data display → Custom definitions): register these as **event-scoped** parameters on the events below (parameter name must match):

| Event | Parameters |
|-------|------------|
| `radiomap_station_select` | `page_type`, `interaction`, `callsign` |
| `radiomap_filter_apply` | `page_type`, `filter_mode`, `conference` |
| `radiomap_share` | `page_type`, `share_method` |
| `radiomap_csv_download` | `page_type` |

**Key events (conversions)** — mark in GA4 only for the events you care about (e.g. `radiomap_station_select`, `radiomap_share`); avoid marking every micro-event.
