# Radiomap — reference

Companion to [`CLAUDE.md`](../CLAUDE.md). URL/query details, globals, script roles.

## `data/data.js` globals

| Symbol | Role |
|--------|------|
| `VERSION` | String; CI bumps on push to `main`; HTML uses `__VERSION__` for cache bust |
| `NODES` | Array of station objects consumed by map, list, export, share |
| `REGION_COLORS` | Map region name → hex color for map UI |

Node objects follow CSV-derived fields (see `data/README.md`); the generator may add normalized booleans or extra keys — inspect `csv-to-datajs.py` / sample `NODES[0]` when in doubt.

## `data/shortwave.js` global (onda corta, separado de `NODES`)

| Symbol | Role |
|--------|------|
| `SHORTWAVE` | Horario EiBi de onda corta (solo radiodifusión 1711–30000 kHz), generado por `scripts/eibi-to-shortwavejs.py` desde `data/shortwave/source/`. Diccionarios `sites`, `stations`, `days`, `langs`, `targets`, `countries` + `entries` compactas (formato en la cabecera del archivo). **No** se carga con la página: `shortwave-map.js` lo inyecta al activar el botón Onda corta. |

## CSV column order (one line)

`signal`, `nombre`, `comuna`, `ubicacion`, `lat`, `lon`, `potencia`, `ganancia`, `banda`, `rx`, `tx`, `tono`, `region`, `otorga`, `vence`, `isEcholink`, `conference`, `isDMR`, `serviceType`, `color`, `slot`, `tg`, `website`, `notes`, `labels`

(Confirm against `data/README.md` if the pipeline adds columns.)

## Share / URL query parameters

Implemented in [`scripts/share-view.js`](../scripts/share-view.js) (build) and [`scripts/location-filter.js`](../scripts/location-filter.js) (`loadFilterState`, `urlHasShareParams`).

| Param | Notes |
|-------|--------|
| `search` | Free-text search |
| `banda` | Repeatable or comma-separated → band filters |
| `region` | Repeatable or comma-separated → region filters |
| `type` | Repeatable or comma-separated; filter types (e.g. echolink, dmr, radioclub) |
| `conference` | Repeatable or comma-separated |
| `echolink` | Legacy: `only` / `no` maps to type filters if `type` absent |
| `echolinkConference` | Legacy single conference if `conference` absent |
| `near` | `lat,lon` (decimal) for "cerca de mí" anchor |
| `nearRadius` | Radius km when distance semantics apply (near, signal anchor, etc.) |
| `signal` | Reference station for distance filter / map focus |
| `mlat`, `mlon`, `zoom` | Map center and zoom (map page) |
| `mode` | Map display mode (when shared from map) |
| `sb` | `1` = panel lateral (#sidebar) abierto, `0` = cerrado (con `signal` seleccionado) |
| `prop` | `1` = mapa de propagación activo para esa señal (si hay datos) |
| `nosb` | Legado: equivalente a `sb=0` al abrir desde lista (sigue soportado) |
| `sw` | `1` = capa Onda corta activa (vista mundial; `shortwave-map.js`) |
| `swnow` | Solo depuración: instante ISO UTC para evaluar «al aire» (p. ej. `2026-09-25T00:00Z`); no se comparte |

## Propagation docs

- **User-facing:** [`propagacion.html`](../propagacion.html) (deployed as `/propagacion.html`). **Contributors:** [`data/propagation/README.md`](../data/propagation/README.md) (Signal-Server, SRTM/OpenTopography citation pointer, experimental note).

## Script map (repo root: `scripts/`)

| File | Role |
|------|------|
| `map.js` | Leaflet map, sidebar, neighbors, tooltips |
| `list.js` | Lista table, detail, mobile cards |
| `dmr-ui.js` | DMR chips / blocks in shared UI |
| `station-display.js` | Field visibility / empty helpers |
| `location-filter.js` | Near me, filters, URL/session restore |
| `share-view.js` | Build share URLs, copy/share handlers |
| `export-csv.js` | Generic CSV download (Spanish headers, all fields) |
| `exporter/registry.js` | Auto-generated list of radio/software exporters; read by the download dialog |
| `exporter/chirp/mapper.js` | Auto-generated CHIRP exporter; do not edit directly |
| `help.js` | Help overlay, focus trap |
| `theme.js` | Theme toggle / persistence |
| `utils.js` | Shared helpers |
| `csv-to-datajs.py` | CSV → `data/data.js` |
| `shortwave-live.js` | Onda corta: lógica pura «al aire ahora» (horario, días, temporada, validez) sobre `SHORTWAVE`; exporta `window.radiomapShortwaveLive` (y `module.exports` para Node) |
| `shortwave-map.js` | Onda corta: botón, carga diferida de `data/shortwave.js`, capa por sitio de transmisión, panel y popup; vista mundial al activar y restaura la vista previa al desactivar |
| `eibi-to-shortwavejs.py` | EiBi `sked-*.csv` + `README.TXT` → `data/shortwave.js` (mapeo de columnas por nombre de cabecera) |

## Helper scripts

| Script | Command |
|--------|---------|
| Regenerate `data.js` + `shortwave.js` | `./scripts/sync-data.sh` |
| Test EiBi mapper | `python scripts/ci/test_eibi_mapper.py` |
| Local HTTP server | `./scripts/serve.sh [PORT]` (default `8080`) |
| Regenerate exporters | `python scripts/generate-exporter-mapper.py` — rewrites `exporter/*/mapper.js` and `exporter/registry.js` from each format's `reference.csv`; see [`scripts/exporter/README.md`](../scripts/exporter/README.md) for how to add a new format |
