/**
 * Build / open shareable URLs: filters, near-me, map position & mode, list vs map page.
 * Requires: location-filter.js, data/data.js (NODES) for buildMapViewURLForStation
 */
(function () {
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
      var r = NODES.find(function (n) { return n.signal === signal; });
      if (r && r.lat != null && r.lon != null && typeof r.lat === 'number' && typeof r.lon === 'number') {
        p.set('mlat', r.lat.toFixed(5));
        p.set('mlon', r.lon.toFixed(5));
        p.set('zoom', String(zoomForStationNode(r)));
      }
    }
    base.search = p.toString();
    return base.toString();
  }

  function buildShareViewURL() {
    var url = new URL(window.location.href);
    url.hash = '';
    var p = buildShareQueryParams();

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

    url.search = p.toString();
    return url.toString();
  }

  function fallbackCopyShareUrl(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        alert('Enlace copiado al portapapeles.');
      }).catch(function () {
        window.prompt('Copia este enlace:', text);
      });
    } else {
      window.prompt('Copia este enlace:', text);
    }
  }

  function shareThisView(ev) {
    if (ev) ev.preventDefault();
    var url = buildShareViewURL();
    var title = 'Radiomap';
    var text = 'Vista.';
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () {
        fallbackCopyShareUrl(url);
      });
    } else {
      fallbackCopyShareUrl(url);
    }
    if (typeof closeMenuMap === 'function') closeMenuMap();
    if (typeof closeMenu === 'function') closeMenu();
  }

  window.buildShareViewURL = buildShareViewURL;
  window.buildMapViewURLForStation = buildMapViewURLForStation;
  window.shareThisView = shareThisView;
  window.fallbackCopyShareUrl = fallbackCopyShareUrl;

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
