/**
 * List view — table by region, filters, share
 * Requires: conference-colors.js (buildConferenceColorMap), utils.js (escapeHtml, escapeAttr), data/data.js (NODES, REGION_COLORS, VERSION), location-filter.js (getFilteredNodes), dmr-ui.js (buildDmrDetailHtml), share-view.js (buildShareViewURL), export-csv.js, theme.js, help.js, station-display.js (hasStationFieldValue), station-service-icons.js
 */
(function() {
  if (typeof NODES === 'undefined' || !NODES.length) return;

  /** Stable id for lista (map.js also sets this when the map loads). Needed when several rows share the same `signal`. */
  NODES.forEach(function (r, i) {
    r._idx = i;
  });

  if (typeof setRadiomapVersionDisplays === 'function') {
    setRadiomapVersionDisplays(typeof VERSION !== 'undefined' ? VERSION : null);
  } else if (typeof VERSION !== 'undefined') {
    var _av = document.getElementById('app-version');
    if (_av) _av.textContent = VERSION;
  }
  const filterRegion = document.getElementById('filter-region');
  const regionNames = sortRegionKeysChile(Object.keys(REGION_COLORS || {}).filter(Boolean));
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
    var confColorMap = typeof buildConferenceColorMap === 'function' ? buildConferenceColorMap(NODES) : { sortedNames: [], colors: {} };
    confColorMap.sortedNames.forEach(function (c) {
      const label = document.createElement('label');
      label.className = 'filter-checkbox-row';
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.setAttribute('data-filter-value', c);
      const swatch = document.createElement('span');
      swatch.className = 'filter-conference-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.background = confColorMap.colors[c] || '#888888';
      label.appendChild(inp);
      label.appendChild(swatch);
      label.appendChild(document.createTextNode(' ' + c));
      filterConf.appendChild(label);
    });
  }
  if (typeof loadFilterState === 'function') loadFilterState();
  if (typeof syncFilterTypeOptionsAvailability === 'function') syncFilterTypeOptionsAvailability();

  let sortCol = null;
  let sortDir = 'asc';

  function cmpStr(a, b) {
    const sa = (a == null || a === '') ? null : String(a);
    const sb = (b == null || b === '') ? null : String(b);
    if (sa === null && sb === null) return 0;
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sa.localeCompare(sb, 'es', { sensitivity: 'base' });
  }
  function cmpNum(a, b) {
    const na = (a == null || a === '') ? null : parseFloat(a);
    const nb = (b == null || b === '') ? null : parseFloat(b);
    if (na === null && nb === null) return 0;
    if (na === null || isNaN(na)) return 1;
    if (nb === null || isNaN(nb)) return -1;
    return na - nb;
  }
  const SORT_COMPARATORS = {
    signal:    (a, b) => cmpStr(a.signal, b.signal),
    banda:     (a, b) => cmpStr(a.banda, b.banda),
    rx:        (a, b) => cmpNum(a.rx, b.rx),
    tx:        (a, b) => cmpNum(a.tx, b.tx),
    tono:      (a, b) => cmpNum(a.tono, b.tono),
    potencia:  (a, b) => cmpNum(a.potencia, b.potencia),
    nombre:    (a, b) => cmpStr(a.nombre, b.nombre),
    comuna:    (a, b) => cmpStr(a.comuna, b.comuna),
    ubicacion: (a, b) => cmpStr(a.ubicacion, b.ubicacion),
    _dist:     (a, b) => cmpNum(a._dist, b._dist),
  };

  function bandaClass(banda) {
    const b = banda || '';
    if (b.includes('ATC') || b.includes('/AM')) return 'badge-air';
    if (b.includes('UHF')) return 'badge-uhf';
    return 'badge-vhf';
  }

  function safeWebsiteUrl(w) {
    w = (w || '').trim();
    if (!/^https?:\/\//i.test(w)) return '';
    try {
      const u = new URL(w);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.href;
    } catch (e) {
      return '';
    }
  }
  function websiteLinkHtml(r) {
    const wurl = safeWebsiteUrl(r.website);
    if (!wurl) return '';
    return (
      ' <a href="' +
      escapeAttr(wurl) +
      '" class="station-website-link" target="_blank" rel="noopener noreferrer" aria-label="Sitio web" title="Sitio web"><span class="material-symbols-outlined" aria-hidden="true">language</span></a>'
    );
  }

  let stationDetailLastFocus = null;
  let stationDetailCurrentSignal = null;
  let stationDetailCurrentNodeIdx = null;

  function fmtVal(v) {
    if (!fieldShown(v)) return '';
    return String(v);
  }

  function fieldShown(v) {
    if (typeof hasStationFieldValue === 'function') return hasStationFieldValue(v);
    return v != null && String(v).trim() !== '';
  }

  function cellEmptyClass(v) {
    if (typeof stationFieldEmptyClass === 'function') return stationFieldEmptyClass(v);
    return fieldShown(v) ? '' : ' cell-empty';
  }

  function openStationDetail(signal, nodeIdxOpt, gaInteraction) {
    let r = null;
    if (nodeIdxOpt != null && nodeIdxOpt !== '') {
      const ni = parseInt(nodeIdxOpt, 10);
      if (!isNaN(ni) && NODES[ni]) r = NODES[ni];
    }
    if (!r && signal) r = NODES.find(n => n.signal === signal);
    if (!r) return;
    signal = r.signal;

    const overlay = document.getElementById('station-detail-overlay');
    const dialog = document.getElementById('station-detail-dialog');
    const titleEl = document.getElementById('station-detail-title');
    const subEl = document.getElementById('station-detail-sub');
    const bodyEl = document.getElementById('station-detail-body');
    const mapLink = document.getElementById('station-detail-map-link');
    const shareBtn = document.getElementById('station-detail-share');
    if (!overlay || !dialog || !titleEl || !subEl || !bodyEl || !mapLink || !shareBtn) return;

    stationDetailCurrentSignal = signal;
    stationDetailCurrentNodeIdx = typeof r._idx === 'number' ? r._idx : NODES.indexOf(r);
    stationDetailLastFocus = document.activeElement;

    const distAnchor = typeof getDistanceFilterAnchor === 'function' ? getDistanceFilterAnchor() : null;
    let distKm = null;
    if (distAnchor && r.lat != null && r.lon != null && typeof haversine === 'function') {
      distKm = Math.round(haversine(distAnchor.lat, distAnchor.lon, r.lat, r.lon));
    }

    const hasSvc = typeof hasStationServiceType === 'function' ? hasStationServiceType(r) : !!r.isAir;
    titleEl.classList.toggle('station-detail-signal--with-service', hasSvc);
    const wurl = safeWebsiteUrl(r.website);
    const svcIcon = typeof stationServiceIconInlineHtml === 'function' ? stationServiceIconInlineHtml(r, '') : '';
    const sigHtml = svcIcon + escapeHtml(r.signal || '—');
    if (wurl) {
      titleEl.classList.add('station-detail-signal--with-web');
      titleEl.innerHTML = sigHtml + websiteLinkHtml(r);
    } else if (hasSvc) {
      titleEl.classList.remove('station-detail-signal--with-web');
      titleEl.innerHTML = sigHtml;
    } else {
      titleEl.classList.remove('station-detail-signal--with-web');
      titleEl.textContent = r.signal || '—';
    }
    const subMainParts = [];
    if (fieldShown(r.banda)) {
      const bs = (r.banda || '').replace('/FM', '').trim();
      if (bs) subMainParts.push(bs);
    }
    if (fieldShown(r.nombre)) subMainParts.push(String(r.nombre).trim());
    const subParts = [];
    if (r.isEcholink) {
      const ccf = (r.conference || '').trim();
      subParts.push('Echolink' + (fieldShown(ccf) ? ' · ' + ccf : ''));
    }
    if (r.isDMR && !r.isEcholink) {
      const ccf = (r.conference || '').trim();
      subParts.push('DMR' + (fieldShown(ccf) ? ' · ' + ccf : ''));
    }
    if (distKm != null) subParts.push('~' + distKm + ' km');
    const left = subMainParts.join(' · ');
    const right = subParts.join(' · ');
    subEl.textContent = left && right ? left + ' · ' + right : (left || right);

    const rows = [];
    if (fieldShown(r.rx)) rows.push([['RX (MHz)', 'station-detail-freq'], r.rx + ' MHz']);
    if (fieldShown(r.tx)) rows.push([['TX (MHz)', 'station-detail-freq'], r.tx + ' MHz']);
    if (fieldShown(r.tono)) rows.push([['Tono (Hz)', 'station-detail-freq'], r.tono + ' Hz']);
    if (fieldShown(r.banda)) rows.push([['Banda', ''], r.banda]);
    if (fieldShown(r.potencia)) rows.push([['Potencia', ''], r.potencia + ' W']);
    if (fieldShown(r.ganancia)) rows.push([['Ganancia', ''], fmtVal(r.ganancia)]);
    if (fieldShown(r.region)) rows.push([['Región', ''], fmtVal(r.region)]);
    if (fieldShown(r.comuna)) rows.push([['Comuna', ''], fmtVal(r.comuna)]);
    if (fieldShown(r.ubicacion)) rows.push([['Ubicación', ''], fmtVal(r.ubicacion)]);
    if (r.lat != null && r.lon != null && !isNaN(r.lat) && !isNaN(r.lon)) {
      rows.push([['Lat / Lon', ''], r.lat.toFixed(5) + ', ' + r.lon.toFixed(5)]);
    }
    if (fieldShown(r.otorga)) rows.push([['Otorga', ''], fmtVal(r.otorga)]);
    if (fieldShown(r.vence)) rows.push([['Vence', ''], fmtVal(r.vence)]);
    if (fieldShown(r.notes)) {
      const notesHtml = String(r.notes).split(/\r?\n/).map(function (line) {
        return escapeHtml(line);
      }).join('<br>');
      rows.push([['Notas', 'station-detail-grid-full station-detail-notes'], notesHtml, 'html']);
    }

    if (r.isEcholink) {
      const ccf = (r.conference || '').trim();
      rows.push([
        ['Echolink', 'station-detail-grid-full'],
        '<span class="badge-echolink">Sí</span>' + (fieldShown(ccf) ? ' · ' + escapeHtml(ccf) : ''),
        'html'
      ]);
    }
    if (r.isDMR && !r.isEcholink) {
      const dmrHtml =
        typeof window.buildDmrDetailHtml === 'function'
          ? window.buildDmrDetailHtml(r, 'modal')
          : '<span class="badge-dmr">DMR</span>';
      rows.push([['DMR', 'station-detail-dd-dmr'], dmrHtml, 'html']);
    }

    let dl = '<dl class="station-detail-grid">';
    rows.forEach(function (row) {
      const dt = row[0];
      const label = Array.isArray(dt) ? dt[0] : dt;
      const ddClass = Array.isArray(dt) && dt[1] ? dt[1] : '';
      const val = row[1];
      const asHtml = row[2] === 'html';
      const inner = asHtml ? val : escapeHtml(val);
      dl += '<dt>' + escapeHtml(label) + '</dt><dd' + (ddClass ? ' class="' + escapeHtml(ddClass) + '"' : '') + '>' + inner + '</dd>';
    });
    dl += '</dl>';
    bodyEl.innerHTML = dl;

    try {
      mapLink.href = typeof buildMapViewURLForStation === 'function'
        ? buildMapViewURLForStation(signal)
        : (function () {
            const u = new URL('index.html', window.location.href);
            u.searchParams.set('signal', signal);
            u.searchParams.set('sb', '0');
            return u.pathname + u.search + (u.hash || '');
          })();
    } catch (e) {
      mapLink.href =
        'index.html?signal=' + encodeURIComponent(signal) + '&sb=0';
    }

    mapLink.setAttribute('aria-label', 'Ver ' + (r.signal || 'estación') + ' en el mapa');

    updateStationDetailNav();

    if (typeof window.radiomapGaStationSelect === 'function') {
      var gaTag = gaInteraction != null && String(gaInteraction).trim() !== '' ? String(gaInteraction).trim() : 'list_row';
      window.radiomapGaStationSelect(signal, gaTag);
    }

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function () {
      try {
        dialog.focus();
      } catch (e2) { /* ignore */ }
    });
  }

  function closeStationDetail() {
    const overlay = document.getElementById('station-detail-overlay');
    const bodyEl = document.getElementById('station-detail-body');
    const titleEl = document.getElementById('station-detail-title');
    if (!overlay) return;
    if (titleEl) {
      titleEl.classList.remove('station-detail-signal--with-web', 'station-detail-signal--with-service');
      titleEl.textContent = '—';
    }
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    stationDetailCurrentSignal = null;
    stationDetailCurrentNodeIdx = null;
    if (bodyEl) bodyEl.innerHTML = '';
    try {
      if (stationDetailLastFocus && typeof stationDetailLastFocus.focus === 'function') {
        stationDetailLastFocus.focus();
      }
    } catch (e) { /* ignore */ }
    stationDetailLastFocus = null;
  }

  /**
   * Same grouping and row order as the list table: by region, optional region order by min distance,
   * then optional column sort within each region.
   * @returns {Array<{ region: string, rows: Array }>}
   */
  function buildListRegionGroups(filtered) {
    const distAnchor = typeof getDistanceFilterAnchor === 'function' ? getDistanceFilterAnchor() : null;
    const byRegion = {};
    regionNames.forEach(reg => { byRegion[reg] = []; });
    filtered.forEach(r => {
      const reg = r.region || '';
      if (byRegion[reg] !== undefined) byRegion[reg].push(r);
    });

    let regionsToShow = regionNames.filter(reg => byRegion[reg] && byRegion[reg].length > 0);
    if (distAnchor && regionsToShow.length > 1) {
      regionsToShow.sort((a, b) => {
        const minA = Math.min(...byRegion[a].map(r => r._dist ?? 9999));
        const minB = Math.min(...byRegion[b].map(r => r._dist ?? 9999));
        return minA - minB;
      });
    }

    return regionsToShow.map(reg => {
      let rows = byRegion[reg];
      if (!rows || !rows.length) return null;
      if (sortCol && SORT_COMPARATORS[sortCol]) {
        const cmp = SORT_COMPARATORS[sortCol];
        rows = rows.slice().sort((a, b) => sortDir === 'asc' ? cmp(a, b) : cmp(b, a));
      }
      return { region: reg, rows };
    }).filter(Boolean);
  }

  function updateStationDetailNav() {
    const prevBtn = document.getElementById('station-detail-prev');
    const nextBtn = document.getElementById('station-detail-next');
    const posEl = document.getElementById('station-detail-nav-position');
    if (!prevBtn || !nextBtn) return;

    const groups = buildListRegionGroups(getFiltered());
    const ordered = groups.flatMap(function (g) {
      return g.rows;
    });
    const idx = ordered.findIndex(function (row) {
      return row._idx === stationDetailCurrentNodeIdx;
    });
    const total = ordered.length;
    const atStart = idx <= 0;
    const atEnd = idx < 0 || idx >= total - 1;

    prevBtn.disabled = total === 0 || atStart || idx < 0;
    nextBtn.disabled = total === 0 || atEnd || idx < 0;

    if (posEl) {
      if (idx >= 0 && total > 0) {
        posEl.textContent = (idx + 1) + ' / ' + total;
        posEl.removeAttribute('hidden');
      } else {
        posEl.textContent = '';
        posEl.setAttribute('hidden', 'hidden');
      }
    }
  }

  function navigateStationDetail(delta) {
    if (stationDetailCurrentNodeIdx == null) return;
    const groups = buildListRegionGroups(getFiltered());
    const ordered = groups.flatMap(function (g) {
      return g.rows;
    });
    const idx = ordered.findIndex(function (row) {
      return row._idx === stationDetailCurrentNodeIdx;
    });
    if (idx < 0) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= ordered.length) return;
    const nextRow = ordered[nextIdx];
    openStationDetail(nextRow.signal, nextRow._idx, 'list_nav');
  }

  function render(filtered) {
    if (typeof syncNearRadiusControl === 'function') syncNearRadiusControl();
    const main = document.getElementById('main-content');
    document.getElementById('shown-count').textContent = filtered.length;
    document.getElementById('total-count').textContent = NODES.length;
    document.getElementById('regions-count').textContent = filtered.length ? new Set(filtered.map(r => r.region || '')).size : 0;
    document.getElementById('clubs-count').textContent = filtered.length ? new Set(filtered.map(r => r.nombre).filter(Boolean)).size : 0;
    document.getElementById('filter-nearme').textContent =
      typeof formatNearMeFilterSuffix === 'function' ? formatNearMeFilterSuffix() : (getNearMeLocation() ? ' · cerca de mí' : '');

    if (filtered.length === 0) {
      main.innerHTML = typeof buildGuidedEmptyStateHtml === 'function'
        ? buildGuidedEmptyStateHtml()
        : '<div class="no-results">No se encontraron resultados para la búsqueda actual.</div>';
      return;
    }

    const distAnchor = typeof getDistanceFilterAnchor === 'function' ? getDistanceFilterAnchor() : null;
    const showDistance = !!distAnchor;
    const regionGroups = buildListRegionGroups(filtered);

    function thSort(col, label) {
      const active = sortCol === col;
      const ariaSortAttr = active ? ` aria-sort="${sortDir === 'asc' ? 'ascending' : 'descending'}"` : ' aria-sort="none"';
      return `<th data-sort-col="${col}"${ariaSortAttr}>${label}<span class="sort-arrow" aria-hidden="true"></span></th>`;
    }

    let html = '';
    regionGroups.forEach(function (grp) {
      const reg = grp.region;
      const rows = grp.rows;

      html += `<div class="zone-group" data-region="${reg}">
        <div class="zone-header">
          <span class="zone-badge" style="border-color: ${REGION_COLORS[reg]||'#5e35b1'}; color: ${REGION_COLORS[reg]||'#5e35b1'}">${reg}</span>
          <span class="zone-count"><span>${rows.length}</span> repetidor${rows.length !== 1 ? 'es' : ''}</span>
        </div>
        <table class="rpt-table">
          <thead><tr>
            ${thSort('signal','Señal')}
            ${showDistance ? thSort('_dist','Distancia') : ''}
            ${thSort('rx','RX (MHz)')}${thSort('tx','TX (MHz)')}${thSort('tono','Tono')}${thSort('potencia','Pot. W')}
            ${thSort('nombre','Club / Titular')}${thSort('comuna','Comuna')}${thSort('ubicacion','Ubicación')}
          </tr></thead>
          <tbody>`;

      rows.forEach(r => {
        const bc = bandaClass(r.banda);
        const bandaShort = (r.banda || '').replace('/FM','');
        const confEsc = escapeAttr(r.conference || '');
        const echolinkBadge = r.isEcholink ? `<span class="badge-echolink" title="${confEsc}">Echolink</span>` : '';
        const dmrBadge = r.isDMR && !r.isEcholink ? `<span class="badge-dmr" title="${confEsc}">DMR</span>` : '';
        const svcBadge = typeof stationServiceBadgeHtml === 'function' ? stationServiceBadgeHtml(r) : '';
        const distHasVal = showDistance && r._dist != null && typeof r._dist === 'number' && !isNaN(r._dist);
        const distCell = showDistance
          ? `<td class="cell-dist${distHasVal ? '' : ' cell-empty'}" data-label="Distancia">${distHasVal ? r._dist + ' km' : ''}</td>`
          : '';
        const sigAttr = (r.signal || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const webLink = websiteLinkHtml(r);
        const sigLead = typeof stationServiceIconInlineHtml === 'function' ? stationServiceIconInlineHtml(r, '') : '';
        const clubStrong = fieldShown(r.nombre) ? `<strong>${escapeHtml(r.nombre)}</strong>` : '';
        const clubSmall = fieldShown(r.region) ? `<small>${escapeHtml(r.region)}</small>` : '';
        const clubEmpty = !fieldShown(r.nombre) && !fieldShown(r.region);
        const shareBtn = `<span class="cell-signal-share"><button type="button" class="share-btn" data-signal="${(r.signal || '').replace(/"/g, '&quot;')}" aria-label="Compartir ${(r.signal || '').replace(/"/g, '&quot;')}" title="Compartir detalles"><span class="material-symbols-outlined" aria-hidden="true">share</span></button></span>`;
        const bandaBadge = fieldShown(r.banda)
          ? `<span class="cell-signal-banda"><span class="badge-banda ${bc}">${escapeHtml(bandaShort)}</span></span>`
          : '';
        html += `<tr class="rpt-row" data-signal="${sigAttr}" data-node-idx="${r._idx}">
          <td class="cell-signal" data-label="Señal"><span class="cell-signal-left"><span class="cell-signal-main">${sigLead}${escapeHtml(r.signal || '—')}${webLink} ${echolinkBadge}${dmrBadge}${svcBadge}</span>${bandaBadge}</span>${shareBtn}</td>
          ${distCell}
          <td class="cell-freq freq-rx${cellEmptyClass(r.rx)}" data-label="RX (MHz)">${fieldShown(r.rx) ? r.rx : ''}</td>
          <td class="cell-freq freq-tx${cellEmptyClass(r.tx)}" data-label="TX (MHz)">${fieldShown(r.tx) ? r.tx : ''}</td>
          <td class="cell-tone${cellEmptyClass(r.tono)}" data-label="Tono">${fieldShown(r.tono) ? escapeHtml(String(r.tono)) : ''}</td>
          <td class="cell-pot${cellEmptyClass(r.potencia)}" data-label="Pot. W">${fieldShown(r.potencia) ? r.potencia + ' W' : ''}</td>
          <td class="cell-club${clubEmpty ? ' cell-empty' : ''}" data-label="Club / Titular">${clubStrong}${clubSmall}</td>
          <td class="cell-comuna${cellEmptyClass(r.comuna)}" data-label="Comuna">${fieldShown(r.comuna) ? escapeHtml(r.comuna) : ''}</td>
          <td class="cell-ub${cellEmptyClass(r.ubicacion)}" data-label="Ubicación">${fieldShown(r.ubicacion) ? escapeHtml(r.ubicacion) : ''}</td>
        </tr>`;
      });

      html += `</tbody></table></div>`;
    });

    main.innerHTML = html;
    highlightSharedSignalRow(main);
  }

  function highlightSharedSignalRow(main) {
    try {
      const sig = new URLSearchParams(window.location.search).get('signal');
      if (!sig || !main) return;
      const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(sig) : sig.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const tr = main.querySelector('tr[data-signal="' + esc + '"]');
      if (!tr) return;
      tr.classList.add('row-shared-highlight');
      requestAnimationFrame(function () {
        tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    } catch (e) { /* ignore */ }
  }

  function toggleNearMe() {
    const loc = getNearMeLocation();
    if (loc) {
      clearNearMeLocation();
      updateNearMeButtonState();
      if (typeof saveFilterState === 'function') saveFilterState();
      render(getFiltered());
      if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
      return;
    }
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }
    const btn = document.getElementById('btn-nearme');
    if (btn) btn.disabled = true;
    requestNearMeLocation(
      function () {
        updateNearMeButtonState();
        if (typeof saveFilterState === 'function') saveFilterState();
        render(getFiltered());
        if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
        if (btn) btn.disabled = false;
      },
      function () {
        if (btn) btn.disabled = false;
        alert('No se pudo obtener tu ubicación. Verifica que el permiso esté concedido.');
      }
    );
  }
  window.toggleNearMe = toggleNearMe;

  function getFiltered() {
    return typeof getFilteredNodes === 'function'
      ? getFilteredNodes({ sortByDistance: true })
      : [];
  }

  /**
   * Share link to lista view with current filters / cerca de mí + signal (opens station dialog on open).
   * Uses buildShareViewURL from share-view.js when available.
   */
  function buildStationShareLink(signal) {
    let urlStr = typeof buildShareViewURL === 'function' ? buildShareViewURL() : window.location.href;
    try {
      const u = new URL(urlStr);
      u.hash = '';
      if (signal) u.searchParams.set('signal', signal);
      urlStr = u.toString();
    } catch (e) {
      const sep = String(urlStr).indexOf('?') >= 0 ? '&' : '?';
      urlStr = String(urlStr).split('#')[0] + sep + 'signal=' + encodeURIComponent(signal || '');
    }
    return urlStr;
  }

  function shareStation(signal) {
    const r = NODES.find(n => n.signal === signal);
    if (!r) return;
    const urlStr = buildStationShareLink(signal);
    if (typeof radiomapPerformShare === 'function') {
      radiomapPerformShare({ urlOverride: urlStr, withScreenshot: false, title: r.signal || 'Radiomap' });
      return;
    }
    const title = r.signal || 'Radiomap';
    const text = '¡Hola! Te comparto este mapa de estaciones de radio: ' + urlStr;
    if (navigator.share) {
      navigator.share({ title, text, url: urlStr }).catch(function () {
        if (typeof fallbackCopyShareUrl === 'function') fallbackCopyShareUrl(urlStr);
      });
    } else if (typeof fallbackCopyShareUrl === 'function') {
      fallbackCopyShareUrl(urlStr);
    } else {
      window.prompt('Copia este enlace:', urlStr);
    }
  }

  document.getElementById('main-content').addEventListener('click', function (e) {
    const th = e.target.closest('th[data-sort-col]');
    if (th) {
      const col = th.getAttribute('data-sort-col');
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      render(getFiltered());
      return;
    }
    const btn = e.target.closest('.share-btn');
    if (btn && btn.dataset.signal !== undefined) {
      e.stopPropagation();
      shareStation(btn.dataset.signal);
      return;
    }
    const tr = e.target.closest('tr.rpt-row');
    if (!tr) return;
    const idxStr = tr.getAttribute('data-node-idx');
    const ni = idxStr != null && idxStr !== '' ? parseInt(idxStr, 10) : NaN;
    if (!isNaN(ni) && NODES[ni]) {
      openStationDetail(NODES[ni].signal, ni);
      return;
    }
    const sig = tr.getAttribute('data-signal');
    if (sig) openStationDetail(sig);
  });

  (function initStationDetailDialog() {
    const overlay = document.getElementById('station-detail-overlay');
    const closeBtn = document.getElementById('station-detail-close');
    const shareBtn = document.getElementById('station-detail-share');
    const prevBtn = document.getElementById('station-detail-prev');
    const nextBtn = document.getElementById('station-detail-next');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeStationDetail();
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeStationDetail);
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        if (stationDetailCurrentSignal) shareStation(stationDetailCurrentSignal);
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        navigateStationDetail(-1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        navigateStationDetail(1);
      });
    }
    document.addEventListener('keydown', function (e) {
      const ov = document.getElementById('station-detail-overlay');
      const open = ov && ov.classList.contains('open');
      if (open && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        e.stopPropagation();
        navigateStationDetail(e.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (e.key !== 'Escape') return;
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        closeStationDetail();
      }
    }, true);
  })();

  const searchEl = document.getElementById('search');
  if (searchEl) {
    const debouncedSearch = typeof debounce === 'function'
      ? debounce(function () {
          if (typeof saveFilterState === 'function') saveFilterState();
          render(getFiltered());
          if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
        }, 200)
      : function () {
          if (typeof saveFilterState === 'function') saveFilterState();
          render(getFiltered());
          if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
        };
    searchEl.addEventListener('input', debouncedSearch);
    searchEl.addEventListener('change', function () {
      if (typeof saveFilterState === 'function') saveFilterState();
      render(getFiltered());
      if (typeof window.radiomapGaScheduleFilterApply === 'function') window.radiomapGaScheduleFilterApply();
    });

    function isListOverlayOpen() {
      const help = document.getElementById('help-overlay');
      if (help && help.classList.contains('open')) return true;
      const station = document.getElementById('station-detail-overlay');
      if (station && station.classList.contains('open')) return true;
      return false;
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
      if (isListOverlayOpen()) return;
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
  window.__radiomapListMultiselectChange = function () {
    render(getFiltered());
  };
  window.__radiomapListRadiusChange = function () {
    render(getFiltered());
  };

  updateNearMeButtonState();

  function closeMenu() {
    const menu = document.getElementById('header-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu) menu.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  if (typeof window.radiomapWireFilterBottomSheet === 'function') {
    window.radiomapWireFilterBottomSheet({
      detailsId: 'list-filters-details',
      closeMenu: closeMenu
    });
  }

  var menuToggleList = document.getElementById('menu-toggle');
  if (menuToggleList) {
    menuToggleList.addEventListener('click', function() {
      const menu = document.getElementById('header-menu');
      if (!menu) return;
      const open = menu.classList.toggle('open');
      this.setAttribute('aria-expanded', open);
    });
  }

  function getExportCriteria() {
    return typeof getExportFilterCriteria === 'function' ? getExportFilterCriteria() : { search: '', nearMe: !!(typeof getDistanceFilterAnchor === 'function' && getDistanceFilterAnchor()), bandas: [], regions: [], types: [], conferences: [] };
  }
  document.querySelectorAll('#btn-download-csv, #btn-download-csv-menu').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      if (typeof window.radiomapGaEvent === 'function') window.radiomapGaEvent('radiomap_csv_download', {});
      exportRepeatersCSV(getFiltered(), getExportCriteria());
      closeMenu();
    });
  });

  document.addEventListener('click', function(e) {
    const menu = document.getElementById('header-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu && toggle && menu.classList.contains('open') && !menu.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  window.__radiomapAfterClearFilters = function () {
    render(getFiltered());
  };

  render(getFiltered());

  (function maybeOpenStationDetailFromUrl() {
    try {
      const sig = new URLSearchParams(window.location.search).get('signal');
      if (!sig || !NODES.some(n => n.signal === sig)) return;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          openStationDetail(sig, undefined, 'url_signal');
        });
      });
    } catch (e) { /* ignore */ }
  })();
})();
