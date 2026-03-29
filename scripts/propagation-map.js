/**
 * Map propagation raster: ESRI world file (.pgw) + PNG under data/propagation/{signal}/.
 * Requires Leaflet (L) on window.
 */
(function () {
  function enc(s) {
    return encodeURIComponent(String(s));
  }

  function propagationBaseUrl(signal) {
    var seg = enc(signal);
    return 'data/propagation/' + seg + '/' + seg;
  }

  function parseWorldFileSix(text) {
    var lines = String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(function (l) {
        return l.trim();
      })
      .filter(function (l) {
        return l.length > 0;
      });
    if (lines.length < 6) {
      throw new Error('World file: se esperaban 6 líneas, hay ' + lines.length);
    }
    var nums = lines.slice(0, 6).map(function (l) {
      var x = parseFloat(l.replace(',', '.'));
      if (isNaN(x)) throw new Error('World file: número inválido: ' + l);
      return x;
    });
    return { A: nums[0], B: nums[1], C: nums[2], D: nums[3], E: nums[4], F: nums[5] };
  }

  /**
   * Affine from ESRI world file (center of pixel): X = A*col + B*row + E, Y = C*col + D*row + F
   * col = 0..W-1, row = 0..H-1. X = lon, Y = lat (WGS84).
   */
  function latLngBoundsFromWorldFile(wf, widthPx, heightPx) {
    if (typeof L === 'undefined' || !L.latLngBounds) {
      throw new Error('Leaflet no disponible');
    }
    var W = widthPx;
    var H = heightPx;
    if (!(W > 0 && H > 0)) throw new Error('Dimensiones de imagen inválidas');
    var A = wf.A,
      B = wf.B,
      C = wf.C,
      D = wf.D,
      E = wf.E,
      F = wf.F;
    var corners = [
      [0, 0],
      [W - 1, 0],
      [0, H - 1],
      [W - 1, H - 1],
    ];
    var lats = [];
    var lngs = [];
    for (var i = 0; i < corners.length; i++) {
      var col = corners[i][0];
      var row = corners[i][1];
      var lon = A * col + B * row + E;
      var lat = C * col + D * row + F;
      lats.push(lat);
      lngs.push(lon);
    }
    var minLat = Math.min.apply(null, lats);
    var maxLat = Math.max.apply(null, lats);
    var minLng = Math.min.apply(null, lngs);
    var maxLng = Math.max.apply(null, lngs);
    return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
  }

  function propagationPngUrl(signal) {
    return propagationBaseUrl(signal) + '.png';
  }

  function propagationPgwUrl(signal) {
    return propagationBaseUrl(signal) + '.pgw';
  }

  function fetchPgwText(signal) {
    return fetch(propagationPgwUrl(signal), { cache: 'force-cache' }).then(function (r) {
      if (!r.ok) throw new Error('No se pudo cargar .pgw (' + r.status + ')');
      return r.text();
    });
  }

  /** Prefer texto embebido en NODES (generado por csv-to-datajs) para evitar fetch/CORS. */
  function resolvePgwText(signal) {
    if (typeof NODES !== 'undefined' && NODES && NODES.length) {
      for (var i = 0; i < NODES.length; i++) {
        var n = NODES[i];
        if (n && n.signal === signal && typeof n.propagationPgw === 'string' && n.propagationPgw.trim() !== '') {
          return Promise.resolve(n.propagationPgw);
        }
      }
    }
    return fetchPgwText(signal);
  }

  function loadImageNaturalSize(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = function () {
        reject(new Error('No se pudo cargar la imagen PNG'));
      };
      img.src = url;
    });
  }

  function clearPropagationOverlay(layerGroup) {
    if (layerGroup && typeof layerGroup.clearLayers === 'function') {
      layerGroup.clearLayers();
    }
  }

  /** Signal-Server .dcf: líneas «±NNN: R, G, B». */
  function parseDcfPalette(text) {
    var lines = String(text || '').split(/\r?\n/);
    var re = /^\s*([+-]?\d+)\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/;
    var stops = [];
    for (var i = 0; i < lines.length; i++) {
      var m = re.exec(lines[i].trim());
      if (!m) continue;
      stops.push({
        dbm: parseInt(m[1], 10),
        r: parseInt(m[2], 10),
        g: parseInt(m[3], 10),
        b: parseInt(m[4], 10),
      });
    }
    stops.sort(function (a, b) {
      return a.dbm - b.dbm;
    });
    return stops;
  }

  /**
   * Leyenda vertical: arriba dBm más alto (más señal), abajo más débil.
   * @param {Array<{dbm:number,r:number,g:number,b:number}>} stops
   * @returns {HTMLElement}
   */
  function buildPropagationLegendElement(stops) {
    if (!stops || stops.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'propagation-legend propagation-legend--float';
      return empty;
    }
    var minDbm = stops[0].dbm;
    var maxDbm = stops[stops.length - 1].dbm;
    var span = maxDbm - minDbm;
    if (span <= 0) span = 1;

    var desc = stops.slice().reverse();
    var gradParts = [];
    for (var i = 0; i < desc.length; i++) {
      var s = desc[i];
      var pct = ((maxDbm - s.dbm) / span) * 100;
      gradParts.push('rgb(' + s.r + ',' + s.g + ',' + s.b + ') ' + pct.toFixed(2) + '%');
    }
    var gradient = 'linear-gradient(to bottom, ' + gradParts.join(', ') + ')';

    var root = document.createElement('div');
    root.className = 'propagation-legend propagation-legend--float';
    root.setAttribute('aria-hidden', 'false');
    root.setAttribute('aria-label', 'Potencia recibida (dBm)');

    var title = document.createElement('div');
    title.className = 'propagation-legend__title';
    title.textContent = 'dBm';

    var body = document.createElement('div');
    body.className = 'propagation-legend__body';

    var strip = document.createElement('div');
    strip.className = 'propagation-legend__strip';
    strip.style.background = gradient;

    var ticks = document.createElement('div');
    ticks.className = 'propagation-legend__ticks';
    for (var j = 0; j < stops.length; j++) {
      var t = stops[j];
      var topPct = ((maxDbm - t.dbm) / span) * 100;
      var row = document.createElement('div');
      row.className = 'propagation-legend__tick';
      row.style.top = topPct + '%';
      row.textContent = (t.dbm >= 0 ? '+' : '') + t.dbm;
      ticks.appendChild(row);
    }

    strip.appendChild(ticks);
    body.appendChild(strip);
    root.appendChild(title);
    root.appendChild(body);
    return root;
  }

  /**
   * @param {L.LayerGroup} layerGroup
   * @param {string} signal
   * @param {{ opacity?: number }} [options]
   * @returns {Promise<void>}
   */
  function showPropagationOverlay(layerGroup, signal, options) {
    options = options || {};
    var opacity = typeof options.opacity === 'number' ? options.opacity : 0.45;
    if (!layerGroup || typeof layerGroup.clearLayers !== 'function') {
      return Promise.reject(new Error('layerGroup inválido'));
    }
    layerGroup.clearLayers();
    var pngUrl = propagationPngUrl(signal);
    return resolvePgwText(signal)
      .then(function (text) {
        return parseWorldFileSix(text);
      })
      .then(function (wf) {
        return loadImageNaturalSize(pngUrl).then(function (dim) {
          return { wf: wf, dim: dim };
        });
      })
      .then(function (o) {
        var bounds = latLngBoundsFromWorldFile(o.wf, o.dim.w, o.dim.h);
        L.imageOverlay(pngUrl, bounds, {
          opacity: opacity,
          interactive: false,
        }).addTo(layerGroup);
      });
  }

  window.radiomapPropagation = {
    parseWorldFileSix: parseWorldFileSix,
    latLngBoundsFromWorldFile: latLngBoundsFromWorldFile,
    propagationPngUrl: propagationPngUrl,
    propagationPgwUrl: propagationPgwUrl,
    fetchPgwText: fetchPgwText,
    resolvePgwText: resolvePgwText,
    parseDcfPalette: parseDcfPalette,
    buildPropagationLegendElement: buildPropagationLegendElement,
    showPropagationOverlay: showPropagationOverlay,
    clearPropagationOverlay: clearPropagationOverlay,
  };
})();
