/**
 * Near-me + multiselect filters (checkbox lists in .filter-checkbox-list).
 * Requires global NODES (data/data.js) for getVisibleNodeIndices / getFilteredNodes.
 */
const NEAR_ME_RADIUS_MIN_KM = 20;
const NEAR_ME_RADIUS_MAX_KM = 100;
const NEAR_ME_RADIUS_DEFAULT_KM = 100;
const NEAR_ME_RADIUS_STORAGE_KEY = 'ra-nearme-radius-km';

function clampNearMeRadiusKm(n) {
  var x = parseInt(n, 10);
  if (isNaN(x)) return NEAR_ME_RADIUS_DEFAULT_KM;
  return Math.min(NEAR_ME_RADIUS_MAX_KM, Math.max(NEAR_ME_RADIUS_MIN_KM, x));
}

function getNearMeRadiusKm() {
  try {
    var s = sessionStorage.getItem(NEAR_ME_RADIUS_STORAGE_KEY);
    if (s == null || s === '') return NEAR_ME_RADIUS_DEFAULT_KM;
    return clampNearMeRadiusKm(s);
  } catch (e) {
    return NEAR_ME_RADIUS_DEFAULT_KM;
  }
}

function setNearMeRadiusKm(km) {
  try {
    sessionStorage.setItem(NEAR_ME_RADIUS_STORAGE_KEY, String(clampNearMeRadiusKm(km)));
  } catch (e) { /* ignore */ }
}

window.getNearMeRadiusKm = getNearMeRadiusKm;
window.setNearMeRadiusKm = setNearMeRadiusKm;

const RADIUS_REF_SIGNAL_KEY = 'ra-radius-ref-signal';

function getRadiusRefSignal() {
  try {
    var s = sessionStorage.getItem(RADIUS_REF_SIGNAL_KEY);
    return s ? String(s).trim() : '';
  } catch (e) {
    return '';
  }
}

function setRadiusRefSignal(signal) {
  try {
    var t = signal != null ? String(signal).trim() : '';
    if (t) sessionStorage.setItem(RADIUS_REF_SIGNAL_KEY, t);
    else sessionStorage.removeItem(RADIUS_REF_SIGNAL_KEY);
  } catch (e) { /* ignore */ }
}

function clearRadiusRefSignal() {
  try {
    sessionStorage.removeItem(RADIUS_REF_SIGNAL_KEY);
  } catch (e) { /* ignore */ }
}

window.getRadiusRefSignal = getRadiusRefSignal;
window.setRadiusRefSignal = setRadiusRefSignal;
window.clearRadiusRefSignal = clearRadiusRefSignal;

/**
 * Reference point for distance filter + orden por distancia.
 * Prioridad: GPS (cerca de mí) → selección actual en mapa → señal persistida (p. ej. lista / sesión).
 * @returns {{ lat: number, lon: number, kind: 'gps'|'station', signal?: string }|null}
 */
function getDistanceFilterAnchor() {
  var g = getNearMeLocation();
  if (g && typeof g.lat === 'number' && typeof g.lon === 'number' && !isNaN(g.lat) && !isNaN(g.lon)) {
    return { lat: g.lat, lon: g.lon, kind: 'gps' };
  }
  if (typeof window.__radiomapRadiusReference === 'function') {
    var live = window.__radiomapRadiusReference();
    if (live && typeof live.lat === 'number' && typeof live.lon === 'number' && !isNaN(live.lat) && !isNaN(live.lon)) {
      return { lat: live.lat, lon: live.lon, kind: 'station', signal: live.signal || '' };
    }
  }
  var sig = getRadiusRefSignal();
  if (sig && typeof NODES !== 'undefined' && NODES.length) {
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if (n.signal === sig && n.lat != null && n.lon != null && typeof n.lat === 'number' && typeof n.lon === 'number') {
        return { lat: n.lat, lon: n.lon, kind: 'station', signal: sig };
      }
    }
  }
  return null;
}
window.getDistanceFilterAnchor = getDistanceFilterAnchor;

function formatNearMeFilterSuffix() {
  var a = getDistanceFilterAnchor();
  if (!a) return '';
  var km = getNearMeRadiusKm();
  if (a.kind === 'gps') return ' · cerca de mí (' + km + ' km)';
  var lab = a.signal ? a.signal : 'referencia';
  return ' · cerca de ' + lab + ' (' + km + ' km)';
}
window.formatNearMeFilterSuffix = formatNearMeFilterSuffix;

/**
 * Orden administrativo Chile (norte → sur, ley de regiones / división oficial).
 * Cualquier región en datos que no esté en la lista va al final, ordenada por locale es.
 */
