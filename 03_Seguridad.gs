/** Seguridad, contraseñas, sesiones y permisos. */
function validarContrasenaElegida_(contrasena) {
  if (contrasena === null || typeof contrasena === 'undefined' || String(contrasena).length === 0) {
    throw new Error('CONTRASENA_REQUERIDA');
  }
  return String(contrasena);
}

function usuarioTieneAccesoConfigurado_(usuario) {
  if (!usuario || usuario.ELIMINADO === 'SI' || usuario.ESTADO !== 'Activo') return false;
  const correo = normalizarEmail_(usuario.CORREO);
  const claveCifrada = String(usuario.CONTRASENA_CIFRADA || '');
  const sal = String(usuario.SAL_CONTRASENA || '');
  return Boolean(correo) && /^[a-f0-9]{64}$/i.test(claveCifrada) && sal.length >= 16;
}

function instalarSistemaInicial_(request) {
  const users = listarRegistros_('USUARIOS', {});
  if (users.some(usuarioTieneAccesoConfigurado_)) throw new Error('SISTEMA_YA_INICIALIZADO');
  const claveEsperada = obtenerOCrearClaveInstalacion_();
  if (String(request.claveInstalacion || '') !== claveEsperada) throw new Error('CLAVE_INSTALACION_INVALIDA');
  validarRequeridos_(request, ['nombre','correo']);
  const contrasena = validarContrasenaElegida_(request.contrasena);

  asegurarCatalogos_();
  users.forEach(function(usuario) {
    actualizarRegistro_('USUARIOS', usuario.ID, {
      ESTADO: 'Inactivo',
      ELIMINADO: 'SI',
    });
  });
  const user = crearUsuarioInterno_({
    NOMBRE: request.nombre,
    CORREO: request.correo,
    CONTRASENA: contrasena,
    ROL_ID: 'ROL-ADMIN',
    ESTADO: 'Activo',
    TELEFONO: request.telefono || '',
  });
  PropertiesService.getScriptProperties().setProperty('INSTALACION_COMPLETADA', 'SI');
  registrarBitacora_(user, 'INSTALACION_INICIAL', 'SEGURIDAD', user.ID, 'Administrador inicial creado');
  return ok_({ initialized: true, user: usuarioPublico_(user) });
}

function iniciarSesion_(request) {
  validarRequeridos_(request, ['correo','contrasena']);
  const email = normalizarEmail_(request.correo);
  const user = listarRegistros_('USUARIOS', {}).find(function(row) {
    return normalizarEmail_(row.CORREO) === email && usuarioTieneAccesoConfigurado_(row);
  });
  if (!user || cifrarContrasena_(request.contrasena, user.SAL_CONTRASENA) !== user.CONTRASENA_CIFRADA) {
    throw new Error('CREDENCIALES_INVALIDAS');
  }
  const rawToken = crearToken_();
  const now = new Date();
  const expires = new Date(now.getTime() + CONFIGURACION_APLICACION.HORAS_SESION * 60 * 60 * 1000);
  const sessionRow = insertarRegistro_('SESIONES', {
    USUARIO_ID: user.ID,
    FICHA_SESION_CIFRADA: cifrarFichaSesion_(rawToken),
    FECHA_INICIO: now,
    FECHA_EXPIRACION: expires,
    ULTIMO_USO: now,
    ACTIVA: 'SI',
    AGENTE_NAVEGADOR: String(request.agenteNavegador || '').slice(0, 500),
    ELIMINADO: 'NO',
  }, 'SES');
  actualizarRegistro_('USUARIOS', user.ID, { ULTIMO_ACCESO: now });
  registrarBitacora_(user, 'INICIO_SESION', 'SEGURIDAD', user.ID, 'Inicio de sesión correcto');
  return ok_({ token: rawToken, sessionId:sessionRow.ID, expiresAt: expires.toISOString(), user: usuarioPublico_(user) });
}

