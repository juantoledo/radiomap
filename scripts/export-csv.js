/**
 * CSV export for repeater list — shared by mapa and lista
 * criteria: from getExportFilterCriteria() — { search, nearMe, bandas, regions, types, conferences }
 */
function exportRepeatersCSV(rows, criteria) {
  const cols = ['signal', 'nombre', 'banda', 'comuna', 'ubicacion', 'rx', 'tx', 'tono', 'potencia', 'ganancia', 'region', 'vence', 'isEcholink', 'isDMR', 'serviceType', 'conference', 'color', 'slot', 'tg', 'website', 'notes'];
  const headers = ['Señal', 'Club/Titular', 'Banda', 'Comuna', 'Ubicación', 'RX (MHz)', 'TX (MHz)', 'Tono', 'Pot. W', 'Gan. dBi', 'Región', 'Vence', 'Echolink', 'DMR', 'Servicio (icono)', 'Conferencia / red', 'Color', 'Slot', 'TG', 'Sitio web', 'Notas'];
  const esc = function (v) {
    if (v == null || v === '') return '';
    var s = '' + v;
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const fmtBool = function (v) {
    return (v === true || v === 'true' || v === '1') ? 'Sí' : '';
  };
  const csv = [headers.join(','), ...rows.map(function (r) {
    return cols.map(function (c) {
      if (c === 'isEcholink' || c === 'isDMR') return esc(fmtBool(r[c]));
      return esc(r[c]);
    }).join(',');
  })].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = buildExportFilename(criteria);
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildExportFilename(criteria) {
  const date = new Date().toISOString().slice(0, 10);
  const parts = ['radiomap', 'repetidores'];
  const sanitize = function (s) {
    return String(s).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-áéíóúñ]/g, '').toLowerCase().slice(0, 30);
  };
  if (criteria) {
    if (criteria.nearMe) parts.push('cerca-de-mi');
    const bandas = criteria.bandas || (criteria.banda ? [criteria.banda] : []);
    bandas.forEach(function (b) {
      if (b) parts.push(String(b).toLowerCase());
    });
    const types = criteria.types || [];
    if (types.indexOf('echolink') >= 0) parts.push('echolink');
    if (types.indexOf('dmr') >= 0) parts.push('dmr');
    if (types.indexOf('radioclub') >= 0) parts.push('radioclubes');
    if (types.indexOf('atc') >= 0) parts.push('atc');
    if (types.indexOf('fire') >= 0) parts.push('bomberos');
    if (types.indexOf('ambulance') >= 0) parts.push('ambulancia');
    if (types.indexOf('sea') >= 0) parts.push('maritimo');
    if (!types.length && criteria.echolink === 'only') parts.push('echolink');
    if (!types.length && criteria.echolink === 'no') parts.push('repetidoras');
    const conferences = criteria.conferences || (criteria.echoLinkConference ? [criteria.echoLinkConference] : []);
    conferences.forEach(function (c) {
      if (c) parts.push('conferencia-' + sanitize(c));
    });
    const regions = criteria.regions || (criteria.region ? [criteria.region] : []);
    regions.forEach(function (reg) {
      const r = sanitize(reg);
      if (r) parts.push('region-' + r);
    });
    const search = criteria.search != null ? criteria.search : '';
    if (search && String(search).trim()) {
      const q = sanitize(String(search).trim()).slice(0, 20);
      if (q) parts.push('busqueda-' + q);
    }
  }
  parts.push(date);
  return parts.join('-') + '.csv';
}
