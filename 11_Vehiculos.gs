/** Módulo Vehículos. */
function obtenerVehiculoPorQr_(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return listarRegistros_('VEHICULOS', {}).find(function(row) {
    return String(row.QR_CODIGO || '').toUpperCase() === normalized ||
      String(row.PATENTE || '').replace(/[^A-Z0-9]/g, '') === normalized.replace(/[^A-Z0-9]/g, '');
  }) || null;
}

function validarQrVehiculo_(request, session) {
  exigirPermiso_(session.user, 'QR', 'LEER');
  const code = request.codigo || request.CODIGO || '';
  if (!code) throw new Error('CODIGO_QR_REQUERIDO');
  const vehicle = obtenerVehiculoPorQr_(code);
  if (!vehicle) throw new Error('QR_NO_RECONOCIDO');
  if (vehicle.ESTADO !== 'Disponible') throw new Error('VEHICULO_NO_DISPONIBLE');
  const qr = listarRegistros_('QR', {}).find(function(row) {
    return row.CODIGO === vehicle.QR_CODIGO || row.REGISTRO_ID === vehicle.ID;
  });
  if (qr) {
    actualizarRegistro_('QR', qr.ID, {
      FECHA_ULTIMO_USO: new Date(),
      USOS: Number(qr.USOS || 0) + 1,
    });
  }
  const authorization = crearToken_();
  CacheService.getScriptCache().put(
    'qr_aut_' + cifrarFichaSesion_(authorization),
    JSON.stringify({ USUARIO_ID:session.user.ID, VEHICULO_ID:vehicle.ID }),
    300
  );
  registrarBitacora_(session.user, 'VALIDAR', 'QR', vehicle.ID, 'Vehículo validado: ' + vehicle.PATENTE);
  return ok_({ row: limpiarSalidaRecurso_('VEHICULOS', vehicle), autorizacionQr:authorization, validaPorSegundos:300 });
}
