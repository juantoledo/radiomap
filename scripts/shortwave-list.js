/**
 * Onda corta — zona «ONDA CORTA» en la lista (lista.html): emisoras al aire ahora + las que comienzan
 * en la próxima hora, agrupadas por banda, para leer la frecuencia y sintonizarla en el receptor.
 * - Datos: data/shortwave.js (global SHORTWAVE) vía shortwave-loader.js, solo al activar el botón.
 * - Lógica y formatos: shortwave-live.js. Filtros: buscador (#search) + barra «Dirigidas a» / «Banda» / «Idioma»
 *   de shortwave-filters.js (la misma del mapa; se comparte por sesión y URL). Los filtros de repetidoras
 *   (región / banda / tipo) no aplican aquí.
 * - list.js inserta zoneHtml() al final de la lista en cada render, luego llama hydrate() (rellena los filtros);
 *   expone window.radiomapListRender. Cambios de filtros y el refresco por minuto actualizan la zona en su lugar.
 * Estado compartido con el mapa: sessionStorage `ra-shortwave-visible` + parámetro URL `sw=1`.
 * Requiere: utils.js (escapeHtml), global-groups.js (shouldGroupBeOpen, setGroupOpen).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ra-shortwave-visible';
  var REFRESH_MS = 60000;
  var UPCOMING_MIN = 60;
  var ZONE_KEY = 'region:ONDA CORTA';
  var ZONE_ID = 'sw-zone';

  var on = false;
  var timer = null;

  function live() {
    return window.radiomapShortwaveLive;
  }

  function loader() {
    return window.radiomapShortwaveLoader;
  }

  function filt() {
    return window.radiomapShortwaveFilters;
  }

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }

  /** Texto del buscador (#search), normalizado. */
  function searchQuery() {
    var el = document.getElementById('search');
    var v = el && el.value ? el.value.trim() : '';
    return v ? live().foldText(v) : '';
  }

  function groupOpen(key, isFiltering) {
    return typeof window.shouldGroupBeOpen === 'function' ? window.shouldGroupBeOpen(key, isFiltering) : true;
  }

  function cell(cls, label, text) {
    var has = text != null && String(text).trim() !== '';
    return '<td class="' + cls + (has ? '' : ' cell-empty') + '" data-label="' + label + '">' + (has ? esc(text) : '') + '</td>';
  }

  /** Transmisor: «Sitio (País)»; si la ubicación es aproximada, solo el país. */
  function siteLabel(sw, site) {
    if (!site) return '';
    var country = sw.countries[site[0]] || site[0];
    return site[5] === 'site' ? site[2] + ' (' + country + ')' : country;
  }

  function rowHtml(sw, it, ref, upcoming) {
    var F = live().FIELDS;
    var en = it.entry;
    var st = sw.stations[en[F.STATION]] || [];
    var target = en[F.TARGET] ? (sw.targets[en[F.TARGET]] || en[F.TARGET]) : '';
    var chip = upcoming ? '<span class="sw-chip">en ' + it.startsIn + ' min</span>' : '';
    // «HH:MM–HH:MM UTC · HH:MM–HH:MM Chile» → una línea por zona horaria.
    var slot = live().slotLabel(en, ref).split(' · ').map(function (p) { return '<span class="sw-slot">' + esc(p) + '</span>'; }).join('');
    return '<tr class="sw-row' + (upcoming ? ' sw-row--upcoming' : '') + '">' +
      '<td class="cell-signal sw-cell-khz" data-label="kHz"><span class="sw-khz">' + esc(en[F.KHZ]) + '</span><span class="sw-khz-unit">kHz</span></td>' +
      cell('sw-cell-station', 'Emisora', st[0]) +
      cell('sw-cell-lang', 'Idioma', live().langLabel(sw, en[F.LANG])) +
      cell('sw-cell-target', 'Dirigida a', target) +
      '<td class="sw-cell-time" data-label="Horario">' + chip + slot + '</td>' +
      cell('sw-cell-site', 'Transmisor', siteLabel(sw, sw.sites[en[F.SITE]])) +
      '</tr>';
  }

  function subgroupHtml(key, title, items, rowFn, isFiltering) {
    return '<details class="global-group global-subgroup sw-subgroup" data-group-key="' + key + '"' + (groupOpen(key, isFiltering) ? ' open' : '') + '>' +
      '<summary class="global-group__summary"><span class="global-group__title">' + esc(title) + '</span>' +
      '<span class="global-group__count">' + items.length + '</span></summary>' +
      '<div class="global-panel-table-wrap"><table class="rpt-table sw-table"><thead><tr>' +
      '<th class="sw-col-khz">kHz</th><th class="sw-col-station">Emisora</th><th class="sw-col-lang">Idioma</th>' +
      '<th class="sw-col-target">Dirigida a</th><th class="sw-col-time">Horario</th><th class="sw-col-site">Transmisor</th>' +
      '</tr></thead><tbody>' + items.map(rowFn).join('') + '</tbody></table></div></details>';
  }

  function byKhz(a, b) {
    var F = live().FIELDS;
    return a.entry[F.KHZ] - b.entry[F.KHZ] || a.entry[F.START] - b.entry[F.START];
  }

  /**
   * Emisiones de la zona en este instante: `all` = al aire (anotadas con banda/zona, para los conteos de los
   * filtros); `liveShown` / `upcoming` = lo que pasa búsqueda + filtros.
   */
  function compute() {
    var sw = SHORTWAVE;
    var ref = loader().now();
    var q = searchQuery();
    var pass = function (it) { return filt().passes(it, q, null); };
    var all = filt().annotate(live().liveEntries(sw, ref, {}));
    var upcoming = filt().annotate(live().upcomingEntries(sw, ref, { withinMin: UPCOMING_MIN })).filter(pass);
    return { sw: sw, ref: ref, q: q, all: all, liveShown: all.filter(pass), upcoming: upcoming };
  }

  /** Una subsección por banda (120 m → 11 m, luego «Fuera de banda») + «Comienzan en la próxima hora». */
  function bodyHtml(c) {
    var sw = c.sw;
    var ref = c.ref;
    var isFiltering = !!c.q || filt().isActive();
    var byBand = {};
    c.liveShown.forEach(function (it) {
      (byBand[it.band] = byBand[it.band] || []).push(it);
    });
    var liveRow = function (it) { return rowHtml(sw, it, ref, false); };
    var html = '';
    live().BANDS.map(function (b) { return b[2]; }).concat([live().BAND_OOB]).forEach(function (id) {
      var items = byBand[id];
      if (!items || !items.length) return;
      var range = live().bandRange(id);
      items.sort(byKhz);
      html += subgroupHtml('sw:' + id, live().bandLabel(id) + (range ? ' · ' + range : ''), items, liveRow, isFiltering);
    });
    if (c.upcoming.length) {
      c.upcoming.sort(function (a, b) { return a.startsIn - b.startsIn || byKhz(a, b); });
      html += subgroupHtml('sw:upcoming', 'Comienzan en la próxima hora', c.upcoming, function (it) { return rowHtml(sw, it, ref, true); }, isFiltering);
    }
    if (html) return html;
    return '<p class="sw-zone__empty">' + (isFiltering
      ? 'Ninguna emisión coincide con los filtros.'
      : 'No hay emisiones al aire en este momento.') + '</p>';
  }

  /** «N al aire · reloj», o «N de M al aire · reloj» si la búsqueda o los filtros reducen la lista. */
  function countHtml(c) {
    var n = c.liveShown.length;
    var m = c.all.length;
    return '<span>' + n + '</span>' + (n !== m ? ' de ' + m : '') + ' al aire · ' + esc(live().clockLabel(c.ref));
  }

  /** ¿Ocultar la zona? Solo si la búsqueda (sin filtros propios) no coincide con nada. */
  function zoneHidden(c) {
    return !!c.q && !filt().isActive() && !c.liveShown.length && !c.upcoming.length;
  }

  /**
   * HTML de la zona «ONDA CORTA» ('' si está apagada, sin datos, o la búsqueda no coincide con nada).
   * Estructura: cabecera + nota + barra de filtros (shortwave-filters.js) + cuerpo; la barra se rellena en hydrate().
   */
  function zoneHtml() {
    if (!on || typeof SHORTWAVE === 'undefined' || !live() || !loader() || !filt()) return '';
    var c = compute();
    if (zoneHidden(c)) return '';
    var sw = c.sw;
    var isFiltering = !!c.q || filt().isActive();
    var season = sw.meta && sw.meta.season ? ' (temporada ' + esc(sw.meta.season) + ')' : '';
    return '<div class="zone-group zone-group--sw" id="' + ZONE_ID + '" data-region="ONDA CORTA">' +
      '<details class="global-group" data-group-key="' + ZONE_KEY + '"' + (groupOpen(ZONE_KEY, isFiltering) ? ' open' : '') + '>' +
      '<summary class="global-group__summary"><span class="zone-badge zone-badge--sw">ONDA CORTA</span>' +
      '<span class="zone-count" data-sw-zone-count>' + countHtml(c) + '</span></summary>' +
      '<p class="sw-zone__note">Emisoras internacionales según horarios <a href="http://www.eibispace.de/" target="_blank" rel="noopener">EiBi</a>' + season +
      '; oírlas depende de la propagación. Se actualiza cada minuto.</p>' +
      '<div class="sw-zone__filters">' + filt().barHtml() + '</div>' +
      '<div class="sw-zone__body">' + bodyHtml(c) + '</div>' +
      '</details></div>';
  }

  function zoneFilters(el) {
    return el ? el.querySelector('.sw-zone__filters') : null;
  }

  /** Tras cada render de list.js: rellena los desplegables de filtros (se construyen vía DOM). */
  function hydrate() {
    var el = document.getElementById(ZONE_ID);
    if (!el || !on || typeof SHORTWAVE === 'undefined') return;
    var c = compute();
    filt().update(zoneFilters(el), c.sw, c.all, c.q);
    observeSummaryHeight(el);
  }

  // La barra de filtros es pegajosa justo bajo la cabecera (también pegajosa) de la zona; esa cabecera
  // envuelve a dos líneas en pantallas angostas, así que su alto se publica como --sw-summary-h.
  var summaryObserver = null;
  function observeSummaryHeight(el) {
    var summary = el.querySelector('.global-group__summary');
    if (!summary) return;
    var apply = function () { el.style.setProperty('--sw-summary-h', summary.offsetHeight + 'px'); };
    apply();
    if (typeof ResizeObserver !== 'function') return;
    if (summaryObserver) summaryObserver.disconnect();
    summaryObserver = new ResizeObserver(apply);
    summaryObserver.observe(summary);
  }

  function rerenderList() {
    if (typeof window.radiomapListRender === 'function') window.radiomapListRender();
  }

  /**
   * Refresco sin redibujar la lista: reemplaza solo el cuerpo y el conteo de la zona y actualiza los filtros
   * en su lugar (un desplegable abierto sigue abierto y la casilla marcada conserva el foco).
   */
  function refresh() {
    if (!on) return;
    var el = document.getElementById(ZONE_ID);
    if (!el || typeof SHORTWAVE === 'undefined') { rerenderList(); return; }
    var c = compute();
    if (zoneHidden(c)) { rerenderList(); return; }
    el.querySelector('.sw-zone__body').innerHTML = bodyHtml(c);
    el.querySelector('[data-sw-zone-count]').innerHTML = countHtml(c);
    filt().update(zoneFilters(el), c.sw, c.all, c.q);
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(function () {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function onVisibility() {
    if (on && !document.hidden) refresh();
  }

  function syncButton() {
    var btn = document.getElementById('btn-shortwave-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.disabled = !on && loader().isLoading();
  }

  /** `sw=1` y los filtros (`swtgt` / `swband` / `swlang`) mientras está activa; al apagar se quitan. */
  function syncUrl() {
    try {
      var url = new URL(window.location.href);
      if (on) url.searchParams.set('sw', '1');
      else url.searchParams.delete('sw');
      filt().writeUrl(url, on);
      history.replaceState(history.state, '', url.toString());
    } catch (e) { /* ignore */ }
  }

  function persist() {
    try { sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  /** opts.reveal: abrir la zona y desplazarse a ella (activación explícita o enlace con sw=1). */
  function enable(opts) {
    opts = opts || {};
    if (on) return Promise.resolve();
    var btn = document.getElementById('btn-shortwave-toggle');
    if (btn) btn.disabled = true;
    return loader().ensureData().then(function () {
      on = true;
      filt().load();
      filt().validateLangs(SHORTWAVE);
      if (opts.reveal && typeof window.setGroupOpen === 'function') window.setGroupOpen(ZONE_KEY, true);
      persist();
      syncUrl();
      rerenderList();
      startTimer();
      document.addEventListener('visibilitychange', onVisibility);
      if (opts.reveal) {
        requestAnimationFrame(function () {
          var el = document.getElementById(ZONE_ID);
          if (!el) return;
          // La barra .sticky-top de la lista tapa lo que queda arriba: descontar su alto.
          var bar = document.querySelector('.sticky-top');
          var offset = (bar ? bar.getBoundingClientRect().height : 0) + 8;
          window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - offset, behavior: 'smooth' });
        });
      }
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
    if (!on) return;
    on = false;
    filt().closeAll(null);
    stopTimer();
    document.removeEventListener('visibilitychange', onVisibility);
    persist();
    syncUrl();
    syncButton();
    rerenderList();
    if (typeof window.radiomapGaShortwaveToggle === 'function') window.radiomapGaShortwaveToggle('off');
  }

  function toggle() {
    return on ? (disable(), Promise.resolve()) : enable({ reveal: true });
  }

  function init() {
    var btn = document.getElementById('btn-shortwave-toggle');
    if (!btn) return;
    btn.addEventListener('click', toggle);
    var fromUrl = false;
    var fromSession = false;
    try { fromUrl = new URLSearchParams(window.location.search).get('sw') === '1'; } catch (e) { /* ignore */ }
    try { fromSession = sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* ignore */ }
    if (fromUrl || fromSession) enable({ reveal: fromUrl });
  }

  // Filtros de la zona: al cambiar, refrescar la zona en su lugar y actualizar la URL.
  filt().onChange(function () {
    if (!on) return;
    refresh();
    syncUrl();
  });

  // Misma interfaz que shortwave-map.js para share-view.js (sw=1 + filtros); list.js usa zoneHtml + hydrate.
  window.radiomapShortwave = {
    enable: enable,
    disable: disable,
    toggle: toggle,
    isOn: function () { return on; },
    shareParams: function () { return on ? filt().shareParams() : {}; },
    zoneHtml: zoneHtml,
    hydrate: hydrate
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
