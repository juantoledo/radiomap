/**
 * Map view — Leaflet map, circles, markers, sidebar, filters
 * Requires: conference-colors.js (buildConferenceColorMap), utils.js (escapeHtml, escapeAttr), data/data.js (NODES, REGION_COLORS, VERSION), location-filter.js (getVisibleNodeIndices), dmr-ui.js (buildDmrDetailHtml), export-csv.js, theme.js, help.js, station-display.js (hasStationFieldValue), station-service-icons.js (getStationServiceType, stationServiceIconInlineHtml, …), propagation-map.js (radiomapPropagation: overlay + leyenda dBm flotante en el mapa)
 */
(function() {
  if (typeof NODES === 'undefined' || !NODES.length) return;

  if (typeof setRadiomapVersionDisplays === 'function') {
    setRadiomapVersionDisplays(typeof VERSION !== 'undefined' ? VERSION : null);
  } else if (typeof VERSION !== 'undefined') {
    var _av = document.getElementById('app-version');
    if (_av) _av.textContent = VERSION;
  }
  function getClubName(signal) { var n = NODES && NODES.find(function(x){ return x.signal === signal; }); return n ? (n.nombre || '') : ''; }
  window.getClubName = getClubName;

  function safeWebsiteUrl(w) {
    w = (w || '').trim();
    if (!/^https?:\/\//i.test(w)) return '';
    try {
      var u = new URL(w);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.href;
    } catch (e) {
      return '';
    }
  }

  function fieldShown(v) {
    if (typeof hasStationFieldValue === 'function') return hasStationFieldValue(v);
    return v != null && String(v).trim() !== '';
  }

  /** Radio fijo (km) para círculos «cobertura» en vista círculos/ambos — orientativo, no por estación. */
  const DISPLAY_CIRCLE_RADIUS_KM = 25;
  /** Máx. distancia entre coordenadas para listar «nodos cercanos» en el panel. */
  const NEIGHBOR_MAX_KM = 50;
  NODES.forEach((r,i)=>{
    r._idx = i;
    r._neighbors = [];
    if (r.lat == null || r.lon == null || (typeof r.lat !== 'number') || (typeof r.lon !== 'number')) return;
    NODES.forEach((s,j)=>{
      if(i===j) return;
      if (s.lat == null || s.lon == null || (typeof s.lat !== 'number') || (typeof s.lon !== 'number')) return;
      const d = haversine(r.lat,r.lon,s.lat,s.lon);
      if(d < NEIGHBOR_MAX_KM) r._neighbors.push({idx:j, dist:Math.round(d)});
    });
    r._neighbors.sort((a,b)=>a.dist-b.dist);
  });

  const map = L.map('map', {
    center: [-33.5, -70.6],
    zoom: 5,
    zoomControl: false,
    attributionControl: true,
  });

  const tileOpts = {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  };
  let currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', tileOpts).addTo(map);

  function setMapTiles(theme) {
    map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(
      theme === 'light' ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      tileOpts
    ).addTo(map);
  }

  /** Raster de propagación (sobre teselas, bajo círculos y marcadores). */
  const propagationLayerGroup = L.layerGroup().addTo(map);
  const circleLayer = L.layerGroup().addTo(map);
  /** Anillo casi invisible del radio «cerca de mí / referencia» (sobre cobertura, bajo marcadores). */
  const nearRadiusFilterLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);

  let propagationToggleOn = false;
  let propagationActiveSignal = null;

  function removePropagationLegend() {
    var host = document.getElementById('propagation-legend-host');
    if (host) {
      host.innerHTML = '';
      host.hidden = true;
    }
  }

  function showPropagationLegendFromNode(r) {
    removePropagationLegend();
    if (!r || typeof r.propagationDcf !== 'string' || !r.propagationDcf.trim()) return;
    var rp = window.radiomapPropagation;
    if (!rp || typeof rp.parseDcfPalette !== 'function' || typeof rp.buildPropagationLegendElement !== 'function') return;
    var stops = rp.parseDcfPalette(r.propagationDcf);
    if (!stops.length) return;
    var el = rp.buildPropagationLegendElement(stops);
    if (typeof L !== 'undefined' && L.DomEvent) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
    var host = document.getElementById('propagation-legend-host');
    if (!host) return;
    host.appendChild(el);
    host.hidden = false;
  }

  function resetPropagationSidebar() {
    propagationToggleOn = false;
    propagationActiveSignal = null;
    var propWrap = document.getElementById('propagation-actions-wrap');
    if (propWrap) propWrap.hidden = true;
    var btn = document.getElementById('btn-toggle-propagation');
    if (btn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('is-pressed');
      btn.disabled = false;
    }
    if (window.radiomapPropagation && typeof window.radiomapPropagation.clearPropagationOverlay === 'function') {
      window.radiomapPropagation.clearPropagationOverlay(propagationLayerGroup);
    }
    removePropagationLegend();
  }

  /** Nodo usado para el botón Propagación (panel abierto o propagación activa con panel cerrado). */
  function nodeForPropagationControl() {
    if (selectedIdx != null && NODES[selectedIdx]) return NODES[selectedIdx];
    if (propagationToggleOn && propagationActiveSignal) {
      var ix = NODES.findIndex(function (n) {
        return n.signal === propagationActiveSignal;
      });
      if (ix >= 0) return NODES[ix];
    }
    return null;
  }

  function nodeBySignal(sig) {
    if (!sig) return null;
    var ix = NODES.findIndex(function (n) {
      return n.signal === sig;
    });
    return ix >= 0 ? NODES[ix] : null;
  }

  function syncPropagationSidebarUI(r) {
    var propWrap = document.getElementById('propagation-actions-wrap');
    var btn = document.getElementById('btn-toggle-propagation');
    if (!r || !r.hasPropagation) {
      if (propWrap) propWrap.hidden = true;
      if (window.radiomapPropagation && typeof window.radiomapPropagation.clearPropagationOverlay === 'function') {
        window.radiomapPropagation.clearPropagationOverlay(propagationLayerGroup);
      }
      removePropagationLegend();
      propagationToggleOn = false;
      propagationActiveSignal = null;
      if (btn) {
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('is-pressed');
      }
      return;
    }
    if (propWrap) propWrap.hidden = false;
    if (btn) {
      var on = !!(propagationToggleOn && propagationActiveSignal === r.signal);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-pressed', on);
    }
  }

  /** Mantiene signal + panel lateral (sb) + propagación (prop) en la URL para recargar y compartir. */
  function syncRadiomapMapUiToUrl() {
    try {
      var u = new URL(window.location.href);
      var p = u.searchParams;
      p.delete('nosb');
      if (selectedIdx !== null && NODES[selectedIdx]) {
        var sig = NODES[selectedIdx].signal;
        p.set('signal', sig);
        var sbEl = document.getElementById('sidebar');
        var sbOpen = !!(sbEl && sbEl.classList.contains('open'));
        p.set('sb', sbOpen ? '1' : '0');
        if (propagationToggleOn && propagationActiveSignal === sig) p.set('prop', '1');
        else p.delete('prop');
      } else {
        var propSig =
          propagationToggleOn && propagationActiveSignal ? propagationActiveSignal : null;
        if (propSig) {
          p.set('signal', propSig);
          p.set('sb', '0');
          p.set('prop', '1');
        } else {
          p.delete('signal');
          p.delete('sb');
          p.delete('prop');
        }
      }
      var qs = p.toString();
      history.replaceState(null, '', u.pathname + (qs ? '?' + qs : '') + u.hash);
    } catch (eSync) { /* ignore */ }
  }

  /** Panel lateral: .open en el contenedor + inert/aria; el slide es CSS en .sidebar-panel-slide. */
  function setSidebarOpen(isOpen) {
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.classList.toggle('open', !!isOpen);
    if (isOpen) {
      sb.removeAttribute('inert');
      sb.removeAttribute('aria-hidden');
    } else {
      sb.setAttribute('inert', '');
      sb.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Dos rAF + reflow para que el navegador aplique el estado cerrado del hijo antes de .open
   * (transition translateX / translateY en .sidebar-panel-slide).
   */
  function openSidebarAfterLayout(whenOpen) {
    var sb = document.getElementById('sidebar');
    if (!sb || sb.classList.contains('open')) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        void sb.offsetWidth;
        setSidebarOpen(true);
        if (typeof whenOpen === 'function') whenOpen();
      });
    });
  }

  function syncNearRadiusFilterOverlay() {
    nearRadiusFilterLayer.clearLayers();
    var anchor = typeof getDistanceFilterAnchor === 'function' ? getDistanceFilterAnchor() : null;
    if (!anchor || typeof anchor.lat !== 'number' || typeof anchor.lon !== 'number' || isNaN(anchor.lat) || isNaN(anchor.lon)) return;
    var km = typeof getNearMeRadiusKm === 'function' ? getNearMeRadiusKm() : 100;
    if (!(km > 0)) return;
    var light = typeof getTheme === 'function' && getTheme() === 'light';
    L.circle([anchor.lat, anchor.lon], {
      radius: km * 1000,
      color: light ? 'rgba(40, 70, 120, 0.2)' : 'rgba(0, 212, 255, 0.22)',
      weight: 1,
      fillColor: light ? 'rgba(60, 100, 180, 0.035)' : 'rgba(0, 212, 255, 0.04)',
      fillOpacity: 1,
      interactive: false,
      bubblingMouseEvents: false,
    }).addTo(nearRadiusFilterLayer);
  }

  setMapTiles(getTheme());
  window.onThemeChange = function(theme) {
    setMapTiles(theme);
    syncNearRadiusFilterOverlay();
  };

  let currentMode = 'markers';
  let selectedIdx = null;
  let visibleSet = new Set(NODES.map(r=>r._idx));

  const regionNames = sortRegionKeysChile(Object.keys(REGION_COLORS || {}).filter(Boolean));
  const filterRegion = document.getElementById('filter-region');
  if (filterRegion) {
    regionNames.forEach(reg => {
      const label = document.createElement('label');
      label.className = 'filter-checkbox-row';
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.setAttribute('data-filter-value', reg);
      label.appendChild(inp);
      label.appendChild(document.createTextNode(' ' + reg));
      filterRegion.appendChild(label);
    });
  }
  var _confColorMap = typeof buildConferenceColorMap === 'function' ? buildConferenceColorMap(NODES) : { sortedNames: [], colors: {} };
  const sortedConferenceNames = _confColorMap.sortedNames;
  const CONFERENCE_COLORS = _confColorMap.colors;
  const filterConf = document.getElementById('filter-conference');
  if (filterConf) {
    sortedConferenceNames.forEach(function (c) {
      const label = document.createElement('label');
      label.className = 'filter-checkbox-row';
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.setAttribute('data-filter-value', c);
      const swatch = document.createElement('span');
      swatch.className = 'filter-conference-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.background = CONFERENCE_COLORS[c] || '#888888';
      label.appendChild(inp);
      label.appendChild(swatch);
      label.appendChild(document.createTextNode(' ' + c));
      filterConf.appendChild(label);
    });
  }
  if (typeof loadFilterState === 'function') loadFilterState();
  if (typeof syncFilterTypeOptionsAvailability === 'function') syncFilterTypeOptionsAvailability();

  /** Fit map to stations matching current filters (lat/lon only). Optionally include distance anchor in bounds. */
  const FIT_BOUNDS_PADDING = [40, 40];
  const FIT_BOUNDS_MAX_ZOOM = 17;

  function fitMapToCriteriaPoints(visibleNodes, distAnchor) {
    var withCoords = visibleNodes.filter(function (r) {
      return (
        r.lat != null &&
        r.lon != null &&
        typeof r.lat === 'number' &&
        typeof r.lon === 'number' &&
        !isNaN(r.lat) &&
        !isNaN(r.lon)
      );
    });
    if (withCoords.length === 0) {
      if (distAnchor && typeof distAnchor.lat === 'number' && typeof distAnchor.lon === 'number' && !isNaN(distAnchor.lat) && !isNaN(distAnchor.lon)) {
        map.setView([distAnchor.lat, distAnchor.lon], 10);
      } else {
        try {
          map.fitBounds(
            [
              [-55, -76],
              [-17, -66],
            ],
            { padding: FIT_BOUNDS_PADDING }
          );
        } catch (e) { /* ignore */ }
      }
      return;
    }
    var bounds = L.latLngBounds(withCoords.map(function (r) { return [r.lat, r.lon]; }));
    if (distAnchor && typeof distAnchor.lat === 'number' && typeof distAnchor.lon === 'number' && !isNaN(distAnchor.lat) && !isNaN(distAnchor.lon)) {
      bounds.extend([distAnchor.lat, distAnchor.lon]);
    }
    if (withCoords.length === 1 && !distAnchor) {
      map.setView([withCoords[0].lat, withCoords[0].lon], 12);
      return;
    }
    if (withCoords.length === 1 && distAnchor) {
      try {
        bounds.pad(0.2);
      } catch (e) { /* ignore */ }
    }
    try {
      if (bounds.isValid()) map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, maxZoom: FIT_BOUNDS_MAX_ZOOM });
    } catch (e) { /* ignore */ }
  }

  function hexToRgb(hex){
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return r+','+g+','+b;
  }
  /** Para sombras de marcador cuando el color es hsl(...) */
  function hslStringToRgbComma(hsl) {
    if (!hsl || typeof hsl !== 'string') return '128,128,128';
    var m = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(hsl.trim());
    if (!m) return '128,128,128';
    var h = parseFloat(m[1]) / 360;
    var s = parseFloat(m[2]) / 100;
    var l = parseFloat(m[3]) / 100;
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var r = hue2rgb(p, q, h + 1 / 3);
    var g = hue2rgb(p, q, h);
    var b = hue2rgb(p, q, h - 1 / 3);
    return Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255);
  }

  const SPREAD_RADIUS_DEG = 0.0005; // ~55m — offset for co-located markers
  function buildDisplayPositions(){
    const locGroups = new Map();
    NODES.forEach(r=>{
      if (r.lat == null || r.lon == null || !visibleSet.has(r._idx)) return;
      const key = r.lat.toFixed(6) + '_' + r.lon.toFixed(6);
      if (!locGroups.has(key)) locGroups.set(key, []);
      locGroups.get(key).push(r._idx);
    });
    const displayPos = new Map();
    locGroups.forEach((indices)=>{
      if (indices.length <= 1) {
        indices.forEach(i=> displayPos.set(i, [NODES[i].lat, NODES[i].lon]));
      } else {
        indices.forEach((idx, j)=>{
          const r = NODES[idx];
          const angle = (2 * Math.PI * j) / indices.length;
          const latRad = r.lat * Math.PI / 180;
          const dLat = SPREAD_RADIUS_DEG * Math.cos(angle);
          const dLon = SPREAD_RADIUS_DEG * Math.sin(angle) / Math.cos(latRad);
          displayPos.set(idx, [r.lat + dLat, r.lon + dLon]);
        });
      }
    });
    return displayPos;
  }

  function renderAll(){
    circleLayer.clearLayers();
    markerLayer.clearLayers();
    const displayPos = buildDisplayPositions();

    var critMarkers = typeof getFilterCriteria === 'function' ? getFilterCriteria() : { conferences: [] };
    var useConferenceColors =
      critMarkers.conferences &&
      critMarkers.conferences.length > 0;

    NODES.forEach(r=>{
      if (r.lat == null || r.lon == null) return;
      const visible = visibleSet.has(r._idx);
      const confTrim = (r.conference || '').trim();
      let color = REGION_COLORS[r.region] || '#5e35b1';
      let rgb = hexToRgb(color);
      if (useConferenceColors && critMarkers.conferences.indexOf(confTrim) >= 0 && CONFERENCE_COLORS[confTrim]) {
        color = CONFERENCE_COLORS[confTrim];
        rgb = hslStringToRgbComma(color);
      }
      const isSelected = r._idx === selectedIdx;
      const isNeighbor = selectedIdx !== null && NODES[selectedIdx]._neighbors.some(n=>n.idx===r._idx);
      const [mLat, mLon] = displayPos.has(r._idx) ? displayPos.get(r._idx) : [r.lat, r.lon];

      if(currentMode === 'circles' || currentMode === 'both'){
        let fillOp, strokeOp, weight, dashArr;
        if(selectedIdx === null){ fillOp = 0.07; strokeOp = 0.35; weight = 1; dashArr = null; }
        else if(isSelected){ fillOp = 0.18; strokeOp = 0.9; weight = 2; dashArr = null; }
        else if(isNeighbor){ fillOp = 0.04; strokeOp = 0.2; weight = 1; dashArr = '4 4'; }
        else { fillOp = 0.02; strokeOp = 0.07; weight = 0.5; dashArr = null; }

        const circle = L.circle([r.lat, r.lon], {
          radius: DISPLAY_CIRCLE_RADIUS_KM * 1000,
          color: 'rgba('+rgb+','+strokeOp+')',
          fillColor: 'rgba('+rgb+','+fillOp+')',
          fillOpacity: 1, weight: weight, dashArray: dashArr, interactive: false,
        });
        if(visible) circle.addTo(circleLayer);
      }

      if(currentMode === 'markers' || currentMode === 'both'){
        const size = isSelected ? 14 : 9;
        const isEch = r.isEcholink;
        const isDmr = r.isDMR && !isEch;
        const svcT = !isEch && !isDmr && typeof getStationServiceType === 'function' ? getStationServiceType(r) : '';
        let shape = 'border-radius:50%';
        let inner = '';
        let extraClass = '';
        if (isEch) {
          shape = 'border-radius:3px';
          inner = '<span style="color:rgba(255,255,255,0.95);font:600 '+(size*0.6)+'px/1 sans-serif;pointer-events:none">e</span>';
          extraClass = ' rpt-marker-echolink';
        } else if (isDmr) {
          shape = 'border-radius:3px;transform:rotate(45deg)';
          inner = '<span style="color:rgba(255,255,255,0.95);font:600 '+(size*0.55)+'px/1 sans-serif;pointer-events:none;transform:rotate(-45deg)">d</span>';
          extraClass = ' rpt-marker-dmr';
        } else if (svcT && typeof stationServiceMarkerInnerHtml === 'function') {
          inner = stationServiceMarkerInnerHtml(svcT, size * 0.58);
          extraClass = ' rpt-marker-service rpt-marker-service--' + svcT;
        }
        const icon = L.divIcon({
          className: '',
          html: '<div class="rpt-marker' + (isSelected?' selected':'') + extraClass + '" style="background:' + color + ';width:'+size+'px;height:'+size+'px;'+shape+';border:2px solid rgba(255,255,255,'+(isSelected?'0.9':'0.35')+');box-shadow:0 0 '+(isSelected?'8px':'3px')+' rgba('+rgb+',0.6);display:flex;align-items:center;justify-content:center;">'+inner+'</div>',
          iconSize: [size, size], iconAnchor: [size/2, size/2],
        });
        const marker = L.marker([mLat, mLon], { icon, zIndexOffset: isSelected ? 1000 : 0 });
        marker.on('click', ()=>{ selectRepeater(r._idx, 'map_marker'); });
        const club = r.nombre || getClubName(r.signal);
        const confT = (r.conference || '').trim();
        const echolinkLine = r.isEcholink ? '<br><span class="rpt-tooltip-meta">Echolink' + (fieldShown(confT) ? ' · ' + escapeHtml(confT) : '') + '</span>' : '';
        const dmrLine = r.isDMR && !r.isEcholink ? '<br><span class="rpt-tooltip-meta">DMR' + (fieldShown(confT) ? ' · ' + escapeHtml(confT) : '') + '</span>' : '';
        const sigLead = typeof stationServiceIconInlineHtml === 'function' ? stationServiceIconInlineHtml(r, '') : '';
        const locParts = [];
        if (fieldShown(r.comuna)) locParts.push(escapeHtml(r.comuna));
        if (fieldShown(r.banda)) locParts.push(escapeHtml(r.banda));
        const locLine = locParts.length ? '<br><span class="rpt-tooltip-meta">' + locParts.join(' · ') + '</span>' : '';
        const freqParts = [];
        if (fieldShown(r.rx)) freqParts.push('RX ' + escapeHtml(String(r.rx)));
        if (fieldShown(r.tx)) freqParts.push('TX ' + escapeHtml(String(r.tx)));
        if (fieldShown(r.tono)) freqParts.push(escapeHtml(String(r.tono)) + ' Hz');
        const freqLine = freqParts.length ? '<br><span class="rpt-tooltip-freq">' + freqParts.join(' · ') + '</span>' : '';
        const tooltipHtml = '<div class="rpt-tooltip-inner">' +
          sigLead + escapeHtml(r.signal) + (fieldShown(club) ? '<br><span class="rpt-tooltip-club">' + escapeHtml(club) + '</span>' : '') +
          locLine + freqLine + echolinkLine + dmrLine + '</div>';
        marker.bindTooltip(tooltipHtml, { permanent: false, direction: 'top', opacity: 1, className: 'rpt-tooltip' });
        if(visible) marker.addTo(markerLayer);
      } else {
        const icon = L.divIcon({
          className: '',
          html: '<div style="width:16px;height:16px;border-radius:50%;cursor:pointer;"></div>',
          iconSize: [16,16], iconAnchor: [8,8],
        });
        const clickTarget = L.marker([mLat, mLon], { icon, opacity: 0 });
        clickTarget.on('click', ()=>selectRepeater(r._idx, 'map_marker'));
        if(visible) clickTarget.addTo(markerLayer);
      }
    });
    updateMapEmptyOverlay();
    syncNearRadiusFilterOverlay();
  }

  function updateMapEmptyOverlay() {
    const el = document.getElementById('map-empty-overlay');
    if (!el) return;
    if (visibleSet.size === 0) {
      el.innerHTML = typeof buildGuidedEmptyStateHtml === 'function'
        ? buildGuidedEmptyStateHtml()
        : '<div class="no-results no-results--guided"><p class="no-results-title">Sin resultados</p><button type="button" class="btn-clear-filters" onclick="clearAllFilters()">Limpiar filtros</button></div>';
      el.hidden = false;
    } else {
      el.hidden = true;
      el.innerHTML = '';
    }
  }

  function setMode(mode){
    currentMode = mode;
    ['markers','circles','both'].forEach(function (m) {
      var el = document.getElementById('btn-' + m);
      if (el) el.classList.toggle('active', m === mode);
    });
    renderAll();
  }

  let userMarker = null;

  /** @returns {number|null} index in NODES */
  function findNearestVisibleNodeIndex(userLat, userLon) {
    let best = null;
    let bestD = Infinity;
    visibleSet.forEach(function (i) {
      const r = NODES[i];
      if (r.lat == null || r.lon == null || typeof r.lat !== 'number' || typeof r.lon !== 'number') return;
      const d = haversine(userLat, userLon, r.lat, r.lon);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  function showUserLocationSidebar(lat, lon) {
    resetPropagationSidebar();
    selectedIdx = null;
    if (typeof clearRadiusRefSignal === 'function') clearRadiusRefSignal();
    renderAll();
    const sidebar = document.getElementById('sidebar');
    const sbSig = document.getElementById('sb-signal');
    const sbClub = document.getElementById('sb-club');
    const body = document.getElementById('sb-body');
    if (!sidebar || !sbSig || !sbClub || !body) return;
    sbSig.classList.remove('sidebar-signal--with-web', 'sidebar-signal--service');
    sbSig.textContent = 'Tu ubicación';
    sbSig.style.color = '#00d4ff';
    sbClub.textContent = lat.toFixed(5) + ', ' + lon.toFixed(5);
    body.innerHTML =
      '<div class="sb-detail-grid">' +
      '<div class="sb-row"><span class="sb-key">Filtro</span><span class="sb-val">Cerca de mí</span></div>' +
      '</div>' +
      '<p class="sb-nearme-hint">No hay repetidoras visibles aquí. Ajusta filtros o la búsqueda.</p>';
    if (typeof window.__radiomapCloseMapFilterSheet === 'function') window.__radiomapCloseMapFilterSheet();
    openSidebarAfterLayout(syncRadiomapMapUiToUrl);
  }

  function toggleNearMe(){
    const loc = getNearMeLocation();
    if(loc){
      clearNearMeLocation();
      if(userMarker) { map.removeLayer(userMarker); userMarker = null; }
      updateNearMeButtonState();
      applyFilters();
      if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
      return;
    }
    if(!navigator.geolocation){ alert('Tu navegador no soporta geolocalización.'); return; }
    const btn = document.getElementById('btn-nearme');
    if(btn) btn.disabled = true;
    requestNearMeLocation(
      function(lat, lon){
        if(userMarker) map.removeLayer(userMarker);
        userMarker = L.marker([lat, lon], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div style="width:16px;height:16px;border-radius:50%;background:#00d4ff;border:3px solid #fff;box-shadow:0 0 8px rgba(0,212,255,0.6);"></div>',
            iconSize: [16,16], iconAnchor: [8,8]
          })
        }).addTo(map).bindTooltip('Tu ubicación', { permanent: false, direction: 'top' });
        updateNearMeButtonState();
        selectedIdx = null;
        applyFilters();
        const nearest = findNearestVisibleNodeIndex(lat, lon);
        if (nearest !== null) {
          selectRepeater(nearest, 'near_me');
        } else {
          showUserLocationSidebar(lat, lon);
        }
        if(btn) btn.disabled = false;
        if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
      },
      function(){
        if(btn) btn.disabled = false;
        alert('No se pudo obtener tu ubicación. Verifica que el permiso esté concedido.');
      }
    );
  }
  window.toggleNearMe = toggleNearMe;

  function applyFilters(opts){
    opts = opts || {};
    const distAnchor = typeof getDistanceFilterAnchor === 'function' ? getDistanceFilterAnchor() : null;
    const visibleIndices = getVisibleNodeIndices();
    visibleSet = new Set(visibleIndices);
    const visibleNodes = visibleIndices.map(function (i) { return NODES[i]; });
    var clearedSelection = false;
    if (selectedIdx !== null && !visibleSet.has(selectedIdx)) {
      selectedIdx = null;
      clearedSelection = true;
      resetPropagationSidebar();
      setSidebarOpen(false);
    }
    document.getElementById('shown-count').textContent = visibleSet.size;
    document.getElementById('total-count').textContent = NODES.length;
    document.getElementById('regions-count').textContent = new Set(visibleNodes.map(r => r.region || '')).size;
    document.getElementById('clubs-count').textContent = new Set(visibleNodes.map(r => r.nombre).filter(Boolean)).size;
    document.getElementById('filter-nearme').textContent =
      typeof formatNearMeFilterSuffix === 'function' ? formatNearMeFilterSuffix() : (distAnchor ? ' · filtro distancia' : '');
    if (typeof saveFilterState === 'function') saveFilterState();
    if (typeof syncNearRadiusControl === 'function') syncNearRadiusControl();
    renderAll();
    if (selectedIdx !== null && !opts.skipSidebar) showSidebar(selectedIdx);
    if (selectedIdx !== null && NODES[selectedIdx]) {
      syncPropagationSidebarUI(NODES[selectedIdx]);
    }
    if (!opts.skipFitBounds) {
      fitMapToCriteriaPoints(visibleNodes, distAnchor);
    }
    if (clearedSelection) syncRadiomapMapUiToUrl();
  }
  window.applyFilters = applyFilters;

  const searchEl = document.getElementById('search');
  if (searchEl) {
    const debouncedApply = typeof debounce === 'function'
      ? debounce(function () {
          applyFilters();
          if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
        }, 200)
      : function () {
          applyFilters();
          if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
        };
    searchEl.addEventListener('input', debouncedApply);
    function isMapOverlayOpen() {
      const help = document.getElementById('help-overlay');
      return !!(help && help.classList.contains('open'));
    }
    function isMapFilterSheetOpen() {
      return document.body.classList.contains('map-filter-sheet-open');
    }
    function activeElementIsEditable() {
      const el = document.activeElement;
      if (!el || el.nodeType !== 1) return false;
      const tag = el.nodeName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    }
    document.addEventListener('keydown', function focusSearchOnPrintableKey(e) {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      if (activeElementIsEditable()) return;
      if (isMapOverlayOpen()) return;
      if (isMapFilterSheetOpen()) return;
      if (e.key === ' ' && document.activeElement && document.activeElement.matches &&
          document.activeElement.matches('button, [role="button"], a[href], summary')) return;

      e.preventDefault();
      searchEl.focus();
      const start = searchEl.selectionStart != null ? searchEl.selectionStart : searchEl.value.length;
      const end = searchEl.selectionEnd != null ? searchEl.selectionEnd : searchEl.value.length;
      const val = searchEl.value;
      searchEl.value = val.slice(0, start) + e.key + val.slice(end);
      searchEl.setSelectionRange(start + 1, start + 1);
      searchEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function selectRepeater(idx, interaction, openOpts){
    openOpts = openOpts || {};
    var prevIdx = selectedIdx;
    var prevSig = prevIdx !== null && NODES[prevIdx] ? NODES[prevIdx].signal : null;
    selectedIdx = idx;
    const r = NODES[idx];
    var newSig = r ? r.signal : null;
    if (prevSig != null && newSig != null && prevSig !== newSig) {
      propagationToggleOn = false;
      propagationActiveSignal = null;
      if (window.radiomapPropagation && typeof window.radiomapPropagation.clearPropagationOverlay === 'function') {
        window.radiomapPropagation.clearPropagationOverlay(propagationLayerGroup);
      }
      removePropagationLegend();
    }
    if (r && typeof window.radiomapGaStationSelect === 'function') {
      window.radiomapGaStationSelect(r.signal, interaction || 'select');
    }
    if (typeof setRadiusRefSignal === 'function') {
      if (r && r.lat != null && r.lon != null && typeof r.lat === 'number' && typeof r.lon === 'number') {
        setRadiusRefSignal(r.signal);
      } else if (typeof clearRadiusRefSignal === 'function') {
        clearRadiusRefSignal();
      }
    }
    applyFilters({ skipFitBounds: true, skipSidebar: !!openOpts.skipSidebar });
    if (openOpts.skipSidebar) syncRadiomapMapUiToUrl();
  }

  function showSidebar(idx){
    const r = NODES[idx];
    const color = REGION_COLORS[r.region] || '#5e35b1';
    const club = r.nombre || getClubName(r.signal);
    var sbSig = document.getElementById('sb-signal');
    var wurl = safeWebsiteUrl(r.website);
    var hasSvc = typeof hasStationServiceType === 'function' ? hasStationServiceType(r) : !!r.isAir;
    sbSig.classList.toggle('sidebar-signal--service', hasSvc);
    var svcPre = typeof stationServiceIconInlineHtml === 'function' ? stationServiceIconInlineHtml(r, '') : '';
    if (wurl) {
      sbSig.classList.add('sidebar-signal--with-web');
      sbSig.innerHTML =
        svcPre +
        '<span class="sidebar-signal-text">' +
        escapeHtml(r.signal) +
        '</span><a href="' +
        escapeAttr(wurl) +
        '" class="station-website-link" target="_blank" rel="noopener noreferrer" aria-label="Sitio web del club" title="Sitio web"><span class="material-symbols-outlined" aria-hidden="true">language</span></a>';
      var st = sbSig.querySelector('.sidebar-signal-text');
      if (st) st.style.color = color;
      sbSig.style.color = '';
    } else if (hasSvc) {
      sbSig.classList.remove('sidebar-signal--with-web');
      sbSig.innerHTML = svcPre + '<span class="sidebar-signal-text">' + escapeHtml(r.signal) + '</span>';
      var stA = sbSig.querySelector('.sidebar-signal-text');
      if (stA) stA.style.color = color;
      sbSig.style.color = '';
    } else {
      sbSig.classList.remove('sidebar-signal--with-web');
      sbSig.textContent = r.signal;
      sbSig.style.color = color;
    }
    var sbClubLine = [];
    if (fieldShown(club)) sbClubLine.push(club);
    if (fieldShown(r.region)) sbClubLine.push(r.region);
    if (fieldShown(r.comuna)) sbClubLine.push(r.comuna);
    document.getElementById('sb-club').textContent = sbClubLine.join(' · ');

    const body = document.getElementById('sb-body');
    const rows = [];
    if (fieldShown(club)) rows.push(['CLUB', escapeHtml(club)]);
    if (fieldShown(r.region)) rows.push(['Región', escapeHtml(r.region)]);
    if (fieldShown(r.comuna)) rows.push(['COMUNA', escapeHtml(r.comuna)]);
    if (fieldShown(r.banda)) {
      rows.push([
        'BANDA',
        '<span style="color:' + (String(r.banda).startsWith('VHF') ? '#29abe2' : '#e91e8c') + '">' + r.banda + '</span>',
      ]);
    }
    if (fieldShown(r.rx)) rows.push(['RX (MHz)', '<span class="sb-freq-val">' + escapeHtml(String(r.rx)) + '</span>']);
    if (fieldShown(r.tx)) rows.push(['TX (MHz)', '<span class="sb-freq-val">' + escapeHtml(String(r.tx)) + '</span>']);
    if (fieldShown(r.tono)) rows.push(['TONO', '<span class="sb-freq-val">' + escapeHtml(String(r.tono)) + ' Hz</span>']);
    if (fieldShown(r.potencia)) rows.push(['POTENCIA', escapeHtml(String(r.potencia)) + ' W']);
    if (fieldShown(r.ganancia)) rows.push(['GANANCIA', escapeHtml(String(r.ganancia)) + ' dBi']);
    if (fieldShown(r.ubicacion)) rows.push(['UBICACIÓN', escapeHtml(r.ubicacion)]);
    if (fieldShown(r.labels)) {
      const labelsHtml =
        typeof formatStationLabelsHtml === 'function'
          ? formatStationLabelsHtml(r.labels)
          : escapeHtml(String(r.labels));
      rows.push(['ETIQUETAS', labelsHtml]);
    }
    if (fieldShown(r.notes)) {
      const notesHtml = String(r.notes)
        .split(/\r?\n/)
        .map(function (line) {
          return escapeHtml(line);
        })
        .join('<br>');
      rows.push(['NOTAS', '<span class="sb-notes">' + notesHtml + '</span>']);
    }
    if (fieldShown(r.vence)) rows.push(['VENCE', escapeHtml(r.vence)]);
    if (r.isEcholink) {
      const ccf = (r.conference || '').trim();
      rows.push(['ECHOLINK', '<span class="badge-echolink">Sí</span>' + (fieldShown(ccf) ? ' · ' + escapeHtml(ccf) : '')]);
    }
    if (r.isDMR && !r.isEcholink) {
      const ccfD = (r.conference || '').trim();
      rows.push([
        'DMR',
        typeof buildDmrDetailHtml === 'function'
          ? buildDmrDetailHtml(r, 'sidebar')
          : '<span class="badge-dmr">DMR</span>' +
            (fieldShown(ccfD) ? ' · ' + escapeHtml(ccfD) : ''),
      ]);
    }

    let html = '<div class="sb-detail-grid">' + rows.map(([k,v])=>'<div class="sb-row"><span class="sb-key">'+k+'</span><span class="sb-val">'+v+'</span></div>').join('') + '</div>';

    const filteredNeighbors = [{idx: idx, dist: 0}, ...r._neighbors.filter(n=>visibleSet.has(n.idx))].sort((a,b)=>a.dist-b.dist);
    if(filteredNeighbors.length > 0){
      html += '<div class="sb-section-title">NODOS CERCANOS <span class="sb-neighbor-actions"><a href="#" class="sb-download-neighbors" onclick="downloadNeighborsCSV();return false" title="Descargar nodos cercanos como CSV"><span class="material-symbols-outlined" aria-hidden="true">download</span> CSV</a><a href="#" class="sb-share-neighbors" onclick="shareNeighbors();return false" title="Compartir enlace con filtros, mapa y esta repetidora (panel de nodos cercanos)"><span class="material-symbols-outlined" aria-hidden="true">share</span> Compartir</a></span></div>';
      html += filteredNeighbors.map(n=>{
        const nb = NODES[n.idx];
        const nc = REGION_COLORS[nb.region]||'#5e35b1';
        const freqPartsN = [];
        if (fieldShown(nb.rx)) freqPartsN.push('RX ' + escapeHtml(String(nb.rx)));
        if (fieldShown(nb.tx)) freqPartsN.push('TX ' + escapeHtml(String(nb.tx)));
        if (fieldShown(nb.tono)) freqPartsN.push(escapeHtml(String(nb.tono)) + ' Hz');
        const details = freqPartsN.join(' · ');
        const rawClubN = (nb.nombre || getClubName(nb.signal) || '').trim();
        const metaPieces = [];
        if (fieldShown(rawClubN)) metaPieces.push(rawClubN);
        if (fieldShown(nb.comuna)) metaPieces.push(String(nb.comuna).trim());
        const metaLabel = metaPieces.join(' · ');
        const metaHtml = metaLabel
          ? '<div class="neighbor-meta" title="' + escapeAttr(metaLabel) + '">' + escapeHtml(metaLabel) + '</div>'
          : '';
        const detailsHtml = details
          ? '<div class="neighbor-details"><span class="neighbor-freq-values">' + details + '</span></div>'
          : '';
        const isSelected = n.idx === idx;
        const distStr = n.dist === 0 ? '0 km' : n.dist+' km';
        var neighborSvc = typeof stationServiceNeighborDotHtml === 'function' ? stationServiceNeighborDotHtml(nb, nc) : '';
        const dotEl = nb.isEcholink
          ? '<div class="neighbor-echolink" style="background:'+nc+'" title="Echolink">e</div>'
          : nb.isDMR
          ? '<div class="neighbor-dmr" style="background:'+nc+'" title="DMR"><span class="neighbor-dmr-letter" aria-hidden="true">d</span></div>'
          : neighborSvc
          ? neighborSvc
          : '<div class="neighbor-dot" style="background:'+nc+'"></div>';
        return '<div class="neighbor-row'+(isSelected?' neighbor-selected':'')+'" onclick="selectRepeater('+n.idx+',\'neighbor\')" tabindex="0" role="button" data-idx="'+n.idx+'" aria-label="'+escapeAttr(nb.signal)+(isSelected?' (este)':'')+'">' +
          dotEl +
          '<div class="neighbor-main"><span class="neighbor-signal">'+escapeHtml(nb.signal)+(isSelected?' (este)':'')+'</span>' +
          metaHtml +
          detailsHtml + '</div>' +
          '<span class="neighbor-dist">'+distStr+'</span></div>';
      }).join('');
    }

    body.innerHTML = html;
    if (typeof window.__radiomapCloseMapFilterSheet === 'function') window.__radiomapCloseMapFilterSheet();
    var sbPanel = document.getElementById('sidebar');
    if (sbPanel && !sbPanel.classList.contains('open')) {
      openSidebarAfterLayout(syncRadiomapMapUiToUrl);
    } else {
      syncRadiomapMapUiToUrl();
    }
  }

  function downloadNeighborsCSV(){
    if(selectedIdx == null) return;
    const r = NODES[selectedIdx];
    const filteredNeighbors = [{idx: selectedIdx, dist: 0}, ...(r._neighbors || []).filter(n=>visibleSet.has(n.idx))].sort((a,b)=>a.dist-b.dist);
    if(filteredNeighbors.length === 0) return;
    const esc = v => (v == null || v === '') ? '' : (''+v).includes(',') || (''+v).includes('"') ? '"' + (''+v).replace(/"/g, '""') + '"' : ''+v;
    const headers = ['Repetidor','Señal nodo cercano','Club','Región','Comuna','RX (MHz)','TX (MHz)','Tono (Hz)','Banda','Etiquetas','Distancia (km)'];
    const rows = filteredNeighbors.map(n=>{
      const nb = NODES[n.idx];
      return [r.signal, nb.signal, nb.nombre || getClubName(nb.signal), nb.region, nb.comuna || '', nb.rx || '', nb.tx || '', nb.tono || '', nb.banda || '', nb.labels || '', n.dist];
    });
    const csv = [headers.join(','), ...rows.map(row=>row.map(esc).join(','))].join('\n');
    const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nodos-cercanos-' + r.signal.replace(/\s+/g,'-') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function shareNeighbors(){
    if(selectedIdx == null) return;
    const r = NODES[selectedIdx];
    const filteredNeighbors = [{idx: selectedIdx, dist: 0}, ...(r._neighbors || []).filter(n=>visibleSet.has(n.idx))].sort((a,b)=>a.dist-b.dist);
    if(filteredNeighbors.length === 0) return;
    /** Same as “Compartir vista”: filtros, cerca de mí, mapa (mlat/mlon/zoom/mode) y signal de la repetidora abierta → al abrir se selecciona y se ve “Nodos cercanos”. */
    if (typeof radiomapPerformShare === 'function') {
      radiomapPerformShare({ title: r.signal || 'Radiomap' });
      return;
    }
    const urlStr = typeof buildShareViewURL === 'function' ? buildShareViewURL() : window.location.href;
    const title = r.signal || 'Radiomap';
    const text = '¡Hola! Te comparto esta vista del mapa de estaciones de radio en Chile: ' + urlStr;
    if (navigator.share) {
      navigator.share({ title, text, url: urlStr }).catch(function () {
        if (typeof fallbackCopyShareUrl === 'function') fallbackCopyShareUrl(urlStr);
      });
    } else if (typeof fallbackCopyShareUrl === 'function') {
      fallbackCopyShareUrl(urlStr);
    } else {
      try {
        navigator.clipboard.writeText(urlStr).then(function () { alert('Enlace copiado al portapapeles.'); });
      } catch (e) {
        window.prompt('Copia este enlace:', urlStr);
      }
    }
  }

  function closeSidebar(){
    var keepPropagation =
      selectedIdx !== null &&
      NODES[selectedIdx] &&
      propagationToggleOn &&
      propagationActiveSignal === NODES[selectedIdx].signal;
    if (!keepPropagation) {
      resetPropagationSidebar();
    }
    setSidebarOpen(false);
    selectedIdx = null;
    renderAll();
    if (keepPropagation && propagationActiveSignal) {
      var rKeep = nodeBySignal(propagationActiveSignal);
      if (rKeep) syncPropagationSidebarUI(rKeep);
    }
    syncRadiomapMapUiToUrl();
  }

  /** Clic en el mapa (no en marcador): cerrar panel y quitar repetidora como referencia de distancia. GPS «cerca de mí» no se toca. */
  map.on('click', function () {
    var hadSelection = selectedIdx !== null;
    var hadRef = typeof getRadiusRefSignal === 'function' && !!getRadiusRefSignal();
    if (!hadSelection && !hadRef) return;
    if (hadSelection) {
      resetPropagationSidebar();
      setSidebarOpen(false);
      selectedIdx = null;
    }
    if (hadRef && typeof clearRadiusRefSignal === 'function') clearRadiusRefSignal();
    if (typeof applyFilters === 'function') applyFilters({ skipFitBounds: true });
    if (hadSelection || hadRef) syncRadiomapMapUiToUrl();
  });

  function closeMenuMap() {
    const menu = document.getElementById('header-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu) menu.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  (function wireMapFilterBottomSheet() {
    if (typeof window.radiomapWireFilterBottomSheet !== 'function') return;
    function invalidateMapSizeSoon() {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
        });
      });
    }
    window.radiomapWireFilterBottomSheet({
      detailsId: 'map-filters-details',
      closeMenu: closeMenuMap,
      onLayout: invalidateMapSizeSoon
    });
  })();

  var menuToggleEl = document.getElementById('menu-toggle');
  if (menuToggleEl) {
    menuToggleEl.addEventListener('click', function () {
      const menu = document.getElementById('header-menu');
      if (!menu) return;
      const open = menu.classList.toggle('open');
      this.setAttribute('aria-expanded', open);
    });
  }
  document.addEventListener('click', function (e) {
    const menu = document.getElementById('header-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu && menu.classList.contains('open') && toggle && !menu.contains(e.target) && !toggle.contains(e.target)) closeMenuMap();
  });

  (function wireNeighborKeyboard() {
    var sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest('.neighbor-row');
      if (!row) return;
      var idx = parseInt(row.getAttribute('data-idx'), 10);
      if (!isNaN(idx)) {
        e.preventDefault();
        selectRepeater(idx, 'neighbor');
      }
    });
  })();

  function applyPropagationFromUrlIfNeeded() {
    if (selectedIdx == null || !window.radiomapPropagation) return;
    var r = NODES[selectedIdx];
    if (!r || !r.hasPropagation) return;
    var rp = window.radiomapPropagation;
    var btn = document.getElementById('btn-toggle-propagation');
    propagationToggleOn = true;
    propagationActiveSignal = r.signal;
    if (btn) btn.disabled = true;
    rp.showPropagationOverlay(propagationLayerGroup, r.signal, { opacity: 0.45 })
      .then(function () {
        if (btn) {
          btn.setAttribute('aria-pressed', 'true');
          btn.classList.add('is-pressed');
          btn.disabled = false;
        }
        var rDone = nodeBySignal(propagationActiveSignal);
        if (rDone) showPropagationLegendFromNode(rDone);
        setSidebarOpen(false);
        closeMenuMap();
        if (rDone) syncPropagationSidebarUI(rDone);
        syncRadiomapMapUiToUrl();
      })
      .catch(function (err) {
        console.error(err);
        propagationToggleOn = false;
        propagationActiveSignal = null;
        rp.clearPropagationOverlay(propagationLayerGroup);
        removePropagationLegend();
        if (btn) btn.disabled = false;
        syncRadiomapMapUiToUrl();
      });
  }

  (function wirePropagationToggle() {
    var btn = document.getElementById('btn-toggle-propagation');
    if (!btn || !window.radiomapPropagation) return;
    btn.addEventListener('click', function () {
      var r = nodeForPropagationControl();
      if (!r || !r.hasPropagation) return;
      var rp = window.radiomapPropagation;
      var pressed = btn.getAttribute('aria-pressed') === 'true';
      if (pressed) {
        propagationToggleOn = false;
        propagationActiveSignal = null;
        rp.clearPropagationOverlay(propagationLayerGroup);
        removePropagationLegend();
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('is-pressed');
        syncPropagationSidebarUI(nodeForPropagationControl());
        syncRadiomapMapUiToUrl();
        return;
      }
      btn.disabled = true;
      propagationToggleOn = true;
      propagationActiveSignal = r.signal;
      rp.showPropagationOverlay(propagationLayerGroup, r.signal, { opacity: 0.45 })
        .then(function () {
          btn.setAttribute('aria-pressed', 'true');
          btn.classList.add('is-pressed');
          var rDone = nodeBySignal(propagationActiveSignal);
          if (rDone) showPropagationLegendFromNode(rDone);
          setSidebarOpen(false);
          closeMenuMap();
          if (rDone) syncPropagationSidebarUI(rDone);
          syncRadiomapMapUiToUrl();
        })
        .catch(function (err) {
          console.error(err);
          propagationToggleOn = false;
          propagationActiveSignal = null;
          rp.clearPropagationOverlay(propagationLayerGroup);
          removePropagationLegend();
          alert('No se pudo cargar el mapa de propagación.');
          syncRadiomapMapUiToUrl();
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  })();

  function getExportCriteria() {
    return typeof getExportFilterCriteria === 'function' ? getExportFilterCriteria() : { search: '', nearMe: !!(typeof getDistanceFilterAnchor === 'function' && getDistanceFilterAnchor()), bandas: [], regions: [], types: [], conferences: [] };
  }
  document.querySelectorAll('#btn-download-csv, #btn-download-csv-menu').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      if (typeof window.radiomapGaEvent === 'function') window.radiomapGaEvent('radiomap_csv_download', {});
      const visibleSignals = new Set(NODES.filter((r,i)=>visibleSet.has(i)).map(r=>r.signal));
      const rows = NODES.filter(n=>visibleSignals.has(n.signal));
      exportRepeatersCSV(rows.length ? rows : NODES, getExportCriteria());
      closeMenuMap();
    });
  });

  window.setMode = setMode;
  window.selectRepeater = selectRepeater;
  window.downloadNeighborsCSV = downloadNeighborsCSV;
  window.shareNeighbors = shareNeighbors;
  window.closeSidebar = closeSidebar;
  window.closeMenuMap = closeMenuMap;

  window.__radiomapAfterClearFilters = function () {
    if (userMarker) {
      map.removeLayer(userMarker);
      userMarker = null;
    }
    if (typeof window.__radiomapCloseMapFilterSheet === 'function') window.__radiomapCloseMapFilterSheet();
    closeSidebar();
    applyFilters({ skipFitBounds: true });
  };

  window.__radiomapRadiusReference = function () {
    if (selectedIdx == null || typeof NODES === 'undefined' || !NODES.length) return null;
    var r = NODES[selectedIdx];
    if (!r || r.lat == null || r.lon == null || typeof r.lat !== 'number' || typeof r.lon !== 'number') return null;
    return { lat: r.lat, lon: r.lon, signal: r.signal || '' };
  };

  window.__radiomapGetMapShareState = function () {
    const c = map.getCenter();
    var sbEl = document.getElementById('sidebar');
    var sidebarOpen = !!(sbEl && sbEl.classList.contains('open'));
    var sig =
      selectedIdx != null && NODES[selectedIdx]
        ? NODES[selectedIdx].signal
        : propagationToggleOn && propagationActiveSignal
          ? propagationActiveSignal
          : null;
    var propagationOn = !!(
      sig &&
      propagationToggleOn &&
      propagationActiveSignal === sig
    );
    return {
      lat: c.lat,
      lng: c.lng,
      zoom: map.getZoom(),
      mode: currentMode,
      signal: sig,
      sidebarOpen: sidebarOpen,
      propagationOn: propagationOn
    };
  };

  const urlParams = new URLSearchParams(window.location.search);
  const sharedMapOk = urlParams.has('mlat') && urlParams.has('mlon') && urlParams.has('zoom');
  const mlat = sharedMapOk ? parseFloat(urlParams.get('mlat')) : NaN;
  const mlon = sharedMapOk ? parseFloat(urlParams.get('mlon')) : NaN;
  const mzoom = sharedMapOk ? parseInt(urlParams.get('zoom'), 10) : NaN;
  const sharedMapValid = sharedMapOk && !isNaN(mlat) && !isNaN(mlon) && !isNaN(mzoom);

  const modeParam = urlParams.get('mode');
  if (modeParam && ['markers', 'circles', 'both'].includes(modeParam)) {
    currentMode = modeParam;
    ['markers', 'circles', 'both'].forEach(m => {
      const el = document.getElementById('btn-' + m);
      if (el) el.classList.toggle('active', m === modeParam);
    });
  }

  updateNearMeButtonState();

  const nearMeOnLoad = getNearMeLocation();
  if (nearMeOnLoad) {
    userMarker = L.marker([nearMeOnLoad.lat, nearMeOnLoad.lon], {
      icon: L.divIcon({
        className: 'user-location-marker',
        html: '<div style="width:16px;height:16px;border-radius:50%;background:#00d4ff;border:3px solid #fff;box-shadow:0 0 8px rgba(0,212,255,0.6);"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8]
      })
    }).addTo(map).bindTooltip('Tu ubicación', { permanent: false, direction: 'top' });
  }

  applyFilters({ skipFitBounds: sharedMapValid });

  if (sharedMapValid) {
    map.setView([mlat, mlon], mzoom);
  }
  /* Sin URL de mapa compartido: applyFilters ya ajustó el zoom a los puntos que cumplen criterios (o Chile si no hay coords). */

  const sigParam = urlParams.get('signal');
  const skipSidebarFromNosb = urlParams.get('nosb') === '1';
  const skipSidebarFromSb = urlParams.get('sb') === '0';
  const wantPropFromUrl = urlParams.get('prop') === '1';
  if (sigParam) {
    const idx = NODES.findIndex(n => n.signal === sigParam);
    if (idx >= 0) {
      requestAnimationFrame(function () {
        const rNode = NODES[idx];
        const skipForClosedPanel = skipSidebarFromNosb || skipSidebarFromSb;
        const skipForPropagation = wantPropFromUrl && rNode.hasPropagation;
        selectRepeater(idx, 'url_signal', {
          skipSidebar: skipForClosedPanel || skipForPropagation
        });
        if (wantPropFromUrl && rNode.hasPropagation) {
          requestAnimationFrame(function () {
            applyPropagationFromUrlIfNeeded();
          });
        } else {
          syncRadiomapMapUiToUrl();
        }
      });
    }
  }
})();
