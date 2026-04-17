/**
 * Coach marks (primer uso): tour por controles clave en mapa y lista.
 * localStorage radiomapCoachMarksV1 = '1' al terminar u omitir.
 * window.radiomapReplayCoachMarks() — volver a mostrar el tour (p. ej. consola o ayuda futura).
 */
(function () {
  var STORAGE_KEY = 'radiomapCoachMarksV1';

  var steps = [
    {
      selector: '.header-nav.header-view-switch',
      title: 'Mapa y lista',
      body:
        'Con este interruptor cambias entre el mapa interactivo y el listado por región. El color activo recuerda VHF (mapa) y UHF (lista).',
    },
    {
      selector: '.header-map-tools',
      title: 'Acciones del encabezado',
      body:
        'Tema, ayuda, compartir vista y descarga CSV. En pantallas chicas parte de esto pasa al menú ☰.',
    },
    {
      selector: '.map-controls-search-row',
      title: 'Búsqueda y filtros',
      body:
        'Busca por señal, club, comuna o frecuencias. El icono de afinación abre los filtros (banda, región, tipo, red) — en móvil se abren en un panel inferior.',
    },
    {
      selector: '#btn-nearme',
      title: 'Cerca de mí',
      body:
        'Filtra repetidoras por distancia desde tu ubicación (o desde una repetidora de referencia en el mapa). Puedes ajustar el radio en el bloque de contadores debajo de la barra.',
    },
  ];

  function pageOk() {
    var b = document.body;
    return b && (b.classList.contains('page-map') || b.classList.contains('page-list'));
  }

  function shouldSkipStorage() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return true;
    }
  }

  function markDone() {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch (e) { /* ignore */ }
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function qs(sel) {
    return document.querySelector(sel);
  }

  var root = null;
  var shades = null;
  var ring = null;
  var tooltip = null;
  var stepIndex = 0;
  var prevFocus = null;
  var resizeHandler = null;
  var keyHandler = null;

  function teardown() {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('scroll', resizeHandler, true);
      resizeHandler = null;
    }
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    shades = null;
    ring = null;
    tooltip = null;
    document.body.classList.remove('radiomap-coach-active');
    if (prevFocus && typeof prevFocus.focus === 'function') {
      try {
        prevFocus.focus();
      } catch (e) { /* ignore */ }
    }
    prevFocus = null;
  }

  function isTargetVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return false;
    var st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    return true;
  }

  function layoutStep() {
    var step = steps[stepIndex];
    if (!step) return false;
    var el = qs(step.selector);
    if (!isTargetVisible(el)) return false;

    var pad = 10;
    var rect = el.getBoundingClientRect();
    var t = Math.max(0, rect.top - pad);
    var l = Math.max(0, rect.left - pad);
    var r = Math.min(window.innerWidth, rect.right + pad);
    var b = Math.min(window.innerHeight, rect.bottom + pad);
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var topH = t;
    var leftW = l;
    var holeH = Math.max(0, b - t);
    var holeW = Math.max(0, r - l);

    shades.top.style.cssText = 'top:0;left:0;width:100%;height:' + topH + 'px;';
    shades.left.style.cssText = 'top:' + t + 'px;left:0;width:' + leftW + 'px;height:' + holeH + 'px;';
    shades.right.style.cssText = 'top:' + t + 'px;left:' + r + 'px;width:' + Math.max(0, vw - r) + 'px;height:' + holeH + 'px;';
    shades.bottom.style.cssText = 'top:' + b + 'px;left:0;width:100%;height:' + Math.max(0, vh - b) + 'px;';

    ring.style.top = t + 'px';
    ring.style.left = l + 'px';
    ring.style.width = holeW + 'px';
    ring.style.height = holeH + 'px';

    var tipW = Math.min(320, vw - 24);
    var tipLeft = Math.round(Math.min(Math.max(12, l), vw - tipW - 12));
    tooltip.style.width = tipW + 'px';
    tooltip.style.left = tipLeft + 'px';

    var titleEl = document.getElementById('radiomap-coach-title');
    var bodyEl = document.getElementById('radiomap-coach-body');
    var stepEl = document.getElementById('radiomap-coach-step');
    var btnNext = document.getElementById('radiomap-coach-next');
    if (titleEl) titleEl.textContent = step.title;
    if (bodyEl) bodyEl.textContent = step.body;
    if (stepEl) stepEl.textContent = 'Paso ' + (stepIndex + 1) + ' de ' + steps.length;
    if (btnNext) {
      btnNext.textContent = stepIndex >= steps.length - 1 ? 'Listo' : 'Siguiente';
    }

    var tipH = tooltip.offsetHeight || 220;
    var below = b + 16;
    var above = t - tipH - 16;
    if (below + tipH < vh - 12) {
      tooltip.style.top = below + 'px';
    } else if (above > 12) {
      tooltip.style.top = above + 'px';
    } else {
      tooltip.style.top = Math.min(Math.max(12, below), vh - tipH - 12) + 'px';
    }

    return true;
  }

  function showStepAt(i) {
    if (i >= steps.length) {
      markDone();
      teardown();
      return;
    }
    stepIndex = i;
    var el = qs(steps[i].selector);
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (!root) return;
        if (stepIndex !== i) return;
        if (isTargetVisible(qs(steps[i].selector)) && layoutStep()) {
          var btn = document.getElementById('radiomap-coach-next');
          if (btn) btn.focus();
          return;
        }
        showStepAt(i + 1);
      });
    });
  }

  function goNext() {
    if (stepIndex >= steps.length - 1) {
      markDone();
      teardown();
      return;
    }
    showStepAt(stepIndex + 1);
  }

  function skipTour() {
    markDone();
    teardown();
  }

  function buildDom() {
    root = document.createElement('div');
    root.id = 'radiomap-coach-root';
    root.className = 'radiomap-coach';

    function shade() {
      var d = document.createElement('div');
      d.className = 'radiomap-coach-shade';
      d.setAttribute('aria-hidden', 'true');
      return d;
    }
    shades = {
      top: shade(),
      left: shade(),
      right: shade(),
      bottom: shade(),
    };
    Object.keys(shades).forEach(function (k) {
      root.appendChild(shades[k]);
    });

    ring = document.createElement('div');
    ring.className = 'radiomap-coach-ring';
    ring.setAttribute('aria-hidden', 'true');
    root.appendChild(ring);

    tooltip = document.createElement('div');
    tooltip.className = 'radiomap-coach-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-modal', 'true');
    tooltip.setAttribute('aria-labelledby', 'radiomap-coach-title');
    tooltip.innerHTML =
      '<p class="radiomap-coach-tooltip__step" id="radiomap-coach-step"></p>' +
      '<h2 class="radiomap-coach-tooltip__title" id="radiomap-coach-title"></h2>' +
      '<p class="radiomap-coach-tooltip__body" id="radiomap-coach-body"></p>' +
      '<div class="radiomap-coach-tooltip__actions">' +
      '<button type="button" class="radiomap-coach-btn radiomap-coach-btn--ghost" id="radiomap-coach-skip">Omitir tour</button>' +
      '<button type="button" class="radiomap-coach-btn radiomap-coach-btn--primary" id="radiomap-coach-next">Siguiente</button>' +
      '</div>';
    root.appendChild(tooltip);

    document.body.appendChild(root);
    document.body.classList.add('radiomap-coach-active');

    document.getElementById('radiomap-coach-skip').addEventListener('click', skipTour);
    document.getElementById('radiomap-coach-next').addEventListener('click', goNext);

    resizeHandler = function () {
      if (root && steps[stepIndex]) layoutStep();
    };
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('scroll', resizeHandler, true);

    keyHandler = function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        skipTour();
      }
    };
    document.addEventListener('keydown', keyHandler, true);
  }

  function startTour() {
    if (!pageOk()) return;
    prevFocus = document.activeElement;
    buildDom();
    showStepAt(0);
  }

  function startIfNeeded() {
    if (!pageOk()) return;
    if (shouldSkipStorage()) return;
    var help = document.getElementById('help-overlay');
    if (help && help.classList.contains('open')) {
      var n = 0;
      var maxPolls = 150;
      var pollMs = 200;
      var id = window.setInterval(function () {
        n++;
        var h = document.getElementById('help-overlay');
        var stillOpen = h && h.classList.contains('open');
        if (!stillOpen || n >= maxPolls) {
          window.clearInterval(id);
          if (stillOpen) return;
          if (!pageOk()) return;
          if (shouldSkipStorage()) return;
          startTour();
        }
      }, pollMs);
      return;
    }
    startTour();
  }

  window.radiomapReplayCoachMarks = function () {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
    if (root) teardown();
    startTour();
  };

  window.addEventListener('load', function () {
    window.setTimeout(startIfNeeded, reducedMotion() ? 200 : 550);
  });
})();
