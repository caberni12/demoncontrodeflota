/** Configuración y parámetros. */
function estadoSistema_() {
  const ss = obtenerSpreadsheet_();
  const users = listarRegistros_('USUARIOS', {});
  const usersWithAccess = users.filter(usuarioTieneAccesoConfigurado_);
  const companies = listarRegistros_('EMPRESAS', {});
  return ok_({
    connected: true,
    version: VERSION_APLICACION,
    spreadsheetName: ss.getName(),
    needsSetup: usersWithAccess.length === 0,
    company: companies.length ? limpiarSalidaRecurso_('EMPRESAS', companies[0]) : null,
    rows: {
      users: users.length,
      usersWithAccess: usersWithAccess.length,
      vehicles: listarRegistros_('VEHICULOS', {}).length,
      drivers: listarRegistros_('CONDUCTORES', {}).length,
      operations: listarRegistros_('OPERACIONES', {}).length,
    },
  });
}


/** Guarda la identidad y los datos institucionales de la empresa. */
function guardarEmpresaServicio_(request, session) {
  exigirPermiso_(session.user, 'CONFIGURACION', 'ACTUALIZAR');
  const current = listarRegistros_('EMPRESAS', {})[0] || null;
  const data = normalizarEntradaRecurso_('EMPRESAS', request.datos || {}, session.user);

  if (String(request.eliminarLogotipo || '') === 'SI') {
    eliminarLogoAnterior_(current);
    data.DIRECCION_LOGOTIPO = '';
    data.ID_ARCHIVO_LOGOTIPO = '';
    data.NOMBRE_ARCHIVO_LOGOTIPO = '';
    data.TIPO_ARCHIVO_LOGOTIPO = '';
  }

  if (request.logotipoBase64) {
    eliminarLogoAnterior_(current);
    const logo = guardarLogoEmpresaEnDrive_(request.logotipoBase64, request.nombreLogotipo, request.tipoLogotipo);
    data.DIRECCION_LOGOTIPO = logo.url;
    data.ID_ARCHIVO_LOGOTIPO = logo.id;
    data.NOMBRE_ARCHIVO_LOGOTIPO = logo.nombre;
    data.TIPO_ARCHIVO_LOGOTIPO = logo.tipo;
  }

  if (!data.ESTADO) data.ESTADO = 'Activo';
  const row = current
    ? actualizarRegistro_('EMPRESAS', current.ID, data)
    : insertarRegistro_('EMPRESAS', data, 'EMP');

  registrarBitacora_(session.user, 'ACTUALIZAR', 'CONFIGURACION', row.ID, 'Configuración de empresa guardada');
  return ok_({ row: limpiarSalidaRecurso_('EMPRESAS', row) });
}

function guardarLogoEmpresaEnDrive_(dataUrl, nombre, tipo) {
  const text = String(dataUrl || '');
  const match = text.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('FORMATO_LOGOTIPO_INVALIDO');
  const mimeType = String(tipo || match[1] || 'image/png');
  if (['image/png','image/jpeg','image/webp'].indexOf(mimeType) < 0) throw new Error('FORMATO_LOGOTIPO_INVALIDO');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 1572864) throw new Error('LOGOTIPO_DEMASIADO_GRANDE');

  const properties = PropertiesService.getScriptProperties();
  let folderId = properties.getProperty('ID_CARPETA_LOGOTIPOS');
  let folder = null;
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); } catch (error) { folder = null; }
  }
  if (!folder) {
    folder = DriveApp.createFolder('Logotipos - Sistema de Gestión de Flotas');
    properties.setProperty('ID_CARPETA_LOGOTIPOS', folder.getId());
  }

  const cleanName = String(nombre || 'logotipo_empresa.png').replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = Utilities.newBlob(bytes, mimeType, cleanName);
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) {}
  return {
    id: file.getId(),
    nombre: file.getName(),
    tipo: mimeType,
    url: 'https://drive.google.com/uc?export=view&id=' + file.getId(),
  };
}

function eliminarLogoAnterior_(company) {
  if (!company || !company.ID_ARCHIVO_LOGOTIPO) return;
  try { DriveApp.getFileById(company.ID_ARCHIVO_LOGOTIPO).setTrashed(true); } catch (error) {}
}
