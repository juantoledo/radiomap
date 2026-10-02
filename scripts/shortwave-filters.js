/**
 * Onda corta — filtros multiselección «Dirigidas a» / «Banda» / «Idioma», compartidos por el panel del mapa
 * (shortwave-map.js) y la zona «ONDA CORTA» de la lista (shortwave-list.js).
 * - Estado único por página; se guarda en la sesión (`ra-shortwave-filters`) para que la selección pase de
 *   Mapa a Lista y viceversa. Los parámetros URL `swtgt` / `swband` / `swlang` (listas separadas por coma)
 *   tienen prioridad al activar.
 * - Eventos delegados en `document`: sirven tanto para el panel fijo del mapa como para la zona de la lista,
 *   que se vuelve a dibujar en cada render.
 * Requiere: shortwave-live.js, location-filter.js (syncCheckboxGroup, getCheckedFilterValues).
 */
(function () {
  'use strict';

  var SESSION_KEY = 'ra-shortwave-filters';
  /** Filtro → parámetro URL. */
  var PARAMS = { lang: 'swlang', band: 'swband', target: 'swtgt' };
  var LABELS = { target: 'Dirigidas a', band: 'Banda', lang: 'Idioma' };

  var state = { lang: [], band: [], target: [] };
  var changeCb = null;

  function live() {
    return window.radiomapShortwaveLive;
  }

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }

  function bandIds() {
    return live().BANDS.map(function (b) { return b[2]; }).concat([live().BAND_OOB]);
  }

  var VALID = {
    band: function (v) { return bandIds().indexOf(v) !== -1; },
    target: function (v) { return live().TARGET_GROUPS.some(function (g) { return g.id === v; }); },
    lang: function (v) { return /^-?[A-Za-z0-9-]{1,8}$/.test(v); }
  };

  /** Lista sin vacíos, duplicados ni valores desconocidos. */
  function clean(key, values) {
    var seen = {};
    return (values || []).map(function (v) { return String(v).trim(); }).filter(function (v) {
      if (!v || seen[v] || !VALID[key](v)) return false;
      seen[v] = true;
      return true;
    });
  }

  /** Añade a cada emisión su banda y grupo de zona objetivo (para filtrar y contar). */
  function annotate(items) {
    var F = live().FIELDS;
    items.forEach(function (it) {
      it.band = live().bandOf(it.entry[F.KHZ]);
      it.target = live().targetGroupOf(it.entry[F.TARGET]);
    });
    return items;
  }

  /** ¿La emisión pasa los filtros y la búsqueda `q` (ya normalizada)? `except` omite un filtro (conteos por faceta). */
  function passes(it, q, except) {
    if (except !== 'lang' && state.lang.length &&
      !live().langsOf(it.entry[live().FIELDS.LANG]).some(function (c) { return state.lang.indexOf(c) !== -1; })) return false;
    if (except !== 'band' && state.band.length && state.band.indexOf(it.band) === -1) return false;
    if (except !== 'target' && state.target.length && state.target.indexOf(it.target) === -1) return false;
    return live().matchesQuery(SHORTWAVE, it.entry, q);
  }

  function isActive() {
    return !!(state.lang.length || state.band.length || state.target.length);
  }

  /** Cuenta, sobre lo que pasa los demás filtros, cuántas emisiones caen en cada valor de `facet`. */
  function facetCounts(items, q, facet, keysOf) {
    var counts = {};
    var total = 0;
    items.forEach(function (it) {
      if (!passes(it, q, facet)) return;
      total++;
      keysOf(it).forEach(function (k) { counts[k] = (counts[k] || 0) + 1; });
    });
    return { counts: counts, total: total };
  }

  /** Desplegable multiselección: <details> con lista de casillas (mismo marcado que los filtros del mapa). */
  function checklistHtml(key) {
    var label = LABELS[key];
    return '<div class="sw-panel__filter' + (key === 'lang' ? ' sw-panel__filter--wide' : '') + '">' +
      '<span class="sw-panel__filter-label">' + label + '</span>' +
      '<details class="sw-ms" data-sw-filter="' + key + '">' +
      '<summary class="sw-ms__summary"><span class="sw-ms__summary-text" data-sw-summary>…</span></summary>' +
      '<div class="sw-ms__panel filter-checkbox-list" role="group" aria-label="' + label + '"></div>' +
      '</details></div>';
  }

  /** Barra de filtros vacía; se rellena con update(). */
  function barHtml() {
    return '<div class="sw-panel__filters">' + checklistHtml('target') + checklistHtml('band') + checklistHtml('lang') + '</div>';
  }

  function checklistRowHtml(value, label, isAll) {
    var attr = isAll ? 'data-filter-all="1"' : 'data-filter-value="' + esc(value) + '"';
    return '<label class="filter-checkbox-row' + (isAll ? ' filter-checkbox-row--all' : '') + '">' +
      '<input type="checkbox" ' + attr + '>' +
      '<span class="sw-ms__label">' + esc(label) + '</span><span class="sw-ms__count" data-sw-n></span></label>';
  }

  /**
   * Rellena un desplegable: «Todas/Todos» + opciones [{ value, label, count }] en el orden dado.
   * Solo reconstruye las filas si cambia el conjunto u orden de valores (así no se pierde el foco al marcar);
   * si no, actualiza conteos y casillas en su lugar. `unit`: «zonas», «bandas»… para el resumen con 3+.
   */
  function fillChecklist(details, allLabel, unit, options, total, selected) {
    if (!details) return;
    var list = details.querySelector('.sw-ms__panel');
    var sig = options.map(function (o) { return o.value; }).join('|');
    if (list.getAttribute('data-sig') !== sig) {
      list.innerHTML = checklistRowHtml('', allLabel, true) + options.map(function (o) {
        return checklistRowHtml(o.value, o.label, false);
      }).join('');
      list.setAttribute('data-sig', sig);
    }
    var allInput = list.querySelector('input[data-filter-all]');
    allInput.checked = !selected.length;
    allInput.parentNode.querySelector('[data-sw-n]').textContent = total;
    var inputs = list.querySelectorAll('input[data-filter-value]');
    options.forEach(function (o, i) {
      inputs[i].checked = selected.indexOf(o.value) !== -1;
      inputs[i].parentNode.querySelector('[data-sw-n]').textContent = o.count;
    });
    var labels = options.filter(function (o) { return selected.indexOf(o.value) !== -1; })
      .map(function (o) { return o.label; });
    var sumEl = details.querySelector('[data-sw-summary]');
    sumEl.textContent = !labels.length ? allLabel + ' (' + total + ')'
      : labels.length <= 2 ? labels.join(', ')
        : labels.length + ' ' + unit;
    sumEl.parentNode.title = labels.length > 2 ? labels.join(', ') : '';
    // Resaltado visual del filtro que está acotando la lista (mapa y lista).
    details.classList.toggle('sw-ms--active', labels.length > 0);
  }

  /**
   * Conteos por faceta dentro de `root`: cada desplegable cuenta lo que está al aire (`items`, ya anotados)
   * con los demás filtros y la búsqueda aplicados. El valor elegido se mantiene aunque quede en 0.
   */
  function update(root, sw, items, q) {
    if (!root) return;
    var F = live().FIELDS;
    function box(key) { return root.querySelector('details[data-sw-filter="' + key + '"]'); }
    function isSel(key, v) { return state[key].indexOf(v) !== -1; }

    var targets = facetCounts(items, q, 'target', function (it) { return [it.target]; });
    var targetOpts = live().TARGET_GROUPS
      .filter(function (g) { return targets.counts[g.id] || isSel('target', g.id); })
      .map(function (g) { return { value: g.id, label: g.label, count: targets.counts[g.id] || 0 }; });
    fillChecklist(box('target'), 'Todas', 'zonas', targetOpts, targets.total, state.target);

    var bands = facetCounts(items, q, 'band', function (it) { return [it.band]; });
    var bandOpts = bandIds()
      .filter(function (id) { return bands.counts[id] || isSel('band', id); })
      .map(function (id) { return { value: id, label: live().bandLabel(id), count: bands.counts[id] || 0 }; });
    fillChecklist(box('band'), 'Todas', 'bandas', bandOpts, bands.total, state.band);

    var langs = facetCounts(items, q, 'lang', function (it) { return live().langsOf(it.entry[F.LANG]); });
    state.lang.forEach(function (c) { if (!langs.counts[c]) langs.counts[c] = 0; });
    var langOpts = Object.keys(langs.counts).map(function (c) {
      return { value: c, label: sw.langs[c] || c, count: langs.counts[c] };
    }).sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label, 'es'); });
    fillChecklist(box('lang'), 'Todos', 'idiomas', langOpts, langs.total, state.lang);
  }

  function saveSession() {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /** Al activar: la URL (`swtgt` / `swband` / `swlang`) si trae alguno; si no, lo guardado en la sesión. */
  function load() {
    var src = null;
    try {
      var p = new URLSearchParams(window.location.search);
      var fromUrl = Object.keys(PARAMS).some(function (k) { return p.has(PARAMS[k]); });
      if (fromUrl) {
        src = {};
        Object.keys(PARAMS).forEach(function (k) { src[k] = String(p.get(PARAMS[k]) || '').split(','); });
      }
    } catch (e) { /* ignore */ }
    if (!src) {
      try { src = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { src = null; }
    }
    if (!src) return;
    Object.keys(PARAMS).forEach(function (k) {
      state[k] = clean(k, Array.isArray(src[k]) ? src[k] : []);
    });
    saveSession();
  }

  /** Tras cargar los datos: descarta idiomas que no existen en SHORTWAVE. */
  function validateLangs(sw) {
    state.lang = state.lang.filter(function (c) { return !!sw.langs[c]; });
  }

  /** Parámetros URL de los filtros activos ({ swband: '49m,31m', … }). */
  function shareParams() {
    var out = {};
    Object.keys(PARAMS).forEach(function (k) {
      if (state[k].length) out[PARAMS[k]] = state[k].join(',');
    });
    return out;
  }

  /** Escribe (o quita, si la capa está apagada) los parámetros de filtros en `url` (URL). */
  function writeUrl(url, on) {
    var params = on ? shareParams() : {};
    Object.keys(PARAMS).forEach(function (k) {
      var name = PARAMS[k];
      if (params[name]) url.searchParams.set(name, params[name]);
      else url.searchParams.delete(name);
    });
  }

  function closeAll(except) {
    document.querySelectorAll('details.sw-ms[open]').forEach(function (d) {
      if (d !== except) d.open = false;
    });
  }

  function onChange(cb) {
    changeCb = cb;
  }

  // Eventos delegados (una vez por página).
  document.addEventListener('change', function (ev) {
    var input = ev.target;
    if (!input || input.type !== 'checkbox' || !input.closest) return;
    var details = input.closest('details.sw-ms[data-sw-filter]');
    if (!details) return;
    var key = details.getAttribute('data-sw-filter');
    if (!(key in state)) return;
    var list = details.querySelector('.sw-ms__panel');
    syncCheckboxGroup(list, input);
    state[key] = getCheckedFilterValues(list);
    saveSession();
    if (changeCb) changeCb(key);
  });
  // 'toggle' no burbujea: captura, igual que wireGlobalGroupPersistence (global-groups.js).
  document.addEventListener('toggle', function (ev) {
    var d = ev.target;
    if (d && d.tagName === 'DETAILS' && d.classList.contains('sw-ms') && d.open) closeAll(d);
  }, true);
  document.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('details.sw-ms')) return;
    closeAll(null);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    var open = document.querySelector('details.sw-ms[open]');
    if (!open) return;
    open.open = false;
    var sum = open.querySelector('summary');
    if (sum) sum.focus();
  });

  window.radiomapShortwaveFilters = {
    state: state,
    annotate: annotate,
    passes: passes,
    isActive: isActive,
    barHtml: barHtml,
    update: update,
    load: load,
    validateLangs: validateLangs,
    shareParams: shareParams,
    writeUrl: writeUrl,
    closeAll: closeAll,
    onChange: onChange
  };
})();
