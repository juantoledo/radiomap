/**
 * Category buckets for GLOBAL-region stations (HF nets, CB channels, international nets),
 * inferred from the `labels` field. Shared by scripts/map.js and scripts/list.js so both
 * pages group/collapse the same way.
 */
(function () {
  var GLOBAL_GROUPS = [
    { key: 'encuentro', title: 'Frecuencias de encuentro internacional', test: function (labels) { return labels.indexOf('encuentro') >= 0; } },
    { key: 'cb', title: 'Banda ciudadana (CB)', test: function (labels) { return labels.indexOf('cb') >= 0 || labels.indexOf('banda-ciudadana') >= 0; }, collapsedByDefault: true },
    { key: 'frs', title: 'FRS (Motorola, 22 canales)', test: function (labels) { return labels.indexOf('frs') >= 0; }, collapsedByDefault: true },
    { key: 'pmr', title: 'PMR446 (16 canales)', test: function (labels) { return labels.indexOf('pmr') >= 0; }, collapsedByDefault: true },
    { key: 'baofeng', title: 'Baofeng BF-888S (16 canales de fábrica)', test: function (labels) { return labels.indexOf('baofeng') >= 0; }, collapsedByDefault: true },
    { key: 'hf', title: 'Redes HF nacionales', test: function (labels, r) { return (r.banda || '') === 'HF'; } },
    { key: 'otros', title: 'Otras estaciones globales', test: function () { return true; } }
  ];

  function classifyGlobalStation(r) {
    var labels = ' ' + String(r.labels || '').toLowerCase() + ' ';
    for (var i = 0; i < GLOBAL_GROUPS.length; i++) {
      if (GLOBAL_GROUPS[i].test(labels, r)) return GLOBAL_GROUPS[i];
    }
    return GLOBAL_GROUPS[GLOBAL_GROUPS.length - 1];
  }

  window.GLOBAL_GROUPS = GLOBAL_GROUPS;
  window.classifyGlobalStation = classifyGlobalStation;

  /**
   * Persisted open/closed state for every collapsible <details class="global-group">,
   * shared across map.js's Global panel and list.js's region zones + GLOBAL sub-categories
   * (same storage key for the same group.key, e.g. 'cb', so collapsing CB on one page
   * collapses it on the other too). All groups start collapsed unless the user expanded
   * them before, or the group's own content is currently matched by an active search/filter.
   */
  var GROUP_STATE_KEY = 'radiomapGroupOpenState';

  function getStoredGroupState() {
    try {
      var raw = window.localStorage.getItem(GROUP_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function isGroupOpen(key) {
    var state = getStoredGroupState();
    return Object.prototype.hasOwnProperty.call(state, key) ? !!state[key] : false;
  }

  function setGroupOpen(key, isOpen) {
    try {
      var state = getStoredGroupState();
      state[key] = !!isOpen;
      window.localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  /** All groups collapsed by default; forced open while a search/filter is active so matches aren't hidden. */
  function shouldGroupBeOpen(key, isFiltering) {
    return !!isFiltering || isGroupOpen(key);
  }

  /**
   * Wire persistence once per page: user clicks on a summary toggle the <details>, which fires
   * a native 'toggle' event (capture-only, doesn't bubble) — save the new state for that key.
   * Safe to call multiple times; only binds once. Full re-renders (innerHTML replacement) never
   * fire 'toggle' on the fresh elements, so this only reacts to genuine user interaction.
   */
  function wireGlobalGroupPersistence() {
    if (window.__radiomapGroupPersistenceWired) return;
    window.__radiomapGroupPersistenceWired = true;
    document.addEventListener('toggle', function (e) {
      var d = e.target;
      if (d && d.tagName === 'DETAILS' && d.dataset && d.dataset.groupKey) {
        setGroupOpen(d.dataset.groupKey, d.open);
      }
    }, true);
  }

  window.isGroupOpen = isGroupOpen;
  window.setGroupOpen = setGroupOpen;
  window.shouldGroupBeOpen = shouldGroupBeOpen;
  window.wireGlobalGroupPersistence = wireGlobalGroupPersistence;
  wireGlobalGroupPersistence();
})();
