(function () {
  'use strict';

  const config = window.CONFIGURACION_FLOTAS;
  const accionesAplicacion = Object.freeze({
    health:'salud', status:'estadoSistema', bootstrap:'instalacionInicial', login:'iniciarSesion',
    logout:'cerrarSesion', me:'miSesion', dashboard:'panelPrincipal', list:'listar', get:'obtener',
    create:'crear', update:'actualizar', delete:'eliminar', startOperation:'iniciarOperacion',
    finishOperation:'finalizarOperacion', saveLocation:'guardarUbicacion', latestLocations:'ultimasUbicaciones',
    changePassword:'cambiarContrasena', saveCompany:'guardarEmpresa', clearOperationalData:'limpiarDatosOperativos'
  });
  const recursosAplicacion = Object.freeze({
    users:'usuarios', roles:'roles', permissions:'permisos', vehicles:'vehiculos', drivers:'conductores',
    operations:'operaciones', gps:'gps', history:'historial', maintenance:'mantenciones', documents:'documentos',
    alerts:'alertas', reports:'reportes', audit:'bitacora', parameters:'parametros', companies:'empresas', qr:'qr'
  });

  const resourceMap = {
    users: 'users', roles: 'roles', permissions: 'permissions', vehicles: 'vehicles',
    drivers: 'drivers', operations: 'operations', gps: 'gps', history: 'history',
    maintenance: 'maintenance', documents: 'documents', alerts: 'alerts', reports: 'reports',
    audit: 'audit', parameters: 'parameters', companies: 'companies', qr: 'qr'
  };

  const emptyState = () => ({
    version: 1,
    users: [], roles: [], permissions: [], vehicles: [], drivers: [], operations: [], gps: [],
    history: [], maintenance: [], documents: [], alerts: [], reports: [], audit: [], parameters: [],
    companies: [], qr: [], sessions: []
  });

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(config.CLAVE_ALMACENAMIENTO_LOCAL));
      return saved && Array.isArray(saved.users) ? { ...emptyState(), ...saved } : emptyState();
    } catch (_) {
      return emptyState();
    }
  }

  let localDb = loadLocal();
  let auth = loadAuth();

  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(config.CLAVE_SESION_LOCAL)) || {}; }
    catch (_) { return {}; }
  }

  function saveLocal() {
    localStorage.setItem(config.CLAVE_ALMACENAMIENTO_LOCAL, JSON.stringify(localDb));
    window.dispatchEvent(new CustomEvent('flotas:guardado-local'));
  }

  function setAuth(data) {
    auth = data || {};
    if (auth.token) localStorage.setItem(config.CLAVE_SESION_LOCAL, JSON.stringify(auth));
    else localStorage.removeItem(config.CLAVE_SESION_LOCAL);
    window.dispatchEvent(new CustomEvent('flotas:sesion-cambiada', { detail: auth }));
  }

  function isRemote() {
    if (sessionStorage.getItem('flotas_forzar_local') === '1') return false;
    if (config.MODO === 'local') return false;
    if (config.MODO === 'aplicacion_google') return true;
    return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?|$)/.test(String(config.DIRECCION_APLICACION || '').trim());
  }

  function backendLabel() {
    return isRemote() ? 'Google Apps Script' : 'Almacenamiento local';
  }

  async function request(action, payload = {}) {
    if (isRemote()) return remoteRequest(action, payload);
    return localRequest(action, payload);
  }


  function prepararSolicitudRemota(accion, carga) {
    const solicitud = { ...carga };
    solicitud.accion = accionesAplicacion[accion] || accion;
    solicitud.recurso = carga.resource ? (recursosAplicacion[carga.resource] || carga.resource) : undefined;
    solicitud.datos = carga.data;
    solicitud.filtros = carga.filters;
    solicitud.limite = carga.limit;
    solicitud.identificador = carga.id;
    solicitud.confirmacion = carga.confirmacion || carga.confirmation;
    solicitud.fichaSesion = auth.token || '';
    solicitud.agenteNavegador = navigator.userAgent;
    delete solicitud.action; delete solicitud.resource; delete solicitud.data; delete solicitud.filters;
    delete solicitud.limit; delete solicitud.id; delete solicitud.token; delete solicitud.userAgent; delete solicitud.confirmation;
    return solicitud;
  }

  async function remoteRequest(action, payload) {
    if (!config.DIRECCION_APLICACION) throw new Error('DIRECCION_APLICACION_NO_CONFIGURADA');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.TIEMPO_ESPERA_MILISEGUNDOS);
    try {
      const response = await fetch(config.DIRECCION_APLICACION, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(prepararSolicitudRemota(action, payload)),
        signal: controller.signal,
        redirect: 'follow'
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); }
      catch (_) { throw new Error('RESPUESTA_NO_VALIDA: ' + text.slice(0, 180)); }
      if (!result.ok) {
        if (['SESION_INVALIDA','SESION_EXPIRADA','AUTENTICACION_REQUERIDA'].includes(result.error)) setAuth({});
        throw new Error(result.error || 'ERROR_SERVICIO');
      }
      return result.data || {};
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('TIEMPO_DE_ESPERA_AGOTADO');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function digest(value) {
    if (window.crypto && crypto.subtle) {
      const bytes = new TextEncoder().encode(String(value));
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
    }
    return btoa(unescape(encodeURIComponent(String(value))));
  }

  function id(prefix) {
    return `${prefix}-${crypto.randomUUID ? crypto.randomUUID().split('-')[0].toUpperCase() : Date.now().toString(36).toUpperCase()}`;
  }
  const iso = () => new Date().toISOString();
  const activeRows = rows => rows.filter(row => row.ELIMINADO !== 'SI');
  const find = (resource, recordId) => activeRows(localDb[resource] || []).find(row => row.ID === recordId);

  function seedCatalogs() {
    if (localDb.roles.length) return;
    const now = iso();
    localDb.roles = [
      { ID:'ROL-ADMIN', NOMBRE:'Administrador', DESCRIPCION:'Acceso completo', ESTADO:'Activo', CREADO_EN:now, ACTUALIZADO_EN:now, ELIMINADO:'NO' },
      { ID:'ROL-SUPERVISOR', NOMBRE:'Supervisor', DESCRIPCION:'Gestión operacional', ESTADO:'Activo', CREADO_EN:now, ACTUALIZADO_EN:now, ELIMINADO:'NO' },
      { ID:'ROL-CONDUCTOR', NOMBRE:'Conductor', DESCRIPCION:'Operaciones y GPS', ESTADO:'Activo', CREADO_EN:now, ACTUALIZADO_EN:now, ELIMINADO:'NO' }
    ];
  }

  function audit(user, action, module, detail, recordId = '') {
    localDb.audit.unshift({
      ID:id('BIT'), USUARIO_ID:user?.ID || '', USUARIO_NOMBRE:user?.NOMBRE || 'Sistema', ACCION:action,
      MODULO:module, REGISTRO_ID:recordId, DETALLE:detail, IP_CLIENTE:'', FECHA_HORA:iso(), CREADO_EN:iso(), ELIMINADO:'NO'
    });
  }

  async function localRequest(action, payload) {
    await Promise.resolve();
    switch (action) {
      case 'health': return { service:'Sistema de Gestión de Flotas local', version:'1.1.0', now:iso() };
      case 'status': return {
        connected:true, needsSetup:activeRows(localDb.users).length === 0, spreadsheetName:'Base local del navegador',
        rows:{ users:activeRows(localDb.users).length, vehicles:activeRows(localDb.vehicles).length,
          drivers:activeRows(localDb.drivers).length, operations:activeRows(localDb.operations).length },
        company: cleanRow(activeRows(localDb.companies)[0] || null)
      };
      case 'bootstrap': {
        if (activeRows(localDb.users).length) throw new Error('SISTEMA_YA_INICIALIZADO');
        if (!payload.claveInstalacion) throw new Error('CLAVE_INSTALACION_REQUERIDA');
        if (!payload.nombre || !payload.correo || String(payload.contrasena || '').length < 8) throw new Error('DATOS_DE_ADMINISTRADOR_INVALIDOS');
        seedCatalogs();
        const salt = id('SALT');
        const user = {
          ID:id('USR'), NOMBRE:payload.nombre.trim(), CORREO:payload.correo.trim().toLowerCase(),
          SAL_CONTRASENA:salt, CONTRASENA_CIFRADA:await digest(payload.contrasena + ':' + salt), ROL_ID:'ROL-ADMIN',
          ESTADO:'Activo', TELEFONO:payload.telefono || '', ULTIMO_ACCESO:'', CREADO_EN:iso(), ACTUALIZADO_EN:iso(), ELIMINADO:'NO'
        };
        localDb.users.push(user); audit(user,'INSTALACION_INICIAL','SEGURIDAD','Administrador inicial creado',user.ID); saveLocal();
        return { initialized:true, user:publicUser(user) };
      }
      case 'login': {
        const email = String(payload.correo || '').trim().toLowerCase();
        const user = activeRows(localDb.users).find(row => row.CORREO === email && row.ESTADO === 'Activo');
        if (!user || user.CONTRASENA_CIFRADA !== await digest(String(payload.contrasena || '') + ':' + user.SAL_CONTRASENA)) throw new Error('CREDENCIALES_INVALIDAS');
        const token = id('TOKEN') + id('TOKEN');
        user.ULTIMO_ACCESO = iso(); user.ACTUALIZADO_EN = iso();
        localDb.sessions.push({ ID:id('SES'), USUARIO_ID:user.ID, FICHA_SESION_CIFRADA:await digest(token), FECHA_INICIO:iso(), FECHA_EXPIRACION:new Date(Date.now()+12*3600000).toISOString(), ACTIVA:'SI' });
        audit(user,'INICIO_SESION','SEGURIDAD','Inicio de sesión correcto',user.ID); saveLocal();
        setAuth({ token, user:publicUser(user) });
        return { token, user:publicUser(user), expiresAt:new Date(Date.now()+12*3600000).toISOString() };
      }
      case 'logout': {
        const user = currentLocalUser(); if (user) audit(user,'CIERRE_SESION','SEGURIDAD','Cierre de sesión',user.ID);
        setAuth({}); saveLocal(); return { loggedOut:true };
      }
      case 'me': return { user:publicUser(requireLocalUser()) };
      case 'dashboard': return panelPrincipalLocal();
      case 'list': return localList(payload);
      case 'get': {
        requireLocalUser(); const row = find(resourceMap[payload.resource], payload.id);
        if (!row) throw new Error('REGISTRO_NO_ENCONTRADO'); return { row:cleanRow(row), total:1 };
      }
      case 'create': return localCreate(payload);
      case 'update': return localUpdate(payload);
      case 'delete': return localDelete(payload);
      case 'startOperation': return localStartOperation(payload);
      case 'finishOperation': return localFinishOperation(payload);
      case 'saveLocation': return localSaveLocation(payload);
      case 'latestLocations': return localLatestLocations();
      case 'changePassword': return localChangePassword(payload);
      case 'saveCompany': return localSaveCompany(payload);
      case 'clearOperationalData': return localClear(payload);
      default: throw new Error('ACCION_NO_ENCONTRADA');
    }
  }

  function currentLocalUser() {
    return auth.user?.ID ? activeRows(localDb.users).find(row => row.ID === auth.user.ID) : null;
  }
  function requireLocalUser() {
    const user = currentLocalUser(); if (!user) throw new Error('AUTENTICACION_REQUERIDA'); return user;
  }
  function publicUser(user) {
    const role = localDb.roles.find(row => row.ID === user.ROL_ID);
    return { ID:user.ID,NOMBRE:user.NOMBRE,CORREO:user.CORREO,ROL_ID:user.ROL_ID,ROL_NOMBRE:role?.NOMBRE || user.ROL_ID,ESTADO:user.ESTADO,TELEFONO:user.TELEFONO || '',ULTIMO_ACCESO:user.ULTIMO_ACCESO || '' };
  }
  function cleanRow(row) {
    const out = { ...row }; delete out.CONTRASENA_CIFRADA; delete out.SAL_CONTRASENA; delete out.FICHA_SESION_CIFRADA; return out;
  }
  function localList(payload) {
    requireLocalUser(); const key = resourceMap[payload.resource]; if (!key) throw new Error('RECURSO_NO_ENCONTRADO');
    let rows = activeRows(localDb[key] || []).map(cleanRow);
    const filters = payload.filters || {};
    rows = rows.filter(row => Object.entries(filters).every(([k,v]) => !v || String(row[k] || '').toLowerCase() === String(v).toLowerCase()));
    return { rows, total:rows.length };
  }
  async function localCreate(payload) {
    const user = requireLocalUser(); const key = resourceMap[payload.resource]; if (!key) throw new Error('RECURSO_NO_ENCONTRADO');
    const data = { ...(payload.data || {}) }, now = iso();
    const prefixes = {users:'USR',vehicles:'VEH',drivers:'CON',operations:'OPE',gps:'GPS',history:'HIS',maintenance:'MAN',documents:'DOC',alerts:'ALT',reports:'REP',audit:'BIT',parameters:'PAR',companies:'EMP',qr:'QR',roles:'ROL',permissions:'PER'};
    if (key === 'users') {
      if (!data.CONTRASENA || String(data.CONTRASENA).length < 8) throw new Error('CONTRASENA_MINIMO_8');
      if (activeRows(localDb.users).some(row => row.CORREO === String(data.CORREO || '').toLowerCase())) throw new Error('CORREO_YA_EXISTE');
      const salt=id('SALT'); data.SAL_CONTRASENA=salt; data.CONTRASENA_CIFRADA=await digest(data.CONTRASENA+':'+salt); delete data.CONTRASENA;
      data.CORREO=String(data.CORREO || '').toLowerCase(); data.ESTADO=data.ESTADO || 'Activo'; data.ROL_ID=data.ROL_ID || 'ROL-CONDUCTOR';
    }
    if (key === 'vehicles') {
      data.PATENTE=String(data.PATENTE || '').toUpperCase(); data.ESTADO=data.ESTADO || 'Disponible';
      data.QR_CODIGO=data.QR_CODIGO || ('VEH-'+data.PATENTE.replace(/[^A-Z0-9]/g,''));
    }
    if (key === 'drivers') data.ESTADO=data.ESTADO || 'Disponible';
    if (key === 'documents') data.ESTADO=data.ESTADO || 'Vigente';
    const row={ ID:data.ID || id(prefixes[key] || 'ID'), ...data, CREADO_EN:now, ACTUALIZADO_EN:now, ELIMINADO:'NO' };
    localDb[key].push(row); audit(user,'CREAR',key.toUpperCase(),'Registro creado',row.ID); saveLocal(); return { row:cleanRow(row) };
  }
  async function localUpdate(payload) {
    const user=requireLocalUser(), key=resourceMap[payload.resource]; const row=find(key,payload.id); if(!row) throw new Error('REGISTRO_NO_ENCONTRADO');
    const data={...(payload.data||{})};
    if(key==='users' && data.CONTRASENA){const salt=id('SALT');row.SAL_CONTRASENA=salt;row.CONTRASENA_CIFRADA=await digest(data.CONTRASENA+':'+salt);delete data.CONTRASENA;}
    Object.assign(row,data,{ACTUALIZADO_EN:iso()}); audit(user,'ACTUALIZAR',key.toUpperCase(),'Registro actualizado',row.ID);saveLocal();return{row:cleanRow(row)};
  }
  function localDelete(payload) {
    const user=requireLocalUser(), key=resourceMap[payload.resource], row=find(key,payload.id); if(!row) throw new Error('REGISTRO_NO_ENCONTRADO');
    row.ELIMINADO='SI';row.ACTUALIZADO_EN=iso();audit(user,'ELIMINAR',key.toUpperCase(),'Registro eliminado',row.ID);saveLocal();return{id:row.ID};
  }
  function panelPrincipalLocal() {
    requireLocalUser(); const rows = key => activeRows(localDb[key]);
    return { metrics:{ vehicles:rows('vehicles').length,availableVehicles:rows('vehicles').filter(x=>x.ESTADO==='Disponible').length,drivers:rows('drivers').length,
      availableDrivers:rows('drivers').filter(x=>x.ESTADO==='Disponible').length,activeOperations:rows('operations').filter(x=>x.ESTADO==='Activa').length,
      openMaintenance:rows('maintenance').filter(x=>['Programada','En proceso','Atrasada'].includes(x.ESTADO)).length,
      expiredDocuments:rows('documents').filter(x=>x.ESTADO==='Vencido').length,unreadAlerts:rows('alerts').filter(x=>x.LEIDA!=='SI').length },
      recentOperations:rows('operations').slice(-10).reverse(), alerts:rows('alerts').filter(x=>x.LEIDA!=='SI').slice(-10).reverse() };
  }
  function localStartOperation(payload) {
    const user=requireLocalUser(), data=payload.data||payload, vehicle=find('vehicles',data.VEHICULO_ID), driver=find('drivers',data.CONDUCTOR_ID);
    if(!vehicle||vehicle.ESTADO!=='Disponible')throw new Error('VEHICULO_NO_DISPONIBLE');if(!driver||driver.ESTADO!=='Disponible')throw new Error('CONDUCTOR_NO_DISPONIBLE');
    const row={ID:id('OPE'),VEHICULO_ID:vehicle.ID,CONDUCTOR_ID:driver.ID,ORIGEN:data.ORIGEN||'Ubicación actual',DESTINO:data.DESTINO||'',FECHA_INICIO:iso(),FECHA_FIN:'',ESTADO:'Activa',KM_INICIO:Number(data.KM_INICIO||vehicle.KILOMETRAJE||0),KM_FIN:'',DISTANCIA_KM:0,OBSERVACIONES:data.OBSERVACIONES||'',CREADO_POR:user.ID,CREADO_EN:iso(),ACTUALIZADO_EN:iso(),ELIMINADO:'NO'};
    localDb.operations.push(row);vehicle.ESTADO='En ruta';driver.ESTADO='En viaje';localDb.history.push({ID:id('HIS'),OPERACION_ID:row.ID,EVENTO:'INICIO',DETALLE:'Operación iniciada',FECHA_HORA:iso(),USUARIO_ID:user.ID,CREADO_EN:iso(),ELIMINADO:'NO'});audit(user,'INICIAR','OPERACIONES','Operación iniciada',row.ID);saveLocal();return{row};
  }
  function localFinishOperation(payload) {
    const user=requireLocalUser(), row=find('operations',payload.id||payload.OPERACION_ID);if(!row||row.ESTADO!=='Activa')throw new Error('OPERACION_NO_ACTIVA');
    const kmEnd=Number(payload.KM_FIN||row.KM_INICIO||0);row.FECHA_FIN=iso();row.ESTADO='Finalizada';row.KM_FIN=kmEnd;row.DISTANCIA_KM=Math.max(0,kmEnd-Number(row.KM_INICIO||0));row.ACTUALIZADO_EN=iso();
    const vehicle=find('vehicles',row.VEHICULO_ID),driver=find('drivers',row.CONDUCTOR_ID);if(vehicle){vehicle.ESTADO='Disponible';vehicle.KILOMETRAJE=kmEnd;}if(driver)driver.ESTADO='Disponible';
    localDb.history.push({ID:id('HIS'),OPERACION_ID:row.ID,EVENTO:'FIN',DETALLE:'Operación finalizada',FECHA_HORA:iso(),USUARIO_ID:user.ID,CREADO_EN:iso(),ELIMINADO:'NO'});audit(user,'FINALIZAR','OPERACIONES','Operación finalizada',row.ID);saveLocal();return{row};
  }
  function localSaveLocation(payload) {
    const user=requireLocalUser(),data=payload.data||payload;let driverId=data.CONDUCTOR_ID||'';if(!driverId){const driver=activeRows(localDb.drivers).find(x=>x.USUARIO_ID===user.ID);if(driver)driverId=driver.ID;}
    let operationId=data.OPERACION_ID||'',vehicleId=data.VEHICULO_ID||'';const active=activeRows(localDb.operations).find(x=>x.CONDUCTOR_ID===driverId&&x.ESTADO==='Activa');if(active){operationId=operationId||active.ID;vehicleId=vehicleId||active.VEHICULO_ID;}
    const row={ID:id('GPS'),OPERACION_ID:operationId,CONDUCTOR_ID:driverId,VEHICULO_ID:vehicleId,LATITUD:Number(data.LATITUD),LONGITUD:Number(data.LONGITUD),PRECISION_METROS:Number(data.PRECISION_METROS||0),VELOCIDAD_KMH:Number(data.VELOCIDAD_KMH||0),RUMBO:Number(data.RUMBO||0),FECHA_HORA:data.FECHA_HORA||iso(),FUENTE:data.FUENTE||'GPS real',CREADO_EN:iso(),ELIMINADO:'NO'};
    localDb.gps.push(row);if(localDb.gps.length>5000)localDb.gps=localDb.gps.slice(-5000);saveLocal();return{row};
  }
  function localLatestLocations() {
    requireLocalUser();const latest={};activeRows(localDb.gps).sort((a,b)=>new Date(b.FECHA_HORA)-new Date(a.FECHA_HORA)).forEach(row=>{const key=row.CONDUCTOR_ID||row.VEHICULO_ID||row.ID;if(!latest[key])latest[key]=row;});
    const rows=Object.values(latest).map(row=>({...row,CONDUCTOR_NOMBRE:find('drivers',row.CONDUCTOR_ID)?.NOMBRE||'',VEHICULO_PATENTE:find('vehicles',row.VEHICULO_ID)?.PATENTE||''}));return{rows,total:rows.length};
  }
  function localSaveCompany(payload){
    const user=requireLocalUser();
    if(user.ROL_ID!=='ROL-ADMIN')throw new Error('PERMISO_DENEGADO');
    const data={...(payload.data||{})};
    let row=activeRows(localDb.companies)[0];
    if(!row){
      row={ID:id('EMP'),CREADO_EN:iso(),ELIMINADO:'NO'};
      localDb.companies.push(row);
    }
    if(payload.logotipoBase64){
      data.DIRECCION_LOGOTIPO=String(payload.logotipoBase64);
      data.NOMBRE_ARCHIVO_LOGOTIPO=String(payload.nombreLogotipo||'logotipo');
      data.TIPO_ARCHIVO_LOGOTIPO=String(payload.tipoLogotipo||'image/png');
    }
    if(payload.eliminarLogotipo==='SI'){
      data.DIRECCION_LOGOTIPO='';data.NOMBRE_ARCHIVO_LOGOTIPO='';data.TIPO_ARCHIVO_LOGOTIPO='';data.ID_ARCHIVO_LOGOTIPO='';
    }
    Object.assign(row,data,{ESTADO:data.ESTADO||row.ESTADO||'Activo',ACTUALIZADO_EN:iso()});
    audit(user,'ACTUALIZAR','EMPRESA','Configuración de empresa guardada',row.ID);
    saveLocal();
    return {row:cleanRow(row)};
  }

  async function localChangePassword(payload){const user=requireLocalUser();if(user.CONTRASENA_CIFRADA!==await digest(payload.contrasenaActual+':'+user.SAL_CONTRASENA))throw new Error('CONTRASENA_ACTUAL_INVALIDA');if(String(payload.nuevaContrasena||'').length<8)throw new Error('CONTRASENA_MINIMO_8');const salt=id('SALT');user.SAL_CONTRASENA=salt;user.CONTRASENA_CIFRADA=await digest(payload.nuevaContrasena+':'+salt);user.ACTUALIZADO_EN=iso();saveLocal();return{changed:true};}
  function localClear(payload){const user=requireLocalUser();if(user.ROL_ID!=='ROL-ADMIN')throw new Error('PERMISO_DENEGADO');if(payload.confirmacion!=='LIMPIAR DATOS')throw new Error('CONFIRMACION_REQUERIDA');['vehicles','drivers','operations','gps','history','maintenance','documents','alerts','reports','audit','qr'].forEach(key=>localDb[key]=[]);audit(user,'LIMPIAR','CONFIGURACION','Datos operativos eliminados; empresa y usuarios conservados');saveLocal();return{cleared:true};}

  window.ConexionFlotas = {
    request,
    isRemote,
    backendLabel,
    getAuth: () => ({ ...auth }),
    setAuth,
    reloadLocal: () => { localDb = loadLocal(); },
  };
  })();
