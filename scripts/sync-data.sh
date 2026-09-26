#!/usr/bin/env bash
# Regenerate data/data.js (curated_stations.csv) and data/shortwave.js (EiBi) (run from any cwd).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
python3 scripts/csv-to-datajs.py
exec python3 scripts/eibi-to-shortwavejs.py
