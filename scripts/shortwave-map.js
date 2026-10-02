/**
 * Onda corta — capa del mapa con emisoras internacionales probablemente al aire ahora (horarios EiBi).
 * - Datos: data/shortwave.js (global SHORTWAVE), cargado bajo demanda al activar el botón.
 * - Lógica de «al aire» y formatos: scripts/shortwave-live.js (window.radiomapShortwaveLive).
 * - Carga y hora de evaluación: scripts/shortwave-loader.js (window.radiomapShortwaveLoader).
 * - Al activar se muestra la vista mundial de los transmisores al aire; al desactivar se vuelve a la vista anterior.
 * Estado: sessionStorage `ra-shortwave-visible` + parámetro URL `sw=1`. Depuración: `?swnow=2026-09-25T00:00Z`.
 * Filtros del panel (zona objetivo, banda, idioma): shortwave-filters.js (window.radiomapShortwaveFilters),
 * compartidos con la lista; URL `swtgt` / `swband` / `swlang` + sesión.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ra-shortwave-visible';
  var PANE = 'radiomapShortwavePane';
  var REFRESH_MS = 60000;
  var POPUP_MAX_ITEMS = 60;

  var on = false;
  var layer = null;
  var savedView = null;
  var timer = null;
  var shownCount = 0;

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

  function filt() {
    return window.radiomapShortwaveFilters;
  }

  /** Texto del buscador del mapa (#search), normalizado; también filtra la capa de onda corta. */
  function searchQuery() {
    var el = document.getElementById('search');
    var v = el && el.value ? el.value.trim() : '';
    return v ? live().foldText(v) : '';
  }

  function now() {
    return window.radiomapShortwaveLoader.now();
  }

  function ensureData() {
    return window.radiomapShortwaveLoader.ensureData();
  }

  function langLabel(sw, code) {
    return live().langLabel(sw, code);
  }

  function slotLabel(entry, ref) {
    return live().slotLabel(entry, ref);
  }

  function markerSize(n) {
    return Math.round(18 + Math.min(18, Math.sqrt(n) * 4));
  }

  /** `label`: nombre accesible (lectores de pantalla), sin tooltip visible. */
  function siteIcon(site, n, label) {
    var size = markerSize(n);
    var approx = site[5] !== 'site';
    return L.divIcon({
      className: '',
      html: '<div class="sw-marker' + (approx ? ' sw-marker--approx' : '') + '" role="img" aria-label="' + esc(label) + '" style="width:' + size + 'px;height:' + size + 'px">' + n + '</div>',
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
    var all = filt().annotate(live().liveEntries(sw, ref, {}));
    var q = searchQuery();
    var shown = all.filter(function (it) { return filt().passes(it, q, null); });
    filt().update(panelHost(), sw, all, q);
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
      // Sin tooltip al pasar el mouse: el detalle va en el popup al hacer clic.
      var label = (site[5] === 'site' ? site[2] : (sw.countries[site[0]] || site[0])) + ' · ' + n + ' al aire';
      var mk = L.marker(ll, { icon: siteIcon(site, n, label), pane: PANE, keyboard: true });
      mk.bindPopup(function () { return popupHtml(sw, site, g.items, ref); }, {
        className: 'sw-popup', maxWidth: 320, autoPanPadding: [24, 24]
      });
      mk.addTo(layer);
    });
    updatePanel(total, groups.length, ref, q);
    shownCount = total;
    syncMapEmptyOverlay();
    return bounds;
  }

  /** El aviso «Sin resultados» del mapa (map.js) considera también las emisoras visibles. */
  function syncMapEmptyOverlay() {
    if (typeof window.radiomapUpdateMapEmptyOverlay === 'function') window.radiomapUpdateMapEmptyOverlay();
  }

  function panelHost() {
    return document.getElementById('shortwave-panel-host');
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
      filt().barHtml() +
      '<p class="sw-panel__note">Según horarios publicados; oírlas depende de la propagación.</p>' +
      '<p class="sw-panel__attr">Datos: <a href="http://www.eibispace.de/" target="_blank" rel="noopener">EiBi</a>' + esc(season) + '</p>';
    host.setAttribute('data-ready', '1');
    host.addEventListener('click', onPanelClick);
  }

  function onPanelClick(ev) {
    var t = ev.target.closest ? ev.target.closest('button') : null;
    if (!t) return;
    if (t.hasAttribute('data-sw-close')) disable();
  }

  function updatePanel(total, sites, ref, q) {
    var host = panelHost();
    if (!host) return;
    var c = host.querySelector('[data-sw-count]');
    if (c) {
      var el = document.getElementById('search');
      var raw = q && el ? el.value.trim() : '';
      c.textContent = total + (total === 1 ? ' emisión' : ' emisiones') + ' · ' + sites + (sites === 1 ? ' sitio' : ' sitios') +
        (raw ? ' · «' + raw + '»' : '');
    }
    var k = host.querySelector('[data-sw-clock]');
    if (k) {
      k.textContent = live().clockLabel(ref);
    }
  }

  function syncButton() {
    var btn = document.getElementById('btn-shortwave-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.disabled = !on && window.radiomapShortwaveLoader.isLoading();
  }

  function syncUrl() {
    try {
      var url = new URL(window.location.href);
      if (on) url.searchParams.set('sw', '1');
      else url.searchParams.delete('sw');
      filt().writeUrl(url, on);
      history.replaceState(history.state, '', url.toString());
    } catch (e) { /* ignore */ }
  }

  /** Parámetros URL de los filtros activos ({ swband: '49m,31m', … }); vacío si la capa está apagada. */
  function shareParams() {
    return on ? filt().shareParams() : {};
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
      filt().load();
      filt().validateLangs(SHORTWAVE);
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
    filt().closeAll(null);
    if (host) host.hidden = true;
    if (map) {
      map.closePopup();
      if (savedView) map.setView(savedView.center, savedView.zoom, { animate: false });
    }
    savedView = null;
    shownCount = 0;
    syncMapEmptyOverlay();
    persist();
    syncUrl();
    syncButton();
    if (typeof window.radiomapGaShortwaveToggle === 'function') window.radiomapGaShortwaveToggle('off');
  }

  /** Llamado por applyFilters (map.js) cuando cambia la búsqueda: refiltra y encuadra lo que coincide. */
  function onSearch() {
    var map = getMap();
    if (!on || !map) return;
    var bounds = render();
    if (bounds && bounds.isValid()) map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 4, duration: 0.5 });
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

  // Filtros del panel: al cambiar, redibujar y actualizar la URL.
  filt().onChange(function () {
    if (!on) return;
    render();
    syncUrl();
  });

  window.radiomapShortwave = {
    enable: enable,
    disable: disable,
    toggle: toggle,
    isOn: function () { return on; },
    shownCount: function () { return on ? shownCount : 0; },
    render: render,
    onSearch: onSearch,
    shareParams: shareParams
  };

  // Se carga después de map.js (necesita window.__radiomapLeafletMap).
  if (getMap()) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
