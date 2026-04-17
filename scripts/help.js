/**
 * Shared help modal — map and list views.
 * Injects a single #help-overlay (one DOM for all pages), open/close, focus trap.
 * Auto-opens on first visit and again after ~10 days (localStorage); closing sets the next date.
 */
var _helpLastFocus = null;

var ABOUT_NEXT_AT_KEY = 'radiomap-about-next-at';
/** ms until auto-open may run again after the user closes the dialog */
var ABOUT_AUTOSHOW_COOLDOWN_MS = 10 * 24 * 60 * 60 * 1000;

function helpPageOk() {
  var b = document.body;
  return b && (b.classList.contains('page-map') || b.classList.contains('page-list'));
}

function getAboutNextAutoShowAt() {
  try {
    var v = window.localStorage.getItem(ABOUT_NEXT_AT_KEY);
    if (v == null || v === '') return 0;
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  } catch (e) {
    return 0;
  }
}

function touchAboutAutoDismissed() {
  try {
    window.localStorage.setItem(ABOUT_NEXT_AT_KEY, String(Date.now() + ABOUT_AUTOSHOW_COOLDOWN_MS));
  } catch (e) { /* ignore */ }
}

function scheduleHelpAutoOpen() {
  if (!helpPageOk()) return;
  if (Date.now() < getAboutNextAutoShowAt()) return;
  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(function () {
    if (!helpPageOk()) return;
    if (Date.now() < getAboutNextAutoShowAt()) return;
    var el = document.getElementById('help-overlay');
    if (el && el.classList.contains('open')) return;
    openHelp();
  }, reduced ? 150 : 400);
}

/** One markup source for index + lista. propagacion.html sin query (CI solo reemplaza __VERSION__ en HTML). */
var HELP_OVERLAY_HTML =
  '<div id="help-overlay" class="help-overlay" aria-hidden="true" tabindex="-1">' +
  '<div class="help-modal" role="dialog" aria-labelledby="help-title" aria-modal="true">' +
  '<div class="help-modal-header">' +
  '<h2 id="help-title" class="help-title">Acerca de Radiomap</h2>' +
  '<button type="button" class="help-close" id="help-close-btn" aria-label="Cerrar">' +
  '<span class="material-symbols-outlined" aria-hidden="true">close</span>' +
  '</button>' +
  '</div>' +
  '<div class="help-modal-body">' +
  '<section class="help-section" id="help-sec-1">' +
  '<h3>1. Qué es Radiomap</h3>' +
  '<p><strong>Mapa + lista</strong> de repetidoras, <strong>Echolink</strong> y <strong>DMR</strong> en Chile. Datos públicos de regulación y <strong>curación</strong> en el repo. <strong>No reemplaza</strong> autorización ni ficha oficial del titular.</p>' +
  '</section>' +
  '<section class="help-section" id="help-sec-2">' +
  '<h3>2. Radioafición</h3>' +
  '<p>Servicio de aficionado <strong>con licencia</strong>, sin interferir. Radiomap es <strong>apoyo</strong>; el cumplimiento es tuyo.</p>' +
  '</section>' +
  '<section class="help-section" id="help-sec-3">' +
  '<h3>3. Uso rápido</h3>' +
  '<ul>' +
  '<li><strong>Mapa</strong> — tema ☽, filtros (☰ <span class="material-symbols-outlined help-inline-icon" aria-hidden="true">tune</span> en chico), clic en estación → panel y vecinos. <strong>Cerca de mí</strong> / <span class="material-symbols-outlined help-inline-icon" aria-hidden="true">my_location</span> y radio km.</li>' +
  '<li><strong>Lista</strong> — misma búsqueda y filtros; tabla por región.</li>' +
  '<li><strong>CSV</strong> y <strong>compartir</strong> en la cabecera (enlace con filtros; captura opcional desde el mapa).</li>' +
  '</ul>' +
  '<div class="help-modal-previews">' +
  '<figure class="help-modal-preview">' +
  '<img class="help-modal-preview__img" src="images/web-light.png" alt="Radiomap: mapa en tema claro, filtros y cabecera" loading="lazy" width="668" height="1157">' +
  '<figcaption class="help-modal-preview__cap">Mapa en <strong>tema claro</strong> (búsqueda, filtros, compartir y CSV).</figcaption>' +
  '</figure>' +
  '<figure class="help-modal-preview">' +
  '<img class="help-modal-preview__img" src="images/propagation.png" alt="Ejemplo: mapa con capa de propagación experimental y leyenda dBm" loading="lazy" width="668" height="1157">' +
  '<figcaption class="help-modal-preview__cap">Capa <strong>Propagación</strong> (donde hay datos) — <a href="propagacion.html" target="_blank" rel="noopener noreferrer">detalle y límites</a>. Vista orientativa.</figcaption>' +
  '</figure>' +
  '</div>' +
  '</section>' +
  '<section class="help-section" id="help-sec-4">' +
  '<h3>4. Colaborar</h3>' +
  '<ul>' +
  '<li><a href="mailto:cd3dxz@gmail.com?subject=Radiomap%20-%20colaboraci%C3%B3n">cd3dxz@gmail.com</a> — indicativo, campo a corregir, fuente si la tienes.</li>' +
  '<li><a href="https://github.com/juantoledo/radiomap" target="_blank" rel="noopener noreferrer">GitHub</a></li>' +
  '</ul>' +
  '</section>' +
  '<p class="help-meta"><span id="help-version-line">Versión <span id="app-version">—</span>. </span>Agénticamente desarrollado por <a href="https://cd3dxz.radio" target="_blank" rel="noopener">CD3DXZ</a>.</p>' +
  '</div>' +
  '</div>' +
  '</div>';

function injectHelpOverlay() {
  if (document.getElementById('help-overlay')) return;
  var wrap = document.createElement('div');
  wrap.innerHTML = HELP_OVERLAY_HTML;
  var el = wrap.firstElementChild;
  if (!el) return;
  document.body.appendChild(el);
  var closeBtn = document.getElementById('help-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeHelp);
}

function openHelp() {
  injectHelpOverlay();
  var el = document.getElementById('help-overlay');
  if (!el) return;
  _helpLastFocus = document.activeElement;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  el.focus();
}

function closeHelp() {
  var el = document.getElementById('help-overlay');
  if (el) {
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  touchAboutAutoDismissed();
  if (_helpLastFocus && typeof _helpLastFocus.focus === 'function') {
    _helpLastFocus.focus();
  }
  _helpLastFocus = null;
}

window.openHelp = openHelp;
window.closeHelp = closeHelp;

(function initHelp() {
  injectHelpOverlay();
  var overlay = document.getElementById('help-overlay');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === this) closeHelp();
    });
  }

  document.addEventListener('keydown', function (e) {
    var el = document.getElementById('help-overlay');
    if (!el || !el.classList.contains('open')) return;

    if (e.key === 'Escape') {
      closeHelp();
      return;
    }

    if (e.key === 'Tab') {
      var focusable = el.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (!focusable.length) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === el) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || document.activeElement === el) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });

  window.addEventListener('load', scheduleHelpAutoOpen);
})();
