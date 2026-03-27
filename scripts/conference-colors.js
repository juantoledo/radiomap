/**
 * Stable HSL color per conference (golden-angle hue) — map markers and filter swatches.
 * Requires: data/data.js (NODES)
 */
(function () {
  function buildConferenceColorMap(nodes) {
    if (!nodes || !nodes.length) return { sortedNames: [], colors: {} };
    var sortedNames = [...new Set(nodes.map(function (r) {
      return (r.conference || '').trim();
    }).filter(Boolean))].sort();
    var colors = {};
    sortedNames.forEach(function (name, i) {
      var hue = (i * 137.508) % 360;
      colors[name] = 'hsl(' + Math.round(hue) + ', 65%, 52%)';
    });
    return { sortedNames: sortedNames, colors: colors };
  }
  window.buildConferenceColorMap = buildConferenceColorMap;
})();
