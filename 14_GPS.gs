/** Registro y consulta de ubicaciones GPS. */
function guardarUbicacion_(request, session) {
  exigirPermiso_(session.user, 'GPS', 'CREAR');
  const data = request.datos || request;
  validarRequeridos_(data, ['LATITUD','LONGITUD']);
  const latitude = Number(data.LATITUD);
  const longitude = Number(data.LONGITUD);
  if (!isFinite(latitude) || !isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('COORDENADAS_INVALIDAS');
  }
  let driverId = data.CONDUCTOR_ID || '';
  if (!driverId && session.user.ROL_ID === 'ROL-CONDUCTOR') {
    const driver = obtenerConductorDeUsuario_(session.user.ID);
    if (driver) driverId = driver.ID;
  }
  let operationId = data.OPERACION_ID || '';
  let vehicleId = data.VEHICULO_ID || '';
  if (!operationId && driverId) {
    const active = listarRegistros_('OPERACIONES', {}).find(function(row) {
      return row.CONDUCTOR_ID === driverId && row.ESTADO === 'Activa';
    });
    if (active) { operationId = active.ID; vehicleId = active.VEHICULO_ID; }
  }
  const row = insertarRegistro_('GPS', {
    OPERACION_ID: operationId,
    CONDUCTOR_ID: driverId,
    VEHICULO_ID: vehicleId,
    LATITUD: latitude,
    LONGITUD: longitude,
    DIRECCION: data.DIRECCION || obtenerDireccionCoordenadas_(latitude, longitude),
    PRECISION_METROS: Number(data.PRECISION_METROS || 0),
    VELOCIDAD_KMH: Number(data.VELOCIDAD_KMH || 0),
    RUMBO: Number(data.RUMBO || 0),
    BATERIA_PORCENTAJE: data.BATERIA_PORCENTAJE === '' ? '' : Number(data.BATERIA_PORCENTAJE || 0),
    DISPOSITIVO_ID: String(data.DISPOSITIVO_ID || ''),
    FECHA_HORA: data.FECHA_HORA ? new Date(data.FECHA_HORA) : new Date(),
    FUENTE: data.FUENTE || 'GPS real',
    ELIMINADO: 'NO',
  }, 'GPS');
  if (data.DISPOSITIVO_ID) {
    actualizarConexion_({ datos:{
      DISPOSITIVO_ID: data.DISPOSITIVO_ID,
      ESTADO: 'En línea',
      BATERIA_PORCENTAJE: data.BATERIA_PORCENTAJE,
      TIPO_RED: data.TIPO_RED || '',
      PLATAFORMA: data.PLATAFORMA || '',
      NAVEGADOR: data.NAVEGADOR || ''
    } }, session);
  }
  return ok_({ row: row });
}

function ultimasUbicaciones_(request, session) {
  exigirPermiso_(session.user, 'GPS', 'LEER');
  let rows = listarRegistros_('GPS', {});
  rows = filtrarPorUsuario_('GPS', rows, session.user);
  rows.sort(function(a,b) { return new Date(b.FECHA_HORA).getTime() - new Date(a.FECHA_HORA).getTime(); });
  const latest = {};
  rows.forEach(function(row) {
    const key = row.CONDUCTOR_ID || row.VEHICULO_ID || row.ID;
    if (!latest[key]) latest[key] = row;
  });
  const drivers = listarRegistros_('CONDUCTORES', {});
  const vehicles = listarRegistros_('VEHICULOS', {});
  const output = Object.keys(latest).map(function(key) {
    const row = latest[key];
    const driver = drivers.find(function(item) { return item.ID === row.CONDUCTOR_ID; });
    const vehicle = vehicles.find(function(item) { return item.ID === row.VEHICULO_ID; });
    return Object.assign({}, row, {
      CONDUCTOR_NOMBRE: driver ? driver.NOMBRE : '',
      VEHICULO_PATENTE: vehicle ? vehicle.PATENTE : '',
    });
  });
  return ok_({ rows: output, total: output.length });
}

function obtenerDireccionCoordenadas_(latitude, longitude) {
  const key = 'direccion_' + Number(latitude).toFixed(5) + '_' + Number(longitude).toFixed(5);
  const cache = CacheService.getScriptCache();
  const saved = cache.get(key);
  if (saved) return saved;
  let address = Number(latitude).toFixed(6) + ', ' + Number(longitude).toFixed(6);
  try {
    const response = Maps.newGeocoder().setLanguage('es').reverseGeocode(latitude, longitude);
    if (response && response.status === 'OK' && response.results && response.results.length) {
      address = response.results[0].formatted_address || address;
    }
  } catch (error) {
    console.log('No fue posible convertir coordenadas en dirección: ' + error.message);
  }
  cache.put(key, address, 21600);
  return address;
}
