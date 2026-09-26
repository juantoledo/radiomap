/**
 * Onda corta — lógica pura (sin DOM): ¿qué emisiones del horario EiBi están al aire en un instante UTC?
 * Datos: global SHORTWAVE (data/shortwave.js, generado por scripts/eibi-to-shortwavejs.py).
 * entry = [kHz, inicioMin, finMin, díasIdx, emisoraIdx, idioma, zonaObjetivo, sitioIdx, soloTemporada, desde, hasta, últimaEscucha]
 */
(function (root) {
  'use strict';

  var E = { KHZ: 0, START: 1, END: 2, DAYS: 3, STATION: 4, LANG: 5, TARGET: 6, SITE: 7, SEASON: 8, FROM: 9, TO: 10, HEARD: 11 };

  /** Zonas objetivo que incluyen (o pasan por) Sudamérica / América. */
  var AMERICAS_TARGETS = {
    Am: 1, LAm: 1, SAm: 1, CAm: 1, Car: 1, NAm: 1, ENA: 1, WNA: 1, CNA: 1, SAO: 1, Glo: 1,
    CHL: 1, ARG: 1, B: 1, BOL: 1, PRU: 1, CLM: 1, VEN: 1, EQA: 1, PRG: 1, URG: 1, MEX: 1, CUB: 1,
    CTR: 1, GTM: 1, HND: 1, NCG: 1, PNR: 1, SLV: 1, DOM: 1, HTI: 1, USA: 1, CAN: 1
  };

  function lastSundayUtc(year, monthIdx) {
    var d = new Date(Date.UTC(year, monthIdx + 1, 0, 1, 0)); // último día del mes, 01:00 UTC
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime();
  }

  /** Temporada EiBi «A» (verano boreal): último domingo de marzo → último domingo de octubre, 01:00 UTC. */
  function isNorthernSummer(now) {
    var y = now.getUTCFullYear();
    var t = now.getTime();
    return t >= lastSundayUtc(y, 2) && t < lastSundayUtc(y, 9);
  }

  function isoDay(d) {
    return d.toISOString().slice(0, 10);
  }

  /** Lunes = 0 … domingo = 6 */
  function weekdayMo0(d) {
    return (d.getUTCDay() + 6) % 7;
  }

  /** ¿El descriptor de días acepta la fecha UTC `day`? Los irregulares (irr/test/…) cuentan como cualquier emisión programada. */
  function dayMatches(desc, day) {
    if (!desc) return false;
    var wd = weekdayMo0(day);
    var dom = day.getUTCDate();
    switch (desc.t) {
      case 'd': return true;
      case 'w': return (desc.m & (1 << wd)) !== 0;
      case 'n': return wd === desc.wd && Math.ceil(dom / 7) === desc.n;
      case 'l': {
        var daysInMonth = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
        return wd === desc.wd && dom + 7 > daysInMonth;
      }
      case 'date': return dom === desc.d && day.getUTCMonth() + 1 === desc.m;
      case 'irr': return true;
      default: return true;
    }
  }

  /**
   * Estado de una emisión en `now` (Date): 'live' | null.
   * Los días se evalúan sobre el día UTC en que COMIENZA el bloque (tramo tras medianoche → día anterior).
   */
  function isOnAir(entry, daysTable, now) {
    if (entry[E.SEASON] === 4 || entry[E.SEASON] === 5) {
      var summer = isNorthernSummer(now);
      if ((entry[E.SEASON] === 5) !== summer) return null;
    }
    var s = entry[E.START];
    var e = entry[E.END];
    var m = now.getUTCHours() * 60 + now.getUTCMinutes();
    var slotDay;
    if (s < e) {
      if (m < s || m >= e) return null;
      slotDay = now;
    } else if (s > e) {
      if (m >= s) slotDay = now;
      else if (m < e) slotDay = new Date(now.getTime() - 86400000);
      else return null;
    } else {
      return null;
    }
    var day = isoDay(slotDay);
    if (entry[E.FROM] && day < entry[E.FROM]) return null;
    if (entry[E.TO] && day > entry[E.TO]) return null;
    return dayMatches(daysTable[entry[E.DAYS]], slotDay) ? 'live' : null;
  }

  function isAimedAtAmericas(target) {
    return !!(target && AMERICAS_TARGETS[target]);
  }

  /**
   * Emisiones al aire, filtradas. opts: { americasOnly, lang: null | 'S' | ['S','P'] }
   * → [{ entry, status }]
   */
  function liveEntries(sw, now, opts) {
    opts = opts || {};
    var langs = opts.lang == null ? null : [].concat(opts.lang);
    var out = [];
    for (var i = 0; i < sw.entries.length; i++) {
      var en = sw.entries[i];
      if (opts.americasOnly && !isAimedAtAmericas(en[E.TARGET])) continue;
      if (langs && langs.indexOf(en[E.LANG]) === -1) continue;
      var st = isOnAir(en, sw.days, now);
      if (!st) continue;
      out.push({ entry: en, status: st });
    }
    return out;
  }

  /** Agrupa por sitio de transmisión → [{ siteIdx, items: [{entry,status}] }] ordenados por kHz. */
  function groupBySite(items) {
    var map = {};
    var order = [];
    items.forEach(function (it) {
      var k = it.entry[E.SITE];
      if (!map[k]) {
        map[k] = { siteIdx: k, items: [] };
        order.push(map[k]);
      }
      map[k].items.push(it);
    });
    order.forEach(function (g) {
      g.items.sort(function (a, b) { return a.entry[E.KHZ] - b.entry[E.KHZ] || a.entry[E.START] - b.entry[E.START]; });
    });
    return order;
  }

  var api = {
    FIELDS: E,
    isOnAir: isOnAir,
    dayMatches: dayMatches,
    isNorthernSummer: isNorthernSummer,
    isAimedAtAmericas: isAimedAtAmericas,
    liveEntries: liveEntries,
    groupBySite: groupBySite
  };
  root.radiomapShortwaveLive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
