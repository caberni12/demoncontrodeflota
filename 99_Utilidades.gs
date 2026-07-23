/** Utilidades compartidas. */
function parsearSolicitud_(e) {
  if (!e) return {};
  const raw = e.postData && e.postData.contents ? e.postData.contents : '';
  if (raw) {
    try { return JSON.parse(raw); } catch (error) { /* continúa con parámetros */ }
  }
  return Object.assign({}, e.parameter || {});
}

function respuestaJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return { ok: true, data: data || {}, version: VERSION_APLICACION };
}

function respuestaError_(error) {
  const message = error && error.message ? error.message : String(error);
  console.error(error && error.stack ? error.stack : error);
  return { ok: false, error: message, version: VERSION_APLICACION };
}

function validarRequeridos_(object, fields) {
  fields.forEach(function(field) {
    if (object[field] === '' || object[field] === null || typeof object[field] === 'undefined') {
      throw new Error('CAMPO_REQUERIDO_' + field);
    }
  });
}

function generarId_(prefix) {
  return String(prefix || 'ID').toUpperCase() + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}

function fechaIso_() {
  return new Date().toISOString();
}

function serializarValor_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return value.toISOString();
  return value;
}

function deserializarFecha_(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  return value;
}

function normalizarEmail_(email) {
  return String(email || '').trim().toLowerCase();
}
