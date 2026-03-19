/**
 * Build / open shareable URLs: filters, near-me, map position & mode, list vs map page.
 * Requires: location-filter.js
 */
(function () {
  function buildShareViewURL() {
    var url = new URL(window.location.href);
    url.hash = '';
    var p = new URLSearchParams();

    var search = document.getElementById('search');
    if (search && search.value.trim()) p.set('search', search.value.trim());

    var banda = document.getElementById('filter-banda');
    if (banda && banda.value) p.set('banda', banda.value);

    var region = document.getElementById('filter-region');
    if (region && region.value) p.set('region', region.value);

    var echolink = document.getElementById('filter-echolink');
    if (echolink && echolink.value) p.set('echolink', echolink.value);

    var ec = document.getElementById('filter-echolink-conference');
    if (ec && ec.value) p.set('echolinkConference', ec.value);

    var nm = typeof getNearMeLocation === 'function' ? getNearMeLocation() : null;
    if (nm && typeof nm.lat === 'number' && typeof nm.lon === 'number') {
      p.set('near', nm.lat.toFixed(5) + ',' + nm.lon.toFixed(5));
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
    var title = 'Radiomap — Vista compartida';
    var text = 'Abre este enlace para ver la misma vista (filtros y mapa o lista).';
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
