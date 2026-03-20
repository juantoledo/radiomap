/**
 * List view — table by region, filters, share
 * Requires: data/data.js (NODES, REGION_COLORS, VERSION), location-filter.js (getFilteredNodes), share-view.js (buildShareViewURL), export-csv.js, theme.js, help.js
 */
(function() {
  if (typeof NODES === 'undefined' || !NODES.length) return;

  if (typeof VERSION !== 'undefined') document.getElementById('app-version') && (document.getElementById('app-version').textContent = VERSION);
  document.getElementById('nodes-count') && (document.getElementById('nodes-count').textContent = NODES.length);

  const filterRegion = document.getElementById('filter-region');
  const regionNames = Object.keys(REGION_COLORS || {}).sort();
  regionNames.forEach(reg => {
    const opt = document.createElement('option');
    opt.value = reg === '' ? '__sin_region__' : reg;
    opt.textContent = reg || 'Sin región en el archivo de Subtel';
    filterRegion.appendChild(opt);
  });
  const filterConf = document.getElementById('filter-echolink-conference');
  if (filterConf) {
    const conferences = [...new Set(NODES.filter(r=>r.isEcholink).map(r=>r.echoLinkConference || '').filter(Boolean))].sort();
    conferences.forEach(c => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      filterConf.appendChild(o);
    });
  }
  if (typeof loadFilterState === 'function') loadFilterState();

  function parseDate(s) {
    if (!s) return null;
    const p = String(s).trim().split('-');
    if (p.length !== 3) return new Date(s);
    if (p[0].length === 4) return new Date(s);
    return new Date(parseInt(p[2],10), parseInt(p[1],10)-1, parseInt(p[0],10));
  }
  function venceClass(vence) {
    if (!vence) return '';
    const d = parseDate(vence);
    const now = new Date();
    const diff = (d - now) / (1000*60*60*24);
    if (diff < 0) return 'vence-expired';
    if (diff < 365) return 'vence-warn';
    return 'vence-ok';
  }
  function bandaClass(banda) {
    if (banda.includes('UHF')) return 'badge-uhf';
    return 'badge-vhf';
  }

  function escapeHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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

  function fmtVal(v) {
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  }

  function openStationDetail(signal) {
    if (!signal) return;
    const r = NODES.find(n => n.signal === signal);
    if (!r) return;

    const overlay = document.getElementById('station-detail-overlay');
    const dialog = document.getElementById('station-detail-dialog');
    const titleEl = document.getElementById('station-detail-title');
    const subEl = document.getElementById('station-detail-sub');
    const bodyEl = document.getElementById('station-detail-body');
    const mapLink = document.getElementById('station-detail-map-link');
    const shareBtn = document.getElementById('station-detail-share');
    if (!overlay || !dialog || !titleEl || !subEl || !bodyEl || !mapLink || !shareBtn) return;

    stationDetailCurrentSignal = signal;
    stationDetailLastFocus = document.activeElement;

    const nearMe = typeof getNearMeLocation === 'function' ? getNearMeLocation() : null;
    let distKm = null;
    if (nearMe && r.lat != null && r.lon != null && typeof haversine === 'function') {
      distKm = Math.round(haversine(nearMe.lat, nearMe.lon, r.lat, r.lon));
    }

    const wurl = safeWebsiteUrl(r.website);
    if (wurl) {
      titleEl.classList.add('station-detail-signal--with-web');
      titleEl.innerHTML = escapeHtml(r.signal || '—') + websiteLinkHtml(r);
    } else {
      titleEl.classList.remove('station-detail-signal--with-web');
      titleEl.textContent = r.signal || '—';
    }
    const bandaShort = (r.banda || '').replace('/FM', '');
    const parts = [bandaShort && (bandaShort + ' · '), r.nombre || ''].filter(Boolean);
    const subParts = [];
    if (r.isEcholink) {
      subParts.push('Echolink' + (r.echoLinkConference ? ' · ' + r.echoLinkConference : ''));
    }
    if (distKm != null) subParts.push('~' + distKm + ' km');
    subEl.textContent = parts.join('') + (subParts.length ? ' · ' + subParts.join(' · ') : '');

    const rows = [
      [['RX (MHz)', 'station-detail-freq'], r.rx ? r.rx + ' MHz' : '—'],
      [['TX (MHz)', 'station-detail-freq'], r.tx ? r.tx + ' MHz' : '—'],
      [['Tono (Hz)', ''], r.tono ? r.tono + ' Hz' : '—'],
      [['Banda', ''], fmtVal(r.banda)],
      [['Potencia', ''], r.potencia ? r.potencia + ' W' : '—'],
      [['Ganancia', ''], fmtVal(r.ganancia)],
      [['Cobertura', ''], r.range_km !== '' && r.range_km != null ? fmtVal(r.range_km) + ' km' : '—'],
      [['Región', ''], fmtVal(r.region)],
      [['Comuna', ''], fmtVal(r.comuna)],
      [['Ubicación', ''], fmtVal(r.ubicacion)],
      [['Lat / Lon', ''], r.lat != null && r.lon != null ? r.lat.toFixed(5) + ', ' + r.lon.toFixed(5) : '—'],
      [['Otorga', ''], fmtVal(r.otorga)],
      [['Vence', ''], fmtVal(r.vence)]
    ];

    let dl = '<dl class="station-detail-grid">';
    rows.forEach(function (row) {
      const dt = row[0];
      const label = Array.isArray(dt) ? dt[0] : dt;
      const ddClass = Array.isArray(dt) && dt[1] ? dt[1] : '';
      const val = row[1];
      dl += '<dt>' + escapeHtml(label) + '</dt><dd' + (ddClass ? ' class="' + escapeHtml(ddClass) + '"' : '') + '>' + escapeHtml(val) + '</dd>';
    });
    dl += '</dl>';
    bodyEl.innerHTML = dl;

    try {
      mapLink.href = typeof buildMapViewURLForStation === 'function'
        ? buildMapViewURLForStation(signal)
        : (function () {
            const u = new URL('index.html', window.location.href);
            u.searchParams.set('signal', signal);
            return u.pathname + u.search + (u.hash || '');
          })();
    } catch (e) {
      mapLink.href = 'index.html?signal=' + encodeURIComponent(signal);
    }

    mapLink.setAttribute('aria-label', 'Ver ' + (r.signal || 'estación') + ' en el mapa');

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
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    stationDetailCurrentSignal = null;
    if (bodyEl) bodyEl.innerHTML = '';
    try {
      if (stationDetailLastFocus && typeof stationDetailLastFocus.focus === 'function') {
        stationDetailLastFocus.focus();
      }
    } catch (e) { /* ignore */ }
    stationDetailLastFocus = null;
  }

  function render(filtered) {
    const main = document.getElementById('main-content');
    document.getElementById('shown-count').textContent = filtered.length;
    document.getElementById('total-count').textContent = NODES.length;
    document.getElementById('regions-count').textContent = filtered.length ? new Set(filtered.map(r => r.region || '')).size : 0;
    document.getElementById('clubs-count').textContent = filtered.length ? new Set(filtered.map(r => r.nombre).filter(Boolean)).size : 0;
    document.getElementById('filter-nearme').textContent = getNearMeLocation() ? ' · cerca de mí' : '';

    if (filtered.length === 0) {
      main.innerHTML = typeof buildGuidedEmptyStateHtml === 'function'
        ? buildGuidedEmptyStateHtml()
        : '<div class="no-results">No se encontraron resultados para la búsqueda actual.</div>';
      return;
    }

    const nearMe = getNearMeLocation();
    const showDistance = !!nearMe;

    const byRegion = {};
    regionNames.forEach(reg => { byRegion[reg] = []; });
    filtered.forEach(r => {
      const reg = r.region || '';
      if (byRegion[reg] !== undefined) byRegion[reg].push(r);
    });

    let regionsToShow = regionNames.filter(reg => byRegion[reg] && byRegion[reg].length > 0);
    if (nearMe && regionsToShow.length > 1) {
      regionsToShow.sort((a, b) => {
        const minA = Math.min(...byRegion[a].map(r => r._dist ?? 9999));
        const minB = Math.min(...byRegion[b].map(r => r._dist ?? 9999));
        return minA - minB;
      });
    }

    const labels = ['Señal','Banda','RX (MHz)','TX (MHz)','Tono','Pot. W','Club / Titular','Comuna','Ubicación','Vence','Compartir'];
    if (showDistance) labels.splice(2, 0, 'Distancia');

    let html = '';
    regionsToShow.forEach(reg => {
      const rows = byRegion[reg];
      if (!rows || !rows.length) return;

      html += `<div class="zone-group" data-region="${reg}">
        <div class="zone-header">
          <span class="zone-badge" style="border-color: ${REGION_COLORS[reg]||'#5e35b1'}; color: ${REGION_COLORS[reg]||'#5e35b1'}">${reg || 'Sin región en el archivo de Subtel'}</span>
          <span class="zone-count"><span>${rows.length}</span> repetidor${rows.length !== 1 ? 'es' : ''}</span>
        </div>
        <table class="rpt-table">
          <thead><tr>
            <th>Señal</th><th>Banda</th>
            ${showDistance ? '<th>Distancia</th>' : ''}
            <th>RX (MHz)</th><th>TX (MHz)</th><th>Tono</th><th>Pot. W</th>
            <th>Club / Titular</th><th>Comuna</th><th>Ubicación</th><th>Vence</th><th>Compartir</th>
          </tr></thead>
          <tbody>`;

      rows.forEach(r => {
        const vc = venceClass(r.vence);
        const bc = bandaClass(r.banda);
        const bandaShort = (r.banda || '').replace('/FM','');
        const echolinkBadge = r.isEcholink ? `<span class="badge-echolink" title="${(r.echoLinkConference || '').replace(/"/g,'&quot;')}">Echolink</span>` : '';
        const distCell = showDistance ? `<td class="cell-dist" data-label="Distancia">${r._dist != null ? r._dist + ' km' : '—'}</td>` : '';
        const sigAttr = (r.signal || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const webLink = websiteLinkHtml(r);
        html += `<tr class="rpt-row" data-signal="${sigAttr}">
          <td class="cell-signal" data-label="${labels[0]}">${escapeHtml(r.signal || '—')}${webLink} ${echolinkBadge}</td>
          <td data-label="${labels[1]}"><span class="badge-banda ${bc}">${bandaShort}</span></td>
          ${distCell}
          <td class="cell-freq freq-rx" data-label="${labels[showDistance ? 3 : 2]}">${r.rx || '—'}</td>
          <td class="cell-freq freq-tx" data-label="${labels[showDistance ? 4 : 3]}">${r.tx || '—'}</td>
          <td class="cell-tone" data-label="${labels[showDistance ? 5 : 4]}">${r.tono || '—'}</td>
          <td class="cell-pot" data-label="${labels[showDistance ? 6 : 5]}">${r.potencia ? r.potencia + ' W' : '—'}</td>
          <td class="cell-club" data-label="${labels[showDistance ? 7 : 6]}"><strong>${r.nombre}</strong><small>${r.region}</small></td>
          <td class="cell-comuna" data-label="${labels[showDistance ? 8 : 7]}">${r.comuna || '—'}</td>
          <td class="cell-ub" data-label="${labels[showDistance ? 9 : 8]}" title="${r.ubicacion}">${r.ubicacion || '—'}</td>
          <td class="cell-vence ${vc}" data-label="${labels[showDistance ? 10 : 9]}">${r.vence || '—'}</td>
          <td class="cell-share" data-label="Compartir"><button type="button" class="share-btn" data-signal="${(r.signal||'').replace(/"/g,'&quot;')}" aria-label="Compartir ${(r.signal||'').replace(/"/g,'&quot;')}" title="Compartir detalles"><span class="material-symbols-outlined" aria-hidden="true">share</span></button></td>
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
      render(getFiltered());
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
        render(getFiltered());
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
    const title = r.signal || 'Radiomap';
    const text = 'Lista.';
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
    const btn = e.target.closest('.share-btn');
    if (btn && btn.dataset.signal !== undefined) {
      e.stopPropagation();
      shareStation(btn.dataset.signal);
      return;
    }
    const tr = e.target.closest('tr.rpt-row');
    if (!tr) return;
    const sig = tr.getAttribute('data-signal');
    if (sig) openStationDetail(sig);
  });

  (function initStationDetailDialog() {
    const overlay = document.getElementById('station-detail-overlay');
    const closeBtn = document.getElementById('station-detail-close');
    const shareBtn = document.getElementById('station-detail-share');
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
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      const ov = document.getElementById('station-detail-overlay');
      if (ov && ov.classList.contains('open')) {
        e.preventDefault();
        e.stopPropagation();
        closeStationDetail();
      }
    }, true);
  })();

  ['search','filter-banda','filter-region','filter-echolink','filter-echolink-conference'].forEach(id => {
    const el = document.getElementById(id);
    if (el) ['input','change'].forEach(ev => el.addEventListener(ev, () => {
      if (typeof saveFilterState === 'function') saveFilterState();
      render(getFiltered());
    }));
  });

  updateNearMeButtonState();

  function closeMenu() {
    document.getElementById('header-menu').classList.remove('open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
  }

  document.getElementById('menu-toggle').addEventListener('click', function() {
    const menu = document.getElementById('header-menu');
    const open = menu.classList.toggle('open');
    this.setAttribute('aria-expanded', open);
  });

  function getExportCriteria() {
    const banda = document.getElementById('filter-banda');
    const region = document.getElementById('filter-region');
    const echolink = document.getElementById('filter-echolink');
    const echolinkConference = document.getElementById('filter-echolink-conference');
    const search = document.getElementById('search');
    return {
      banda: banda ? banda.value : '',
      region: region ? region.value : '',
      echolink: echolink ? echolink.value : '',
      echoLinkConference: echolinkConference ? echolinkConference.value : '',
      search: search ? search.value.trim() : '',
      nearMe: !!getNearMeLocation()
    };
  }
  document.querySelectorAll('#btn-download-csv, #btn-download-csv-menu').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      exportRepeatersCSV(getFiltered(), getExportCriteria());
      closeMenu();
    });
  });

  document.addEventListener('click', function(e) {
    const menu = document.getElementById('header-menu');
    const toggle = document.getElementById('menu-toggle');
    if (menu.classList.contains('open') && !menu.contains(e.target) && !toggle.contains(e.target)) {
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
          openStationDetail(sig);
        });
      });
    } catch (e) { /* ignore */ }
  })();
})();
