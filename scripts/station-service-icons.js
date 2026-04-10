/**
 * Station service icons — ATC, fire, ambulance, maritime (CSV `serviceType`).
 * SVG paths derived from Heroicons (MIT); aircraft path matches legacy map marker.
 */
(function () {
  'use strict';

  var ALLOWED = ['atc', 'fire', 'ambulance', 'sea'];

  /** Short labels for list badges */
  var BADGE = {
    atc: 'ATC',
    fire: 'Bomberos',
    ambulance: 'SAMU',
    sea: 'Marítimo',
  };

  /** Title / tooltip / neighbor */
  var TITLE = {
    atc: 'ATC / aeronáutico (solo RX / escucha)',
    fire: 'Servicio de bomberos',
    ambulance: 'Ambulancia / emergencia médica',
    sea: 'Servicio marítimo / costa',
  };

  /**
   * Inner SVG content (paths only). Heroicons solid 24 / legacy plane.
   * @type {Record<string, string>}
   */
  var PATHS_INNER = {
    atc:
      '<path fill="currentColor" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
    fire:
      '<path fill="currentColor" fill-rule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z" clip-rule="evenodd"/>',
    ambulance:
      '<path fill="currentColor" d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25ZM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875h.375a3 3 0 1 1 6 0h3a.75.75 0 0 0 .75-.75V15Z"/>' +
      '<path fill="currentColor" d="M8.25 19.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM15.75 6.75a.75.75 0 0 0-.75.75v11.25c0 .087.015.17.042.248a3 3 0 0 1 5.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 0 0-3.732-10.104 1.837 1.837 0 0 0-1.47-.725H15.75Z"/>' +
      '<path fill="currentColor" d="M19.5 19.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z"/>',
    sea:
      '<path fill="currentColor" fill-rule="evenodd" d="M19.449 8.448 16.388 11a4.52 4.52 0 0 1 0 2.002l3.061 2.55a8.275 8.275 0 0 0 0-7.103ZM15.552 19.45 13 16.388a4.52 4.52 0 0 1-2.002 0l-2.55 3.061a8.275 8.275 0 0 0 7.103 0ZM4.55 15.552 7.612 13a4.52 4.52 0 0 1 0-2.002L4.551 8.45a8.275 8.275 0 0 0 0 7.103ZM8.448 4.55 11 7.612a4.52 4.52 0 0 1 2.002 0l2.55-3.061a8.275 8.275 0 0 0-7.103 0Zm8.657-.86a9.776 9.776 0 0 1 1.79 1.415 9.776 9.776 0 0 1 1.414 1.788 9.764 9.764 0 0 1 0 10.211 9.777 9.777 0 0 1-1.415 1.79 9.777 9.777 0 0 1-1.788 1.414 9.764 9.764 0 0 1-10.212 0 9.776 9.776 0 0 1-1.788-1.415 9.776 9.776 0 0 1-1.415-1.788 9.764 9.764 0 0 1 0-10.212 9.774 9.774 0 0 1 1.415-1.788A9.774 9.774 0 0 1 6.894 3.69a9.764 9.764 0 0 1 10.211 0ZM14.121 9.88a2.985 2.985 0 0 0-1.11-.704 3.015 3.015 0 0 0-2.022 0 2.985 2.985 0 0 0-1.11.704c-.326.325-.56.705-.704 1.11a3.015 3.015 0 0 0 0 2.022c.144.405.378.785.704 1.11.325.326.705.56 1.11.704.652.233 1.37.233 2.022 0a2.985 2.985 0 0 0 1.11-.704c.326-.325.56-.705.704-1.11a3.016 3.016 0 0 0 0-2.022 2.985 2.985 0 0 0-.704-1.11Z" clip-rule="evenodd"/>',
  };

  function escAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /**
   * @param {object} r node
   * @returns {''|'atc'|'fire'|'ambulance'|'sea'}
   */
  function getStationServiceType(r) {
    if (!r || r.serviceType == null) return '';
    var t = String(r.serviceType).trim().toLowerCase();
    return ALLOWED.indexOf(t) >= 0 ? t : '';
  }

  function hasStationServiceType(r) {
    return getStationServiceType(r) !== '';
  }

  /**
   * Inline icon before signal (lista, tooltip, sidebar, modal).
   * @param {object} r node
   * @param {string} [extraClass] appended to svg class
   */
  function stationServiceIconInlineHtml(r, extraClass) {
    var t = getStationServiceType(r);
    if (!t) return '';
    var inner = PATHS_INNER[t];
    if (!inner) return '';
    var cls =
      'signal-service-icon signal-service-icon--' + t + (extraClass ? ' ' + extraClass : '');
    return (
      '<svg class="' +
      escAttr(cls) +
      '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      inner +
      '</svg>'
    );
  }

  /**
   * Leaflet marker inner (colored disc); same pattern as legacy ATC marker.
   * @param {string} t service type id
   * @param {number} px icon width/height
   */
  function stationServiceMarkerInnerHtml(t, px) {
    if (!t || !PATHS_INNER[t]) return '';
    var p = Math.max(4, Math.round(px));
    var inner = PATHS_INNER[t];
    return (
      '<svg class="rpt-marker-service-icon rpt-marker-service-icon--' +
      t +
      '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' +
      p +
      '" height="' +
      p +
      '" aria-hidden="true" focusable="false">' +
      inner +
      '</svg>'
    );
  }

  /**
   * Neighbor list dot (sidebar): colored circle + small icon.
   * @param {object} nb node
   * @param {string} regionColor hex or css color
   */
  function stationServiceNeighborDotHtml(nb, regionColor) {
    var t = getStationServiceType(nb);
    if (!t) return '';
    var inner = PATHS_INNER[t];
    if (!inner) return '';
    var title = TITLE[t] || t;
    var p = 10;
    var svg =
      '<svg class="neighbor-service-icon neighbor-service-icon--' +
      t +
      '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' +
      p +
      '" height="' +
      p +
      '" aria-hidden="true" focusable="false">' +
      inner +
      '</svg>';
    return (
      '<div class="neighbor-service neighbor-service--' +
      t +
      '" style="background:' +
      regionColor +
      '" title="' +
      escAttr(title) +
      '">' +
      svg +
      '</div>'
    );
  }

  /** Badge chip for lista table (short text). */
  function stationServiceBadgeHtml(r) {
    var t = getStationServiceType(r);
    if (!t) return '';
    var short = BADGE[t] || t;
    var tip = TITLE[t] || short;
    return (
      '<span class="badge-service badge-service--' +
      t +
      '" title="' +
      escAttr(tip) +
      '">' +
      escAttr(short) +
      '</span>'
    );
  }

  window.getStationServiceType = getStationServiceType;
  window.hasStationServiceType = hasStationServiceType;
  window.stationServiceIconInlineHtml = stationServiceIconInlineHtml;
  window.stationServiceMarkerInnerHtml = stationServiceMarkerInnerHtml;
  window.stationServiceNeighborDotHtml = stationServiceNeighborDotHtml;
  window.stationServiceBadgeHtml = stationServiceBadgeHtml;
  window.STATION_SERVICE_TYPE_IDS = ALLOWED.slice();
  window.STATION_SERVICE_TITLES = TITLE;
})();
