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

  /**
   * Emisiones que NO están al aire en `now` pero comienzan dentro de `withinMin` minutos (por defecto 60).
   * Reutiliza isOnAir en el minuto de inicio, así días/temporada/validez se evalúan igual que «al aire».
   * opts: { withinMin } → [{ entry, startsIn }] (startsIn en minutos, 1..withinMin)
   */
  function upcomingEntries(sw, now, opts) {
    var within = opts && opts.withinMin != null ? opts.withinMin : 60;
    var nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    var base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes());
    var out = [];
    for (var i = 0; i < sw.entries.length; i++) {
      var en = sw.entries[i];
      var delta = (en[E.START] - nowMin + 1440) % 1440;
      if (delta <= 0 || delta > within) continue;
      if (isOnAir(en, sw.days, now)) continue;
      if (!isOnAir(en, sw.days, new Date(base + delta * 60000))) continue;
      out.push({ entry: en, startsIn: delta });
    }
    return out;
  }

  /** «S,Q» → ['S','Q'] (EiBi usa códigos combinados para emisiones bilingües). */
  function langsOf(code) {
    return String(code || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  }

  function langLabel(sw, code) {
    return langsOf(code).map(function (c) { return sw.langs[c] || c; }).join(' / ');
  }

  /** Minutos desde 00:00 → «HH:MM» (1440 → «24:00»). */
  function hhmm(min) {
    if (min === 1440) return '24:00';
    var h = Math.floor(min / 60) % 24;
    var m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  var fmtChile = null;
  try {
    fmtChile = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch (e) {
    fmtChile = null;
  }

  /** Hora de Chile del minuto UTC `min` en el día de `ref` ('' si Intl no soporta la zona). */
  function chileTime(min, ref) {
    if (!fmtChile) return '';
    var d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), 0, min % 1440));
    return fmtChile.format(d);
  }

  /** Horario de la emisión: «HH:MM–HH:MM UTC · HH:MM–HH:MM Chile» o «las 24 h». */
  function slotLabel(entry, ref) {
    var s = entry[E.START];
    var e = entry[E.END];
    if (s === 0 && e === 1440) return 'las 24 h';
    var utc = hhmm(s) + '–' + hhmm(e) + ' UTC';
    var cl = chileTime(s, ref);
    return cl ? utc + ' · ' + cl + '–' + chileTime(e, ref) + ' Chile' : utc;
  }

  /** Reloj: «HH:MM UTC · HH:MM Chile». */
  function clockLabel(ref) {
    var utc = hhmm(ref.getUTCHours() * 60 + ref.getUTCMinutes()) + ' UTC';
    return fmtChile ? utc + ' · ' + fmtChile.format(ref) + ' Chile' : utc;
  }

  /** Bandas de radiodifusión en onda corta (UIT), de menor a mayor frecuencia: [mínKHz, máxKHz, id]. */
  var BANDS = [
    [2300, 2495, '120m'], [3200, 3400, '90m'], [3900, 4000, '75m'], [4750, 5060, '60m'],
    [5900, 6200, '49m'], [7200, 7450, '41m'], [9400, 9900, '31m'], [11600, 12100, '25m'],
    [13570, 13870, '22m'], [15100, 15800, '19m'], [17480, 17900, '16m'], [18900, 19020, '15m'],
    [21450, 21850, '13m'], [25670, 26100, '11m']
  ];
  var BAND_OOB = 'oob';

  /** kHz → id de banda («49m») o 'oob' si cae fuera de las bandas de radiodifusión. */
  function bandOf(khz) {
    for (var i = 0; i < BANDS.length; i++) {
      if (khz >= BANDS[i][0] && khz <= BANDS[i][1]) return BANDS[i][2];
    }
    return BAND_OOB;
  }

  /** «49m» → «49 m»; 'oob' → «Fuera de banda». */
  function bandLabel(id) {
    return id === BAND_OOB ? 'Fuera de banda' : String(id).replace(/m$/, ' m');
  }

  /** «49m» → «5900–6200 kHz» ('' para fuera de banda). */
  function bandRange(id) {
    for (var i = 0; i < BANDS.length; i++) {
      if (BANDS[i][2] === id) return BANDS[i][0] + '–' + BANDS[i][1] + ' kHz';
    }
    return '';
  }

  /** Zonas objetivo EiBi agrupadas por región (orden = orden de presentación). */
  var TARGET_GROUPS = [
    { id: 'am', label: 'América', codes: ['SAm', 'LAm', 'Am', 'CAm', 'Car', 'NAm', 'ENA', 'WNA', 'CNA', 'B', 'BOL', 'CHL', 'CLM', 'CUB', 'PRU', 'VEN'] },
    { id: 'eu', label: 'Europa', codes: ['Eu', 'WEu', 'CEu', 'EEu', 'NEu', 'SEu', 'SEE', 'Cau', 'UKR', 'E', 'I', 'HOL', 'IRL'] },
    { id: 'af', label: 'África', codes: ['Af', 'NAf', 'WAf', 'CAf', 'EAf', 'SAf', 'AGL', 'COD', 'ETH', 'MDG', 'MOZ', 'NIG', 'SDN', 'SSD', 'EGY'] },
    { id: 'me', label: 'Medio Oriente', codes: ['ME', 'IRN', 'ISR', 'AFG', 'PAK'] },
    { id: 'as', label: 'Asia', codes: ['As', 'FE', 'CHN', 'TWN', 'KRE', 'J', 'MNG', 'SEA', 'INS', 'MLA', 'PHL', 'MYA', 'SAs', 'NIn', 'SIn', 'IND', 'CLN', 'NPL', 'BTN', 'Tib', 'CAs', 'Sib'] },
    { id: 'oc', label: 'Oceanía', codes: ['Oc', 'WOc', 'AUS', 'NZL', 'VUT', 'SLM'] },
    { id: 'otros', label: 'Otras / sin zona', codes: [] }
  ];
  var TARGET_OTHER = 'otros';
  var targetIndex = {};
  TARGET_GROUPS.forEach(function (g) {
    g.codes.forEach(function (c) { targetIndex[c] = g.id; });
  });

  /** Código de zona objetivo EiBi → id de grupo regional ('otros' si no está mapeado o viene vacío). */
  function targetGroupOf(code) {
    return (code && targetIndex[code]) || TARGET_OTHER;
  }

  var api = {
    FIELDS: E,
    BANDS: BANDS,
    BAND_OOB: BAND_OOB,
    bandOf: bandOf,
    bandLabel: bandLabel,
    bandRange: bandRange,
    TARGET_GROUPS: TARGET_GROUPS,
    targetGroupOf: targetGroupOf,
    upcomingEntries: upcomingEntries,
    langsOf: langsOf,
    langLabel: langLabel,
    hhmm: hhmm,
    slotLabel: slotLabel,
    clockLabel: clockLabel,
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