const CHILE_REGIONS_ADMIN_ORDER = [
  'REGIÓN DE ARICA Y PARINACOTA',
  'REGIÓN DE TARAPACÁ',
  'REGIÓN DE ANTOFAGASTA',
  'REGIÓN DE ATACAMA',
  'REGIÓN DE COQUIMBO',
  'REGIÓN DE VALPARAÍSO',
  'REGIÓN METROPOLITANA DE SANTIAGO',
  "REGIÓN DEL LIBERTADOR GENERAL BERNARDO O'HIGGINS",
  'REGIÓN DEL MAULE',
  'REGIÓN DE NUBLE',
  'REGIÓN DEL BIOBÍO',
  'REGIÓN DE LA ARAUCANÍA',
  'REGIÓN DE LOS RÍOS',
  'REGIÓN DE LOS LAGOS',
  'REGIÓN DE AYSÉN DEL GENERAL CARLOS IBÁÑEZ DEL CAMPO',
  'REGIÓN DE MAGALLANES Y DE LA ANTÁRTICA CHILENA',
  'ATC — NACIONAL (Chile)'
];

function sortRegionKeysChile(keys) {
  const rank = {};
  CHILE_REGIONS_ADMIN_ORDER.forEach(function (r, i) {
    rank[r] = i;
  });
  const UNKNOWN = 10000;
  return keys.slice().sort(function (a, b) {
    const ra = Object.prototype.hasOwnProperty.call(rank, a) ? rank[a] : UNKNOWN;
    const rb = Object.prototype.hasOwnProperty.call(rank, b) ? rank[b] : UNKNOWN;
    if (ra !== rb) return ra - rb;
    return String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
  });
}

window.sortRegionKeysChile = sortRegionKeysChile;

const FILTER_LIST_IDS = ['filter-banda', 'filter-region', 'filter-type', 'filter-conference'];

