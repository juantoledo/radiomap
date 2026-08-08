/**
 * Route Planner — "Repetidores en ruta"
 * Uses OSRM (open-source routing, no API key) and Nominatim (geocoding).
 * Depends on globals: NODES, haversine, escapeHtml, escapeAttr (from earlier scripts).
 * Hooks into map.js via window.__radiomapLeafletMap and window.__radiomapMapClickHook.
 */
(function () {
  'use strict';

  // Chile bounding box — mainland + Easter Island + Juan Fernández
  var CHILE_BBOX = { minLat: -56.0, maxLat: -17.0, minLon: -110.0, maxLon: -65.5 };

  function isInChile(lat, lon) {
    return lat >= CHILE_BBOX.minLat && lat <= CHILE_BBOX.maxLat
        && lon >= CHILE_BBOX.minLon && lon <= CHILE_BBOX.maxLon;
  }

  // ── State ──────────────────────────────────────────────────────
  var pickMode    = null;   // 'from' | 'to' | null
  var fromPoint   = null;   // { lat, lon, name }
  var toPoint     = null;   // { lat, lon, name }
  var routeCoords = null;   // [[lon, lat], ...] from OSRM
  var routeDistM  = 0;      // route length in metres
  var routeStations = null; // [{ node, distKm, posKm }, ...]
  var corridorKm  = 30;
  var routeLayers = null;   // Leaflet LayerGroup
  var fromPin     = null;   // standalone Leaflet marker for the from point
  var toPin       = null;   // standalone Leaflet marker for the to point
  var loading     = false;

  // ── Geometry ───────────────────────────────────────────────────

  /** Perpendicular distance (km) from point P to segment AB. */
  function ptSegDistKm(plat, plon, alat, alon, blat, blon) {
    var dx = blon - alon, dy = blat - alat;
    var lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-14) return haversine(plat, plon, alat, alon);
    var t = ((plon - alon) * dx + (plat - alat) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return haversine(plat, plon, alat + t * dy, alon + t * dx);
  }

  /** Minimum distance (km) from point to any segment of polyline. */
  function minDistToPolyline(lat, lon, coords) {
    var best = Infinity;
    for (var i = 0; i < coords.length - 1; i++) {
      var d = ptSegDistKm(lat, lon, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
      if (d < best) best = d;
    }
    return best;
  }

  /** Cumulative km along route to the nearest projection of the point. */
  function posAlongRoute(lat, lon, coords) {
    var best = Infinity, bestPos = 0, cum = 0;
    for (var i = 0; i < coords.length - 1; i++) {
      var segLen = haversine(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
      var dx = coords[i + 1][0] - coords[i][0], dy = coords[i + 1][1] - coords[i][1];
      var lenSq = dx * dx + dy * dy;
      var t = lenSq < 1e-14 ? 0 : Math.max(0, Math.min(1, ((lon - coords[i][0]) * dx + (lat - coords[i][1]) * dy) / lenSq));
      var d = haversine(lat, lon, coords[i][1] + t * dy, coords[i][0] + t * dx);
      if (d < best) { best = d; bestPos = cum + t * segLen; }
      cum += segLen;
    }
    return bestPos;
  }

  // ── API ────────────────────────────────────────────────────────

  function geocode(query, callback) {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&q='
      + encodeURIComponent(query) + '&countrycodes=cl&limit=1';
    fetch(url, { headers: { 'Accept-Language': 'es' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.length) { callback(new Error('No encontrado')); return; }
        var d = data[0];
        callback(null, {
          lat: parseFloat(d.lat),
          lon: parseFloat(d.lon),
          name: d.display_name.split(',')[0].trim(),
        });
      })
      .catch(callback);
  }

  function reverseGeocode(lat, lon, callback) {
    var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon;
    fetch(url, { headers: { 'Accept-Language': 'es' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data) { callback(null, null); return; }
        var addr = data.address || {};
        var name = addr.city || addr.town || addr.village || addr.county
          || (data.display_name || '').split(',')[0].trim();
        callback(null, name || null);
      })
      .catch(function () { callback(null, null); });
  }

  function fetchRoute(from, to, callback) {
    // steps=true gives per-step geometry (dense, follows every curve).
    // overview=false avoids the coarse simplified overview that misses nearby stations.
    var url = 'https://router.project-osrm.org/route/v1/driving/'
      + from.lon + ',' + from.lat + ';'
      + to.lon + ',' + to.lat
      + '?steps=true&overview=false&geometries=geojson';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
          callback(new Error('No se encontró ruta entre esos puntos.')); return;
        }
        var route = data.routes[0];

        // Concatenate all step coordinates into one dense polyline.
        // Each step's last point equals the next step's first point — skip duplicates.
        var coords = [];
        (route.legs || []).forEach(function (leg) {
          (leg.steps || []).forEach(function (step) {
            var pts = (step.geometry && step.geometry.coordinates) || [];
            var start = coords.length > 0 ? 1 : 0; // skip first point if continuing
            for (var i = start; i < pts.length; i++) coords.push(pts[i]);
          });
        });

        if (!coords.length) {
          callback(new Error('La ruta no tiene geometría detallada.')); return;
        }

        callback(null, {
          coords: coords,          // [[lon, lat], ...] dense step-level polyline
          distanceM: route.distance,
          durationS: route.duration,
        });
      })
      .catch(function (e) { callback(e || new Error('Error al consultar la ruta.')); });
  }

  // ── Filter ────────────────────────────────────────────────────

  function filterStationsInCorridor(coords) {
    var nodes = (typeof NODES !== 'undefined' ? NODES : []);
    var results = [];
    nodes.forEach(function (node) {
      if (node.lat == null || node.lon == null
        || typeof node.lat !== 'number' || typeof node.lon !== 'number') return;
      if (node.serviceType === 'broadcast') return;
      var dist = minDistToPolyline(node.lat, node.lon, coords);
      if (dist > corridorKm) return;
      results.push({
        node: node,
        distKm: Math.round(dist * 10) / 10,
        posKm: Math.round(posAlongRoute(node.lat, node.lon, coords)),
      });
    });
    results.sort(function (a, b) { return a.posKm - b.posKm; });
    return results;
  }

  // ── Map layers ─────────────────────────────────────────────────

  function getLeafletMap() { return window.__radiomapLeafletMap || null; }

  function clearPins() {
    var m = getLeafletMap();
    if (fromPin && m) { m.removeLayer(fromPin); fromPin = null; }
    if (toPin   && m) { m.removeLayer(toPin);   toPin   = null; }
  }

  function clearLayers() {
    var m = getLeafletMap();
    if (routeLayers && m) m.removeLayer(routeLayers);
    routeLayers = null;
    clearPins();
  }

  function placePin(which, lat, lon, name) {
    var m = getLeafletMap();
    if (!m || !window.L) return;
    if (which === 'from') {
      if (fromPin) m.removeLayer(fromPin);
      fromPin = L.marker([lat, lon], {
        icon: buildPinIcon('route-pin--from', 'location_on'),
        title: name || '',
        zIndexOffset: 500,
      }).addTo(m);
    } else {
      if (toPin) m.removeLayer(toPin);
      toPin = L.marker([lat, lon], {
        icon: buildPinIcon('route-pin--to', 'location_on'),
        title: name || '',
        zIndexOffset: 500,
      }).addTo(m);
    }
  }

  function buildPinIcon(cls, symbol) {
    return window.L && L.divIcon({
      className: 'route-pin ' + cls,
      html: '<span class="material-symbols-outlined" aria-hidden="true">' + symbol + '</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 24],
    });
  }

  function drawRoute() {
    clearLayers();
    var m = getLeafletMap();
    if (!m || !window.L || !routeCoords) return;

    var latlngs = routeCoords.map(function (c) { return [c[1], c[0]]; });
    var polyline = L.polyline(latlngs, { color: '#00d4ff', weight: 5, opacity: 0.80 });

    var fromMarker = L.marker([fromPoint.lat, fromPoint.lon], {
      icon: buildPinIcon('route-pin--from', 'location_on'),
      title: fromPoint.name,
      zIndexOffset: 500,
    });
    fromPin = fromMarker;
    var toMarker = L.marker([toPoint.lat, toPoint.lon], {
      icon: buildPinIcon('route-pin--to', 'location_on'),
      title: toPoint.name,
      zIndexOffset: 500,
    });
    toPin = toMarker;

    var stationCircles = (routeStations || []).map(function (s) {
      return L.circleMarker([s.node.lat, s.node.lon], {
        radius: 8,
        color: '#00d4ff',
        weight: 2,
        fillColor: '#00d4ff',
        fillOpacity: 0.25,
        interactive: true,
      }).bindTooltip(
        '<strong>' + s.node.signal + '</strong><br>'
        + (s.node.rx ? s.node.rx + ' MHz' : '') + (s.node.tono ? ' · ' + s.node.tono + ' Hz' : '')
        + '<br>' + s.posKm + ' km desde inicio',
        { sticky: true }
      ).on('click', function () {
        var idx = (typeof NODES !== 'undefined' ? NODES : []).indexOf(s.node);
        if (idx >= 0 && typeof window.selectRepeater === 'function') window.selectRepeater(idx, 'route_planner');
      });
    });

    routeLayers = L.layerGroup([polyline, fromMarker, toMarker].concat(stationCircles)).addTo(m);
    m.fitBounds(polyline.getBounds(), { paddingTopLeft: [8, 8], paddingBottomRight: [8, 8], maxZoom: 13 });
  }

  // ── Pick mode ──────────────────────────────────────────────────

  function setPickMode(mode) {
    pickMode = mode;
    var mapEl = document.getElementById('map');
    if (mapEl) mapEl.classList.toggle('route-pick-cursor', !!mode);
    var hint = document.getElementById('route-pick-hint');
    if (hint) {
      if (mode) {
        hint.textContent = mode === 'from'
          ? 'Haz clic en el mapa para indicar el punto de inicio'
          : 'Haz clic en el mapa para indicar el punto de destino';
        hint.removeAttribute('hidden');
      } else {
        hint.setAttribute('hidden', '');
      }
    }
    var btnFrom = document.getElementById('btn-route-pick-from');
    var btnTo   = document.getElementById('btn-route-pick-to');
    if (btnFrom) btnFrom.setAttribute('aria-pressed', mode === 'from' ? 'true' : 'false');
    if (btnTo)   btnTo.setAttribute('aria-pressed', mode === 'to'   ? 'true' : 'false');
  }

  /** Called by map.js click hook. */
  function handleMapClick(lat, lon) {
    if (!pickMode) return;
    if (!isInChile(lat, lon)) {
      var hint = document.getElementById('route-pick-hint');
      if (hint) {
        var prev = hint.textContent;
        hint.textContent = 'Punto fuera del territorio chileno.';
        hint.removeAttribute('hidden');
        setTimeout(function () { hint.textContent = prev; }, 2000);
      }
      return; // keep pick mode active
    }
    var mode = pickMode;
    setPickMode(null);

    var nameDefault = lat.toFixed(3) + ', ' + lon.toFixed(3);
    var pt = { lat: lat, lon: lon, name: nameDefault };
    var inputId = mode === 'from' ? 'route-from' : 'route-to';
    var inputEl = document.getElementById(inputId);
    if (inputEl) inputEl.value = nameDefault;

    if (mode === 'from') {
      fromPoint = pt;
      placePin('from', lat, lon, nameDefault);
      if (!toPoint) setPickMode('to');
    } else {
      toPoint = pt;
      placePin('to', lat, lon, nameDefault);
    }

    // Best-effort reverse geocode to update the place name on the pin and input
    reverseGeocode(lat, lon, function (err, name) {
      if (!name) return;
      pt.name = name;
      var el = document.getElementById(inputId);
      if (el && el.value === nameDefault) el.value = name;
      var pin = mode === 'from' ? fromPin : toPin;
      if (pin) pin.setTooltipContent(name);
    });
  }

  window.__radiomapMapClickHook = handleMapClick;

  // ── Resolve points (geocode if text only) ─────────────────────

  function resolvePoint(which, callback) {
    var inputId = which === 'from' ? 'route-from' : 'route-to';
    var stored  = which === 'from' ? fromPoint : toPoint;
    var inputEl = document.getElementById(inputId);
    var text    = inputEl ? inputEl.value.trim() : '';

    if (stored) { callback(null, stored); return; }
    if (!text)  { callback(new Error('Ingresa o selecciona el punto de ' + (which === 'from' ? 'inicio' : 'destino') + '.')); return; }

    geocode(text, function (err, pt) {
      if (err || !pt) { callback(new Error('No se encontró «' + text + '» en Chile.')); return; }
      if (!isInChile(pt.lat, pt.lon)) { callback(new Error('«' + text + '» está fuera del territorio chileno.')); return; }
      if (which === 'from') { fromPoint = pt; } else { toPoint = pt; }
      if (inputEl) inputEl.value = pt.name;
      placePin(which, pt.lat, pt.lon, pt.name);
      callback(null, pt);
    });
  }

  // ── Calculate ─────────────────────────────────────────────────

  function setLoading(on) {
    loading = on;
    var btn = document.getElementById('btn-route-calculate');
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? 'Calculando…' : 'Calcular ruta';
  }

  function calculate() {
    if (loading) return;
    setLoading(true);

    resolvePoint('from', function (err, from) {
      if (err) { setLoading(false); alert(err.message); return; }
      resolvePoint('to', function (err2, to) {
        if (err2) { setLoading(false); alert(err2.message); return; }
        fetchRoute(from, to, function (err3, result) {
          setLoading(false);
          if (err3) { alert(err3.message); return; }
          routeCoords    = result.coords;
          routeDistM     = result.distanceM;
          routeStations  = filterStationsInCorridor(routeCoords);
          // Narrow the map to route stations only
          window.__radiomapRouteFilterSignals = new Set(routeStations.map(function (s) { return s.node.signal; }));
          if (typeof window.applyFilters === 'function') window.applyFilters();
          drawRoute();
        });
      });
    });
  }

  // ── Clear ────────────────────────────────────────────────────

  function clearAll() {
    fromPoint = toPoint = routeCoords = routeStations = null;
    routeDistM = 0;
    setPickMode(null);
    clearLayers();
    // Restore all map markers
    window.__radiomapRouteFilterSignals = null;
    if (typeof window.applyFilters === 'function') window.applyFilters();
    var ids = ['route-from', 'route-to'];
    ids.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
    var corridorEl = document.getElementById('route-corridor');
    var corridorValEl = document.getElementById('route-corridor-value');
    if (corridorEl) corridorEl.value = 30;
    if (corridorValEl) corridorValEl.textContent = '30 km';
    corridorKm = 30;
  }

  // ── Panel open / close ────────────────────────────────────────

  function getToolbarHeight() {
    var host = document.querySelector('.radiomap-toolbar-host');
    return host ? host.offsetHeight : 0;
  }

  function openPanel() {
    var panel = document.getElementById('route-panel');
    if (!panel) return;
    // On desktop: slide in from left below the toolbar; on mobile: CSS handles it as a bottom sheet
    if (window.innerWidth > 768) {
      panel.style.top = getToolbarHeight() + 'px';
    } else {
      panel.style.top = '';
    }
    panel.removeAttribute('hidden');
    panel.setAttribute('aria-hidden', 'false');
    window.__radiomapRoutePanelOpen = true;
    if (typeof window.closeSidebar === 'function') window.closeSidebar();
    // Hard-hide sidebar immediately so its slide-out animation doesn't bleed behind route panel
    var sb = document.getElementById('sidebar');
    if (sb) sb.style.display = 'none';
    var btn = document.getElementById('btn-route-toggle');
    if (btn) btn.setAttribute('aria-pressed', 'true');
    var fromInput = document.getElementById('route-from');
    if (fromInput) fromInput.focus();
  }

  function closePanel() {
    var panel = document.getElementById('route-panel');
    if (!panel) return;
    panel.setAttribute('hidden', '');
    panel.setAttribute('aria-hidden', 'true');
    window.__radiomapRoutePanelOpen = false;
    // Restore sidebar visibility
    var sb = document.getElementById('sidebar');
    if (sb) sb.style.display = '';
    var btn = document.getElementById('btn-route-toggle');
    if (btn) btn.setAttribute('aria-pressed', 'false');
    clearAll();
    window.__radiomapMapClickHook = null;
  }

  // ── Wire ──────────────────────────────────────────────────────

  function wire() {
    var btnToggle = document.getElementById('btn-route-toggle');
    if (btnToggle) {
      btnToggle.addEventListener('click', function () {
        var panel = document.getElementById('route-panel');
        if (!panel || panel.hidden) {
          openPanel();
          window.__radiomapMapClickHook = handleMapClick;
        } else {
          closePanel();
        }
      });
    }

    var btnClose = document.getElementById('btn-route-panel-close');
    if (btnClose) btnClose.addEventListener('click', closePanel);

    var btnFrom = document.getElementById('btn-route-pick-from');
    if (btnFrom) {
      btnFrom.addEventListener('click', function () {
        setPickMode(pickMode === 'from' ? null : 'from');
      });
    }

    var btnTo = document.getElementById('btn-route-pick-to');
    if (btnTo) {
      btnTo.addEventListener('click', function () {
        setPickMode(pickMode === 'to' ? null : 'to');
      });
    }

    var corridorEl = document.getElementById('route-corridor');
    var corridorValEl = document.getElementById('route-corridor-value');
    if (corridorEl) {
      corridorEl.addEventListener('input', function () {
        corridorKm = parseInt(this.value, 10);
        if (corridorValEl) corridorValEl.textContent = corridorKm + ' km';
      });
    }

    var btnCalc = document.getElementById('btn-route-calculate');
    if (btnCalc) btnCalc.addEventListener('click', calculate);

    var btnClear = document.getElementById('btn-route-clear');
    if (btnClear) btnClear.addEventListener('click', clearAll);

    // Enter in text inputs triggers calculate; typing clears the saved geocoded point
    ['route-from', 'route-to'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); calculate(); return; }
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
          if (id === 'route-from') fromPoint = null; else toPoint = null;
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