function cerrarSesion_(token, session) {
  actualizarRegistro_('SESIONES', session.session.ID, { ACTIVA: 'NO', ULTIMO_USO: new Date() });
  listarRegistros_('CONEXIONES', {}).filter(function(row) {
    return row.SESION_ID === session.session.ID;
  }).forEach(function(row) {
    actualizarRegistro_('CONEXIONES', row.ID, {
      ESTADO:'Desconectado',
      ACTIVIDAD:'Inactivo',
      PAGINA_VISIBLE:'NO',
      ULTIMA_CONEXION:new Date(),
    });
  });
  registrarBitacora_(session.user, 'CIERRE_SESION', 'SEGURIDAD', session.user.ID, 'Cierre de sesión');
  return ok_({ loggedOut: true });
}

function requerirSesion_(token) {
  if (!token) throw new Error('AUTENTICACION_REQUERIDA');
  const tokenHash = cifrarFichaSesion_(token);
  const session = listarRegistros_('SESIONES', {}).find(function(row) {
    return row.FICHA_SESION_CIFRADA === tokenHash && row.ACTIVA === 'SI';
  });
  if (!session) throw new Error('SESION_INVALIDA');
  if (new Date(session.FECHA_EXPIRACION).getTime() <= Date.now()) {
    actualizarRegistro_('SESIONES', session.ID, { ACTIVA: 'NO' });
    throw new Error('SESION_EXPIRADA');
  }
  const user = obtenerRegistro_('USUARIOS', session.USUARIO_ID);
  if (!user || user.ESTADO !== 'Activo') throw new Error('USUARIO_DESHABILITADO');
  const ultimoUso = new Date(session.ULTIMO_USO || session.FECHA_INICIO || 0).getTime();
  const intervaloActualizacion = Number(CONFIGURACION_APLICACION.SEGUNDOS_ACTUALIZAR_SESION || 120) * 1000;
  if (!isFinite(ultimoUso) || Date.now() - ultimoUso >= intervaloActualizacion) {
    actualizarRegistro_('SESIONES', session.ID, { ULTIMO_USO: new Date() });
  }
  return { user: user, session: session };
}

function cambiarPassword_(request, session) {
  validarRequeridos_(request, ['contrasenaActual']);
  if (cifrarContrasena_(request.contrasenaActual, session.user.SAL_CONTRASENA) !== session.user.CONTRASENA_CIFRADA) {
    throw new Error('CONTRASENA_ACTUAL_INVALIDA');
  }
  const nuevaContrasena = validarContrasenaElegida_(request.nuevaContrasena);
  const salt = crearToken_();
  actualizarRegistro_('USUARIOS', session.user.ID, {
    SAL_CONTRASENA: salt,
    CONTRASENA_CIFRADA: cifrarContrasena_(nuevaContrasena, salt),
  });
  registrarBitacora_(session.user, 'CAMBIAR_PASSWORD', 'SEGURIDAD', session.user.ID, 'Contraseña modificada');
  return ok_({ changed: true });
}

function crearUsuarioInterno_(data) {
  const email = normalizarEmail_(data.CORREO);
  if (!email) throw new Error('CORREO_REQUERIDO');
  const contrasena = validarContrasenaElegida_(data.CONTRASENA);
  if (listarRegistros_('USUARIOS', {}).some(function(row) { return normalizarEmail_(row.CORREO) === email; })) {
    throw new Error('CORREO_YA_EXISTE');
  }
  const salt = crearToken_();
  return insertarRegistro_('USUARIOS', {
    NOMBRE: data.NOMBRE,
    CORREO: email,
    CONTRASENA_CIFRADA: cifrarContrasena_(contrasena, salt),
    SAL_CONTRASENA: salt,
    ROL_ID: data.ROL_ID || 'ROL-CONDUCTOR',
    ESTADO: data.ESTADO || 'Activo',
    TELEFONO: data.TELEFONO || '',
    ELIMINADO: 'NO',
  }, 'USR');
}

