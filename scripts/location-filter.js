/**
 * Near-me + multiselect filters (checkbox lists in .filter-checkbox-list).
 * Requires global NODES (data/data.js) for getVisibleNodeIndices / getFilteredNodes.
 */
const NEAR_ME_RADIUS_KM = 100;

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

function clearNearMeLocation() {
  sessionStorage.removeItem('ra-nearme-location');
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
    if (v === 'radioclub') return 'Radioclubes';
    return v;
  });
  setSummary('filter-conference', 'filter-conference-summary', 'Todas las conferencias', function (v) {
    return v;
  });
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
  const keys = ['search', 'banda', 'region', 'echolink', 'echolinkConference', 'type', 'conference', 'near', 'mlat', 'mlon', 'zoom', 'mode', 'signal'];
  return keys.some(function (k) { return params.has(k); });
}

function saveFilterState() {
  try {
    const search = document.getElementById('search');
    const state = {
      v: 2,
      search: search ? search.value || '' : '',
      bandas: getCheckedFilterValues(getFilterCheckboxListEl('filter-banda')),
      regions: getCheckedFilterValues(getFilterCheckboxListEl('filter-region')),
      types: getCheckedFilterValues(getFilterCheckboxListEl('filter-type')),
      conferences: getCheckedFilterValues(getFilterCheckboxListEl('filter-conference'))
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
        if (!isNaN(la) && !isNaN(lo)) setNearMeLocation(la, lo);
      } else {
        clearNearMeLocation();
      }
    } else {
      var s = sessionStorage.getItem('ra-filter-state');
      if (!s) return;
      var parsed = JSON.parse(s);
      if (parsed.v !== 2) return;
      if (searchEl) searchEl.value = parsed.search || '';
      setCheckedFilterValues('filter-banda', parsed.bandas || []);
      setCheckedFilterValues('filter-region', parsed.regions || []);
      setCheckedFilterValues('filter-type', parsed.types || []);
      setCheckedFilterValues('filter-conference', parsed.conferences || []);
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

function nodeMatchesFilterCriteria(r, c, nearMe) {
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
      if (t === 'radioclub') return !r.isEcholink && !r.isDMR;
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
  if (nearMe && (r.lat == null || r.lon == null || haversine(nearMe.lat, nearMe.lon, r.lat, r.lon) > NEAR_ME_RADIUS_KM)) {
    return false;
  }
  return true;
}

function getVisibleNodeIndices() {
  if (typeof NODES === 'undefined' || !NODES.length) return [];
  var c = getFilterCriteria();
  var nearMe = getNearMeLocation();
  var indices = [];
  for (var i = 0; i < NODES.length; i++) {
    if (nodeMatchesFilterCriteria(NODES[i], c, nearMe)) indices.push(i);
  }
  return indices;
}

function getFilteredNodes(opts) {
  opts = opts || {};
  var indices = getVisibleNodeIndices();
  var result = indices.map(function (i) { return NODES[i]; });
  var nearMe = getNearMeLocation();
  if (opts.sortByDistance && nearMe && result.length > 0) {
    result = result.map(function (r) {
      return Object.assign({}, r, {
        _dist: (r.lat != null && r.lon != null) ? Math.round(haversine(nearMe.lat, nearMe.lon, r.lat, r.lon)) : null
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
    nearMe: !!getNearMeLocation(),
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
      hasNear: typeof getNearMeLocation === 'function' && !!getNearMeLocation()
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
  if (f.hasNear) hints.push('Desactiva «cerca de mí» si no hay nodos en 100 km a tu alrededor.');
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
}

function onDocumentClickCloseDropdowns(ev) {
  if (!ev.target.closest) return;
  if (ev.target.closest('details.filter-dropdown')) return;
  document.querySelectorAll('details.filter-dropdown[open]').forEach(function (d) {
    d.open = false;
  });
}

if (!window.__radiomapFilterDelegationDone) {
  window.__radiomapFilterDelegationDone = true;
  document.addEventListener('change', onFilterCheckboxChange, false);
  document.addEventListener('click', onDocumentClickCloseDropdowns, false);
}
