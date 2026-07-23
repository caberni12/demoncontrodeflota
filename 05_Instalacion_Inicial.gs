/** Instalación y mantenimiento inicial del sistema. */
function generarClaveInstalacion_() {
  const entropia = (
    Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '')
  ).toUpperCase();
  return 'SGF-' + [
    entropia.slice(0, 8),
    entropia.slice(8, 16),
    entropia.slice(16, 24),
    entropia.slice(24, 32),
  ].join('-');
}

function obtenerOCrearClaveInstalacion_() {
  const propiedades = PropertiesService.getScriptProperties();
  const existente = propiedades.getProperty('CLAVE_INSTALACION');
  if (existente) return existente;

  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(30000);
  try {
    const creadaPorOtraEjecucion = propiedades.getProperty('CLAVE_INSTALACION');
    if (creadaPorOtraEjecucion) return creadaPorOtraEjecucion;

    const configurada = String(CONFIGURACION_APLICACION.CLAVE_INSTALACION || '').trim();
    const valoresAutomaticos = ['CAMBIAR-CLAVE-INSTALACION', 'GENERAR_AUTOMATICAMENTE'];
    const clave = configurada && valoresAutomaticos.indexOf(configurada) === -1
      ? configurada
      : generarClaveInstalacion_();
    propiedades.setProperty('CLAVE_INSTALACION', clave);
    return clave;
  } finally {
    bloqueo.releaseLock();
  }
}

function crearClaveInstalacion() {
  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(30000);
  try {
    const clave = generarClaveInstalacion_();
    PropertiesService.getScriptProperties().setProperty('CLAVE_INSTALACION', clave);
    Logger.log('CLAVE DE INSTALACIÓN: ' + clave);
    return {
      ok: true,
      claveInstalacion: clave,
      message: 'Clave creada y guardada en las propiedades del proyecto.',
    };
  } finally {
    bloqueo.releaseLock();
  }
}

function mostrarClaveInstalacion() {
  const clave = obtenerOCrearClaveInstalacion_();
  Logger.log('CLAVE DE INSTALACIÓN: ' + clave);
  return {
    ok: true,
    claveInstalacion: clave,
    message: 'Utilice esta clave una sola vez para crear el administrador inicial.',
  };
}

function generarContrasenaTemporalAdministrador_() {
  const codigo = Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  return 'Flotas-' + codigo + '-9';
}

function prepararAccesoAdministrador() {
  instalarSistema();
  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(30000);
  try {
    const users = listarRegistros_('USUARIOS', {});
    let user = users.find(function(row) { return row.ROL_ID === 'ROL-ADMIN'; }) || users[0] || null;
    const effectiveEmail = normalizarEmail_(
      Session.getEffectiveUser().getEmail() ||
      Session.getActiveUser().getEmail()
    );
    const email = normalizarEmail_(user && user.CORREO) || effectiveEmail;
    if (!email) throw new Error('NO_SE_PUDO_OBTENER_CORREO_ADMINISTRADOR');

    const temporaryPassword = generarContrasenaTemporalAdministrador_();
    const salt = crearToken_();
    const userData = {
      NOMBRE: user && user.NOMBRE ? user.NOMBRE : 'Administrador del sistema',
      CORREO: email,
      CONTRASENA_CIFRADA: cifrarContrasena_(temporaryPassword, salt),
      SAL_CONTRASENA: salt,
      ROL_ID: 'ROL-ADMIN',
      ESTADO: 'Activo',
      ELIMINADO: 'NO',
    };

    user = user
      ? actualizarRegistro_('USUARIOS', user.ID, userData)
      : insertarRegistro_('USUARIOS', userData, 'USR');

    listarRegistros_('SESIONES', {}).filter(function(row) {
      return row.USUARIO_ID === user.ID;
    }).forEach(function(row) {
      actualizarRegistro_('SESIONES', row.ID, {
        ACTIVA: 'NO',
        ULTIMO_USO: new Date(),
      });
    });

    PropertiesService.getScriptProperties().setProperty('INSTALACION_COMPLETADA', 'SI');
    Logger.log('CORREO DE ACCESO: ' + email);
    Logger.log('CONTRASEÑA TEMPORAL: ' + temporaryPassword);
    Logger.log('Abra la interfaz e inicie sesión con estos datos.');

    return {
      ok: true,
      correo: email,
      contrasenaTemporal: temporaryPassword,
      usuarioId: user.ID,
      message: 'Acceso de administrador preparado correctamente.',
    };
  } finally {
    bloqueo.releaseLock();
  }
}