function crearUsuarioServicio_(data, session) {
  validarRequeridos_(data, ['NOMBRE','CORREO']);
  const row = crearUsuarioInterno_(data);
  registrarBitacora_(session.user, 'CREAR', 'USUARIOS', row.ID, 'Usuario creado: ' + row.CORREO);
  return ok_({ row: usuarioPublico_(row) });
}

function actualizarUsuarioServicio_(id, data, session) {
  const clean = Object.assign({}, data);
  delete clean.CONTRASENA_CIFRADA;
  delete clean.SAL_CONTRASENA;
  if (Object.prototype.hasOwnProperty.call(clean, 'CONTRASENA')) {
    const contrasena = validarContrasenaElegida_(clean.CONTRASENA);
    const salt = crearToken_();
    clean.SAL_CONTRASENA = salt;
    clean.CONTRASENA_CIFRADA = cifrarContrasena_(contrasena, salt);
    delete clean.CONTRASENA;
  }
  if (clean.CORREO) clean.CORREO = normalizarEmail_(clean.CORREO);
  const row = actualizarRegistro_('USUARIOS', id, clean);
  registrarBitacora_(session.user, 'ACTUALIZAR', 'USUARIOS', id, 'Usuario actualizado');
  return ok_({ row: usuarioPublico_(row) });
}

function usuarioPublico_(user) {
  if (!user) return null;
  const role = obtenerRegistro_('ROLES', user.ROL_ID);
  const driver = listarRegistros_('CONDUCTORES', {}).find(function(row) { return row.USUARIO_ID === user.ID; });
  const permissions = user.ROL_ID === 'ROL-ADMIN'
    ? ['*:*']
    : listarRegistros_('PERMISOS', {}).filter(function(row) {
        return row.ROL_ID === user.ROL_ID && row.PERMITIDO === 'SI';
      }).map(function(row) { return row.MODULO + ':' + row.ACCION; });
  return {
    ID: user.ID,
    NOMBRE: user.NOMBRE,
    CORREO: user.CORREO,
    ROL_ID: user.ROL_ID,
    ROL_NOMBRE: role ? role.NOMBRE : user.ROL_ID,
    ESTADO: user.ESTADO,
    TELEFONO: user.TELEFONO || '',
    ULTIMO_ACCESO: serializarValor_(user.ULTIMO_ACCESO),
    CONDUCTOR_ID: driver ? driver.ID : '',
    PERMISOS: permissions,
  };
}

function exigirPermiso_(user, moduleName, action) {
  if (!tienePermiso_(user, moduleName, action)) throw new Error('PERMISO_DENEGADO');
  return true;
}

function tienePermiso_(user, moduleName, action) {
  if (user.ROL_ID === 'ROL-ADMIN') return true;
  return listarRegistros_('PERMISOS', {}).some(function(row) {
    return row.ROL_ID === user.ROL_ID && row.MODULO === moduleName && row.ACCION === action && row.PERMITIDO === 'SI';
  });
}

function cifrarContrasena_(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password) + ':' + String(salt),
    Utilities.Charset.UTF_8
  );
  return bytesAHex_(bytes);
}

function cifrarFichaSesion_(token) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8);
  return bytesAHex_(bytes);
}

function bytesAHex_(bytes) {
  return bytes.map(function(value) {
    const normalized = value < 0 ? value + 256 : value;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function crearToken_() {
  return Utilities.getUuid() + Utilities.getUuid();
}

function limpiarSesionesExpiradas_() {
  const now = Date.now();
  listarRegistros_('SESIONES', {}).forEach(function(row) {
    if (row.ACTIVA === 'SI' && new Date(row.FECHA_EXPIRACION).getTime() <= now) {
      actualizarRegistro_('SESIONES', row.ID, { ACTIVA: 'NO' });
    }
  });
}
