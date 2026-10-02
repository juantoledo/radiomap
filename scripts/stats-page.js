(function () {
  'use strict';

  /* ── Per-item colors (use CSS vars where available for theme reactivity) */
  var BAND_COLORS = {
    'VHF/FM':       'var(--vhf)',
    'UHF/FM':       'var(--uhf)',
    'VHF/DMR':      'var(--green)',
    'UHF/DMR':      '#c026d3',
    'HF':           'var(--yellow)',
    'VHF/AM (ATC)': '#475569',
    'FM':           '#eab308',
    'AM':           '#f97316',
  };
  var TYPE_COLORS = {
    'Radioclub FM':   'var(--vhf)',
    'Echolink':       'var(--green)',
    'ATC / Aéreo':    '#64748b',
    'DMR':            'var(--uhf)',
    'Bomberos':       '#ef4444',
    'Ambulancia':     '#f97316',
    'Marítimo':       '#06b6d4',
    'AM/FM Broadcast':'#eab308',
  };
  var CONF_COLORS = {
    'Red Chile':                       'var(--vhf)',
    'Sistema Interconectado CE2RPE':   'var(--yellow)',
    'RCDR':                            'var(--green)',
    'Zona DMR CL':                     'var(--uhf)',
    'SUR':                             '#06b6d4',
    'Red Echolink Chile':              '#a78bfa',
    'Red Echolink Zello':              '#f97316',
  };
  /* Categorías de estación (chips + filtro ?cat=); orden = orden de los chips */
  var CATEGORIES = [
    { id: 'all',       label: 'Todas',            color: 'var(--text-bright)' },
    { id: 'amateur',   label: 'Radioaficionados', color: 'var(--vhf)' },
    { id: 'broadcast', label: 'Broadcast AM/FM',  color: '#eab308' },
    { id: 'atc',       label: 'ATC / Aéreo',      color: '#64748b' },
    { id: 'global',    label: 'Globales',         color: '#a78bfa' },
  ];
  var SW_TOP_N = 12;
  var GLOBAL_CATEGORY_COLORS = {
    'Frecuencias de encuentro internacional': 'var(--vhf)',
    'Banda ciudadana (CB)':                   'var(--yellow)',
    'FRS (Motorola, 22 canales)':              'var(--green)',
    'PMR446 (16 canales)':                     'var(--uhf)',
    'Baofeng BF-888S (16 canales de fábrica)': '#f97316',
    'Redes HF nacionales':                     '#06b6d4',
    'Otras estaciones globales':               '#a78bfa',
  };

  /* ── Menu toggle ────────────────────────────────────────────────────────── */
  function closeMenuStats() {
    var menu = document.getElementById('header-menu');
    var toggle = document.getElementById('menu-toggle');
    if (menu) menu.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  window.closeMenuStats = closeMenuStats;

  if (typeof setRadiomapVersionDisplays === 'function') {
    setRadiomapVersionDisplays(typeof VERSION !== 'undefined' ? VERSION : null);
  } else if (typeof VERSION !== 'undefined') {
    var _av = document.getElementById('app-version');
    if (_av) _av.textContent = VERSION;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var menuToggleEl = document.getElementById('menu-toggle');
    if (menuToggleEl) {
      menuToggleEl.addEventListener('click', function () {
        var menu = document.getElementById('header-menu');
        if (!menu) return;
        var open = menu.classList.toggle('open');
        this.setAttribute('aria-expanded', String(open));
      });
    }
    document.addEventListener('click', function (e) {
      var menu = document.getElementById('header-menu');
      var toggle = document.getElementById('menu-toggle');
      if (menu && menu.classList.contains('open') &&
          toggle && !menu.contains(e.target) && !toggle.contains(e.target)) {
        closeMenuStats();
      }
    });

    if (typeof NODES === 'undefined' || !Array.isArray(NODES)) return;
    var nodes = NODES;

    /* ── KPI count-up (dataset completo, sin filtro) ─────────────────────────── */
    var byCategory = groupBy(nodes, categoryOf);
    animateCount('stats-total',      nodes.length,                  800);
    animateCount('stats-amateur',    byCategory.amateur   || 0,     900);
    animateCount('stats-broadcast',  byCategory.broadcast || 0,     900);
    animateCount('stats-atc',        byCategory.atc       || 0,     900);
    animateCount('stats-global',     byCategory.global    || 0,     900);
    animateCount('stats-echolink',   countWhere(nodes, function (n) { return n.isEcholink; }),     950);
    animateCount('stats-dmr',        countWhere(nodes, function (n) { return n.isDMR; }),          700);
    animateCount('stats-propagation',countWhere(nodes, function (n) { return n.hasPropagation; }), 900);

    /* ── Categoría (chips + ?cat=) ───────────────────────────────────────────── */
    byCategory.all = nodes.length;
    var chipsEl = document.getElementById('stats-cat-chips');
    var current = readCategoryParam();
    if (chipsEl) {
      chipsEl.innerHTML = CATEGORIES.map(function (c) {
        return '<button type="button" class="stats-cat-chip" role="radio" data-cat="' + c.id + '" ' +
          'style="--chip-c:' + c.color + '">' +
          (c.id === 'all' ? '' : '<span class="stats-cat-chip__dot" aria-hidden="true"></span>') +
          '<span class="stats-cat-chip__label">' + esc(c.label) + '</span>' +
          '<span class="stats-cat-chip__count">' + (byCategory[c.id] || 0) + '</span>' +
        '</button>';
      }).join('');
      chipsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.stats-cat-chip');
        if (!btn || btn.getAttribute('aria-checked') === 'true') return;
        selectCategory(btn.getAttribute('data-cat'), true);
      });
      /* radiogroup: flechas mueven la selección */
      chipsEl.addEventListener('keydown', function (e) {
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        var idx = indexOfCategory(current);
        var next = CATEGORIES[(idx + step + CATEGORIES.length) % CATEGORIES.length].id;
        selectCategory(next, true);
        var btn = chipsEl.querySelector('[data-cat="' + next + '"]');
        if (btn) btn.focus();
      });
    }
    selectCategory(current, false);

    function selectCategory(cat, updateUrl) {
      current = cat;
      if (chipsEl) {
        chipsEl.querySelectorAll('.stats-cat-chip').forEach(function (b) {
          var on = b.getAttribute('data-cat') === cat;
          b.setAttribute('aria-checked', String(on));
          b.tabIndex = on ? 0 : -1;
        });
      }
      renderStations(cat === 'all'
        ? nodes
        : nodes.filter(function (n) { return categoryOf(n) === cat; }));
      if (updateUrl) writeCategoryParam(cat);
    }

    setupShortwave();
  });

  /* ── Gráficos de estaciones para un subconjunto ───────────────────────────── */
  function renderStations(subset) {
    var total = subset.length;

    var byBanda  = groupBy(subset, function (n) { return n.banda || 'Desconocida'; });
    var byRegion = groupBy(subset, function (n) { return n.region || 'Sin región'; });
    var types    = sortDesc(computeTypes(subset));
    var byConf   = groupBy(
      subset.filter(function (n) { return n.conference && n.conference.trim() !== ''; }),
      function (n) { return n.conference; }
    );
    var globalNodes = subset.filter(function (n) { return n.region === 'GLOBAL'; });
    var byGlobalCategory = typeof classifyGlobalStation === 'function'
      ? groupBy(globalNodes, function (n) { return classifyGlobalStation(n).title; })
      : {};

    var hasBanda = renderBars('stats-banda-chart', sortDesc(byBanda), total, BAND_COLORS, 'var(--vhf)');
    setHidden('stats-banda-section', !hasBanda);

    /* Un solo tipo (p. ej. sólo broadcast) no aporta: se oculta el donut y banda ocupa la fila */
    var hasTypes = types.length > 1;
    setHidden('stats-type-section', !hasTypes);
    if (hasTypes) {
      renderDonut('stats-donut-ring', 'stats-type-legend', 'stats-total-donut', types, total, TYPE_COLORS);
    }
    var grid = document.getElementById('stats-grid-banda-tipo');
    if (grid) grid.classList.toggle('stats-grid-2--single', !(hasBanda && hasTypes));

    setHidden('stats-region-section',
      !renderBars('stats-region-chart', sortDesc(byRegion), total, {}, 'var(--uhf)', { labelFn: fmtRegion }));
    setHidden('stats-conf-section',
      !renderBars('stats-conf-chart', sortDesc(byConf), total, CONF_COLORS, 'var(--green)'));
    setHidden('stats-global-section',
      !renderBars('stats-global-chart', sortDesc(byGlobalCategory), globalNodes.length,
                  GLOBAL_CATEGORY_COLORS, '#a78bfa'));
  }

  /* ── Onda corta (EiBi): carga diferida al acercarse al final de la página ── */
  function setupShortwave() {
    var section = document.getElementById('stats-sw');
    var loader = window.radiomapShortwaveLoader;
    var live = window.radiomapShortwaveLive;
    if (!section || !loader || !live) return;

    var started = false;
    function load() {
      if (started) return;
      started = true;
      loader.ensureData().then(function (sw) {
        section.hidden = false;
        renderShortwave(sw, live, loader.now());
      }).catch(function () { /* sin datos: la sección queda oculta */ });
    }

    /* La sección está oculta (sin caja): se observa el pie de página como centinela */
    var sentinel = document.querySelector('.app-footer') || section;
    if (!('IntersectionObserver' in window)) { load(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        io.disconnect();
        load();
      }
    }, { rootMargin: '400px 0px' });
    io.observe(sentinel);
  }

  function renderShortwave(sw, live, now) {
    var F = live.FIELDS;
    var entries = sw.entries || [];

    var meta = document.getElementById('stats-sw-meta');
    if (meta && sw.meta) meta.textContent = 'EiBi · temporada ' + (sw.meta.season || '');

    /* Agregados en una sola pasada */
    var byBand = {}, byTarget = {}, byLang = {}, byStation = {};
    var stationsUsed = {}, sitesUsed = {}, nStations = 0, nSites = 0;
    for (var i = 0; i < entries.length; i++) {
      var en = entries[i];
      var band = live.bandOf(en[F.KHZ]);
      byBand[band] = (byBand[band] || 0) + 1;
      var tgt = live.targetGroupOf(en[F.TARGET]);
      byTarget[tgt] = (byTarget[tgt] || 0) + 1;
      live.langsOf(en[F.LANG]).forEach(function (c) { byLang[c] = (byLang[c] || 0) + 1; });
      var st = en[F.STATION];
      byStation[st] = (byStation[st] || 0) + 1;
      if (!stationsUsed[st]) { stationsUsed[st] = true; nStations++; }
      if (!sitesUsed[en[F.SITE]]) { sitesUsed[en[F.SITE]] = true; nSites++; }
    }
    var total = entries.length;

    animateCount('stats-sw-rows',     total,                     800);
    animateCount('stats-sw-stations', nStations,                 900);
    animateCount('stats-sw-sites',    nSites,                    900);
    animateCount('stats-sw-langs',    Object.keys(byLang).length, 900);
    animateCount('stats-sw-live',     live.liveEntries(sw, now).length, 900);
    var clock = document.getElementById('stats-sw-clock');
    if (clock) clock.textContent = live.clockLabel(now);

    /* Bandas en orden de frecuencia (no por conteo); fuera de banda al final */
    var bandItems = live.BANDS
      .map(function (b) { return { label: b[2], count: byBand[b[2]] || 0 }; })
      .filter(function (it) { return it.count > 0; });
    if (byBand[live.BAND_OOB]) bandItems.push({ label: live.BAND_OOB, count: byBand[live.BAND_OOB] });
    renderBars('stats-sw-band-chart', bandItems, total, {}, 'var(--accent2)', {
      labelFn: live.bandLabel,
      titleFn: function (id) { return live.bandRange(id) || live.bandLabel(id); }
    });

    var targetLabels = {};
    live.TARGET_GROUPS.forEach(function (g) { targetLabels[g.id] = g.label; });
    var targetItems = live.TARGET_GROUPS
      .map(function (g) { return { label: g.id, count: byTarget[g.id] || 0 }; })
      .filter(function (it) { return it.count > 0; });
    renderBars('stats-sw-target-chart', targetItems, total, {}, 'var(--uhf)', {
      labelFn: function (id) { return targetLabels[id] || id; }
    });

    var langs = sw.langs || {};
    renderBars('stats-sw-lang-chart', sortDesc(byLang).slice(0, SW_TOP_N), total, {}, '#a78bfa', {
      labelFn: function (c) { return langs[c] || c; }
    });

    var stations = sw.stations || [], countries = sw.countries || {};
    renderBars('stats-sw-station-chart', sortDesc(byStation).slice(0, SW_TOP_N), total, {}, 'var(--vhf)', {
      labelFn: function (idx) { return (stations[idx] || [idx])[0]; },
      titleFn: function (idx) {
        var s = stations[idx] || [idx, ''];
        var country = countries[s[1]] || s[1];
        return s[0] + (country ? ' — ' + country : '');
      }
    });
  }

  /* ── Count-up animation ──────────────────────────────────────────────────── */
  function animateCount(id, target, duration) {
    var el = document.getElementById(id);
    if (!el) return;
    var startTime = null;
    function step(now) {
      if (!startTime) startTime = now;
      var p = Math.min((now - startTime) / duration, 1);
      /* easeOutQuart */
      var e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(e * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── Donut chart (conic-gradient + legend) ────────────────────────────────── */
  function renderDonut(ringId, legendId, numId, items, total, colorMap) {
    var ring   = document.getElementById(ringId);
    var legend = document.getElementById(legendId);

    if (numId) animateCount(numId, total, 800);

    if (ring && items.length) {
      var stops = [];
      var acc = 0;
      items.forEach(function (item) {
        var pct   = item.count / total * 100;
        var color = colorMap[item.label] || '#64748b';
        stops.push(color + ' ' + acc.toFixed(2) + '% ' + (acc + pct).toFixed(2) + '%');
        acc += pct;
      });
      ring.style.background = 'conic-gradient(' + stops.join(', ') + ')';
    }

    if (legend && items.length) {
      legend.innerHTML = items.map(function (item) {
        var pct   = Math.round(item.count / total * 100);
        var color = colorMap[item.label] || '#64748b';
        return '<div class="donut-legend-item">' +
          '<span class="donut-dot" style="background:' + color + '"></span>' +
          '<span class="donut-lbl-text" title="' + esc(item.label) + '">' + esc(item.label) + '</span>' +
          '<span class="donut-lbl-count">' + item.count + '</span>' +
          '<span class="donut-lbl-pct">' + pct + '%</span>' +
        '</div>';
      }).join('');
    }
  }

  /* ── Horizontal bar chart ─────────────────────────────────────────────────── */
  /* opts: { labelFn, titleFn } (reciben item.label). Devuelve false si no hay datos. */
  function renderBars(containerId, items, total, colorMap, defaultColor, opts) {
    var container = document.getElementById(containerId);
    if (!container) return false;
    if (!items.length) { container.innerHTML = ''; return false; }
    opts = opts || {};
    var max = Math.max.apply(null, items.map(function (it) { return it.count; }));
    container.innerHTML = items.map(function (item) {
      var barPct      = Math.round(item.count / max * 100);
      var totalPct    = Math.round(item.count / total * 100);
      var color       = (colorMap && colorMap[item.label]) || defaultColor || 'var(--accent)';
      var displayLbl  = opts.labelFn ? opts.labelFn(item.label) : item.label;
      var title       = opts.titleFn ? opts.titleFn(item.label) : displayLbl;
      return '<div class="stat-row">' +
        '<div class="stat-label" title="' + esc(title) + '">' + esc(displayLbl) + '</div>' +
        '<div class="stat-bar-wrap">' +
          '<div class="stat-bar" data-w="' + barPct + '%" ' +
               'style="width:0;--bar-color:' + color + '"></div>' +
        '</div>' +
        '<div class="stat-meta">' +
          '<span class="stat-count">' + item.count + '</span>' +
          '<span class="stat-pct">' + totalPct + '%</span>' +
        '</div>' +
      '</div>';
    }).join('');
    animateBars(container);
    return true;
  }

  /* Dos frames: el ancho 0 se pinta antes de transicionar al valor final */
  function animateBars(container) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        container.querySelectorAll('.stat-bar[data-w]').forEach(function (el) {
          el.style.width = el.getAttribute('data-w');
        });
      });
    });
  }

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
  function countWhere(arr, fn) {
    var n = 0;
    for (var i = 0; i < arr.length; i++) { if (fn(arr[i])) n++; }
    return n;
  }

  function groupBy(arr, fn) {
    var map = {};
    for (var i = 0; i < arr.length; i++) {
      var key = fn(arr[i]);
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }

  /* Categoría única por estación; el orden de las comprobaciones importa */
  function categoryOf(n) {
    if (n.isAir || n.serviceType === 'atc') return 'atc';
    if (n.serviceType === 'broadcast')      return 'broadcast';
    if (n.region === 'GLOBAL')              return 'global';
    return 'amateur';
  }

  function indexOfCategory(id) {
    for (var i = 0; i < CATEGORIES.length; i++) { if (CATEGORIES[i].id === id) return i; }
    return 0;
  }

  function readCategoryParam() {
    try {
      var c = new URLSearchParams(window.location.search).get('cat');
      if (c && c !== 'all' && indexOfCategory(c) > 0) return c;
    } catch (e) { /* ignore */ }
    return 'all';
  }

  function writeCategoryParam(cat) {
    try {
      var url = new URL(window.location.href);
      if (cat === 'all') url.searchParams.delete('cat');
      else url.searchParams.set('cat', cat);
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (e) { /* ignore */ }
  }

  function setHidden(id, hidden) {
    var el = document.getElementById(id);
    if (el) el.hidden = hidden;
  }

  function computeTypes(nodes) {
    var types = {};
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], t;
      if      (n.isEcholink)                    t = 'Echolink';
      else if (n.isDMR)                         t = 'DMR';
      else if (n.isAir || n.serviceType==='atc')t = 'ATC / Aéreo';
      else if (n.serviceType === 'fire')        t = 'Bomberos';
      else if (n.serviceType === 'ambulance')   t = 'Ambulancia';
      else if (n.serviceType === 'sea')         t = 'Marítimo';
      else if (n.serviceType === 'broadcast')   t = 'AM/FM Broadcast';
      else                                      t = 'Radioclub FM';
      types[t] = (types[t] || 0) + 1;
    }
    return types;
  }

  function sortDesc(map) {
    return Object.keys(map)
      .map(function (k) { return { label: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  var LOWER_WORDS = ['de', 'del', 'la', 'los', 'las', 'el', 'y', 'e', 'o', 'a'];
  /* «REGIÓN DE LOS RÍOS» → «R. de Los Ríos»; por palabras separadas por espacio (\w no cubre tildes) */
  function fmtRegion(s) {
    if (/^ATC\b/.test(s)) return 'ATC nacional';
    var title = s.toLowerCase().split(' ').map(function (word, i) {
      if (i > 0 && LOWER_WORDS.indexOf(word) >= 0) return word;
      return word.replace(/^(\(?)(.)/, function (m, p, c) { return p + c.toUpperCase(); })
                 .replace(/^O'(.)/, function (m, c) { return "O'" + c.toUpperCase(); });
    }).join(' ');
    if (title.toLowerCase().indexOf('metropolitana') >= 0) return 'R. Metropolitana';
    return title.replace(/^Región /, 'R. ');
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
