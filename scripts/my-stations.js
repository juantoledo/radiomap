(function () {
  'use strict';
  var STORAGE_KEY    = 'radiomap-my-stations';
  var DIRTY_KEY      = 'radiomap-export-pending';
  var CLEAN_KEY      = 'radiomap-my-stations-clean'; // snapshot of last exported/imported state
  var _barDismissed  = false; // in-memory: resets per page load so each page shows the bar independently

  function handleBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = '';
  }

  function isDirty() {
    try {
      var current = localStorage.getItem(STORAGE_KEY) || '[]';
      var clean   = localStorage.getItem(CLEAN_KEY)   || '[]';
      return current !== clean;
    } catch (e) { return false; }
  }

  function getUnsavedCount() {
    if (!isDirty()) return 0;
    try {
      var current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      var clean   = JSON.parse(localStorage.getItem(CLEAN_KEY)   || '[]');
      if (!Array.isArray(current)) current = [];
      if (!Array.isArray(clean)) clean = [];
      var cleanMap = {}, currentMap = {};
      clean.forEach(function (s) { cleanMap[s.signal] = JSON.stringify(s); });
      current.forEach(function (s) { currentMap[s.signal] = JSON.stringify(s); });
      var n = 0;
      current.forEach(function (s) { if (cleanMap[s.signal] !== currentMap[s.signal]) n++; });
      clean.forEach(function (s) { if (!currentMap[s.signal]) n++; });
      return n || 1;
    } catch (e) { return 1; }
  }

  function markClean() {
    try {
      localStorage.setItem(CLEAN_KEY, localStorage.getItem(STORAGE_KEY) || '[]');
      localStorage.removeItem(DIRTY_KEY);
    } catch (e) {}
  }

  function syncDirtyState() {
    _barDismissed = false;
    if (isDirty()) {
      try { localStorage.setItem(DIRTY_KEY, String(getUnsavedCount())); } catch (e) {}
    } else {
      try { localStorage.removeItem(DIRTY_KEY); } catch (e) {}
    }
    syncIndicator();
  }
  function showPendingBar() {
    if (document.getElementById('export-pending-bar')) return;
    if (_barDismissed) return;
    var n = getUnsavedCount();
    var msg = (n === 1 ? '1 estación modificada' : n + ' estaciones modificadas') + ' — Exporta tus datos para no perderlos';
    var bar = document.createElement('div');
    bar.id = 'export-pending-bar';
    bar.className = 'export-pending-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span class="material-symbols-outlined export-pending-bar__icon" aria-hidden="true">warning</span>' +
      '<span class="export-pending-bar__msg">' + msg + '</span>' +
      '<button type="button" class="export-pending-bar__action" id="export-pending-action">Exportar ahora</button>' +
      '<button type="button" class="export-pending-bar__close" id="export-pending-close" aria-label="Cerrar aviso">' +
        '<span class="material-symbols-outlined" aria-hidden="true">close</span>' +
      '</button>';
    document.body.appendChild(bar);
    document.getElementById('export-pending-action').addEventListener('click', function () {
      var csvBtn = document.getElementById('btn-download-csv');
      if (csvBtn) csvBtn.click();
      hidePendingBar(false);
    });
    document.getElementById('export-pending-close').addEventListener('click', function () {
      hidePendingBar(true);
    });
  }

  function hidePendingBar(dismissed) {
    var bar = document.getElementById('export-pending-bar');
    if (dismissed) _barDismissed = true;
    if (!bar) return;
    bar.classList.add('export-pending-bar--out');
    setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 220);
  }

  function clearPendingExport() {
    markClean();
    _barDismissed = false;
    window.removeEventListener('beforeunload', handleBeforeUnload);
    hidePendingBar(false);
    var btn = document.getElementById('btn-download-csv');
    if (btn) { btn.classList.remove('has-pending-export'); btn.removeAttribute('data-unsaved-count'); }
  }

  var CHILE_REGIONS = [
    'REGIÓN DE ARICA Y PARINACOTA','REGIÓN DE TARAPACÁ','REGIÓN DE ANTOFAGASTA',
    'REGIÓN DE ATACAMA','REGIÓN DE COQUIMBO','REGIÓN DE VALPARAÍSO',
    'REGIÓN METROPOLITANA','REGIÓN DEL LIBERTADOR GENERAL BERNARDO O\'HIGGINS',
    'REGIÓN DEL MAULE','REGIÓN DE ÑUBLE','REGIÓN DEL BIOBÍO',
    'REGIÓN DE LA ARAUCANÍA','REGIÓN DE LOS RÍOS','REGIÓN DE LOS LAGOS',
    'REGIÓN DE AYSÉN DEL GENERAL CARLOS IBÁÑEZ DEL CAMPO',
    'REGIÓN DE MAGALLANES Y DE LA ANTÁRTICA CHILENA'
  ];

  // ── Storage helpers ────────────────────────────────────────────────────────

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveToStorage(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // ── Inject user stations into NODES synchronously ─────────────────────────

  if (typeof NODES !== 'undefined' && Array.isArray(NODES)) {
    loadFromStorage().forEach(function (s) {
      NODES.push(Object.assign(
        { isAir: s.serviceType === 'atc', hasPropagation: false, propagationPgw: '', propagationDcf: '' },
        s,
        { _isUser: true }
      ));
    });
  }

  // ── CSV import ─────────────────────────────────────────────────────────────

  function parseCSVLine(line) {
    var fields = [], i = 0;
    while (i <= line.length) {
      if (i === line.length) { fields.push(''); break; }
      if (line[i] === '"') {
        var j = i + 1, val = '';
        while (j < line.length) {
          if (line[j] === '"' && line[j + 1] === '"') { val += '"'; j += 2; }
          else if (line[j] === '"') { j++; break; }
          else { val += line[j++]; }
        }
        fields.push(val);
        i = j;
        if (i < line.length && line[i] === ',') i++;
      } else {
        var end = line.indexOf(',', i);
        if (end === -1) end = line.length;
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
    return fields;
  }

  function parseBool(v) {
    if (v == null) return false;
    var s = String(v).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'sí' || s === 'si';
  }

  function importCSV(text) {
    var added = 0, skipped = 0, errors = [];
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var lines = text.split(/\r?\n/);
    if (!lines.length || !lines[0].trim()) return { added: 0, skipped: 0, errors: ['Archivo vacío'] };

    var headers = parseCSVLine(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
    var sigIdx = headers.indexOf('signal');
    if (sigIdx === -1) sigIdx = headers.indexOf('señal');
    if (sigIdx === -1) return { added: 0, skipped: 0, errors: ['Columna "signal" no encontrada. Usa el formato CSV Radiomap.'] };

    var existingSignals = new Set();
    if (typeof NODES !== 'undefined' && Array.isArray(NODES)) {
      NODES.forEach(function (n) { if (n.signal) existingSignals.add(n.signal); });
    }

    var stored = loadFromStorage();
    var newStations = [];

    for (var li = 1; li < lines.length; li++) {
      if (!lines[li].trim()) continue;
      var fields = parseCSVLine(lines[li]);
      var get = function (col) {
        var idx = headers.indexOf(col);
        return idx >= 0 && idx < fields.length ? (fields[idx] || '').trim() : '';
      };
      var sig = (fields[sigIdx] || '').trim();
      if (!sig) { errors.push('Fila ' + (li + 1) + ': señal vacía'); continue; }
      if (existingSignals.has(sig)) { skipped++; continue; }

      var latStr = get('lat'), lonStr = get('lon');
      var lat = latStr ? parseFloat(latStr) : null;
      var lon = lonStr ? parseFloat(lonStr) : null;
      if (latStr && isNaN(lat)) { errors.push('Fila ' + (li + 1) + ' (' + sig + '): lat inválida'); continue; }
      if (lonStr && isNaN(lon)) { errors.push('Fila ' + (li + 1) + ' (' + sig + '): lon inválida'); continue; }

      var svcRaw = (get('servicetype') || get('servicio (icono)') || '').toLowerCase();
      var validSvc = ['atc', 'fire', 'ambulance', 'sea'];
      var serviceType = validSvc.indexOf(svcRaw) >= 0 ? svcRaw : '';

      newStations.push({
        signal: sig,
        nombre: get('nombre') || get('club/titular') || '',
        banda: get('banda') || '',
        comuna: get('comuna') || '',
        ubicacion: get('ubicacion') || get('ubicación') || '',
        lat: lat, lon: lon,
        rx: get('rx') || get('rx (mhz)') || '',
        tx: get('tx') || get('tx (mhz)') || '',
        tono: get('tono') || '',
        potencia: get('potencia') || get('pot. w') || '',
        ganancia: get('ganancia') || get('gan. dbi') || '',
        region: get('region') || get('región') || '',
        otorga: get('otorga') || '',
        vence: get('vence') || '',
        isEcholink: parseBool(get('isecholink') || get('echolink')),
        conference: get('conference') || get('conferencia / red') || '',
        isDMR: parseBool(get('isdmr') || get('dmr')),
        serviceType: serviceType,
        color: get('color') || '',
        slot: get('slot') || '',
        tg: get('tg') || '',
        website: get('website') || get('sitio web') || '',
        notes: get('notes') || get('notas') || '',
        labels: get('labels') || get('etiquetas') || '',
        _isUser: true,
        _addedAt: new Date().toISOString()
      });
      existingSignals.add(sig);
      added++;
    }

    if (newStations.length > 0) {
      saveToStorage(stored.concat(newStations));
      markClean();
    }
    return { added: added, skipped: skipped, errors: errors };
  }

  // ── Station CRUD ───────────────────────────────────────────────────────────

  function removeStation(signal) {
    saveToStorage(loadFromStorage().filter(function (s) { return s.signal !== signal; }));
    syncDirtyState();
    window.removeEventListener('beforeunload', handleBeforeUnload);
    location.reload();
  }

  function saveFormStation(originalSignal, data) {
    var stored = loadFromStorage();
    if (originalSignal) {
      stored = stored.map(function (s) {
        return s.signal === originalSignal ? Object.assign({}, s, data, { _isUser: true }) : s;
      });
    } else {
      stored.push(Object.assign({ _addedAt: new Date().toISOString() }, data, { _isUser: true }));
    }
    saveToStorage(stored);
    syncDirtyState();
    window.removeEventListener('beforeunload', handleBeforeUnload);
    location.reload();
  }

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── List panel renderer ────────────────────────────────────────────────────

  function bandaSlug(banda) {
    var b = (banda || '').toLowerCase();
    if (b.includes('uhf')) return 'uhf';
    if (b === 'hf') return 'hf';
    if (b.includes('atc') || b.includes('/am')) return 'air';
    return 'vhf';
  }

  function renderListPanel() {
    var panel = document.getElementById('ms-panel-list');
    if (!panel) return;
    var stored = loadFromStorage();
    var addBtn = '<div class="ms-list-header"><button type="button" class="ms-add-btn" id="ms-add-btn"><span class="material-symbols-outlined" aria-hidden="true">add</span> Agregar estación</button></div>';

    if (!stored.length) {
      panel.innerHTML = addBtn + '<div class="my-stations-empty">No tienes estaciones propias.<br>Agrégalas manualmente o usa el botón CSV para importar.</div>';
    } else {
      panel.innerHTML = addBtn + stored.map(function (s) {
        var slug = s.banda ? bandaSlug(s.banda) : '';
        var meta = '';
        if (s.rx)    meta += '<span class="ms-meta-freq"><span class="ms-meta-label">RX</span> ' + esc(s.rx) + '</span>';
        if (s.tx)    meta += '<span class="ms-meta-freq"><span class="ms-meta-label">TX</span> ' + esc(s.tx) + '</span>';
        if (s.banda) meta += '<span class="ms-meta-banda">' + esc(s.banda.replace('/FM','')) + '</span>';
        return '<div class="my-station-row"' + (slug ? ' data-banda="' + slug + '"' : '') + '>' +
          '<div class="my-station-info">' +
            '<div class="my-station-signal">' + esc(s.signal || '—') + '</div>' +
            (meta ? '<div class="my-station-meta">' + meta + '</div>' : '') +
          '</div>' +
          '<div class="my-station-actions">' +
            '<button type="button" class="my-station-edit" data-signal="' + esc(s.signal) + '" aria-label="Editar ' + esc(s.signal) + '">' +
              '<span class="material-symbols-outlined" aria-hidden="true">edit</span>' +
            '</button>' +
            '<button type="button" class="my-station-delete" data-signal="' + esc(s.signal) + '" aria-label="Eliminar ' + esc(s.signal) + '">' +
              '<span class="material-symbols-outlined" aria-hidden="true">delete</span>' +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    var addBtnEl = document.getElementById('ms-add-btn');
    if (addBtnEl) addBtnEl.addEventListener('click', function () { openForm(null); });

    panel.querySelectorAll('.my-station-edit').forEach(function (btn) {
      btn.addEventListener('click', function () { openForm(this.getAttribute('data-signal')); });
    });
    panel.querySelectorAll('.my-station-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sig = this.getAttribute('data-signal');
        if (confirm('¿Eliminar la estación "' + sig + '" de tus estaciones?')) removeStation(sig);
      });
    });
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  var _currentEditSignal = null;

  function openForm(editSignal) {
    _currentEditSignal = editSignal || null;
    var dialog  = document.getElementById('my-stations-dialog');
    var titleEl = document.getElementById('my-stations-title');
    var backBtn = document.getElementById('ms-form-back');
    if (!dialog) return;

    titleEl.textContent = editSignal ? 'Editar estación' : 'Agregar estación';
    backBtn.hidden = false;
    dialog.dataset.panel = 'form';

    var listWrap = document.getElementById('ms-panel-list-wrap');
    var formWrap = document.getElementById('ms-panel-form-wrap');
    if (listWrap) listWrap.inert = true;
    if (formWrap) formWrap.inert = false;

    var form = document.getElementById('ms-station-form');
    if (form) form.reset();
    clearFormError();

    if (editSignal) {
      var station = loadFromStorage().find(function (s) { return s.signal === editSignal; });
      if (station) populateForm(station);
      var sigField = document.getElementById('ms-f-signal');
      if (sigField) { sigField.readOnly = true; sigField.style.opacity = '0.6'; }
    } else {
      var sigField2 = document.getElementById('ms-f-signal');
      if (sigField2) { sigField2.readOnly = false; sigField2.style.opacity = ''; }
    }

    toggleDmrFields();
    setTimeout(function () {
      var fw = document.getElementById('ms-panel-form-wrap');
      var first = fw && fw.querySelector('input:not([readonly]), select, textarea');
      if (first) first.focus();
    }, 220);
  }

  function closeForm() {
    var dialog  = document.getElementById('my-stations-dialog');
    var titleEl = document.getElementById('my-stations-title');
    var backBtn = document.getElementById('ms-form-back');
    if (!dialog) return;
    titleEl.textContent = 'Mis Estaciones';
    backBtn.hidden = true;
    dialog.dataset.panel = 'list';

    var listWrap = document.getElementById('ms-panel-list-wrap');
    var formWrap = document.getElementById('ms-panel-form-wrap');
    if (listWrap) listWrap.inert = false;
    if (formWrap) formWrap.inert = true;

    _currentEditSignal = null;
    renderListPanel();
  }

  function populateForm(s) {
    var set = function (id, val) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = (val == null ? '' : String(val));
    };
    set('ms-f-signal', s.signal);
    set('ms-f-nombre', s.nombre);
    set('ms-f-banda', s.banda);
    set('ms-f-rx', s.rx);
    set('ms-f-tx', s.tx);
    set('ms-f-tono', s.tono);
    set('ms-f-potencia', s.potencia);
    set('ms-f-ganancia', s.ganancia);
    set('ms-f-lat', s.lat != null ? s.lat : '');
    set('ms-f-lon', s.lon != null ? s.lon : '');
    set('ms-f-region', s.region);
    set('ms-f-comuna', s.comuna);
    set('ms-f-ubicacion', s.ubicacion);
    set('ms-f-echolink', s.isEcholink);
    set('ms-f-dmr', s.isDMR);
    set('ms-f-conference', s.conference);
    set('ms-f-svc', s.serviceType);
    set('ms-f-color', s.color);
    set('ms-f-slot', s.slot);
    set('ms-f-tg', s.tg);
    set('ms-f-website', s.website);
    set('ms-f-notes', s.notes);
    set('ms-f-labels', s.labels);
  }

  function toggleDmrFields() {
    var dmrCheck = document.getElementById('ms-f-dmr');
    var dmrSec   = document.getElementById('ms-dmr-fields');
    if (dmrCheck && dmrSec) dmrSec.hidden = !dmrCheck.checked;
  }

  function clearFormError() {
    var errEl = document.getElementById('ms-form-error');
    if (errEl) { errEl.textContent = ''; errEl.hidden = true; }
  }

  function showFormError(msg) {
    var errEl = document.getElementById('ms-form-error');
    if (errEl) { errEl.textContent = msg; errEl.hidden = false; errEl.scrollIntoView({ block: 'nearest' }); }
  }

  function readForm() {
    var val = function (id) {
      var el = document.getElementById(id);
      if (!el) return '';
      if (el.type === 'checkbox') return el.checked;
      return el.value.trim();
    };
    var latStr = val('ms-f-lat');
    var lonStr = val('ms-f-lon');
    var lat = latStr ? parseFloat(latStr) : null;
    var lon = lonStr ? parseFloat(lonStr) : null;
    var validSvc = ['atc', 'fire', 'ambulance', 'sea'];
    var svcRaw = val('ms-f-svc');
    return {
      signal:      val('ms-f-signal'),
      nombre:      val('ms-f-nombre'),
      banda:       val('ms-f-banda'),
      rx:          val('ms-f-rx'),
      tx:          val('ms-f-tx'),
      tono:        val('ms-f-tono'),
      potencia:    val('ms-f-potencia'),
      ganancia:    val('ms-f-ganancia'),
      lat:         lat,
      lon:         lon,
      region:      val('ms-f-region'),
      comuna:      val('ms-f-comuna'),
      ubicacion:   val('ms-f-ubicacion'),
      isEcholink:  val('ms-f-echolink'),
      isDMR:       val('ms-f-dmr'),
      conference:  val('ms-f-conference'),
      serviceType: validSvc.indexOf(svcRaw) >= 0 ? svcRaw : '',
      color:       val('ms-f-color'),
      slot:        val('ms-f-slot'),
      tg:          val('ms-f-tg'),
      website:     val('ms-f-website'),
      notes:       val('ms-f-notes'),
      labels:      val('ms-f-labels'),
      otorga:      '',
      vence:       '',
      isAir:       svcRaw === 'atc'
    };
  }

  function submitForm() {
    clearFormError();
    var data = readForm();

    if (!data.signal) { showFormError('La señal (indicativo) es obligatoria.'); return; }

    var latStr = document.getElementById('ms-f-lat') ? document.getElementById('ms-f-lat').value.trim() : '';
    var lonStr = document.getElementById('ms-f-lon') ? document.getElementById('ms-f-lon').value.trim() : '';
    if (latStr && isNaN(data.lat)) { showFormError('Latitud inválida.'); return; }
    if (lonStr && isNaN(data.lon)) { showFormError('Longitud inválida.'); return; }

    if (!_currentEditSignal) {
      var existing = typeof NODES !== 'undefined' && Array.isArray(NODES)
        ? NODES.some(function (n) { return n.signal === data.signal; })
        : false;
      if (existing) { showFormError('Ya existe una estación con esa señal.'); return; }
    }

    saveFormStation(_currentEditSignal, data);
  }

  // ── Modal HTML ─────────────────────────────────────────────────────────────

  function buildRegionOptions() {
    return CHILE_REGIONS.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('');
  }

  var _injected = false;
  function injectModal() {
    if (_injected) return;
    _injected = true;
    var el = document.createElement('div');
    el.innerHTML =
      '<div id="my-stations-overlay" aria-hidden="true">' +
        '<div id="my-stations-dialog" role="dialog" aria-modal="true" aria-labelledby="my-stations-title" tabindex="-1" data-panel="list">' +

          '<div class="ms-drag-handle" aria-hidden="true"></div>' +

          '<div class="my-stations-header">' +
            '<button type="button" class="ms-form-back-btn" id="ms-form-back" aria-label="Volver a la lista" hidden>' +
              '<span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>' +
            '</button>' +
            '<h2 class="my-stations-title" id="my-stations-title">Mis Estaciones</h2>' +
            '<button type="button" class="my-stations-close" id="my-stations-close" aria-label="Cerrar">' +
              '<span class="material-symbols-outlined" aria-hidden="true">close</span>' +
            '</button>' +
          '</div>' +

          '<div class="ms-panels">' +
            '<div class="ms-panel ms-panel--list" id="ms-panel-list-wrap">' +
              '<div id="ms-panel-list"></div>' +
              '<p class="ms-disclaimer">Las estaciones personalizadas son responsabilidad del operador. Verifica frecuencias y datos antes de transmitir.</p>' +
            '</div>' +

            '<div class="ms-panel ms-panel--form" id="ms-panel-form-wrap">' +
            '<form id="ms-station-form" class="ms-station-form" novalidate>' +

              '<div class="ms-form-section">' +
                '<h3 class="ms-form-section-title">Identificación</h3>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-signal">Señal (indicativo) <span class="ms-form-required">*</span></label>' +
                  '<input type="text" id="ms-f-signal" class="ms-form-input" placeholder="CE3ABC RPT" autocomplete="off">' +
                '</div>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-nombre">Club / Titular</label>' +
                  '<input type="text" id="ms-f-nombre" class="ms-form-input" placeholder="Nombre del club u operador" autocomplete="off">' +
                '</div>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-website">Sitio web</label>' +
                  '<input type="url" id="ms-f-website" class="ms-form-input" placeholder="https://">' +
                '</div>' +
              '</div>' +

              '<div class="ms-form-section">' +
                '<h3 class="ms-form-section-title">Frecuencias</h3>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-banda">Banda</label>' +
                  '<select id="ms-f-banda" class="ms-form-select">' +
                    '<option value="">—</option>' +
                    '<option value="VHF/FM">VHF/FM</option>' +
                    '<option value="UHF/FM">UHF/FM</option>' +
                    '<option value="HF">HF</option>' +
                  '</select>' +
                '</div>' +
                '<div class="ms-form-row ms-form-row--freq">' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-rx">RX (MHz)</label>' +
                    '<input type="text" id="ms-f-rx" class="ms-form-input ms-form-input--mono" placeholder="146.000">' +
                  '</div>' +
                  '<button type="button" id="ms-copy-rx" class="ms-copy-rx-btn" title="Copiar RX a TX" aria-label="Copiar RX a TX">' +
                    '<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>' +
                  '</button>' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-tx">TX (MHz)</label>' +
                    '<input type="text" id="ms-f-tx" class="ms-form-input ms-form-input--mono" placeholder="146.000">' +
                  '</div>' +
                '</div>' +
                '<div class="ms-form-row">' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-tono">Tono (Hz)</label>' +
                    '<input type="text" id="ms-f-tono" class="ms-form-input ms-form-input--mono" placeholder="88.5">' +
                  '</div>' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-potencia">Potencia (W)</label>' +
                    '<input type="text" id="ms-f-potencia" class="ms-form-input ms-form-input--mono">' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<div class="ms-form-section">' +
                '<h3 class="ms-form-section-title">Ubicación</h3>' +
                '<div class="ms-form-row">' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-lat">Latitud</label>' +
                    '<input type="text" id="ms-f-lat" class="ms-form-input ms-form-input--mono" placeholder="-33.45">' +
                  '</div>' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-lon">Longitud</label>' +
                    '<input type="text" id="ms-f-lon" class="ms-form-input ms-form-input--mono" placeholder="-70.67">' +
                  '</div>' +
                '</div>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-region">Región</label>' +
                  '<input type="text" id="ms-f-region" class="ms-form-input" list="ms-regions-list" placeholder="REGIÓN DE...">' +
                  '<datalist id="ms-regions-list">' + buildRegionOptions() + '</datalist>' +
                '</div>' +
                '<div class="ms-form-row">' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-comuna">Comuna</label>' +
                    '<input type="text" id="ms-f-comuna" class="ms-form-input">' +
                  '</div>' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-ubicacion">Ubicación</label>' +
                    '<input type="text" id="ms-f-ubicacion" class="ms-form-input">' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<div class="ms-form-section">' +
                '<h3 class="ms-form-section-title">Tipo</h3>' +
                '<div class="ms-form-checks">' +
                  '<label class="ms-form-check"><input type="checkbox" id="ms-f-echolink"> Echolink</label>' +
                  '<label class="ms-form-check"><input type="checkbox" id="ms-f-dmr"> DMR</label>' +
                '</div>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-conference">Conferencia / red</label>' +
                  '<input type="text" id="ms-f-conference" class="ms-form-input" placeholder="Red Chile, RCDR...">' +
                '</div>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-svc">Servicio especial</label>' +
                  '<select id="ms-f-svc" class="ms-form-select">' +
                    '<option value="">— Repetidora genérica</option>' +
                    '<option value="atc">ATC / Aéreo</option>' +
                    '<option value="fire">Bomberos</option>' +
                    '<option value="ambulance">SAMU / Ambulancia</option>' +
                    '<option value="sea">Marítimo</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +

              '<div class="ms-form-section" id="ms-dmr-fields" hidden>' +
                '<h3 class="ms-form-section-title">DMR</h3>' +
                '<div class="ms-form-row">' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-color">Color Code</label>' +
                    '<input type="text" id="ms-f-color" class="ms-form-input ms-form-input--mono" placeholder="1">' +
                  '</div>' +
                  '<div class="ms-form-field">' +
                    '<label class="ms-form-label" for="ms-f-slot">Slot</label>' +
                    '<input type="text" id="ms-f-slot" class="ms-form-input ms-form-input--mono" placeholder="1 2">' +
                  '</div>' +
                '</div>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-tg">TG</label>' +
                  '<input type="text" id="ms-f-tg" class="ms-form-input ms-form-input--mono" placeholder="7300 7301">' +
                '</div>' +
              '</div>' +

              '<div class="ms-form-section">' +
                '<h3 class="ms-form-section-title">Notas</h3>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-notes">Notas</label>' +
                  '<textarea id="ms-f-notes" class="ms-form-textarea" rows="3" placeholder="Información adicional..."></textarea>' +
                '</div>' +
                '<div class="ms-form-field">' +
                  '<label class="ms-form-label" for="ms-f-labels">Etiquetas (separadas por espacio)</label>' +
                  '<input type="text" id="ms-f-labels" class="ms-form-input" placeholder="vhf norte-chico">' +
                '</div>' +
              '</div>' +

              '<div id="ms-form-error" class="ms-form-error" hidden></div>' +

              '<div class="ms-form-actions">' +
                '<button type="button" id="ms-form-cancel" class="ms-form-btn ms-form-btn--cancel">Cancelar</button>' +
                '<button type="submit" id="ms-form-submit" class="ms-form-btn ms-form-btn--save">Guardar</button>' +
              '</div>' +

            '</form>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</div>';
    document.body.appendChild(el.firstElementChild);
    wireModal();
    var formWrap = document.getElementById('ms-panel-form-wrap');
    if (formWrap) formWrap.inert = true;
  }

  function wireModal() {
    var overlay = document.getElementById('my-stations-overlay');

    function closeModal() {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      closeForm();
    }

    document.getElementById('my-stations-close').addEventListener('click', closeModal);
    document.getElementById('ms-form-back').addEventListener('click', closeForm);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
    });

    // Form wiring
    var copyRxBtn = document.getElementById('ms-copy-rx');
    if (copyRxBtn) copyRxBtn.addEventListener('click', function () {
      var rx = document.getElementById('ms-f-rx');
      var tx = document.getElementById('ms-f-tx');
      if (rx && tx) { tx.value = rx.value; tx.focus(); }
    });

    var dmrCheck = document.getElementById('ms-f-dmr');
    if (dmrCheck) dmrCheck.addEventListener('change', toggleDmrFields);

    document.getElementById('ms-form-cancel').addEventListener('click', closeForm);

    var form = document.getElementById('ms-station-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submitForm();
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.myStations = {
    getAll: loadFromStorage,
    removeStation: removeStation,
    importCSV: importCSV,
    openManageModal: function () {
      injectModal();
      renderListPanel();
      var overlay = document.getElementById('my-stations-overlay');
      var dialog  = document.getElementById('my-stations-dialog');
      if (!overlay) return;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      if (dialog) dialog.focus();
    },
    openEditStation: function (signal) {
      injectModal();
      var overlay = document.getElementById('my-stations-overlay');
      if (!overlay) return;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      openForm(signal);
    },
    exportCSV: function () {
      var stored = loadFromStorage();
      if (!stored.length) { alert('No tienes estaciones propias guardadas.'); return; }
      if (typeof exportRepeatersCSV === 'function') exportRepeatersCSV(stored, { myStations: true });
      clearPendingExport();
    },
    clearPendingExport: clearPendingExport,
    releaseBeforeUnload: function () {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  };

  var _navReleaseWired = false;
  function wireNavRelease() {
    if (_navReleaseWired) return;
    _navReleaseWired = true;
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a || a.target === '_blank') return;
      var href = a.getAttribute('href') || '';
      var isExternal = /^(https?:)?\/\//.test(href) || href.startsWith('mailto:');
      if (!isExternal) window.removeEventListener('beforeunload', handleBeforeUnload);
    }, true);
  }

  function initUI() {
    injectModal();
    var n = getUnsavedCount();
    if (n > 0) {
      var csvBtn = document.getElementById('btn-download-csv');
      if (csvBtn) {
        csvBtn.classList.add('has-pending-export');
        csvBtn.setAttribute('data-unsaved-count', n > 9 ? '9+' : String(n));
      }
      window.addEventListener('beforeunload', handleBeforeUnload);
      wireNavRelease();
      showPendingBar();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  // Shared sync: called on bfcache restore (pageshow) and cross-tab storage changes (storage).
  function syncIndicator() {
    var n = getUnsavedCount();
    var csvBtn = document.getElementById('btn-download-csv');
    if (n > 0) {
      if (csvBtn && !csvBtn.classList.contains('has-pending-export')) {
        csvBtn.classList.add('has-pending-export');
        csvBtn.setAttribute('data-unsaved-count', n > 9 ? '9+' : String(n));
      }
      _barDismissed = false;
      if (!document.getElementById('export-pending-bar')) showPendingBar();
      window.addEventListener('beforeunload', handleBeforeUnload);
      wireNavRelease();
    } else {
      if (csvBtn) {
        csvBtn.classList.remove('has-pending-export');
        csvBtn.removeAttribute('data-unsaved-count');
      }
      var bar = document.getElementById('export-pending-bar');
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }

  // bfcache restore: DOMContentLoaded does not re-fire so initUI() is skipped.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    _navReleaseWired = false;
    syncIndicator();
  });

  // Cross-tab sync: localStorage fires 'storage' on all other open tabs when DIRTY_KEY changes.
  window.addEventListener('storage', function (e) {
    if (e.key === DIRTY_KEY) syncIndicator();
  });

  // Tab focus fallback: re-sync when tab becomes visible in case storage events were
  // missed while the tab was throttled in the background.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') syncIndicator();
  });
})();