function instalarSistema() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const configuredId = CONFIGURACION_APLICACION.ID_HOJA_CALCULO;
    if (!configuredId || configuredId.indexOf('PEGAR_') === 0) throw new Error('Abra el Apps Script desde la hoja o configure ID_HOJA_CALCULO.');
    ss = SpreadsheetApp.openById(configuredId);
  }
  PropertiesService.getScriptProperties().setProperty('ID_HOJA_CALCULO', ss.getId());
  Object.keys(ESQUEMAS_APLICACION).forEach(function(sheetName) { asegurarHoja_(sheetName); });
  asegurarCatalogos_();
  const claveInstalacion = obtenerOCrearClaveInstalacion_();
  Logger.log('CLAVE DE INSTALACIÓN: ' + claveInstalacion);
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheets: Object.keys(ESQUEMAS_APLICACION),
    claveInstalacion: claveInstalacion,
    message: 'Estructura instalada. Copie la clave mostrada en el registro de ejecución para crear el administrador inicial.',
  };
}

function probarConexion() {
  const ss = obtenerSpreadsheet_();
  return {
    ok: true,
    name: ss.getName(),
    id: ss.getId(),
    url: ss.getUrl(),
    version: VERSION_APLICACION,
  };
}

function asegurarCatalogos_() {
  asegurarRol_('ROL-ADMIN', 'Administrador', 'Acceso completo');
  asegurarRol_('ROL-SUPERVISOR', 'Supervisor', 'Gestión operacional y reportes');
  asegurarRol_('ROL-CONDUCTOR', 'Conductor', 'Operaciones, rutas, GPS y notificaciones propias');

  const modules = ['PANEL_PRINCIPAL','USUARIOS','VEHICULOS','CONDUCTORES','OPERACIONES','GPS','HISTORIAL','MANTENCIONES','DOCUMENTOS','ALERTAS','REPORTES','BITACORA','CONFIGURACION','QR','RUTAS','NOTIFICACIONES','CONEXIONES'];
  const actions = ['LEER','CREAR','ACTUALIZAR','ELIMINAR'];
  modules.forEach(function(moduleName) {
    actions.forEach(function(action) {
      asegurarPermisoCatalogo_('ROL-ADMIN', moduleName, action, 'SI');
    });
  });
  const supervisorModules = ['PANEL_PRINCIPAL','VEHICULOS','CONDUCTORES','OPERACIONES','GPS','HISTORIAL','MANTENCIONES','DOCUMENTOS','ALERTAS','REPORTES','QR','RUTAS','NOTIFICACIONES','CONEXIONES'];
  supervisorModules.forEach(function(moduleName) {
    actions.forEach(function(action) {
      asegurarPermisoCatalogo_('ROL-SUPERVISOR', moduleName, action, action === 'ELIMINAR' ? 'NO' : 'SI');
    });
  });
  const driverRules = {
    PANEL_PRINCIPAL:['LEER'], VEHICULOS:['LEER'], CONDUCTORES:['LEER'], OPERACIONES:['LEER','CREAR','ACTUALIZAR'],
    GPS:['LEER','CREAR'], HISTORIAL:['LEER'], DOCUMENTOS:['LEER'], ALERTAS:['LEER','ACTUALIZAR'],
    QR:['LEER','ACTUALIZAR'], RUTAS:['LEER','ACTUALIZAR'], NOTIFICACIONES:['LEER','ACTUALIZAR'],
    CONEXIONES:['LEER','CREAR','ACTUALIZAR']
  };
  Object.keys(driverRules).forEach(function(moduleName) {
    driverRules[moduleName].forEach(function(action) {
      asegurarPermisoCatalogo_('ROL-CONDUCTOR', moduleName, action, 'SI');
    });
  });
}

function asegurarRol_(id, nombre, descripcion) {
  if (!obtenerRegistro_('ROLES', id)) {
    insertarRegistro_('ROLES', { ID:id, NOMBRE:nombre, DESCRIPCION:descripcion, ESTADO:'Activo', ELIMINADO:'NO' }, 'ROL');
  }
}

function asegurarPermisoCatalogo_(rolId, modulo, accion, permitido) {
  const existing = listarRegistros_('PERMISOS', {}).find(function(row) {
    return row.ROL_ID === rolId && row.MODULO === modulo && row.ACCION === accion;
  });
  if (!existing) {
    insertarRegistro_('PERMISOS', { ROL_ID:rolId, MODULO:modulo, ACCION:accion, PERMITIDO:permitido, ELIMINADO:'NO' }, 'PER');
  }
}

function limpiarDatosOperativosServicio_(request, session) {
  exigirPermiso_(session.user, 'CONFIGURACION', 'ELIMINAR');
  if (String(request.confirmacion || '') !== 'LIMPIAR DATOS') throw new Error('CONFIRMACION_REQUERIDA');
  ['VEHICULOS','CONDUCTORES','OPERACIONES','GPS','HISTORIAL','MANTENCIONES','DOCUMENTOS','ALERTAS','REPORTES','BITACORA','QR','RUTAS','NOTIFICACIONES','CONEXIONES'].forEach(limpiarHojaDatos_);
  registrarBitacora_(session.user, 'LIMPIAR', 'CONFIGURACION', '', 'Datos operativos eliminados; usuarios y empresa conservados');
  return ok_({ cleared: true });
}
