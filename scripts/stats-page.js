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
  };
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
    var total = nodes.length;

    /* ── Aggregate ────────────────────────────────────────────────────────── */
    var echolinkCount = countWhere(nodes, function (n) { return n.isEcholink; });
    var dmrCount      = countWhere(nodes, function (n) { return n.isDMR; });
    var propCount     = countWhere(nodes, function (n) { return n.hasPropagation; });
    var vhfFmCount    = countWhere(nodes, function (n) { return n.banda === 'VHF/FM'; });
    var uhfCount      = countWhere(nodes, function (n) {
      return n.banda === 'UHF/FM' || n.banda === 'UHF/DMR';
    });

    var byBanda  = groupBy(nodes, function (n) { return n.banda || 'Desconocida'; });
    var byRegion = groupBy(nodes, function (n) { return n.region || 'Sin región'; });
    var byType   = computeTypes(nodes);
    var byConf   = groupBy(
      nodes.filter(function (n) { return n.conference && n.conference.trim() !== ''; }),
      function (n) { return n.conference; }
    );

    var globalNodes = nodes.filter(function (n) { return n.region === 'GLOBAL'; });
    var globalCount = globalNodes.length;
    var byGlobalCategory = typeof classifyGlobalStation === 'function'
      ? groupBy(globalNodes, function (n) { return classifyGlobalStation(n).title; })
      : {};

    /* ── KPI count-up ──────────────────────────────────────────────────────── */
    animateCount('stats-total',      total,         800);
    animateCount('stats-vhf',        vhfFmCount,    900);
    animateCount('stats-uhf',        uhfCount,      900);
    animateCount('stats-echolink',   echolinkCount, 950);
    animateCount('stats-dmr',        dmrCount,      700);
    animateCount('stats-propagation',propCount,     900);
    animateCount('stats-global',     globalCount,   900);

    /* ── Charts ────────────────────────────────────────────────────────────── */
    renderBars  ('stats-banda-chart',  sortDesc(byBanda),  total, BAND_COLORS, 'var(--vhf)');
    renderDonut ('stats-donut-ring', 'stats-type-legend', 'stats-total-donut',
                 sortDesc(byType), total, TYPE_COLORS);
    renderBars  ('stats-region-chart', sortDesc(byRegion), total, {}, 'var(--uhf)', fmtRegion);
    renderBars  ('stats-conf-chart',   sortDesc(byConf),   total, CONF_COLORS, 'var(--green)');
    if (globalCount > 0) {
      var globalSection = document.getElementById('stats-global-section');
      if (globalSection) globalSection.hidden = false;
      renderBars('stats-global-chart', sortDesc(byGlobalCategory), globalCount, GLOBAL_CATEGORY_COLORS, '#a78bfa');
    }

    /* ── Trigger bar animations ─────────────────────────────────────────────── */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.querySelectorAll('.stat-bar[data-w]').forEach(function (el) {
          el.style.width = el.getAttribute('data-w');
        });
      });
    });
  });

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
  function renderBars(containerId, items, total, colorMap, defaultColor, labelFn) {
    var container = document.getElementById(containerId);
    if (!container || !items.length) return;
    var max = items[0].count;
    container.innerHTML = items.map(function (item) {
      var barPct      = Math.round(item.count / max * 100);
      var totalPct    = Math.round(item.count / total * 100);
      var color       = (colorMap && colorMap[item.label]) || defaultColor || 'var(--accent)';
      var displayLbl  = labelFn ? labelFn(item.label) : item.label;
      return '<div class="stat-row">' +
        '<div class="stat-label" title="' + esc(item.label) + '">' + esc(displayLbl) + '</div>' +
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
  function fmtRegion(s) {
    var title = s.toLowerCase().replace(/\b\w+/g, function (word, offset) {
      return (offset > 0 && LOWER_WORDS.indexOf(word) >= 0)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1);
    });
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
