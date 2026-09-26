/**
 * Onda corta — capa del mapa con emisoras internacionales probablemente al aire ahora (horarios EiBi).
 * - Datos: data/shortwave.js (global SHORTWAVE), cargado bajo demanda al activar el botón.
 * - Lógica de «al aire»: scripts/shortwave-live.js (window.radiomapShortwaveLive).
 * - Al activar se muestra la vista mundial de los transmisores al aire; al desactivar se vuelve a la vista anterior.
 * Estado: sessionStorage `ra-shortwave-visible` + parámetro URL `sw=1`. Depuración: `?swnow=2026-09-25T00:00Z`.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ra-shortwave-visible';
  var PANE = 'radiomapShortwavePane';
  var REFRESH_MS = 60000;
  var POPUP_MAX_ITEMS = 60;

  var on = false;
  var loading = null;
  var layer = null;
  var savedView = null;
  var timer = null;
  var filters = { americasOnly: true, lang: null };

  var fmtChile = null;
  try {
    fmtChile = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch (e) {
    fmtChile = null;
  }

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }

  function getMap() {
    return window.__radiomapLeafletMap || null;
  }

  function live() {
    return window.radiomapShortwaveLive;
  }

  /** Hora de evaluación: ahora, o `?swnow=` (ISO) para verificar horarios. */
  function now() {
    try {
      var p = new URLSearchParams(window.location.search).get('swnow');
      if (p) {
        var d = new Date(p);
        if (!isNaN(d.getTime())) return d;
      }
    } catch (e) { /* ignore */ }
    return new Date();
  }

  function ensureData() {
    if (typeof SHORTWAVE !== 'undefined') return Promise.resolve(SHORTWAVE);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var v = typeof VERSION !== 'undefined' ? VERSION : '';
      s.src = 'data/shortwave.js' + (v ? '?v=' + encodeURIComponent(v) : '');
      s.async = true;
      s.onload = function () {
        if (typeof SHORTWAVE !== 'undefined') resolve(SHORTWAVE);
        else reject(new Error('SHORTWAVE no definido'));
      };
      s.onerror = function () { reject(new Error('No se pudo cargar data/shortwave.js')); };
      document.head.appendChild(s);
    }).catch(function (err) {
      loading = null;
      throw err;
    });
    return loading;
  }

  /** «S,Q» → ['S','Q'] (EiBi usa códigos combinados para emisiones bilingües). */
  function langsOf(code) {
    return String(code || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  }

  function langLabel(sw, code) {
    return langsOf(code).map(function (c) { return sw.langs[c] || c; }).join(' / ');
  }

  function hhmm(min) {
    if (min === 1440) return '24:00';
    var h = Math.floor(min / 60) % 24;
    var m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function chileTime(min, ref) {
    if (!fmtChile) return '';
    var d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), 0, min % 1440));
    return fmtChile.format(d);
  }

  function slotLabel(entry, ref) {
    var F = live().FIELDS;
    var s = entry[F.START];
    var e = entry[F.END];
    if (s === 0 && e === 1440) return 'las 24 h';
    var utc = hhmm(s) + '–' + hhmm(e) + ' UTC';
    var cl = chileTime(s, ref);
    return cl ? utc + ' · ' + cl + '–' + chileTime(e, ref) + ' Chile' : utc;
  }

  function markerSize(n) {
    return Math.round(18 + Math.min(18, Math.sqrt(n) * 4));
  }

  function siteIcon(site, n) {
    var size = markerSize(n);
    var approx = site[5] !== 'site';
    return L.divIcon({
      className: '',
      html: '<div class="sw-marker' + (approx ? ' sw-marker--approx' : '') + '" style="width:' + size + 'px;height:' + size + 'px">' + n + '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function popupHtml(sw, site, items, ref) {
    var F = live().FIELDS;
    var country = sw.countries[site[0]] || site[0];
    var approx = site[5] !== 'site';
    var html = '<div class="sw-popup__head"><strong>' + esc(approx ? country : site[2]) + '</strong>' +
      (approx ? '' : ' <span class="sw-popup__country">' + esc(country) + '</span>') + '</div>';
    if (approx) html += '<div class="sw-popup__note">Sitio de transmisión no publicado: ubicación aproximada.</div>';
    html += '<ul class="sw-popup__list">';
    items.slice(0, POPUP_MAX_ITEMS).forEach(function (it) {
      var en = it.entry;
      var st = sw.stations[en[F.STATION]];
      var lang = langLabel(sw, en[F.LANG]);
      var target = en[F.TARGET] ? (sw.targets[en[F.TARGET]] || en[F.TARGET]) : '';
      html += '<li class="sw-popup__item">' +
        '<span class="sw-popup__khz">' + esc(en[F.KHZ]) + ' kHz</span> ' +
        '<span class="sw-popup__station">' + esc(st[0]) + '</span>' +
        '<div class="sw-popup__meta">' + esc([lang, target ? '→ ' + target : ''].filter(Boolean).join(' ')) + '</div>' +
        '<div class="sw-popup__time">' + esc(slotLabel(en, ref)) + '</div>' +
        '</li>';
    });
    html += '</ul>';
    if (items.length > POPUP_MAX_ITEMS) html += '<div class="sw-popup__note">… y ' + (items.length - POPUP_MAX_ITEMS) + ' más</div>';
    return html;
  }

  function ensureLayer(map) {
    if (!map.getPane(PANE)) map.createPane(PANE).style.zIndex = 590;
    if (!layer) layer = L.layerGroup();
    if (!map.hasLayer(layer)) layer.addTo(map);
    return layer;
  }

  /** Dibuja marcadores; devuelve LatLngBounds de lo dibujado. */
  function render() {
    var map = getMap();
    if (!map || typeof SHORTWAVE === 'undefined' || !live()) return null;
    var sw = SHORTWAVE;
    var ref = now();
    // Idiomas: se cuentan sobre lo que está al aire con los demás filtros, para poblar el selector.
    var F = live().FIELDS;
    var all = live().liveEntries(sw, ref, { americasOnly: filters.americasOnly });
    var langCounts = {};
    all.forEach(function (it) {
      langsOf(it.entry[F.LANG]).forEach(function (c) { langCounts[c] = (langCounts[c] || 0) + 1; });
    });
    var shown = filters.lang
      ? all.filter(function (it) { return langsOf(it.entry[F.LANG]).indexOf(filters.lang) !== -1; })
      : all;
    updateLangSelect(sw, langCounts, all.length);
    var groups = live().groupBySite(shown);
    ensureLayer(map).clearLayers();
    var bounds = L.latLngBounds([]);
    var total = 0;
    groups.forEach(function (g) {
      var site = sw.sites[g.siteIdx];
      var ll = L.latLng(site[3], site[4]);
      var n = g.items.length;
      total += n;
      bounds.extend(ll);
      var mk = L.marker(ll, { icon: siteIcon(site, n), pane: PANE, keyboard: true, title: site[2] });
      // Mismo patrón que los repetidores: .rpt-tooltip es transparente, el fondo lo pone .rpt-tooltip-inner.
      mk.bindTooltip('<div class="rpt-tooltip-inner">' + esc(site[5] === 'site' ? site[2] : (sw.countries[site[0]] || site[0])) +
        ' <span class="rpt-tooltip-meta">· ' + n + ' al aire</span></div>', {
        direction: 'top', opacity: 1, className: 'rpt-tooltip'
      });
      mk.bindPopup(function () { return popupHtml(sw, site, g.items, ref); }, {
        className: 'sw-popup', maxWidth: 320, autoPanPadding: [24, 24]
      });
      mk.addTo(layer);
    });
    updatePanel(total, groups.length, ref);
    return bounds;
  }

  function panelHost() {
    return document.getElementById('shortwave-panel-host');
  }

  function chip(attr, value, label, pressed) {
    return '<button type="button" class="sw-chip" ' + attr + '="' + esc(value) + '" aria-pressed="' + (pressed ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  function buildPanel() {
    var host = panelHost();
    if (!host || host.getAttribute('data-ready') === '1') return;
    var season = typeof SHORTWAVE !== 'undefined' && SHORTWAVE.meta && SHORTWAVE.meta.season ? ' · temporada ' + SHORTWAVE.meta.season : '';
    host.innerHTML =
      '<div class="sw-panel__head">' +
      '<span class="material-symbols-outlined" aria-hidden="true">settings_input_antenna</span>' +
      '<strong>Onda corta al aire</strong>' +
      '<button type="button" class="sw-panel__close" data-sw-close aria-label="Ocultar onda corta"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>' +
      '</div>' +
      '<div class="sw-panel__stats"><span data-sw-count>…</span><span class="sw-panel__clock" data-sw-clock></span></div>' +
      '<div class="sw-panel__chips">' +
      chip('data-sw-toggle', 'americasOnly', 'Dirigidas a América', filters.americasOnly) +
      '</div>' +
      '<label class="sw-panel__lang">Idioma <select data-sw-lang-select></select></label>' +
      '<p class="sw-panel__note">Según horarios publicados; oírlas depende de la propagación.</p>' +
      '<p class="sw-panel__attr">Datos: <a href="http://www.eibispace.de/" target="_blank" rel="noopener">EiBi</a>' + esc(season) + '</p>';
    host.setAttribute('data-ready', '1');
    host.addEventListener('click', onPanelClick);
    host.querySelector('[data-sw-lang-select]').addEventListener('change', function (ev) {
      filters.lang = ev.target.value || null;
      render();
    });
  }

  /** Opciones: «Todos» + idiomas al aire ahora (más emisiones primero). El elegido se mantiene aunque quede en 0. */
  function updateLangSelect(sw, counts, total) {
    var host = panelHost();
    var sel = host && host.querySelector('[data-sw-lang-select]');
    if (!sel) return;
    if (filters.lang && !counts[filters.lang]) counts[filters.lang] = 0;
    var codes = Object.keys(counts).sort(function (a, b) {
      var la = sw.langs[a] || a;
      var lb = sw.langs[b] || b;
      return counts[b] - counts[a] || la.localeCompare(lb, 'es');
    });
    sel.innerHTML = '<option value="">Todos (' + total + ')</option>' + codes.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(sw.langs[c] || c) + ' (' + counts[c] + ')</option>';
    }).join('');
    sel.value = filters.lang || '';
  }

  function onPanelClick(ev) {
    var t = ev.target.closest ? ev.target.closest('button') : null;
    if (!t) return;
    if (t.hasAttribute('data-sw-close')) {
      disable();
      return;
    }
    if (t.hasAttribute('data-sw-toggle')) {
      var k = t.getAttribute('data-sw-toggle');
      filters[k] = !filters[k];
      t.setAttribute('aria-pressed', filters[k] ? 'true' : 'false');
      render();
      return;
    }
  }

  function updatePanel(total, sites, ref) {
    var host = panelHost();
    if (!host) return;
    var c = host.querySelector('[data-sw-count]');
    if (c) c.textContent = total + (total === 1 ? ' emisión' : ' emisiones') + ' · ' + sites + (sites === 1 ? ' sitio' : ' sitios');
    var k = host.querySelector('[data-sw-clock]');
    if (k) {
      var utc = hhmm(ref.getUTCHours() * 60 + ref.getUTCMinutes()) + ' UTC';
      k.textContent = fmtChile ? utc + ' · ' + fmtChile.format(ref) + ' Chile' : utc;
    }
  }

  function syncButton() {
    var btn = document.getElementById('btn-shortwave-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.disabled = !!loading && !on && typeof SHORTWAVE === 'undefined';
  }

  function syncUrl() {
    try {
      var url = new URL(window.location.href);
      if (on) url.searchParams.set('sw', '1');
      else url.searchParams.delete('sw');
      history.replaceState(history.state, '', url.toString());
    } catch (e) { /* ignore */ }
  }

  function persist() {
    try { sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(function () {
      if (!document.hidden) render();
    }, REFRESH_MS);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function onVisibility() {
    if (on && !document.hidden) render();
  }

  function enable(opts) {
    opts = opts || {};
    var map = getMap();
    if (on || !map) return Promise.resolve();
    var btn = document.getElementById('btn-shortwave-toggle');
    if (btn) btn.disabled = true;
    return ensureData().then(function () {
      on = true;
      savedView = { center: map.getCenter(), zoom: map.getZoom() };
      buildPanel();
      var host = panelHost();
      if (host) host.hidden = false;
      var bounds = render();
      if (!opts.keepView) {
        if (bounds && bounds.isValid()) map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 4, duration: 0.8 });
        else map.setView([15, 0], 2);
      }
      startTimer();
      document.addEventListener('visibilitychange', onVisibility);
      persist();
      syncUrl();
      if (typeof window.radiomapGaShortwaveToggle === 'function') window.radiomapGaShortwaveToggle('on');
    }).catch(function (err) {
      on = false;
      if (window.console) console.error(err);
      alert('No se pudieron cargar los datos de onda corta. Intente nuevamente.');
    }).then(function () {
      if (btn) btn.disabled = false;
      syncButton();
    });
  }

  function disable() {
    var map = getMap();
    if (!on) return;
    on = false;
    stopTimer();
    document.removeEventListener('visibilitychange', onVisibility);
    if (layer) layer.clearLayers();
    if (map && layer && map.hasLayer(layer)) map.removeLayer(layer);
    var host = panelHost();
    if (host) host.hidden = true;
    if (map) {
      map.closePopup();
      if (savedView) map.setView(savedView.center, savedView.zoom, { animate: false });
    }
    savedView = null;
    persist();
    syncUrl();
    syncButton();
    if (typeof window.radiomapGaShortwaveToggle === 'function') window.radiomapGaShortwaveToggle('off');
  }

  function toggle() {
    return on ? (disable(), Promise.resolve()) : enable();
  }

  function init() {
    var btn = document.getElementById('btn-shortwave-toggle');
    if (!btn || !getMap()) return;
    btn.addEventListener('click', toggle);
    var fromUrl = false;
    var fromSession = false;
    try { fromUrl = new URLSearchParams(window.location.search).get('sw') === '1'; } catch (e) { /* ignore */ }
    try { fromSession = sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* ignore */ }
    if (fromUrl || fromSession) {
      // Dejar que map.js termine de aplicar la vista/filtros de la URL antes de abrir el mundo.
      requestAnimationFrame(function () { requestAnimationFrame(function () { enable(); }); });
    }
  }

  window.radiomapShortwave = {
    enable: enable,
    disable: disable,
    toggle: toggle,
    isOn: function () { return on; },
    render: render
  };

  // Se carga después de map.js (necesita window.__radiomapLeafletMap).
  if (getMap()) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
