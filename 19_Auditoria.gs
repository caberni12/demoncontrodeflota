/** Bitácora de auditoría. */
function registrarBitacora_(user, action, moduleName, recordId, detail) {
  try {
    insertarRegistro_('BITACORA', {
      USUARIO_ID: user && user.ID ? user.ID : '',
      USUARIO_NOMBRE: user && user.NOMBRE ? user.NOMBRE : 'Sistema',
      ACCION: action,
      MODULO: moduleName,
      REGISTRO_ID: recordId || '',
      DETALLE: detail || '',
      IP_CLIENTE: '',
      FECHA_HORA: new Date(),
      ELIMINADO: 'NO',
    }, 'BIT');
  } catch (error) {
    console.error('No fue posible registrar la bitácora', error);
  }
}
