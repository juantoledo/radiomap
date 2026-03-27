/**
 * Build / open shareable URLs: filters, near-me, map position & mode, list vs map page.
 * List view: friendly text + link. Map view: same + optional live map PNG (Web Share Level 2).
 * Requires: location-filter.js, data/data.js (NODES) for buildMapViewURLForStation
 */
(function () {
  /**
   * Include radio (km) whenever the link encodes distance-from-reference semantics:
   * GPS (near), repetidora (signal), or an active anchor not yet reflected in p.
   */
  function ensureNearRadiusInParams(p) {
    if (!p || typeof getNearMeRadiusKm !== 'function') return;
    var need =
      p.has('near') ||
      p.has('signal') ||
      (typeof getDistanceFilterAnchor === 'function' && !!getDistanceFilterAnchor());
    if (need) {
      p.set('nearRadius', String(getNearMeRadiusKm()));
    }
  }

  /** Filters + near (no map position) — shared by buildShareViewURL and buildMapViewURLForStation */
  function buildShareQueryParams() {
    var p = new URLSearchParams();

    var search = document.getElementById('search');
    if (search && search.value.trim()) p.set('search', search.value.trim());

    var c = typeof getFilterCriteria === 'function' ? getFilterCriteria() : { bandas: [], regions: [], types: [], conferences: [] };
    (c.bandas || []).forEach(function (b) {
      if (b) p.append('banda', b);
    });
    (c.regions || []).forEach(function (r) {
      if (r) p.append('region', r);
    });
    (c.types || []).forEach(function (t) {
      if (t) p.append('type', t);
    });
    (c.conferences || []).forEach(function (x) {
      if (x) p.append('conference', x);
    });

    var nm = typeof getNearMeLocation === 'function' ? getNearMeLocation() : null;
    if (nm && typeof nm.lat === 'number' && typeof nm.lon === 'number') {
      p.set('near', nm.lat.toFixed(5) + ',' + nm.lon.toFixed(5));
    }

    ensureNearRadiusInParams(p);
    return p;
  }

  /** Heuristic zoom from coverage radius (map init uses mlat/mlon/zoom) */
  function zoomForStationNode(r) {
    if (!r) return 5;
    var rk = r.range_km;
    if (typeof rk !== 'number' || isNaN(rk)) {
      return r.isEcholink ? 7 : 8;
    }
    if (rk >= 100) return 6;
    if (rk >= 50) return 7;
    if (rk >= 25) return 8;
    if (rk >= 15) return 9;
    return 10;
  }

  /**
   * Link to index.html with current filters, signal, and map centered on the station (mlat/mlon/zoom).
   */
  function buildMapViewURLForStation(signal) {
    var base = new URL('index.html', window.location.href);
    base.hash = '';
    var p = buildShareQueryParams();
    if (signal) p.set('signal', signal);
    if (typeof NODES !== 'undefined' && NODES.length && signal) {
      var r = NODES.find(function (n) {
        return n.signal === signal;
      });
      if (r && r.lat != null && r.lon != null && typeof r.lat === 'number' && typeof r.lon === 'number') {
        p.set('mlat', r.lat.toFixed(5));
        p.set('mlon', r.lon.toFixed(5));
        p.set('zoom', String(zoomForStationNode(r)));
      }
    }
    ensureNearRadiusInParams(p);
    base.search = p.toString();
    return base.toString();
  }

  function buildShareViewURL() {
    var url = new URL(window.location.href);
    url.hash = '';
    var p = buildShareQueryParams();
    try {
      var curSig = new URLSearchParams(window.location.search).get('signal');
      if (curSig && String(curSig).trim() && !p.has('signal')) {
        p.set('signal', String(curSig).trim());
      }
    } catch (e2) {
      /* ignore */
    }

    if (typeof window.__radiomapGetMapShareState === 'function') {
      var m = window.__radiomapGetMapShareState();
      if (m && typeof m.lat === 'number' && typeof m.lng === 'number' && typeof m.zoom === 'number') {
        p.set('mlat', m.lat.toFixed(5));
        p.set('mlon', m.lng.toFixed(5));
        p.set('zoom', String(m.zoom));
        if (m.mode) p.set('mode', m.mode);
        if (m.signal) p.set('signal', m.signal);
      }
    }

    ensureNearRadiusInParams(p);
    url.search = p.toString();
    return url.toString();
  }

  /** When `navigator.share` is missing or fails, copy only the URL (no greeting text). */
  function fallbackCopyShareUrl(url, onMethod) {
    var u = url != null ? String(url) : '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(u).then(function () {
        alert('Enlace copiado al portapapeles.');
        if (onMethod) onMethod('clipboard');
      }).catch(function () {
        window.prompt('Copia este enlace:', u);
        if (onMethod) onMethod('prompt');
      });
    } else {
      window.prompt('Copia este enlace:', u);
      if (onMethod) onMethod('prompt');
    }
  }

  var html2canvasLoadPromise = null;
  function ensureHtml2Canvas() {
    if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
    if (html2canvasLoadPromise) return html2canvasLoadPromise;
    html2canvasLoadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.crossOrigin = 'anonymous';
      s.integrity = 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H';
      s.onload = function () {
        if (typeof window.html2canvas === 'function') resolve(window.html2canvas);
        else reject(new Error('html2canvas'));
      };
      s.onerror = function () {
        reject(new Error('html2canvas load'));
      };
      document.head.appendChild(s);
    });
    return html2canvasLoadPromise;
  }

  function captureMapElementToPngBlob() {
    var el = document.getElementById('map');
    if (!el || typeof window.html2canvas !== 'function') return Promise.reject(new Error('no map'));
    return window.html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        scale: Math.min(2, window.devicePixelRatio || 1),
        logging: false,
        backgroundColor: null,
        imageTimeout: 15000,
      })
      .then(function (canvas) {
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('toBlob'));
          }, 'image/png');
        });
      });
  }

  function sharePayloadForPage(url, isMapPage) {
    if (isMapPage) {
      return {
        title: 'Radiomap',
        text: '¡Hola! Te comparto esta vista del mapa de estaciones de radio en Chile: ' + url,
      };
    }
    return {
      title: 'Radiomap',
      text: '¡Hola! Te comparto este mapa de estaciones de radio contigo: ' + url,
    };
  }

  /**
   * @param {object} opts
   * @param {string} [opts.urlOverride] — full URL to share (default: buildShareViewURL())
   * @param {boolean} [opts.withScreenshot] — on map page, attach PNG of #map when supported
   * @param {string} [opts.title] — share title (e.g. station signal)
   */
  function radiomapPerformShare(opts) {
    opts = opts || {};
    var url = opts.urlOverride || buildShareViewURL();
    var isMapPage = document.body.classList.contains('page-map');
    var wantScreenshot = !!opts.withScreenshot && isMapPage;
    var msgs = sharePayloadForPage(url, isMapPage);
    var title = opts.title != null && String(opts.title).trim() ? String(opts.title).trim() : msgs.title;
    var text = msgs.text;

    function closeMenus() {
      if (typeof closeMenuMap === 'function') closeMenuMap();
      if (typeof closeMenu === 'function') closeMenu();
    }

    function tryShare(files) {
      var payload = { title: title, text: text, url: url };
      if (files && files.length && navigator.canShare) {
        try {
          if (!navigator.canShare({ files: files })) files = null;
        } catch (e) {
          files = null;
        }
      }
      if (files && files.length) payload.files = files;
      if (navigator.share) return navigator.share(payload);
      return Promise.reject(new Error('no share'));
    }

    function fallback() {
      fallbackCopyShareUrl(url, function (m) {
        if (typeof window.radiomapGaShare === 'function') window.radiomapGaShare(m);
      });
    }

    var chain = Promise.resolve();
    if (wantScreenshot) {
      chain = ensureHtml2Canvas()
        .then(captureMapElementToPngBlob)
        .then(function (blob) {
          var file = new File([blob], 'radiomap-mapa.png', { type: 'image/png' });
          return tryShare([file]).catch(function () {
            return tryShare(null);
          });
        })
        .catch(function () {
          return tryShare(null);
        });
    } else {
      chain = tryShare(null);
    }

    return chain
      .then(function () {
        if (typeof window.radiomapGaShare === 'function') window.radiomapGaShare('web_share');
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        fallback();
      })
      .finally(closeMenus);
  }

  function shareThisView(ev) {
    if (ev) ev.preventDefault();
    var isList = document.body.classList.contains('page-list');
    radiomapPerformShare({ withScreenshot: !isList });
  }

  window.buildShareViewURL = buildShareViewURL;
  window.buildMapViewURLForStation = buildMapViewURLForStation;
  window.shareThisView = shareThisView;
  window.fallbackCopyShareUrl = fallbackCopyShareUrl;
  window.radiomapPerformShare = radiomapPerformShare;

  function bindShareButtons() {
    document.querySelectorAll('#btn-share-view, #btn-share-view-menu').forEach(function (btn) {
      btn.addEventListener('click', shareThisView);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindShareButtons);
  } else {
    bindShareButtons();
  }
})();
