/**
 * Onda corta — carga diferida de data/shortwave.js (global SHORTWAVE) y hora de evaluación.
 * Compartido por shortwave-map.js (mapa) y shortwave-list.js (lista). Depuración: `?swnow=2026-09-25T00:00Z`.
 */
(function () {
  'use strict';

  var loading = null;

  /** Inyecta data/shortwave.js una sola vez; resuelve con SHORTWAVE. */
  function ensureData() {
    if (typeof SHORTWAVE !== 'undefined') return Promise.resolve(SHORTWAVE);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var v = typeof VERSION !== 'undefined' ? VERSION : '';
      s.src = 'data/shortwave.js' + (v ? '?v=' + encodeURIComponent(v) : '');
      s.async = true;
      s.onload = function () {
        if (typeof SHORTWAVE !== 'undefined') resolve(SHORTWAVE);
        else reject(new Error('SHORTWAVE no definido'));
      };
      s.onerror = function () { reject(new Error('No se pudo cargar data/shortwave.js')); };
      document.head.appendChild(s);
    }).catch(function (err) {
      loading = null;
      throw err;
    });
    return loading;
  }

  /** ¿Hay una carga en curso? (para deshabilitar el botón mientras tanto) */
  function isLoading() {
    return !!loading && typeof SHORTWAVE === 'undefined';
  }

  /** Hora de evaluación: ahora, o `?swnow=` (ISO) para verificar horarios. */
  function now() {
    try {
      var p = new URLSearchParams(window.location.search).get('swnow');
      if (p) {
        var d = new Date(p);
        if (!isNaN(d.getTime())) return d;
      }
    } catch (e) { /* ignore */ }
    return new Date();
  }

  window.radiomapShortwaveLoader = { ensureData: ensureData, isLoading: isLoading, now: now };
})();
