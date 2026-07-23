/** Enrutador único del servicio de datos. */
function enrutarSolicitud_(request, event) {
  const accion = String(request.accion || '').trim();
  if (!accion) throw new Error('ACCION_REQUERIDA');

  if (accion === 'salud') {
    return ok_({ version: VERSION_APLICACION, service: 'Sistema de Gestión de Flotas - Google Apps Script', now: fechaIso_() });
  }
  if (accion === 'estadoSistema') return estadoSistema_();
  if (accion === 'instalacionInicial') return instalarSistemaInicial_(request);
  if (accion === 'iniciarSesion') return iniciarSesion_(request);

  const session = requerirSesion_(request.fichaSesion);

  switch (accion) {
    case 'cerrarSesion': return cerrarSesion_(request.fichaSesion, session);
    case 'miSesion': return ok_({ user: usuarioPublico_(session.user) });
    case 'panelPrincipal': return panelPrincipal_(session);
    case 'listar': return servicioListar_(request, session);
    case 'obtener': return servicioObtener_(request, session);
    case 'crear': return servicioCrear_(request, session);
    case 'actualizar': return servicioActualizar_(request, session);
    case 'eliminar': return servicioEliminar_(request, session);
    case 'iniciarOperacion': return iniciarOperacion_(request, session);
    case 'finalizarOperacion': return finalizarOperacion_(request, session);
    case 'validarQrVehiculo': return validarQrVehiculo_(request, session);
    case 'guardarUbicacion': return guardarUbicacion_(request, session);
    case 'ultimasUbicaciones': return ultimasUbicaciones_(request, session);
    case 'asignarRuta': return asignarRuta_(request, session);
    case 'actualizarEstadoRuta': return actualizarEstadoRuta_(request, session);
    case 'enviarNotificacion': return enviarNotificacion_(request, session);
    case 'marcarNotificacionLeida': return marcarNotificacionLeida_(request, session);
    case 'actualizarConexion': return actualizarConexion_(request, session);
    case 'resumenTiempoReal': return resumenTiempoReal_(request, session);
    case 'cambiarContrasena': return cambiarPassword_(request, session);
    case 'guardarEmpresa': return guardarEmpresaServicio_(request, session);
    case 'limpiarDatosOperativos': return limpiarDatosOperativosServicio_(request, session);
    default: throw new Error('ACCION_NO_ENCONTRADA');
  }
}

function servicioListar_(request, session) {
  const resource = obtenerRecurso_(request.recurso);
  exigirPermiso_(session.user, resource.module, 'LEER');
  let rows = listarRegistros_(resource.sheet, request.filtros || {});
  rows = filtrarPorUsuario_(resource.sheet, rows, session.user);
  const limit = Math.min(Number(request.limite || CONFIGURACION_APLICACION.MAXIMO_FILAS_LISTADO), CONFIGURACION_APLICACION.MAXIMO_FILAS_LISTADO);
  return ok_({ rows: rows.slice(0, limit), total: rows.length });
}

function servicioObtener_(request, session) {
  const resource = obtenerRecurso_(request.recurso);
  exigirPermiso_(session.user, resource.module, 'LEER');
  const row = obtenerRegistro_(resource.sheet, request.identificador);
  if (!row) throw new Error('REGISTRO_NO_ENCONTRADO');
  const visible = filtrarPorUsuario_(resource.sheet, [row], session.user);
  if (!visible.length) throw new Error('PERMISO_DENEGADO');
  return ok_({ row: visible[0] });
}

function servicioCrear_(request, session) {
  const resource = obtenerRecurso_(request.recurso);
  exigirPermiso_(session.user, resource.module, 'CREAR');
  if (resource.sheet === 'USUARIOS') return crearUsuarioServicio_(request.datos || {}, session);
  if (session.user.ROL_ID === 'ROL-CONDUCTOR') {
    if (resource.sheet === 'OPERACIONES') return iniciarOperacion_({ datos:request.datos || {} }, session);
    if (resource.sheet === 'GPS') return guardarUbicacion_({ datos:request.datos || {} }, session);
    if (resource.sheet === 'CONEXIONES') throw new Error('ACCION_ESPECIAL_REQUERIDA');
  }
  const data = normalizarEntradaRecurso_(resource.sheet, request.datos || {}, session.user);
  const row = insertarRegistro_(resource.sheet, data, resource.prefix);
  registrarBitacora_(session.user, 'CREAR', resource.module, row.ID, 'Registro creado');
  return ok_({ row: limpiarSalidaRecurso_(resource.sheet, row) });
}

function servicioActualizar_(request, session) {
  const resource = obtenerRecurso_(request.recurso);
  exigirPermiso_(session.user, resource.module, 'ACTUALIZAR');
  const existing = obtenerRegistro_(resource.sheet, request.identificador);
  if (!existing) throw new Error('REGISTRO_NO_ENCONTRADO');
  if (!filtrarPorUsuario_(resource.sheet, [existing], session.user).length) throw new Error('PERMISO_DENEGADO');
  if (session.user.ROL_ID === 'ROL-CONDUCTOR') {
    const driverData = request.datos || {};
    if (resource.sheet === 'RUTAS') {
      return actualizarEstadoRuta_({ RUTA_ID:request.identificador, ESTADO:driverData.ESTADO }, session);
    }
    if (resource.sheet === 'NOTIFICACIONES') {
      if (driverData.LEIDA !== 'SI') throw new Error('PERMISO_DENEGADO');
      return marcarNotificacionLeida_({ NOTIFICACION_ID:request.identificador }, session);
    }
    if (resource.sheet === 'ALERTAS') {
      const alertKeys = Object.keys(driverData);
      if (alertKeys.some(function(key) { return key !== 'LEIDA'; })) throw new Error('PERMISO_DENEGADO');
    }
    if (resource.sheet === 'OPERACIONES' || resource.sheet === 'CONEXIONES') throw new Error('ACCION_ESPECIAL_REQUERIDA');
  }
  if (resource.sheet === 'USUARIOS') return actualizarUsuarioServicio_(request.identificador, request.datos || {}, session);
  const data = normalizarEntradaRecurso_(resource.sheet, request.datos || {}, session.user);
  const row = actualizarRegistro_(resource.sheet, request.identificador, data);
  registrarBitacora_(session.user, 'ACTUALIZAR', resource.module, request.identificador, 'Registro actualizado');
  return ok_({ row: limpiarSalidaRecurso_(resource.sheet, row) });
}

function servicioEliminar_(request, session) {
  const resource = obtenerRecurso_(request.recurso);
  exigirPermiso_(session.user, resource.module, 'ELIMINAR');
  const existing = obtenerRegistro_(resource.sheet, request.identificador);
  if (!existing) throw new Error('REGISTRO_NO_ENCONTRADO');
  if (!filtrarPorUsuario_(resource.sheet, [existing], session.user).length) throw new Error('PERMISO_DENEGADO');
  eliminarRegistro_(resource.sheet, request.identificador);
  registrarBitacora_(session.user, 'ELIMINAR', resource.module, request.identificador, 'Registro eliminado lógicamente');
  return ok_({ id: request.identificador });
}
