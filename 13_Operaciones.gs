/** Inicio y finalización de operaciones. */
function iniciarOperacion_(request, session) {
  exigirPermiso_(session.user, 'OPERACIONES', 'CREAR');
  const data = request.datos || request;
  if (session.user.ROL_ID === 'ROL-CONDUCTOR') {
    const ownDriver = obtenerConductorDeUsuario_(session.user.ID);
    if (!ownDriver) throw new Error('CONDUCTOR_NO_ASOCIADO');
    data.CONDUCTOR_ID = ownDriver.ID;
    const authorization = String(data.AUTORIZACION_QR || '');
    const cacheKey = authorization ? 'qr_aut_' + cifrarFichaSesion_(authorization) : '';
    const saved = cacheKey ? CacheService.getScriptCache().get(cacheKey) : '';
    let authorized = null;
    try { authorized = saved ? JSON.parse(saved) : null; } catch (error) { authorized = null; }
    if (!authorized || authorized.USUARIO_ID !== session.user.ID || authorized.VEHICULO_ID !== data.VEHICULO_ID) {
      throw new Error('AUTORIZACION_QR_INVALIDA');
    }
    CacheService.getScriptCache().remove(cacheKey);
  }
  validarRequeridos_(data, ['VEHICULO_ID','CONDUCTOR_ID','DESTINO']);
  const vehicle = obtenerRegistro_('VEHICULOS', data.VEHICULO_ID);
  const driver = obtenerRegistro_('CONDUCTORES', data.CONDUCTOR_ID);
  if (!vehicle || vehicle.ESTADO !== 'Disponible') throw new Error('VEHICULO_NO_DISPONIBLE');
  if (!driver || driver.ESTADO !== 'Disponible') throw new Error('CONDUCTOR_NO_DISPONIBLE');

  const operation = insertarRegistro_('OPERACIONES', {
    VEHICULO_ID: vehicle.ID,
    CONDUCTOR_ID: driver.ID,
    ORIGEN: data.ORIGEN || 'Ubicación actual',
    DESTINO: data.DESTINO,
    FECHA_INICIO: new Date(),
    ESTADO: 'Activa',
    KM_INICIO: Number(data.KM_INICIO || vehicle.KILOMETRAJE || 0),
    OBSERVACIONES: data.OBSERVACIONES || '',
    CREADO_POR: session.user.ID,
    ELIMINADO: 'NO',
  }, 'OPE');
  actualizarRegistro_('VEHICULOS', vehicle.ID, { ESTADO:'En ruta' });
  actualizarRegistro_('CONDUCTORES', driver.ID, { ESTADO:'En viaje' });
  insertarRegistro_('HISTORIAL', {
    OPERACION_ID: operation.ID, EVENTO:'INICIO', DETALLE:'Operación iniciada', FECHA_HORA:new Date(), USUARIO_ID:session.user.ID, ELIMINADO:'NO'
  }, 'HIS');
  registrarBitacora_(session.user, 'INICIAR', 'OPERACIONES', operation.ID, vehicle.PATENTE + ' / ' + driver.NOMBRE);
  return ok_({ row: operation });
}

function finalizarOperacion_(request, session) {
  exigirPermiso_(session.user, 'OPERACIONES', 'ACTUALIZAR');
  const operation = obtenerRegistro_('OPERACIONES', request.identificador || request.OPERACION_ID);
  if (!operation || operation.ESTADO !== 'Activa') throw new Error('OPERACION_NO_ACTIVA');
  if (!filtrarPorUsuario_('OPERACIONES', [operation], session.user).length) throw new Error('PERMISO_DENEGADO');
  const kmEnd = Number(request.KM_FIN || operation.KM_INICIO || 0);
  const kmStart = Number(operation.KM_INICIO || 0);
  const updated = actualizarRegistro_('OPERACIONES', operation.ID, {
    FECHA_FIN: new Date(),
    ESTADO: 'Finalizada',
    KM_FIN: kmEnd,
    DISTANCIA_KM: Math.max(0, kmEnd - kmStart),
    OBSERVACIONES: request.OBSERVACIONES || operation.OBSERVACIONES || '',
  });
  actualizarRegistro_('VEHICULOS', operation.VEHICULO_ID, { ESTADO:'Disponible', KILOMETRAJE:kmEnd });
  actualizarRegistro_('CONDUCTORES', operation.CONDUCTOR_ID, { ESTADO:'Disponible' });
  insertarRegistro_('HISTORIAL', {
    OPERACION_ID: operation.ID, EVENTO:'FIN', DETALLE:'Operación finalizada', FECHA_HORA:new Date(), USUARIO_ID:session.user.ID, ELIMINADO:'NO'
  }, 'HIS');
  registrarBitacora_(session.user, 'FINALIZAR', 'OPERACIONES', operation.ID, 'Operación finalizada');
  return ok_({ row: updated });
}
