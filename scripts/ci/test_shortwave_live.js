#!/usr/bin/env node
/**
 * Tests de la lógica pura de onda corta (scripts/shortwave-live.js): bandas y grupos de zona objetivo.
 * Uso: node scripts/ci/test_shortwave_live.js
 */
'use strict';

var path = require('path');
var assert = require('assert');
var live = require(path.join(__dirname, '..', 'shortwave-live.js'));

var failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok   ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + ': ' + e.message);
  }
}

check('bandOf: bordes de 49 m', function () {
  assert.strictEqual(live.bandOf(5900), '49m');
  assert.strictEqual(live.bandOf(6200), '49m');
  assert.strictEqual(live.bandOf(5899), 'oob');
  assert.strictEqual(live.bandOf(6201), 'oob');
});

check('bandOf: extremos de la tabla', function () {
  assert.strictEqual(live.bandOf(2300), '120m');
  assert.strictEqual(live.bandOf(25670), '11m');
  assert.strictEqual(live.bandOf(26100), '11m');
  assert.strictEqual(live.bandOf(1711), 'oob');
  assert.strictEqual(live.bandOf(30000), 'oob');
});

check('bandOf: Sound of Hope típico fuera de banda', function () {
  assert.strictEqual(live.bandOf(8300), live.BAND_OOB);
});

check('BANDS: ordenadas y sin solaparse', function () {
  for (var i = 1; i < live.BANDS.length; i++) {
    assert.ok(live.BANDS[i][0] > live.BANDS[i - 1][1], live.BANDS[i][2]);
  }
});

check('targetGroupOf: regiones', function () {
  assert.strictEqual(live.targetGroupOf('SAm'), 'am');
  assert.strictEqual(live.targetGroupOf('CHL'), 'am');
  assert.strictEqual(live.targetGroupOf('FE'), 'as');
  assert.strictEqual(live.targetGroupOf('Eu'), 'eu');
  assert.strictEqual(live.targetGroupOf('ME'), 'me');
  assert.strictEqual(live.targetGroupOf('EAf'), 'af');
  assert.strictEqual(live.targetGroupOf('Oc'), 'oc');
});

check('targetGroupOf: vacío o desconocido → otros', function () {
  assert.strictEqual(live.targetGroupOf(''), 'otros');
  assert.strictEqual(live.targetGroupOf(null), 'otros');
  assert.strictEqual(live.targetGroupOf('ATA'), 'otros');
  assert.strictEqual(live.targetGroupOf('XYZ'), 'otros');
});

check('TARGET_GROUPS: ningún código en dos grupos', function () {
  var seen = {};
  live.TARGET_GROUPS.forEach(function (g) {
    g.codes.forEach(function (c) {
      assert.ok(!seen[c], c + ' en ' + seen[c] + ' y ' + g.id);
      seen[c] = g.id;
    });
  });
});

// entry = [kHz, inicioMin, finMin, díasIdx, emisoraIdx, idioma, zona, sitioIdx, soloTemporada, desde, hasta, últimaEscucha]
function entry(khz, start, end, days) {
  return [khz, start, end, days || 0, 0, 'S', 'SAm', 0, 0, '', '', ''];
}
var SW_FIXTURE = {
  days: [{ t: 'd' }, { t: 'w', m: 1 << 0 } /* solo lunes */],
  entries: [
    entry(5910, 21 * 60 + 30, 23 * 60),      // 0: 21:30, dentro de 60 min desde 21:00
    entry(6000, 23 * 60, 24 * 60),            // 1: 23:00, fuera de la ventana
    entry(7300, 20 * 60, 22 * 60),            // 2: al aire a las 21:00 → no es «próxima»
    entry(9500, 21 * 60 + 30, 22 * 60, 1),    // 3: 21:30 pero solo lunes
    entry(11700, 0, 60)                       // 4: 00:00, cruza medianoche desde 23:30
  ]
};

check('upcomingEntries: ventana de 60 min, excluye al aire y días que no corresponden', function () {
  var thu = new Date('2026-10-01T21:00:00Z'); // jueves
  var got = live.upcomingEntries(SW_FIXTURE, thu, {}).map(function (u) { return [u.entry[0], u.startsIn]; });
  assert.deepStrictEqual(got, [[5910, 30]]);
});

check('upcomingEntries: el día se evalúa en el minuto de inicio (lunes)', function () {
  var mon = new Date('2026-10-05T21:00:00Z'); // lunes
  var got = live.upcomingEntries(SW_FIXTURE, mon, {}).map(function (u) { return u.entry[0]; });
  assert.deepStrictEqual(got, [5910, 9500]);
});

check('upcomingEntries: cruza medianoche', function () {
  var late = new Date('2026-10-01T23:30:00Z');
  var got = live.upcomingEntries(SW_FIXTURE, late, { withinMin: 60 }).map(function (u) { return [u.entry[0], u.startsIn]; });
  assert.deepStrictEqual(got, [[11700, 30]]);
});

check('hhmm / bandLabel / bandRange', function () {
  assert.strictEqual(live.hhmm(0), '00:00');
  assert.strictEqual(live.hhmm(1290), '21:30');
  assert.strictEqual(live.hhmm(1440), '24:00');
  assert.strictEqual(live.bandLabel('49m'), '49 m');
  assert.strictEqual(live.bandLabel('oob'), 'Fuera de banda');
  assert.strictEqual(live.bandRange('49m'), '5900–6200 kHz');
  assert.strictEqual(live.bandRange('oob'), '');
});

if (failures) {
  console.log(failures + ' fallo(s)');
  process.exit(1);
}
console.log('todo ok');
