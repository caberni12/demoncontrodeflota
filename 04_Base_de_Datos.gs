/** Capa genérica de acceso a Google Sheets. */
function obtenerSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty('ID_HOJA_CALCULO');
  const configuredId = CONFIGURACION_APLICACION.ID_HOJA_CALCULO;
  const id = savedId || (configuredId && configuredId.indexOf('PEGAR_') !== 0 ? configuredId : '');
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('ID_HOJA_NO_CONFIGURADO');
}

function obtenerHoja_(sheetName) {
  const ss = obtenerSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('HOJA_NO_ENCONTRADA_' + sheetName);
  return sheet;
}

function asegurarHoja_(sheetName) {
  const ss = obtenerSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const headers = ESQUEMAS_APLICACION[sheetName];
  if (!headers) throw new Error('ESQUEMA_NO_ENCONTRADO_' + sheetName);
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#0B5F59')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setWrap(true);
  return sheet;
}

function listarRegistros_(sheetName, filters) {
  const sheet = obtenerHoja_(sheetName);
  const headers = ESQUEMAS_APLICACION[sheetName];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const rows = values.filter(function(row) {
    return row.some(function(value) { return value !== '' && value !== null; });
  }).map(function(row) {
    const object = {};
    headers.forEach(function(header, index) { object[header] = serializarValor_(row[index]); });
    return object;
  }).filter(function(row) {
    return !Object.prototype.hasOwnProperty.call(row, 'ELIMINADO') || row.ELIMINADO !== 'SI';
  });
  return aplicarFiltros_(rows, filters || {});
}

function aplicarFiltros_(rows, filters) {
  const keys = Object.keys(filters || {});
  if (!keys.length) return rows;
  return rows.filter(function(row) {
    return keys.every(function(key) {
      const expected = filters[key];
      if (expected === '' || expected === null || typeof expected === 'undefined') return true;
      return String(row[key] || '').toLowerCase() === String(expected).toLowerCase();
    });
  });
}

function obtenerRegistro_(sheetName, id) {
  if (!id) return null;
  return listarRegistros_(sheetName, {}).find(function(row) { return String(row.ID) === String(id); }) || null;
}

function insertarRegistro_(sheetName, data, prefix) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = obtenerHoja_(sheetName);
    const headers = ESQUEMAS_APLICACION[sheetName];
    const now = new Date();
    const object = Object.assign({}, data);
    if (headers.indexOf('ID') >= 0 && !object.ID) object.ID = generarId_(prefix || sheetName.slice(0, 3));
    if (headers.indexOf('CREADO_EN') >= 0 && !object.CREADO_EN) object.CREADO_EN = now;
    if (headers.indexOf('ACTUALIZADO_EN') >= 0) object.ACTUALIZADO_EN = now;
    if (headers.indexOf('ELIMINADO') >= 0 && !object.ELIMINADO) object.ELIMINADO = 'NO';
    const row = headers.map(function(header) {
      return Object.prototype.hasOwnProperty.call(object, header) ? deserializarFecha_(object[header]) : '';
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    return limpiarSalidaRecurso_(sheetName, object);
  } finally {
    lock.releaseLock();
  }
}

function actualizarRegistro_(sheetName, id, data) {
  if (!id) throw new Error('ID_REQUERIDO');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = obtenerHoja_(sheetName);
    const headers = ESQUEMAS_APLICACION[sheetName];
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('REGISTRO_NO_ENCONTRADO');
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const idIndex = headers.indexOf('ID');
    const rowIndex = values.findIndex(function(row) { return String(row[idIndex]) === String(id); });
    if (rowIndex < 0) throw new Error('REGISTRO_NO_ENCONTRADO');
    const current = {};
    headers.forEach(function(header, index) { current[header] = values[rowIndex][index]; });
    Object.keys(data || {}).forEach(function(key) {
      if (headers.indexOf(key) >= 0 && key !== 'ID' && key !== 'CREADO_EN') current[key] = data[key];
    });
    if (headers.indexOf('ACTUALIZADO_EN') >= 0) current.ACTUALIZADO_EN = new Date();
    const newRow = headers.map(function(header) { return deserializarFecha_(current[header]); });
    sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([newRow]);
    SpreadsheetApp.flush();
    return limpiarSalidaRecurso_(sheetName, current);
  } finally {
    lock.releaseLock();
  }
}

function eliminarRegistro_(sheetName, id) {
  const headers = ESQUEMAS_APLICACION[sheetName];
  if (headers.indexOf('ELIMINADO') >= 0) return actualizarRegistro_(sheetName, id, { ELIMINADO: 'SI' });
  throw new Error('ELIMINACION_NO_ADMITIDA');
}

function limpiarHojaDatos_(sheetName) {
  const sheet = obtenerHoja_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
}

function obtenerRecurso_(resourceName) {
  const resource = RECURSOS_APLICACION[String(resourceName || '')];
  if (!resource) throw new Error('RECURSO_NO_ENCONTRADO');
  return resource;
}

