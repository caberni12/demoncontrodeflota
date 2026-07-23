/** Módulo de alertas. */
function crearAlerta_(data) {
  return insertarRegistro_('ALERTAS', {
    TIPO: data.TIPO || 'Sistema', NIVEL: data.NIVEL || 'Info', TITULO:data.TITULO || 'Alerta',
    MENSAJE:data.MENSAJE || '', MODULO:data.MODULO || '', REGISTRO_ID:data.REGISTRO_ID || '',
    LEIDA:'NO', USUARIO_ID:data.USUARIO_ID || '', FECHA_HORA:new Date(), ELIMINADO:'NO'
  }, 'ALT');
}
