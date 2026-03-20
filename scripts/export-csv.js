/**
 * CSV export for repeater list — shared by mapa and lista
 * criteria: { banda, region, search, nearMe } — optional, from current filters
 */
function exportRepeatersCSV(rows, criteria) {
  const cols = ['signal','nombre','banda','comuna','ubicacion','rx','tx','tono','potencia','ganancia','region','vence','isEcholink','echoLinkConference','website'];
  const headers = ['Señal','Club/Titular','Banda','Comuna','Ubicación','RX (MHz)','TX (MHz)','Tono','Pot. W','Gan. dBi','Región','Vence','Echolink','Conferencia Echolink','Sitio web'];
  const esc = v => (v == null || v === '') ? '' : (''+v).includes(',') || (''+v).includes('"') || (''+v).includes('\n') ? '"' + (''+v).replace(/"/g, '""') + '"' : ''+v;
  const fmtBool = v => (v === true || v === 'true' || v === '1') ? 'Sí' : '';
  const csv = [headers.join(','), ...rows.map(r => cols.map(c => c === 'isEcholink' ? esc(fmtBool(r[c])) : esc(r[c])).join(','))].join('\n');
  const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = buildExportFilename(criteria);
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildExportFilename(criteria) {
  const date = new Date().toISOString().slice(0, 10);
  const parts = ['radiomap', 'repetidores'];
  const sanitize = s => String(s).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-áéíóúñ]/g, '').toLowerCase().slice(0, 30);
  if (criteria) {
    if (criteria.nearMe) parts.push('cerca-de-mi');
    if (criteria.banda) parts.push(criteria.banda.toLowerCase());
    if (criteria.echolink === 'only') parts.push('echolink');
    if (criteria.echolink === 'no') parts.push('repetidoras');
    if (criteria.echoLinkConference) parts.push('conferencia-' + sanitize(criteria.echoLinkConference));
    if (criteria.region) {
      const r = criteria.region === '__sin_region__' ? 'sin-region' : sanitize(criteria.region);
      if (r) parts.push('region-' + r);
    }
    if (criteria.search && criteria.search.trim()) {
      const q = sanitize(criteria.search).slice(0, 20);
      if (q) parts.push('busqueda-' + q);
    }
  }
  parts.push(date);
  return parts.join('-') + '.csv';
}