function normalizarEntradaRecurso_(sheetName, data, user) {
  const clean = {};
  const headers = ESQUEMAS_APLICACION[sheetName];
  Object.keys(data || {}).forEach(function(key) {
    if (headers.indexOf(key) >= 0 && ['ID','CONTRASENA_CIFRADA','SAL_CONTRASENA','FICHA_SESION_CIFRADA','CREADO_EN','ACTUALIZADO_EN','ELIMINADO'].indexOf(key) < 0) {
      clean[key] = data[key];
    }
  });
  if (sheetName === 'VEHICULOS') {
    if (clean.PATENTE) clean.PATENTE = String(clean.PATENTE).trim().toUpperCase();
    if (!clean.ESTADO) clean.ESTADO = 'Disponible';
    if (!clean.QR_CODIGO && clean.PATENTE) clean.QR_CODIGO = 'VEH-' + clean.PATENTE.replace(/[^A-Z0-9]/g, '');
  }
  if (sheetName === 'CONDUCTORES' && !clean.ESTADO) clean.ESTADO = 'Disponible';
  if (sheetName === 'DOCUMENTOS' && !clean.ESTADO) clean.ESTADO = 'Vigente';
  if (sheetName === 'ALERTAS') {
    if (!clean.LEIDA) clean.LEIDA = 'NO';
    if (!clean.FECHA_HORA) clean.FECHA_HORA = new Date();
  }
  if (sheetName === 'RUTAS') {
    if (!clean.ESTADO) clean.ESTADO = 'Asignada';
    if (!clean.PROVEEDOR_NAVEGACION) clean.PROVEEDOR_NAVEGACION = 'Google Maps';
    if (!clean.FECHA_ASIGNACION) clean.FECHA_ASIGNACION = new Date();
  }
  if (sheetName === 'NOTIFICACIONES') {
    if (!clean.LEIDA) clean.LEIDA = 'NO';
    if (!clean.PRIORIDAD) clean.PRIORIDAD = 'Normal';
    if (!clean.TIPO) clean.TIPO = 'Información';
    if (!clean.FECHA_ENVIO) clean.FECHA_ENVIO = new Date();
  }
  return clean;
}

function limpiarSalidaRecurso_(sheetName, row) {
  const output = {};
  Object.keys(row || {}).forEach(function(key) {
    if (['CONTRASENA_CIFRADA','SAL_CONTRASENA','FICHA_SESION_CIFRADA'].indexOf(key) < 0) output[key] = serializarValor_(row[key]);
  });
  return output;
}

function filtrarPorUsuario_(sheetName, rows, user) {
  if (user.ROL_ID !== 'ROL-CONDUCTOR') return rows.map(function(row) { return limpiarSalidaRecurso_(sheetName, row); });
  const driver = listarRegistros_('CONDUCTORES', {}).find(function(row) { return row.USUARIO_ID === user.ID; });
  if (sheetName === 'NOTIFICACIONES') {
    rows = rows.filter(function(row) {
      return row.DESTINATARIO_USUARIO_ID === user.ID || (driver && row.DESTINATARIO_CONDUCTOR_ID === driver.ID);
    });
  } else if (sheetName === 'CONEXIONES') {
    rows = rows.filter(function(row) { return row.USUARIO_ID === user.ID; });
  } else if (!driver && ['CONDUCTORES','VEHICULOS','OPERACIONES','GPS','RUTAS','HISTORIAL','DOCUMENTOS','MANTENCIONES'].indexOf(sheetName) >= 0) {
    rows = [];
  } else if (sheetName === 'CONDUCTORES') {
    rows = rows.filter(function(row) { return row.ID === driver.ID; });
  } else if (sheetName === 'OPERACIONES' || sheetName === 'GPS' || sheetName === 'RUTAS') {
    rows = rows.filter(function(row) { return row.CONDUCTOR_ID === driver.ID; });
  } else if (sheetName === 'VEHICULOS') {
    const vehicleIds = {};
    listarRegistros_('OPERACIONES', {}).forEach(function(row) {
      if (row.CONDUCTOR_ID === driver.ID) vehicleIds[row.VEHICULO_ID] = true;
    });
    listarRegistros_('RUTAS', {}).forEach(function(row) {
      if (row.CONDUCTOR_ID === driver.ID) vehicleIds[row.VEHICULO_ID] = true;
    });
    rows = rows.filter(function(row) { return vehicleIds[row.ID]; });
  } else if (sheetName === 'HISTORIAL') {
    const operationIds = {};
    listarRegistros_('OPERACIONES', {}).forEach(function(row) {
      if (row.CONDUCTOR_ID === driver.ID) operationIds[row.ID] = true;
    });
    rows = rows.filter(function(row) { return operationIds[row.OPERACION_ID]; });
  } else if (sheetName === 'DOCUMENTOS') {
    const associatedVehicles = {};
    listarRegistros_('OPERACIONES', {}).forEach(function(row) {
      if (row.CONDUCTOR_ID === driver.ID) associatedVehicles[row.VEHICULO_ID] = true;
    });
    listarRegistros_('RUTAS', {}).forEach(function(row) {
      if (row.CONDUCTOR_ID === driver.ID) associatedVehicles[row.VEHICULO_ID] = true;
    });
    rows = rows.filter(function(row) {
      return (row.ASOCIADO_TIPO === 'Conductor' && row.ASOCIADO_ID === driver.ID) ||
        (row.ASOCIADO_TIPO === 'Vehículo' && associatedVehicles[row.ASOCIADO_ID]);
    });
  } else if (sheetName === 'MANTENCIONES') {
    const maintenanceVehicles = {};
    listarRegistros_('OPERACIONES', {}).forEach(function(row) {
      if (row.CONDUCTOR_ID === driver.ID) maintenanceVehicles[row.VEHICULO_ID] = true;
    });
    listarRegistros_('RUTAS', {}).forEach(function(row) {
      if (row.CONDUCTOR_ID === driver.ID) maintenanceVehicles[row.VEHICULO_ID] = true;
    });
    rows = rows.filter(function(row) { return maintenanceVehicles[row.VEHICULO_ID]; });
  } else if (sheetName === 'ALERTAS') {
    rows = rows.filter(function(row) { return !row.USUARIO_ID || row.USUARIO_ID === user.ID; });
  }
  return rows.map(function(row) { return limpiarSalidaRecurso_(sheetName, row); });
}
