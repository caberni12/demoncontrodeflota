/** Módulo de documentos y vencimientos. */
function actualizarEstadosDocumentos_() {
  const today = new Date();
  const warning = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  listarRegistros_('DOCUMENTOS', {}).forEach(function(row) {
    if (!row.FECHA_VENCIMIENTO) return;
    const expiry = new Date(row.FECHA_VENCIMIENTO);
    const status = expiry < today ? 'Vencido' : expiry <= warning ? 'Por vencer' : 'Vigente';
    if (row.ESTADO !== status) actualizarRegistro_('DOCUMENTOS', row.ID, { ESTADO:status });
  });
}
