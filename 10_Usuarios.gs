/** Módulo Usuarios. Las operaciones CRUD se enrutan mediante create/update/list/delete. */
function listarUsuarios_(session) {
  exigirPermiso_(session.user, 'USUARIOS', 'LEER');
  return listarRegistros_('USUARIOS', {}).map(usuarioPublico_);
}
