/**
 * Shared near-me (geolocation) filter logic for map and list views
 */
const NEAR_ME_RADIUS_KM = 100;

function haversine(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1 * Math.PI/180) * Math.cos(la2 * Math.PI/180) * Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearMeLocation() {
  try {
    const s = sessionStorage.getItem('ra-nearme-location');
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

function setNearMeLocation(lat, lon) {
  sessionStorage.setItem('ra-nearme-location', JSON.stringify({ lat, lon }));
}

function clearNearMeLocation() {
  sessionStorage.removeItem('ra-nearme-location');
}

function updateNearMeButtonState() {
  const loc = getNearMeLocation();
  document.querySelectorAll('.location-btn, #btn-nearme').forEach(btn => {
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
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      setNearMeLocation(lat, lon);
      if (onSuccess) onSuccess(lat, lon);
    },
    function () {
      if (onError) onError();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

/** Filter state sync between map and list views */
const FILTER_KEYS = ['search', 'filter-banda', 'filter-region', 'filter-echolink', 'filter-echolink-conference'];
const URL_PARAM_MAP = { 'search': 'search', 'filter-banda': 'banda', 'filter-region': 'region', 'filter-echolink': 'echolink', 'filter-echolink-conference': 'echolinkConference' };

function saveFilterState() {
  try {
    const state = {};
    FILTER_KEYS.forEach(id => {
      const el = document.getElementById(id);
      if (el) state[id] = el.value || '';
    });
    sessionStorage.setItem('ra-filter-state', JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

function urlHasShareParams() {
  const params = new URLSearchParams(window.location.search);
  const keys = ['search', 'banda', 'region', 'echolink', 'echolinkConference', 'near', 'mlat', 'mlon', 'zoom', 'mode', 'signal'];
  return keys.some(k => params.has(k));
}

function loadFilterState() {
  try {
    const params = new URLSearchParams(window.location.search);
    const useUrl = urlHasShareParams();
    const state = {};

    if (useUrl) {
      FILTER_KEYS.forEach(id => {
        const paramKey = URL_PARAM_MAP[id];
        state[id] = paramKey != null && params.get(paramKey) != null ? params.get(paramKey) : '';
      });
      if (params.has('near')) {
        const near = params.get('near');
        const parts = String(near).split(',');
        const la = parseFloat(parts[0], 10);
        const lo = parseFloat(parts[1], 10);
        if (!isNaN(la) && !isNaN(lo)) setNearMeLocation(la, lo);
      } else {
        clearNearMeLocation();
      }
    } else {
      const s = sessionStorage.getItem('ra-filter-state');
      if (s) Object.assign(state, JSON.parse(s));
    }

    FILTER_KEYS.forEach(id => {
      const el = document.getElementById(id);
      if (el && state[id] !== undefined) el.value = state[id];
    });
  } catch (e) { /* ignore */ }
}

/**
 * Reset search, selects, near-me, session filter state; strip share params from URL.
 * Map/list pages set window.__radiomapAfterClearFilters to refresh UI (markers, table).
 */
function clearAllFilters() {
  try {
    FILTER_KEYS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
      } else {
        el.value = '';
      }
    });
    clearNearMeLocation();
    updateNearMeButtonState();
    saveFilterState();
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

/**
 * Which filters are active — used for guided empty states (list + map).
 */
function getActiveFilterFlags() {
  try {
    const searchEl = document.getElementById('search');
    const q = searchEl && searchEl.value.trim();
    const banda = document.getElementById('filter-banda');
    const region = document.getElementById('filter-region');
    const echolink = document.getElementById('filter-echolink');
    const ec = document.getElementById('filter-echolink-conference');
    const hasBanda = banda && banda.value;
    const hasRegion = region && region.value;
    const hasEcholink = echolink && echolink.value;
    const hasEc = ec && ec.value;
    return {
      hasSearch: !!q,
      hasFilters: !!(hasBanda || hasRegion || hasEcholink || hasEc),
      hasNear: typeof getNearMeLocation === 'function' && !!getNearMeLocation()
    };
  } catch (e) {
    return { hasSearch: false, hasFilters: false, hasNear: false };
  }
}

/**
 * HTML for “no results” with contextual hints + clear button (shared list/map).
 */
function buildGuidedEmptyStateHtml() {
  const f = getActiveFilterFlags();
  const hints = [];
  if (f.hasSearch) hints.push('Borra o acorta el texto en el campo de búsqueda.');
  if (f.hasFilters) hints.push('Relaja los filtros: banda, región, tipo Echolink o conferencia.');
  if (f.hasNear) hints.push('Desactiva «cerca de mí» si no hay nodos en 100 km a tu alrededor.');
  if (hints.length === 0) hints.push('Amplía la búsqueda o quita filtros.');
  const items = hints.map(function (h) { return '<li>' + h + '</li>'; }).join('');
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
