/** Módulo Conductores. */
function obtenerConductorDeUsuario_(userId) {
  return listarRegistros_('CONDUCTORES', {}).find(function(row) { return row.USUARIO_ID === userId; }) || null;
}