function haversine(la1, lo1, la2, lo2) {
  const R = 6371;
  const dLa = (la2 - la1) * Math.PI / 180;
  const dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearMeLocation() {
  try {
    const s = sessionStorage.getItem('ra-nearme-location');
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

function setNearMeLocation(lat, lon) {
  sessionStorage.setItem('ra-nearme-location', JSON.stringify({ lat, lon }));
}

function stripNearShareParamsFromCurrentURL() {
  try {
    var u = new URL(window.location.href);
    var changed = false;
    if (u.searchParams.has('near')) {
      u.searchParams.delete('near');
      changed = true;
    }
    if (u.searchParams.has('nearRadius')) {
      u.searchParams.delete('nearRadius');
      changed = true;
    }
    if (!changed) return;
    var qs = u.searchParams.toString();
    window.history.replaceState(null, '', u.pathname + (qs ? '?' + qs : '') + (u.hash || ''));
  } catch (e) { /* ignore */ }
}

function clearNearMeLocation() {
  sessionStorage.removeItem('ra-nearme-location');
  stripNearShareParamsFromCurrentURL();
}

function updateNearMeButtonState() {
  const loc = getNearMeLocation();
  document.querySelectorAll('.location-btn, #btn-nearme').forEach(function (btn) {
    if (btn) btn.classList.toggle('active', !!loc);
  });
}

function requestNearMeLocation(onSuccess, onError) {
  if (!navigator.geolocation) {
    if (onError) onError();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setNearMeLocation(lat, lon);
      if (onSuccess) onSuccess(lat, lon);
    },
    function () {
      if (onError) onError();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function getFilterCheckboxListEl(id) {
  return document.getElementById(id);
}

/** @returns {string[]} empty = no filter (equivalent to «Todas») */
function getCheckedFilterValues(listEl) {
  if (!listEl) return [];
  const allInput = listEl.querySelector('input[data-filter-all="1"]');
  if (allInput && allInput.checked) return [];
  const out = [];
  listEl.querySelectorAll('input[data-filter-value]').forEach(function (inp) {
    if (inp.checked) out.push(inp.getAttribute('data-filter-value') || '');
  });
  return out;
}

function setCheckedFilterValues(listId, values) {
  const list = document.getElementById(listId);
  if (!list) return;
  const allInput = list.querySelector('input[data-filter-all="1"]');
  const valueInputs = list.querySelectorAll('input[data-filter-value]');
  if (!values || !values.length) {
    if (allInput) allInput.checked = true;
    valueInputs.forEach(function (inp) {
      inp.checked = false;
    });
    return;
  }
  if (allInput) allInput.checked = false;
  valueInputs.forEach(function (inp) {
    const v = inp.getAttribute('data-filter-value');
    inp.checked = values.indexOf(v) >= 0;
  });
}

function syncCheckboxGroup(listEl, changedInput) {
  const allInput = listEl.querySelector('input[data-filter-all="1"]');
  const valueInputs = listEl.querySelectorAll('input[data-filter-value]');
  if (changedInput.hasAttribute('data-filter-all')) {
    if (changedInput.checked) {
      valueInputs.forEach(function (inp) {
        inp.checked = false;
      });
    } else {
      changedInput.checked = true;
    }
  } else {
    if (changedInput.checked && allInput) allInput.checked = false;
    if (!changedInput.checked) {
      let any = false;
      valueInputs.forEach(function (inp) {
        if (inp.checked) any = true;
      });
      if (!any && allInput) allInput.checked = true;
    }
  }
}

function buildUnifiedFilterSummaryText() {
  function part(listId, multiWord) {
    var listEl = document.getElementById(listId);
    if (!listEl) return '';
    var vals = getCheckedFilterValues(listEl);
    if (!vals.length) return '';
    if (vals.length === 1) {
      var v = vals[0];
      if (listId === 'filter-type') {
        if (v === 'echolink') return 'Echolink';
        if (v === 'dmr') return 'DMR';
        if (v === 'atc') return 'ATC / aéreo';
        if (v === 'radioclub') return 'Radioclubes';
      }
      return v;
    }
    return vals.length + ' ' + multiWord;
  }
  var bits = [];
  var b = part('filter-banda', 'bandas');
  if (b) bits.push(b);
  var r = part('filter-region', 'regiones');
  if (r) bits.push(r);
  var t = part('filter-type', 'tipos');
  if (t) bits.push(t);
  var c = part('filter-conference', 'conferencias');
  if (c) bits.push(c);
  if (!bits.length) return 'Sin restricciones';
  if (bits.length <= 2) return bits.join(' · ');
  return bits.length + ' criterios activos';
}

function setUnifiedFilterSummaryUi() {
  var t = buildUnifiedFilterSummaryText();
  var u = document.getElementById('filter-unified-summary');
  if (u) u.textContent = t;
  var sheet = document.getElementById('filter-unified-summary-sheet');
  if (sheet) sheet.textContent = t === 'Sin restricciones' ? '' : t;
}

function updateFilterMultiselectSummaries() {
  function setSummary(listId, summaryId, allLabel, labelForValue) {
    const sumEl = document.getElementById(summaryId);
    const listEl = document.getElementById(listId);
    if (!sumEl || !listEl) return;
    const vals = getCheckedFilterValues(listEl);
    if (!vals.length) {
      sumEl.textContent = allLabel;
      return;
    }
    if (vals.length === 1) {
      sumEl.textContent = labelForValue(vals[0]);
      return;
    }
    sumEl.textContent = vals.length + (listId === 'filter-banda' ? ' bandas' : listId === 'filter-region' ? ' regiones' : listId === 'filter-type' ? ' tipos' : ' conferencias');
  }

  setSummary('filter-banda', 'filter-banda-summary', 'Todas las bandas', function (v) {
    return v;
  });
  setSummary('filter-region', 'filter-region-summary', 'Todas las regiones', function (v) {
    return v;
  });
  setSummary('filter-type', 'filter-type-summary', 'Todos los tipos', function (v) {
    if (v === 'echolink') return 'Echolink';
    if (v === 'dmr') return 'DMR';
    if (v === 'atc') return 'ATC / aéreo';
    if (v === 'radioclub') return 'Radioclubes';
    return v;
  });
  setSummary('filter-conference', 'filter-conference-summary', 'Todas las conferencias', function (v) {
    return v;
  });
  setUnifiedFilterSummaryUi();
}

function parseMultiParam(params, key) {
  const all = params.getAll(key);
  if (all.length > 1) return all.map(function (s) { return String(s).trim(); }).filter(Boolean);
  const single = params.get(key);
  if (!single) return [];
  return String(single).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function urlHasShareParams() {
  const params = new URLSearchParams(window.location.search);
  const keys = ['search', 'banda', 'region', 'echolink', 'echolinkConference', 'type', 'conference', 'near', 'nearRadius', 'mlat', 'mlon', 'zoom', 'mode', 'signal', 'sb', 'prop', 'nosb'];
  return keys.some(function (k) { return params.has(k); });
}

function saveFilterState() {
  try {
    const search = document.getElementById('search');
    const state = {
      v: 5,
      search: search ? search.value || '' : '',
      bandas: getCheckedFilterValues(getFilterCheckboxListEl('filter-banda')),
      regions: getCheckedFilterValues(getFilterCheckboxListEl('filter-region')),
      types: getCheckedFilterValues(getFilterCheckboxListEl('filter-type')),
      conferences: getCheckedFilterValues(getFilterCheckboxListEl('filter-conference')),
      nearMe: !!getNearMeLocation(),
      nearMeRadiusKm: getNearMeRadiusKm(),
      radiusRefSignal: getRadiusRefSignal() || null
    };
    sessionStorage.setItem('ra-filter-state', JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

function loadFilterState() {
  try {
    const params = new URLSearchParams(window.location.search);
    const useUrl = urlHasShareParams();
    const searchEl = document.getElementById('search');

    if (useUrl) {
      if (searchEl && params.has('search')) searchEl.value = params.get('search') || '';

      setCheckedFilterValues('filter-banda', parseMultiParam(params, 'banda'));
      setCheckedFilterValues('filter-region', parseMultiParam(params, 'region'));

      var types = parseMultiParam(params, 'type');
      if (!types.length) {
        var ech = params.get('echolink');
        if (ech === 'only') types = ['echolink'];
        else if (ech === 'no') types = ['dmr', 'radioclub'];
      }
      setCheckedFilterValues('filter-type', types);

      var conferences = parseMultiParam(params, 'conference');
      if (!conferences.length) {
        var ecLegacy = params.get('echolinkConference');
        if (ecLegacy) conferences = [ecLegacy];
      }
      setCheckedFilterValues('filter-conference', conferences);

      if (params.has('near')) {
        var near = params.get('near');
        var parts = String(near).split(',');
        var la = parseFloat(parts[0], 10);
        var lo = parseFloat(parts[1], 10);
        if (!isNaN(la) && !isNaN(lo)) {
          setNearMeLocation(la, lo);
          if (params.has('nearRadius')) {
            setNearMeRadiusKm(params.get('nearRadius'));
          } else {
            setNearMeRadiusKm(NEAR_ME_RADIUS_DEFAULT_KM);
          }
        }
      } else {
        clearNearMeLocation();
      }
      if (params.has('nearRadius') && !params.has('near')) {
        setNearMeRadiusKm(params.get('nearRadius'));
      } else if (params.has('signal') && !params.has('near') && !params.has('nearRadius')) {
        setNearMeRadiusKm(NEAR_ME_RADIUS_DEFAULT_KM);
      }
      if (params.has('signal')) {
        setRadiusRefSignal(params.get('signal') || '');
      } else {
        clearRadiusRefSignal();
      }
    } else {
      var s = sessionStorage.getItem('ra-filter-state');
      if (!s) return;
      var parsed = JSON.parse(s);
      if (parsed.v !== 2 && parsed.v !== 3 && parsed.v !== 4 && parsed.v !== 5) return;
      if (searchEl) searchEl.value = parsed.search || '';
      setCheckedFilterValues('filter-banda', parsed.bandas || []);
      setCheckedFilterValues('filter-region', parsed.regions || []);
      setCheckedFilterValues('filter-type', parsed.types || []);
      setCheckedFilterValues('filter-conference', parsed.conferences || []);
      if (parsed.v >= 3 && parsed.nearMe === false) {
        clearNearMeLocation();
      }
      if (parsed.nearMeRadiusKm != null && parsed.v >= 4) {
        setNearMeRadiusKm(parsed.nearMeRadiusKm);
      }
      if (parsed.v >= 5 && Object.prototype.hasOwnProperty.call(parsed, 'radiusRefSignal')) {
        if (parsed.radiusRefSignal) setRadiusRefSignal(parsed.radiusRefSignal);
        else clearRadiusRefSignal();
      }
    }
    updateFilterMultiselectSummaries();
  } catch (e) { /* ignore */ }
}

function clearAllFilters() {
  try {
    var searchEl = document.getElementById('search');
    if (searchEl) searchEl.value = '';
    FILTER_LIST_IDS.forEach(function (id) {
      setCheckedFilterValues(id, []);
    });
    clearNearMeLocation();
    clearRadiusRefSignal();
    setNearMeRadiusKm(NEAR_ME_RADIUS_DEFAULT_KM);
    updateNearMeButtonState();
    saveFilterState();
    updateFilterMultiselectSummaries();
    try {
      if (window.location.search) {
        var path = window.location.pathname || '/';
        var hash = window.location.hash || '';
        window.history.replaceState(null, '', path + hash);
      }
    } catch (e2) { /* ignore */ }
    if (typeof window.__radiomapAfterClearFilters === 'function') {
      window.__radiomapAfterClearFilters();
    }
    if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
  } catch (e) { /* ignore */ }
}

window.clearAllFilters = clearAllFilters;

function getFilterCriteria() {
  try {
    var search = document.getElementById('search');
    var q = search && search.value.trim() ? search.value.trim().toLowerCase() : '';
    return {
      q: q,
      bandas: getCheckedFilterValues(getFilterCheckboxListEl('filter-banda')),
      regions: getCheckedFilterValues(getFilterCheckboxListEl('filter-region')),
      types: getCheckedFilterValues(getFilterCheckboxListEl('filter-type')),
      conferences: getCheckedFilterValues(getFilterCheckboxListEl('filter-conference'))
    };
  } catch (e) {
    return { q: '', bandas: [], regions: [], types: [], conferences: [] };
  }
}

function nodeMatchesFilterCriteria(r, c, distAnchor) {
  if (c.regions && c.regions.length) {
    var okReg = c.regions.some(function (reg) {
      return r.region === reg;
    });
    if (!okReg) return false;
  }
  if (c.bandas && c.bandas.length) {
    var b = r.banda || '';
    if (!c.bandas.some(function (x) { return b.indexOf(x) >= 0; })) return false;
  }
  if (c.types && c.types.length) {
    var okType = c.types.some(function (t) {
      if (t === 'echolink') return !!r.isEcholink;
      if (t === 'dmr') return !!r.isDMR;
      if (t === 'atc') return !!r.isAir;
      if (t === 'radioclub') return !r.isEcholink && !r.isDMR && !r.isAir;
      return false;
    });
    if (!okType) return false;
  }
  if (c.conferences && c.conferences.length) {
    var conf = (r.conference || '').trim();
    if (!conf || c.conferences.indexOf(conf) < 0) return false;
  }
  if (c.q) {
    var haystack = [
      r.signal, r.nombre, r.comuna, r.ubicacion, r.region, r.rx, r.tx, r.tono, r.banda,
      r.conference, r.color, r.slot, r.tg, r.website
    ].filter(Boolean).join(' ').toLowerCase();
    if (haystack.indexOf(c.q) < 0) return false;
  }
  if (distAnchor && (r.lat == null || r.lon == null || haversine(distAnchor.lat, distAnchor.lon, r.lat, r.lon) > getNearMeRadiusKm())) {
    return false;
  }
  return true;
}

function getVisibleNodeIndices() {
  if (typeof NODES === 'undefined' || !NODES.length) return [];
  var c = getFilterCriteria();
  var anchor = getDistanceFilterAnchor();
  var indices = [];
  for (var i = 0; i < NODES.length; i++) {
    if (nodeMatchesFilterCriteria(NODES[i], c, anchor)) indices.push(i);
  }
  return indices;
}

function getFilteredNodes(opts) {
  opts = opts || {};
  var indices = getVisibleNodeIndices();
  var result = indices.map(function (i) { return NODES[i]; });
  var anchor = getDistanceFilterAnchor();
  if (opts.sortByDistance && anchor && result.length > 0) {
    result = result.map(function (r) {
      return Object.assign({}, r, {
        _dist: (r.lat != null && r.lon != null) ? Math.round(haversine(anchor.lat, anchor.lon, r.lat, r.lon)) : null
      });
    });
    result.sort(function (a, b) { return (a._dist ?? 9999) - (b._dist ?? 9999); });
  }
  return result;
}

window.getFilterCriteria = getFilterCriteria;
window.nodeMatchesFilterCriteria = nodeMatchesFilterCriteria;
window.getVisibleNodeIndices = getVisibleNodeIndices;
window.getFilteredNodes = getFilteredNodes;

/** For CSV filename + criteria blob */
function getExportFilterCriteria() {
  var c = getFilterCriteria();
  var searchEl = document.getElementById('search');
  var rawSearch = searchEl && searchEl.value.trim() ? searchEl.value.trim() : '';
  return {
    search: rawSearch,
    nearMe: !!getDistanceFilterAnchor(),
    bandas: c.bandas,
    regions: c.regions,
    types: c.types,
    conferences: c.conferences
  };
}
window.getExportFilterCriteria = getExportFilterCriteria;

function getActiveFilterFlags() {
  try {
    var c = getFilterCriteria();
    return {
      hasSearch: !!c.q,
      hasFilters: !!(c.bandas.length || c.regions.length || c.types.length || c.conferences.length),
      hasNear: typeof getDistanceFilterAnchor === 'function' && !!getDistanceFilterAnchor()
    };
  } catch (e) {
    return { hasSearch: false, hasFilters: false, hasNear: false };
  }
}

function buildGuidedEmptyStateHtml() {
  var f = getActiveFilterFlags();
  var hints = [];
  if (f.hasSearch) hints.push('Borra o acorta el texto en el campo de búsqueda.');
  if (f.hasFilters) hints.push('Relaja los filtros: banda, región, tipo (Echolink / DMR / radioclub) o conferencia.');
  if (f.hasNear) hints.push('Desactiva el filtro por distancia (ubicación o repetidora de referencia), o amplía el radio (hasta ' + NEAR_ME_RADIUS_MAX_KM + ' km).');
  if (hints.length === 0) hints.push('Amplía la búsqueda o quita filtros.');
  var items = hints.map(function (h) { return '<li>' + h + '</li>'; }).join('');
  return '<div class="no-results no-results--guided" role="status">' +
    '<p class="no-results-title">Sin resultados</p>' +
    '<p class="no-results-lead">Ninguna repetidora coincide con estos criterios.</p>' +
    '<ul class="no-results-list">' + items + '</ul>' +
    '<button type="button" class="btn-clear-filters no-results-cta" onclick="clearAllFilters()">' +
    '<span class="material-symbols-outlined" aria-hidden="true">filter_alt_off</span> Limpiar filtros</button>' +
    '</div>';
}

window.getActiveFilterFlags = getActiveFilterFlags;
window.buildGuidedEmptyStateHtml = buildGuidedEmptyStateHtml;

function onFilterCheckboxChange(ev) {
  var input = ev.target;
  if (!input || input.type !== 'checkbox') return;
  var list = input.closest('.filter-checkbox-list');
  if (!list || !list.id || FILTER_LIST_IDS.indexOf(list.id) < 0) return;
  syncCheckboxGroup(list, input);
  updateFilterMultiselectSummaries();
  saveFilterState();
  if (typeof window.applyFilters === 'function') window.applyFilters();
  if (typeof window.__radiomapListMultiselectChange === 'function') window.__radiomapListMultiselectChange();
  if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
}

function onDocumentClickCloseDropdowns(ev) {
  if (!ev.target.closest) return;
  if (ev.target.closest('details.filter-dropdown')) return;
  document.querySelectorAll('details.filter-dropdown[open]').forEach(function (d) {
    d.open = false;
  });
}

/** Visual viewport (mobile URL bar / keyboard); fallback to layout viewport. */
function getFilterDropdownViewportRect() {
  var vv = window.visualViewport;
  if (vv) {
    return {
      left: vv.offsetLeft,
      top: vv.offsetTop,
      width: vv.width,
      height: vv.height
    };
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function clearFilterDropdownPanelFixed(panel) {
  if (!panel) return;
  panel.classList.remove('radiomap-filter-panel--fixed');
  panel.style.position = '';
  panel.style.top = '';
  panel.style.left = '';
  panel.style.width = '';
  panel.style.maxWidth = '';
  panel.style.maxHeight = '';
  panel.style.zIndex = '';
}

/**
 * Map unified filters live inside #map-filter-sheet-panel. On desktop the sheet is display:contents
 * and the floating panel should use the same fixed positioning as lista. On narrow viewports the
 * sheet is a real flex panel — the filter panel must stay in-flow (no position:fixed).
 */
function mapUnifiedFilterInBottomSheet(details) {
  if (!details) return false;
  if (details.id !== 'map-filters-details' && details.id !== 'list-filters-details') return false;
  var sheet = document.getElementById('map-filter-sheet-panel');
  if (!sheet) return false;
  return window.getComputedStyle(sheet).display !== 'contents';
}

var __radiomapOpenFilterDetails = null;
var __radiomapFilterRepositionScheduled = false;

function positionFilterDropdownPanel(details) {
  var panel = details.querySelector('.filter-dropdown__panel');
  var summary = details.querySelector('.filter-dropdown__summary');
  if (!panel || !summary) return;

  var tr = summary.getBoundingClientRect();
  var vp = getFilterDropdownViewportRect();
  var unified = panel.classList.contains('filter-dropdown__panel--unified');
  var narrowSheet = vp.width <= 560;
  var gap = unified && narrowSheet ? 6 : 4;
  var edge = 8;
  if (unified && narrowSheet) {
    edge = vp.width <= 360 ? 5 : vp.width <= 480 ? 7 : 8;
  }
  edge = Math.max(edge, 0);

  var maxWCap = unified ? 520 : 360;
  var minWFloor = unified ? (narrowSheet ? 0 : 280) : 252;

  var maxPanelW = narrowSheet ? (vp.width - 2 * edge) : Math.min(maxWCap, vp.width - 2 * edge);
  var w = narrowSheet
    ? Math.floor(Math.max(0, maxPanelW))
    : Math.min(Math.max(Math.max(tr.width, Math.min(panel.scrollWidth, maxPanelW)), minWFloor), maxPanelW);

  var availV = Math.max(0, Math.floor(vp.height - 2 * edge));
  var belowTop = tr.bottom + gap;
  var spaceBelow = Math.floor(vp.top + vp.height - belowTop - edge);
  var spaceAbove = Math.floor(tr.top - vp.top - gap - edge);

  var openBelow = spaceBelow >= spaceAbove;
  if (spaceBelow < 88 && spaceAbove > spaceBelow) openBelow = false;
  else if (spaceAbove < 88 && spaceBelow > spaceAbove) openBelow = true;

  /* Objetivo de alto: listas largas deben poder hacer scroll dentro del viewport */
  var preferH = Math.min(
    Math.floor(availV * (unified && narrowSheet ? 0.86 : 0.72)),
    unified && narrowSheet ? 640 : 520,
    availV
  );
  if (!narrowSheet) preferH = Math.min(preferH, unified ? 480 : 420);

  var primary = openBelow ? spaceBelow : spaceAbove;
  var maxH = Math.floor(Math.min(preferH, primary, availV));

  if (narrowSheet && maxH < Math.min(200, preferH)) {
    var alt = openBelow ? spaceAbove : spaceBelow;
    if (alt > primary + 12) {
      openBelow = !openBelow;
      primary = openBelow ? spaceBelow : spaceAbove;
      maxH = Math.floor(Math.min(preferH, primary, availV));
    }
  }

  primary = openBelow ? spaceBelow : spaceAbove;
  maxH = Math.floor(Math.min(maxH, primary, availV));

  var top = openBelow ? belowTop : (tr.top - gap - maxH);
  top = Math.max(vp.top + edge, Math.min(top, vp.top + vp.height - maxH - edge));

  var left = narrowSheet ? (vp.left + edge) : tr.left;
  if (!narrowSheet) {
    left = Math.min(Math.max(left, vp.left + edge), vp.left + vp.width - w - edge);
  }

  panel.classList.add('radiomap-filter-panel--fixed');
  panel.style.position = 'fixed';
  panel.style.left = Math.round(left) + 'px';
  panel.style.top = Math.round(top) + 'px';
  panel.style.width = Math.round(w) + 'px';
  if (unified) {
    panel.style.maxWidth = Math.round(w) + 'px';
  } else {
    panel.style.maxWidth = '';
  }
  panel.style.maxHeight = maxH + 'px';
  panel.style.zIndex = '13000';
}

function scheduleRepositionOpenFilterDropdown() {
  var d = __radiomapOpenFilterDetails;
  if (!d || !d.open) {
    d = document.getElementById('map-filters-details');
    if (!d || !d.open) d = document.getElementById('list-filters-details');
    if (!d || !d.open) return;
    if (mapUnifiedFilterInBottomSheet(d)) return;
    __radiomapOpenFilterDetails = d;
  } else if (mapUnifiedFilterInBottomSheet(d)) {
    clearFilterDropdownPanelFixed(d.querySelector('.filter-dropdown__panel'));
    __radiomapOpenFilterDetails = null;
    return;
  }
  if (__radiomapFilterRepositionScheduled) return;
  __radiomapFilterRepositionScheduled = true;
  requestAnimationFrame(function () {
    __radiomapFilterRepositionScheduled = false;
    d = __radiomapOpenFilterDetails;
    if (!d || !d.open) return;
    if (mapUnifiedFilterInBottomSheet(d)) {
      clearFilterDropdownPanelFixed(d.querySelector('.filter-dropdown__panel'));
      __radiomapOpenFilterDetails = null;
      return;
    }
    positionFilterDropdownPanel(d);
  });
}

function bindFilterDropdownViewportListeners() {
  if (window.__radiomapFilterViewportListenersBound) return;
  window.__radiomapFilterViewportListenersBound = true;
  window.addEventListener('resize', scheduleRepositionOpenFilterDropdown, true);
  document.addEventListener('scroll', scheduleRepositionOpenFilterDropdown, true);
  var vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', scheduleRepositionOpenFilterDropdown);
    vv.addEventListener('scroll', scheduleRepositionOpenFilterDropdown);
  }
}

function onFilterDropdownToggle(ev) {
  var details = ev.currentTarget;
  if (!details || details.nodeName !== 'DETAILS' || !details.classList.contains('filter-dropdown')) return;

  if (details.open) {
    document.querySelectorAll('details.filter-dropdown[open]').forEach(function (other) {
      if (other !== details) other.open = false;
    });
    var panelEl = details.querySelector('.filter-dropdown__panel');
    if (mapUnifiedFilterInBottomSheet(details)) {
      clearFilterDropdownPanelFixed(panelEl);
      __radiomapOpenFilterDetails = null;
      return;
    }
    bindFilterDropdownViewportListeners();
    __radiomapOpenFilterDetails = details;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (details.open) positionFilterDropdownPanel(details);
      });
    });
  } else {
    clearFilterDropdownPanelFixed(details.querySelector('.filter-dropdown__panel'));
    if (__radiomapOpenFilterDetails === details) __radiomapOpenFilterDetails = null;
  }
}

function wireFilterDropdownPanelPositioning() {
  document.querySelectorAll('details.filter-dropdown').forEach(function (d) {
    if (d.dataset.radiomapPanelBound) return;
    d.dataset.radiomapPanelBound = '1';
    d.addEventListener('toggle', onFilterDropdownToggle);
  });
}

if (!window.__radiomapFilterDelegationDone) {
  window.__radiomapFilterDelegationDone = true;
  document.addEventListener('change', onFilterCheckboxChange, false);
  document.addEventListener('click', onDocumentClickCloseDropdowns, false);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireFilterDropdownPanelPositioning);
  } else {
    wireFilterDropdownPanelPositioning();
  }
}

function syncNearRadiusControl() {
  var wrap = document.getElementById('near-radius-floater');
  var sl = document.getElementById('near-radius-slider');
  var valEl = document.getElementById('near-radius-value');
  if (!wrap || !sl || !valEl) return;
  var on = typeof getDistanceFilterAnchor === 'function' && !!getDistanceFilterAnchor();
  wrap.hidden = !on;
  wrap.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (on) {
    var r = typeof getNearMeRadiusKm === 'function' ? getNearMeRadiusKm() : 100;
    sl.value = String(r);
    valEl.textContent = r + ' km';
    sl.setAttribute('aria-valuenow', String(r));
  }
}
window.syncNearRadiusControl = syncNearRadiusControl;

function wireNearRadiusSliderOnce() {
  var nrSlider = document.getElementById('near-radius-slider');
  if (!nrSlider || nrSlider.dataset.radiomapNearRadiusBound) return;
  nrSlider.dataset.radiomapNearRadiusBound = '1';
  nrSlider.addEventListener('input', function () {
    if (typeof setNearMeRadiusKm === 'function') setNearMeRadiusKm(nrSlider.value);
    var valEl = document.getElementById('near-radius-value');
    var r = typeof getNearMeRadiusKm === 'function' ? getNearMeRadiusKm() : parseInt(nrSlider.value, 10);
    if (valEl) valEl.textContent = r + ' km';
    nrSlider.setAttribute('aria-valuenow', String(r));
    if (typeof saveFilterState === 'function') saveFilterState();
    if (typeof window.applyFilters === 'function') {
      window.applyFilters({ skipFitBounds: true });
    } else if (typeof window.__radiomapListRadiusChange === 'function') {
      window.__radiomapListRadiusChange();
    }
    if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
  });
}

if (!window.__radiomapNearRadiusSliderWired) {
  window.__radiomapNearRadiusSliderWired = true;
  function runNearRadiusWire() {
    wireNearRadiusSliderOnce();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runNearRadiusWire);
  } else {
    runNearRadiusWire();
  }
}

/**
 * Narrow-viewport filter bottom sheet (map + lista). Pass detailsId for the page's <details> unified filter.
 */
window.radiomapWireFilterBottomSheet = function (opts) {
  opts = opts || {};
  if (window.__radiomapFilterBottomSheetWired) return;
  var detailsId = opts.detailsId || 'map-filters-details';
  var onLayout = typeof opts.onLayout === 'function' ? opts.onLayout : function () {};
  var closeMenu = typeof opts.closeMenu === 'function' ? opts.closeMenu : function () {};

  var mq = window.matchMedia('(max-width: 768px)');
  var trigger = document.getElementById('btn-map-filter-sheet');
  var closeBtn = document.getElementById('btn-map-filter-sheet-close');
  var panel = document.getElementById('map-filter-sheet-panel');
  var backdrop = document.getElementById('map-filter-sheet-backdrop');
  if (!trigger || !panel || !backdrop) return;

  window.__radiomapFilterBottomSheetWired = true;

  function isNarrow() {
    return mq.matches;
  }
  function syncFiltersDetailsOpen(open) {
    var d = document.getElementById(detailsId);
    if (d) d.open = !!open;
  }
  function closeSheet() {
    panel.classList.remove('map-filter-sheet-panel--open');
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('map-filter-sheet-open');
    syncFiltersDetailsOpen(false);
    onLayout();
  }
  function openSheet() {
    if (!isNarrow()) return;
    closeMenu();
    panel.classList.add('map-filter-sheet-panel--open');
    backdrop.hidden = false;
    backdrop.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('map-filter-sheet-open');
    syncFiltersDetailsOpen(true);
    onLayout();
  }
  function toggleSheet() {
    if (panel.classList.contains('map-filter-sheet-panel--open')) closeSheet();
    else openSheet();
  }
  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!isNarrow()) return;
    toggleSheet();
  });
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      closeSheet();
    });
  }
  backdrop.addEventListener('click', function () {
    closeSheet();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!isNarrow() || !panel.classList.contains('map-filter-sheet-panel--open')) return;
    var help = document.getElementById('help-overlay');
    if (help && help.classList.contains('open')) return;
    e.preventDefault();
    closeSheet();
  });
  function onMqChange() {
    if (!mq.matches) closeSheet();
  }
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMqChange);
  else mq.addListener(onMqChange);

  window.__radiomapCloseMapFilterSheet = closeSheet;
};
