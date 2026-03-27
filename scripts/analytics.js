/**
 * GA4 custom events (gtag). No-op if gtag is absent.
 * Register event parameters as custom dimensions in GA4 Admin; see AGENTS.md.
 */
(function () {
  function pageType() {
    if (document.body && document.body.classList.contains('page-list')) return 'list';
    if (document.body && document.body.classList.contains('page-map')) return 'map';
    return 'other';
  }

  function buildFilterMode() {
    var c = typeof getFilterCriteria === 'function' ? getFilterCriteria() : {};
    var anchor = typeof getDistanceFilterAnchor === 'function' ? getDistanceFilterAnchor() : null;
    var parts = [];
    parts.push('b' + (c.bandas && c.bandas.length ? c.bandas.length : 0));
    parts.push('r' + (c.regions && c.regions.length ? c.regions.length : 0));
    parts.push('t' + (c.types && c.types.length ? c.types.length : 0));
    parts.push('c' + (c.conferences && c.conferences.length ? c.conferences.length : 0));
    parts.push('q' + (c.q ? '1' : '0'));
    if (anchor) {
      parts.push('near:' + (anchor.kind === 'gps' ? 'gps' : 'station'));
      var km = typeof getNearMeRadiusKm === 'function' ? getNearMeRadiusKm() : 100;
      parts.push('km' + km);
    } else {
      parts.push('near:0');
    }
    return parts.join('|');
  }

  function conferenceParam() {
    var c = typeof getFilterCriteria === 'function' ? getFilterCriteria() : {};
    var conf = c.conferences || [];
    if (conf.length === 1) return String(conf[0]).slice(0, 100);
    if (conf.length > 1) return 'multi';
    return '';
  }

  function gaSend(eventName, params) {
    if (typeof gtag !== 'function') return;
    var p = Object.assign({ page_type: pageType() }, params || {});
    Object.keys(p).forEach(function (k) {
      if (p[k] === undefined || p[k] === null || p[k] === '') delete p[k];
    });
    gtag('event', eventName, p);
  }

  var filterTimer = null;
  function scheduleFilterApply() {
    if (filterTimer) clearTimeout(filterTimer);
    filterTimer = setTimeout(function () {
      filterTimer = null;
      gaSend('radiomap_filter_apply', {
        filter_mode: buildFilterMode(),
        conference: conferenceParam() || undefined
      });
    }, 900);
  }

  window.radiomapGaEvent = gaSend;
  window.radiomapGaScheduleFilterApply = scheduleFilterApply;
  window.radiomapGaStationSelect = function (callsign, interaction) {
    var sig = callsign != null ? String(callsign).trim() : '';
    if (!sig) return;
    gaSend('radiomap_station_select', {
      callsign: sig.slice(0, 32),
      interaction: interaction || 'select'
    });
  };
  window.radiomapGaShare = function (share_method) {
    gaSend('radiomap_share', {
      share_method: share_method || 'unknown'
    });
  };
})();
