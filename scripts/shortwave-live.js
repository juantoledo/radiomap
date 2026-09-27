/**
 * Onda corta — lógica pura (sin DOM): ¿qué emisiones del horario EiBi están al aire en un instante UTC?
 * Datos: global SHORTWAVE (data/shortwave.js, generado por scripts/eibi-to-shortwavejs.py).
 * entry = [kHz, inicioMin, finMin, díasIdx, emisoraIdx, idioma, zonaObjetivo, sitioIdx, soloTemporada, desde, hasta, últimaEscucha]
 */
(function (root) {
  'use strict';

  var E = { KHZ: 0, START: 1, END: 2, DAYS: 3, STATION: 4, LANG: 5, TARGET: 6, SITE: 7, SEASON: 8, FROM: 9, TO: 10, HEARD: 11 };

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

  /**
   * Emisiones al aire, filtradas. opts: { lang: null | 'S' | ['S','P'] }
   * → [{ entry, status }]
   */
  function liveEntries(sw, now, opts) {
    opts = opts || {};
    var langs = opts.lang == null ? null : [].concat(opts.lang);
    var out = [];
    for (var i = 0; i < sw.entries.length; i++) {
      var en = sw.entries[i];
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

  /** Minúsculas sin tildes («Bogotá» → «bogota») para buscar texto. */
  function foldText(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    return t.normalize ? t.normalize('NFD').replace(/[̀-ͯ]/g, '') : t;
  }

  /**
   * ¿La emisión coincide con el texto de búsqueda? q ya pasado por foldText.
   * Solo dígitos → prefijo de kHz («95» → 9500–9599). Si no: emisora, país (nombre o código ITU),
   * sitio, idiomas o zona objetivo contienen q.
   */
  function matchesQuery(sw, entry, q) {
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(entry[E.KHZ]).indexOf(q) === 0;
    var st = sw.stations[entry[E.STATION]] || [];
    var site = sw.sites[entry[E.SITE]] || [];
    var hay = [st[0], site[0], sw.countries[site[0]], site[2], entry[E.TARGET], sw.targets[entry[E.TARGET]]];
    String(entry[E.LANG] || '').split(',').forEach(function (c) {
      c = c.trim();
      if (c) hay.push(sw.langs[c]);
    });
    for (var i = 0; i < hay.length; i++) {
      if (hay[i] && foldText(hay[i]).indexOf(q) !== -1) return true;
    }
    return false;
  }

  var api = {
    FIELDS: E,
    foldText: foldText,
    matchesQuery: matchesQuery,
    isOnAir: isOnAir,
    dayMatches: dayMatches,
    isNorthernSummer: isNorthernSummer,
    liveEntries: liveEntries,
    groupBySite: groupBySite
  };
  root.radiomapShortwaveLive = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
