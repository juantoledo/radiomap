/**
 * Map view — Leaflet map, circles, markers, sidebar, filters
 * Requires: data/data.js (NODES, REGION_COLORS, VERSION), location-filter.js (getVisibleNodeIndices), export-csv.js, theme.js, help.js
 */
(function() {
  if (typeof NODES === 'undefined' || !NODES.length) return;

  if (typeof VERSION !== 'undefined') document.getElementById('app-version') && (document.getElementById('app-version').textContent = VERSION);
  document.getElementById('nodes-count') && (document.getElementById('nodes-count').textContent = NODES.length);

  function getClubName(signal) { var n = NODES && NODES.find(function(x){ return x.signal === signal; }); return n ? (n.nombre || '') : ''; }
  window.getClubName = getClubName;

  function escapeHtmlText(s) {
    if (s == null || s === '') return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
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

  const DEFAULT_RANGE_KM = 25; // for nodes without range_km (e.g. Echolink)
  const getRange = (n) => (typeof n.range_km === 'number' && !isNaN(n.range_km)) ? n.range_km : DEFAULT_RANGE_KM;
  NODES.forEach((r,i)=>{
    r._idx = i;
    r._neighbors = [];
    if (r.lat == null || r.lon == null || (typeof r.lat !== 'number') || (typeof r.lon !== 'number')) return;
    const rRange = getRange(r);
    NODES.forEach((s,j)=>{
      if(i===j) return;
      if (s.lat == null || s.lon == null || (typeof s.lat !== 'number') || (typeof s.lon !== 'number')) return;
      const sRange = getRange(s);
      const d = haversine(r.lat,r.lon,s.lat,s.lon);
      if(d < rRange + sRange) r._neighbors.push({idx:j, dist:Math.round(d)});
    });
    r._neighbors.sort((a,b)=>a.dist-b.dist);
  });

  const map = L.map('map', {
    center: [-33.5, -70.6],
    zoom: 5,
    zoomControl: true,
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
  setMapTiles(getTheme());
  window.onThemeChange = function(theme) { setMapTiles(theme); };

  const circleLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);

  let currentMode = 'markers';
  let selectedIdx = null;
  let visibleSet = new Set(NODES.map(r=>r._idx));

  const regionNames = Object.keys(REGION_COLORS || {}).filter(Boolean).sort();
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
  const filterConf = document.getElementById('filter-conference');
  if (filterConf) {
    const conferences = [...new Set(NODES.map(r => (r.conference || '').trim()).filter(Boolean))].sort();
    conferences.forEach(c => {
      const label = document.createElement('label');
      label.className = 'filter-checkbox-row';
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.setAttribute('data-filter-value', c);
      label.appendChild(inp);
      label.appendChild(document.createTextNode(' ' + c));
      filterConf.appendChild(label);
    });
  }
  if (typeof loadFilterState === 'function') loadFilterState();

  function hexToRgb(hex){
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return r+','+g+','+b;
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

    NODES.forEach(r=>{
      if (r.lat == null || r.lon == null) return;
      const visible = visibleSet.has(r._idx);
      const color = REGION_COLORS[r.region] || '#5e35b1';
      const rgb = hexToRgb(color);
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
          radius: r.range_km * 1000,
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
        }
        const icon = L.divIcon({
          className: '',
          html: '<div class="rpt-marker' + (isSelected?' selected':'') + extraClass + '" style="background:' + color + ';width:'+size+'px;height:'+size+'px;'+shape+';border:2px solid rgba(255,255,255,'+(isSelected?'0.9':'0.35')+');box-shadow:0 0 '+(isSelected?'8px':'3px')+' rgba('+rgb+',0.6);display:flex;align-items:center;justify-content:center;">'+inner+'</div>',
          iconSize: [size, size], iconAnchor: [size/2, size/2],
        });
        const marker = L.marker([mLat, mLon], { icon, zIndexOffset: isSelected ? 1000 : 0 });
        marker.on('click', ()=>{ selectRepeater(r._idx); });
        const club = r.nombre || getClubName(r.signal);
        const rx = r.rx || '—', tx = r.tx || '—', tono = r.tono ? r.tono + ' Hz' : '—';
        const confT = (r.conference || '').trim();
        const echolinkLine = r.isEcholink ? '<br><span class="rpt-tooltip-meta">Echolink' + (confT ? ' · ' + escapeHtmlText(confT) : '') + '</span>' : '';
        const dmrLine = r.isDMR && !r.isEcholink ? '<br><span class="rpt-tooltip-meta">DMR' + (confT ? ' · ' + escapeHtmlText(confT) : '') + '</span>' : '';
        const tooltipHtml = '<div class="rpt-tooltip-inner" style="font-family:Share Tech Mono,monospace;color:#00d4ff;background:#0d1520;border:1px solid #1a2d42;padding:8px 12px;border-radius:4px;">' +
          r.signal + (club ? '<br><span class="rpt-tooltip-club">' + club + '</span>' : '') +
          '<br><span class="rpt-tooltip-meta">' + r.comuna + ' · ' + r.banda + '</span>' +
          '<br><span class="rpt-tooltip-meta">RX ' + rx + ' · TX ' + tx + ' · ' + tono + '</span>' + echolinkLine + dmrLine + '</div>';
        marker.bindTooltip(tooltipHtml, { permanent: false, direction: 'top', opacity: 1, className: 'rpt-tooltip' });
        if(visible) marker.addTo(markerLayer);
      } else {
        const icon = L.divIcon({
          className: '',
          html: '<div style="width:16px;height:16px;border-radius:50%;cursor:pointer;"></div>',
          iconSize: [16,16], iconAnchor: [8,8],
        });
        const clickTarget = L.marker([mLat, mLon], { icon, opacity: 0 });
        clickTarget.on('click', ()=>selectRepeater(r._idx));
        if(visible) clickTarget.addTo(markerLayer);
      }
    });
    updateMapEmptyOverlay();
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
    ['markers','circles','both'].forEach(m=>{
      document.getElementById('btn-'+m).classList.toggle('active', m===mode);
    });
    renderAll();
  }

  let userMarker = null;

  function toggleNearMe(){
    const loc = getNearMeLocation();
    if(loc){
      clearNearMeLocation();
      if(userMarker) { map.removeLayer(userMarker); userMarker = null; }
      updateNearMeButtonState();
      applyFilters();
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
        applyFilters();
        if(btn) btn.disabled = false;
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
    const nearMe = getNearMeLocation();
    const visibleIndices = getVisibleNodeIndices();
    visibleSet = new Set(visibleIndices);
    const visibleNodes = visibleIndices.map(function (i) { return NODES[i]; });
    if (selectedIdx !== null && !visibleSet.has(selectedIdx)) {
      selectedIdx = null;
      const sb = document.getElementById('sidebar');
      if (sb) sb.classList.remove('open');
    }
    document.getElementById('shown-count').textContent = visibleSet.size;
    document.getElementById('total-count').textContent = NODES.length;
    document.getElementById('regions-count').textContent = new Set(visibleNodes.map(r => r.region || '')).size;
    document.getElementById('clubs-count').textContent = new Set(visibleNodes.map(r => r.nombre).filter(Boolean)).size;
    document.getElementById('filter-nearme').textContent = nearMe ? ' · cerca de mí' : '';
    if (typeof saveFilterState === 'function') saveFilterState();
    renderAll();
    if (selectedIdx !== null) showSidebar(selectedIdx);
    if (!opts.skipFitBounds && nearMe) {
      const withCoords = visibleNodes.filter(r => r.lat != null && r.lon != null);
      if (withCoords.length > 0) {
        const bounds = L.latLngBounds(withCoords.map(r => [r.lat, r.lon]));
        bounds.extend([nearMe.lat, nearMe.lon]);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      } else {
        map.setView([nearMe.lat, nearMe.lon], 10);
      }
    }
  }
  window.applyFilters = applyFilters;

  function selectRepeater(idx){
    selectedIdx = idx;
    renderAll();
    showSidebar(idx);
  }

  function showSidebar(idx){
    const r = NODES[idx];
    const color = REGION_COLORS[r.region] || '#5e35b1';
    const club = r.nombre || getClubName(r.signal);
    var sbSig = document.getElementById('sb-signal');
    var wurl = safeWebsiteUrl(r.website);
    if (wurl) {
      sbSig.classList.add('sidebar-signal--with-web');
      sbSig.innerHTML =
        '<span class="sidebar-signal-text">' +
        escapeHtmlText(r.signal) +
        '</span><a href="' +
        escapeAttr(wurl) +
        '" class="station-website-link" target="_blank" rel="noopener noreferrer" aria-label="Sitio web del club" title="Sitio web"><span class="material-symbols-outlined" aria-hidden="true">language</span></a>';
      var st = sbSig.querySelector('.sidebar-signal-text');
      if (st) st.style.color = color;
      sbSig.style.color = '';
    } else {
      sbSig.classList.remove('sidebar-signal--with-web');
      sbSig.textContent = r.signal;
      sbSig.style.color = color;
    }
    document.getElementById('sb-club').textContent = club || r.region + ' · ' + r.comuna;

    const body = document.getElementById('sb-body');
    const vence = r.vence || '—';
    const rows = [
      ['CLUB', club || '—'], ['Región', r.region || '—'], ['COMUNA', r.comuna || '—'],
      ['BANDA', '<span style="color:'+(r.banda.startsWith('VHF')?'#29abe2':'#e91e8c')+'">' + r.banda + '</span>'],
      ['RX (MHz)', r.rx || '—'], ['TX (MHz)', r.tx || '—'], ['TONO', r.tono ? r.tono + ' Hz' : '—'],
      ['POTENCIA', r.potencia ? r.potencia + ' W' : '—'], ['GANANCIA', r.ganancia ? r.ganancia + ' dBi' : '—'],
      ['COBERTURA', r.range_km ? r.range_km + ' km' : '—'], ['UBICACIÓN', r.ubicacion || '—'], ['VENCE', vence],
    ];
    if (r.isEcholink) {
      const ccf = (r.conference || '').trim();
      rows.push(['ECHOLINK', '<span class="badge-echolink">Sí</span>' + (ccf ? ' · ' + escapeHtmlText(ccf) : '')]);
    }
    if (r.isDMR && !r.isEcholink) {
      const ccf = (r.conference || '').trim();
      rows.push(['DMR', '<span class="badge-dmr">Sí</span>' + (ccf ? ' · ' + escapeHtmlText(ccf) : '')]);
    }

    let html = '<div class="sb-detail-grid">' + rows.map(([k,v])=>'<div class="sb-row"><span class="sb-key">'+k+'</span><span class="sb-val">'+v+'</span></div>').join('') + '</div>';

    const filteredNeighbors = [{idx: idx, dist: 0}, ...r._neighbors.filter(n=>visibleSet.has(n.idx))].sort((a,b)=>a.dist-b.dist);
    if(filteredNeighbors.length > 0){
      html += '<div class="sb-section-title">NODOS CERCANOS <span class="sb-neighbor-actions"><a href="#" class="sb-download-neighbors" onclick="downloadNeighborsCSV();return false" title="Descargar nodos cercanos como CSV"><span class="material-symbols-outlined" aria-hidden="true">download</span> CSV</a><a href="#" class="sb-share-neighbors" onclick="shareNeighbors();return false" title="Compartir enlace con filtros, mapa y esta repetidora (panel de nodos cercanos)"><span class="material-symbols-outlined" aria-hidden="true">share</span> Compartir</a></span></div>';
      html += filteredNeighbors.map(n=>{
        const nb = NODES[n.idx];
        const nc = REGION_COLORS[nb.region]||'#5e35b1';
        const rx = nb.rx || '—', tx = nb.tx || '—', tono = nb.tono ? nb.tono+' Hz' : '—';
        const details = 'RX '+rx+' · TX '+tx+' · '+tono;
        const clubName = (nb.nombre || getClubName(nb.signal) || '').trim();
        const comuna = (nb.comuna || '').trim();
        const metaLabel = [clubName, comuna].filter(Boolean).join(' · ');
        const metaHtml = metaLabel
          ? '<div class="neighbor-meta" title="' + escapeAttr(metaLabel) + '">' + escapeHtmlText(metaLabel) + '</div>'
          : '';
        const isSelected = n.idx === idx;
        const distStr = n.dist === 0 ? '0 km' : n.dist+' km';
        const dotEl = nb.isEcholink
          ? '<div class="neighbor-echolink" style="background:'+nc+'" title="Echolink">e</div>'
          : nb.isDMR
          ? '<div class="neighbor-dmr" style="background:'+nc+'" title="DMR"><span class="neighbor-dmr-letter" aria-hidden="true">d</span></div>'
          : '<div class="neighbor-dot" style="background:'+nc+'"></div>';
        return '<div class="neighbor-row'+(isSelected?' neighbor-selected':'')+'" onclick="selectRepeater('+n.idx+')">' +
          dotEl +
          '<div class="neighbor-main"><span class="neighbor-signal">'+escapeHtmlText(nb.signal)+(isSelected?' (este)':'')+'</span>' +
          metaHtml +
          '<div class="neighbor-details"><span>'+details+'</span></div></div>' +
          '<span class="neighbor-dist">'+distStr+'</span></div>';
      }).join('');
    }

    body.innerHTML = html;
    document.getElementById('sidebar').classList.add('open');
  }

  function downloadNeighborsCSV(){
    if(selectedIdx == null) return;
    const r = NODES[selectedIdx];
    const filteredNeighbors = [{idx: selectedIdx, dist: 0}, ...(r._neighbors || []).filter(n=>visibleSet.has(n.idx))].sort((a,b)=>a.dist-b.dist);
    if(filteredNeighbors.length === 0) return;
    const esc = v => (v == null || v === '') ? '' : (''+v).includes(',') || (''+v).includes('"') ? '"' + (''+v).replace(/"/g, '""') + '"' : ''+v;
    const headers = ['Repetidor','Señal nodo cercano','Club','Región','Comuna','RX (MHz)','TX (MHz)','Tono (Hz)','Banda','Distancia (km)'];
    const rows = filteredNeighbors.map(n=>{
      const nb = NODES[n.idx];
      return [r.signal, nb.signal, nb.nombre || getClubName(nb.signal), nb.region, nb.comuna || '', nb.rx || '', nb.tx || '', nb.tono || '', nb.banda || '', n.dist];
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
    const urlStr = typeof buildShareViewURL === 'function' ? buildShareViewURL() : window.location.href;
    const title = r.signal || 'Radiomap';
    const text = 'Mapa · cercanos.';
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
    document.getElementById('sidebar').classList.remove('open');
    selectedIdx = null;
    renderAll();
  }

  map.on('click', function(){ if(selectedIdx !== null) closeSidebar(); });

  function closeMenuMap() {
    const menu = document.getElementById('header-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu) menu.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  document.getElementById('menu-toggle').addEventListener('click', function() {
    const menu = document.getElementById('header-menu');
    const open = menu.classList.toggle('open');
    this.setAttribute('aria-expanded', open);
  });
  document.addEventListener('click', function(e) {
    const menu = document.getElementById('header-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu && menu.classList.contains('open') && !menu.contains(e.target) && !toggle.contains(e.target)) closeMenuMap();
  });

  function getExportCriteria() {
    return typeof getExportFilterCriteria === 'function' ? getExportFilterCriteria() : { search: '', nearMe: !!getNearMeLocation(), bandas: [], regions: [], types: [], conferences: [] };
  }
  document.querySelectorAll('#btn-download-csv, #btn-download-csv-menu').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
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
    closeSidebar();
    applyFilters();
  };

  window.__radiomapGetMapShareState = function () {
    const c = map.getCenter();
    return {
      lat: c.lat,
      lng: c.lng,
      zoom: map.getZoom(),
      mode: currentMode,
      signal: selectedIdx != null && NODES[selectedIdx] ? NODES[selectedIdx].signal : null
    };
  };

  const urlParams = new URLSearchParams(window.location.search);
  const sharedMapOk = urlParams.has('mlat') && urlParams.has('mlon') && urlParams.has('zoom');
  const mlat = sharedMapOk ? parseFloat(urlParams.get('mlat'), 10) : NaN;
  const mlon = sharedMapOk ? parseFloat(urlParams.get('mlon'), 10) : NaN;
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
  } else if (!nearMeOnLoad) {
    map.fitBounds([[-55, -76], [-17, -66]]);
  }

  const sigParam = urlParams.get('signal');
  if (sigParam) {
    const idx = NODES.findIndex(n => n.signal === sigParam);
    if (idx >= 0) {
      requestAnimationFrame(function () { selectRepeater(idx); });
    }
  }
})();
