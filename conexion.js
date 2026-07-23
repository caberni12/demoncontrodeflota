(function () {
  'use strict';

  const config = window.CONFIGURACION_FLOTAS;
  const accionesAplicacion = Object.freeze({
    health:'salud', status:'estadoSistema', bootstrap:'instalacionInicial', login:'iniciarSesion',
    logout:'cerrarSesion', me:'miSesion', dashboard:'panelPrincipal', list:'listar', get:'obtener',
    create:'crear', update:'actualizar', delete:'eliminar', startOperation:'iniciarOperacion',
    finishOperation:'finalizarOperacion', saveLocation:'guardarUbicacion', latestLocations:'ultimasUbicaciones',
    changePassword:'cambiarContrasena', saveCompany:'guardarEmpresa', clearOperationalData:'limpiarDatosOperativos',
    assignRoute:'asignarRuta', updateRouteStatus:'actualizarEstadoRuta', sendNotification:'enviarNotificacion',
    readNotification:'marcarNotificacionLeida', heartbeat:'actualizarConexion', realtimeSummary:'resumenTiempoReal',
    validateVehicleQr:'validarQrVehiculo'
  });
  const recursosAplicacion = Object.freeze({
    users:'usuarios', roles:'roles', permissions:'permisos', vehicles:'vehiculos', drivers:'conductores',
    operations:'operaciones', gps:'gps', history:'historial', maintenance:'mantenciones', documents:'documentos',
    alerts:'alertas', reports:'reportes', audit:'bitacora', parameters:'parametros', companies:'empresas', qr:'qr',
    routes:'rutas', notifications:'notificaciones', connections:'conexiones'
  });

  const resourceMap = {
    users: 'users', roles: 'roles', permissions: 'permissions', vehicles: 'vehicles',
    drivers: 'drivers', operations: 'operations', gps: 'gps', history: 'history',
    maintenance: 'maintenance', documents: 'documents', alerts: 'alerts', reports: 'reports',
    audit: 'audit', parameters: 'parameters', companies: 'companies', qr: 'qr',
    routes: 'routes', notifications: 'notifications', connections: 'connections'
  };

  const emptyState = () => ({
    version: 2,
    users: [], roles: [], permissions: [], vehicles: [], drivers: [], operations: [], gps: [],
    history: [], maintenance: [], documents: [], alerts: [], reports: [], audit: [], parameters: [],
    companies: [], qr: [], routes: [], notifications: [], connections: [], sessions: []
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
  const qrAuthorizations = new Map();

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
    const now = iso();
    const roles = [
      { ID:'ROL-ADMIN', NOMBRE:'Administrador', DESCRIPCION:'Acceso completo', ESTADO:'Activo', CREADO_EN:now, ACTUALIZADO_EN:now, ELIMINADO:'NO' },
      { ID:'ROL-SUPERVISOR', NOMBRE:'Supervisor', DESCRIPCION:'Gestión operacional', ESTADO:'Activo', CREADO_EN:now, ACTUALIZADO_EN:now, ELIMINADO:'NO' },
      { ID:'ROL-CONDUCTOR', NOMBRE:'Conductor', DESCRIPCION:'Operaciones, rutas, GPS y notificaciones propias', ESTADO:'Activo', CREADO_EN:now, ACTUALIZADO_EN:now, ELIMINADO:'NO' }
    ];
    roles.forEach(role => { if (!activeRows(localDb.roles).some(row => row.ID === role.ID)) localDb.roles.push(role); });
    const allModules=['PANEL_PRINCIPAL','USUARIOS','VEHICULOS','CONDUCTORES','OPERACIONES','GPS','HISTORIAL','MANTENCIONES','DOCUMENTOS','ALERTAS','REPORTES','BITACORA','CONFIGURACION','QR','RUTAS','NOTIFICACIONES','CONEXIONES'];
    const actions=['LEER','CREAR','ACTUALIZAR','ELIMINAR'];
    const supervisorModules=new Set(['PANEL_PRINCIPAL','VEHICULOS','CONDUCTORES','OPERACIONES','GPS','HISTORIAL','MANTENCIONES','DOCUMENTOS','ALERTAS','REPORTES','QR','RUTAS','NOTIFICACIONES','CONEXIONES']);
    const driverRules={
      PANEL_PRINCIPAL:['LEER'],VEHICULOS:['LEER'],CONDUCTORES:['LEER'],OPERACIONES:['LEER','CREAR','ACTUALIZAR'],
      GPS:['LEER','CREAR'],HISTORIAL:['LEER'],DOCUMENTOS:['LEER'],ALERTAS:['LEER','ACTUALIZAR'],QR:['LEER','ACTUALIZAR'],
      RUTAS:['LEER','ACTUALIZAR'],NOTIFICACIONES:['LEER','ACTUALIZAR'],CONEXIONES:['LEER','CREAR','ACTUALIZAR']
    };
    const ensure=(role,module,action,allowed)=>{
      if(!activeRows(localDb.permissions).some(row=>row.ROL_ID===role&&row.MODULO===module&&row.ACCION===action)){
        localDb.permissions.push({ID:id('PER'),ROL_ID:role,MODULO:module,ACCION:action,PERMITIDO:allowed?'SI':'NO',CREADO_EN:now,ACTUALIZADO_EN:now,ELIMINADO:'NO'});
      }
    };
    allModules.forEach(module=>actions.forEach(action=>ensure('ROL-ADMIN',module,action,true)));
    allModules.forEach(module=>actions.forEach(action=>ensure('ROL-SUPERVISOR',module,action,supervisorModules.has(module)&&action!=='ELIMINAR')));
    allModules.forEach(module=>actions.forEach(action=>ensure('ROL-CONDUCTOR',module,action,(driverRules[module]||[]).includes(action))));
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
      case 'health': return { service:'Sistema de Gestión de Flotas local', version:'2.2.0', now:iso() };
      case 'status': return {
        connected:true, needsSetup:activeRows(localDb.users).length === 0, spreadsheetName:'Base local del navegador',
        rows:{ users:activeRows(localDb.users).length, vehicles:activeRows(localDb.vehicles).length,
          drivers:activeRows(localDb.drivers).length, operations:activeRows(localDb.operations).length },
        company: cleanRow(activeRows(localDb.companies)[0] || null)
      };
      case 'bootstrap': {
        if (activeRows(localDb.users).length) throw new Error('SISTEMA_YA_INICIALIZADO');
        if (!payload.claveInstalacion) throw new Error('CLAVE_INSTALACION_REQUERIDA');
        if (!payload.nombre || !payload.correo || String(payload.contrasena ?? '').length === 0) throw new Error('DATOS_DE_ADMINISTRADOR_INVALIDOS');
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
        seedCatalogs();
        const email = String(payload.correo || '').trim().toLowerCase();
        const user = activeRows(localDb.users).find(row => row.CORREO === email && row.ESTADO === 'Activo');
        if (!user || user.CONTRASENA_CIFRADA !== await digest(String(payload.contrasena || '') + ':' + user.SAL_CONTRASENA)) throw new Error('CREDENCIALES_INVALIDAS');
        const token = id('TOKEN') + id('TOKEN');
        user.ULTIMO_ACCESO = iso(); user.ACTUALIZADO_EN = iso();
        const sessionRow={ ID:id('SES'), USUARIO_ID:user.ID, FICHA_SESION_CIFRADA:await digest(token), FECHA_INICIO:iso(), FECHA_EXPIRACION:new Date(Date.now()+12*3600000).toISOString(), ACTIVA:'SI' };
        localDb.sessions.push(sessionRow);
        audit(user,'INICIO_SESION','SEGURIDAD','Inicio de sesión correcto',user.ID); saveLocal();
        setAuth({ token, sessionId:sessionRow.ID, user:publicUser(user) });
        return { token, sessionId:sessionRow.ID, user:publicUser(user), expiresAt:new Date(Date.now()+12*3600000).toISOString() };
      }
      case 'logout': {
        const user=currentLocalUser(),sessionId=auth.sessionId||'';if(user){audit(user,'CIERRE_SESION','SEGURIDAD','Cierre de sesión',user.ID);const session=find('sessions',sessionId);if(session){session.ACTIVA='NO';session.ULTIMO_USO=iso();}activeRows(localDb.connections).filter(row=>row.SESION_ID===sessionId).forEach(row=>{row.ESTADO='Desconectado';row.ACTIVIDAD='Inactivo';row.PAGINA_VISIBLE='NO';row.ULTIMA_CONEXION=iso();row.ACTUALIZADO_EN=iso();});}
        setAuth({}); saveLocal(); return { loggedOut:true };
      }
      case 'me': seedCatalogs(); return { user:publicUser(requireLocalUser()) };
      case 'dashboard': return panelPrincipalLocal();
      case 'list': return localList(payload);
      case 'get': {
        const user=requireLocalUser(),key=resourceMap[payload.resource];requireLocalPermission(user,moduleByResource[key],'LEER');const row = find(key, payload.id);
        if (!row) throw new Error('REGISTRO_NO_ENCONTRADO'); if(!localFilterRows(key,[row],user).length)throw new Error('PERMISO_DENEGADO');return { row:cleanRow(row), total:1 };
      }
      case 'create': return localCreate(payload);
      case 'update': return localUpdate(payload);
      case 'delete': return localDelete(payload);
      case 'startOperation': return localStartOperation(payload);
      case 'finishOperation': return localFinishOperation(payload);
      case 'validateVehicleQr': return localValidateVehicleQr(payload);
      case 'saveLocation': return localSaveLocation(payload);
      case 'latestLocations': return localLatestLocations();
      case 'assignRoute': return localAssignRoute(payload);
      case 'updateRouteStatus': return localUpdateRouteStatus(payload);
      case 'sendNotification': return localSendNotification(payload);
      case 'readNotification': return localReadNotification(payload);
      case 'heartbeat': return localHeartbeat(payload);
      case 'realtimeSummary': return localRealtimeSummary();
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
  const moduleByResource={
    users:'USUARIOS',roles:'USUARIOS',permissions:'USUARIOS',vehicles:'VEHICULOS',drivers:'CONDUCTORES',
    operations:'OPERACIONES',gps:'GPS',history:'HISTORIAL',maintenance:'MANTENCIONES',documents:'DOCUMENTOS',
    alerts:'ALERTAS',reports:'REPORTES',audit:'BITACORA',parameters:'CONFIGURACION',companies:'CONFIGURACION',
    qr:'QR',routes:'RUTAS',notifications:'NOTIFICACIONES',connections:'CONEXIONES'
  };
  function hasLocalPermission(user,module,action) {
    if(user?.ROL_ID==='ROL-ADMIN')return true;
    return activeRows(localDb.permissions).some(row=>row.ROL_ID===user?.ROL_ID&&row.MODULO===module&&row.ACCION===action&&row.PERMITIDO==='SI');
  }
  function requireLocalPermission(user,module,action){if(!hasLocalPermission(user,module,action))throw new Error('PERMISO_DENEGADO');}
  function localDriver(user){return activeRows(localDb.drivers).find(row=>row.USUARIO_ID===user?.ID)||null;}
  function localFilterRows(key,rows,user) {
    if(user.ROL_ID!=='ROL-CONDUCTOR')return rows;
    const driver=localDriver(user);
    if(key==='notifications')return rows.filter(row=>row.DESTINATARIO_USUARIO_ID===user.ID||(driver&&row.DESTINATARIO_CONDUCTOR_ID===driver.ID));
    if(key==='connections')return rows.filter(row=>row.USUARIO_ID===user.ID);
    if(!driver&&['drivers','vehicles','operations','gps','routes','history','documents','maintenance'].includes(key))return[];
    if(key==='drivers')return rows.filter(row=>row.ID===driver.ID);
    if(['operations','gps','routes'].includes(key))return rows.filter(row=>row.CONDUCTOR_ID===driver.ID);
    const ownOperations=activeRows(localDb.operations).filter(row=>row.CONDUCTOR_ID===driver.ID);
    const ownRoutes=activeRows(localDb.routes).filter(row=>row.CONDUCTOR_ID===driver.ID);
    const vehicleIds=new Set([...ownOperations,...ownRoutes].map(row=>row.VEHICULO_ID).filter(Boolean));
    if(key==='vehicles')return rows.filter(row=>vehicleIds.has(row.ID));
    if(key==='maintenance')return rows.filter(row=>vehicleIds.has(row.VEHICULO_ID));
    if(key==='history'){const operationIds=new Set(ownOperations.map(row=>row.ID));return rows.filter(row=>operationIds.has(row.OPERACION_ID));}
    if(key==='documents')return rows.filter(row=>(row.ASOCIADO_TIPO==='Conductor'&&row.ASOCIADO_ID===driver.ID)||(row.ASOCIADO_TIPO==='Vehículo'&&vehicleIds.has(row.ASOCIADO_ID)));
    if(key==='alerts')return rows.filter(row=>!row.USUARIO_ID||row.USUARIO_ID===user.ID);
    return rows;
  }
  function publicUser(user) {
    const role = localDb.roles.find(row => row.ID === user.ROL_ID);
    const permissions=user.ROL_ID==='ROL-ADMIN'?['*:*']:activeRows(localDb.permissions).filter(row=>row.ROL_ID===user.ROL_ID&&row.PERMITIDO==='SI').map(row=>`${row.MODULO}:${row.ACCION}`);
    return { ID:user.ID,NOMBRE:user.NOMBRE,CORREO:user.CORREO,ROL_ID:user.ROL_ID,ROL_NOMBRE:role?.NOMBRE || user.ROL_ID,ESTADO:user.ESTADO,
      TELEFONO:user.TELEFONO || '',ULTIMO_ACCESO:user.ULTIMO_ACCESO || '',CONDUCTOR_ID:localDriver(user)?.ID||'',PERMISOS:permissions };
  }
  function cleanRow(row) {
    const out = { ...row }; delete out.CONTRASENA_CIFRADA; delete out.SAL_CONTRASENA; delete out.FICHA_SESION_CIFRADA; return out;
  }
  function localList(payload) {
    const user=requireLocalUser(); const key = resourceMap[payload.resource]; if (!key) throw new Error('RECURSO_NO_ENCONTRADO');
    requireLocalPermission(user,moduleByResource[key],'LEER');
    let rows = localFilterRows(key,activeRows(localDb[key] || []),user).map(cleanRow);
    const filters = payload.filters || {};
    rows = rows.filter(row => Object.entries(filters).every(([k,v]) => !v || String(row[k] || '').toLowerCase() === String(v).toLowerCase()));
    return { rows, total:rows.length };
  }
  async function localCreate(payload) {
    const user = requireLocalUser(); const key = resourceMap[payload.resource]; if (!key) throw new Error('RECURSO_NO_ENCONTRADO');
    requireLocalPermission(user,moduleByResource[key],'CREAR');
    if(user.ROL_ID==='ROL-CONDUCTOR'){if(key==='operations')return localStartOperation(payload);if(key==='gps')return localSaveLocation(payload);if(key==='connections')throw new Error('ACCION_ESPECIAL_REQUERIDA');}
    const data = { ...(payload.data || {}) }, now = iso();
    const prefixes = {users:'USR',vehicles:'VEH',drivers:'CON',operations:'OPE',gps:'GPS',history:'HIS',maintenance:'MAN',documents:'DOC',alerts:'ALT',reports:'REP',audit:'BIT',parameters:'PAR',companies:'EMP',qr:'QR',roles:'ROL',permissions:'PER',routes:'RUT',notifications:'NOT',connections:'CNX'};
    if (key === 'users') {
      if (String(data.CONTRASENA ?? '').length === 0) throw new Error('CONTRASENA_REQUERIDA');
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
    requireLocalPermission(user,moduleByResource[key],'ACTUALIZAR');if(!localFilterRows(key,[row],user).length)throw new Error('PERMISO_DENEGADO');
    const data={...(payload.data||{})};
    if(user.ROL_ID==='ROL-CONDUCTOR'){if(key==='routes')return localUpdateRouteStatus({id:payload.id,ESTADO:data.ESTADO});if(key==='notifications'){if(data.LEIDA!=='SI')throw new Error('PERMISO_DENEGADO');return localReadNotification({id:payload.id});}if(key==='alerts'&&Object.keys(data).some(field=>field!=='LEIDA'))throw new Error('PERMISO_DENEGADO');if(['operations','connections'].includes(key))throw new Error('ACCION_ESPECIAL_REQUERIDA');}
    if(key==='users' && data.CONTRASENA){const salt=id('SALT');row.SAL_CONTRASENA=salt;row.CONTRASENA_CIFRADA=await digest(data.CONTRASENA+':'+salt);delete data.CONTRASENA;}
    Object.assign(row,data,{ACTUALIZADO_EN:iso()}); audit(user,'ACTUALIZAR',key.toUpperCase(),'Registro actualizado',row.ID);saveLocal();return{row:cleanRow(row)};
  }
  function localDelete(payload) {
    const user=requireLocalUser(), key=resourceMap[payload.resource], row=find(key,payload.id); if(!row) throw new Error('REGISTRO_NO_ENCONTRADO');
    requireLocalPermission(user,moduleByResource[key],'ELIMINAR');if(!localFilterRows(key,[row],user).length)throw new Error('PERMISO_DENEGADO');
    row.ELIMINADO='SI';row.ACTUALIZADO_EN=iso();audit(user,'ELIMINAR',key.toUpperCase(),'Registro eliminado',row.ID);saveLocal();return{id:row.ID};
  }
  function panelPrincipalLocal() {
    const user=requireLocalUser();requireLocalPermission(user,'PANEL_PRINCIPAL','LEER');const rows = key => hasLocalPermission(user,moduleByResource[key],'LEER')?localFilterRows(key,activeRows(localDb[key]),user):[];
    const onlineLimit=Date.now()-(config.ANTIGUEDAD_CONEXION_ACTIVA_MILISEGUNDOS||90000);
    const operations=rows('operations'),vehicles=rows('vehicles'),operationCounts={};
    operations.forEach(row=>{const date=new Date(row.FECHA_INICIO||row.CREADO_EN);if(!Number.isNaN(date.getTime())){const key=date.toISOString().slice(0,10);operationCounts[key]=(operationCounts[key]||0)+1;}});
    const operationsByDay=Array.from({length:7},(_,index)=>{const date=new Date();date.setDate(date.getDate()-(6-index));const key=date.toISOString().slice(0,10);return{FECHA:key,ETIQUETA:new Intl.DateTimeFormat('es-CL',{weekday:'short'}).format(date).replace('.',''),TOTAL:operationCounts[key]||0};});
    const countStates=list=>Object.entries(list.reduce((acc,row)=>{const state=row.ESTADO||'Sin estado';acc[state]=(acc[state]||0)+1;return acc;},{})).map(([ESTADO,TOTAL])=>({ESTADO,TOTAL})).sort((a,b)=>b.TOTAL-a.TOTAL);
    return { metrics:{ vehicles:rows('vehicles').length,availableVehicles:rows('vehicles').filter(x=>x.ESTADO==='Disponible').length,drivers:rows('drivers').length,
      availableDrivers:rows('drivers').filter(x=>x.ESTADO==='Disponible').length,activeOperations:rows('operations').filter(x=>x.ESTADO==='Activa').length,
      openMaintenance:rows('maintenance').filter(x=>['Programada','En proceso','Atrasada'].includes(x.ESTADO)).length,
      expiredDocuments:rows('documents').filter(x=>x.ESTADO==='Vencido').length,unreadAlerts:rows('alerts').filter(x=>x.LEIDA!=='SI').length,
      assignedRoutes:rows('routes').filter(x=>['Asignada','En curso'].includes(x.ESTADO)).length,
      unreadNotifications:rows('notifications').filter(x=>x.LEIDA!=='SI').length,
      onlineDevices:rows('connections').filter(x=>x.ESTADO!=='Desconectado'&&new Date(x.ULTIMA_CONEXION).getTime()>=onlineLimit).length },
      recentOperations:rows('operations').slice(-10).reverse(), alerts:rows('alerts').filter(x=>x.LEIDA!=='SI').slice(-10).reverse(),
      notifications:rows('notifications').filter(x=>x.LEIDA!=='SI').slice(-10).reverse(),routes:rows('routes').slice(-10).reverse(),
      charts:{operationsByDay,vehicleStates:countStates(vehicles),routeStates:countStates(rows('routes'))} };
  }
  function localStartOperation(payload) {
    const user=requireLocalUser(), data={...(payload.data||payload)};requireLocalPermission(user,'OPERACIONES','CREAR');
    if(user.ROL_ID==='ROL-CONDUCTOR'){const own=localDriver(user);if(!own)throw new Error('CONDUCTOR_NO_ASOCIADO');data.CONDUCTOR_ID=own.ID;const authorization=qrAuthorizations.get(data.AUTORIZACION_QR);if(!authorization||authorization.USUARIO_ID!==user.ID||authorization.VEHICULO_ID!==data.VEHICULO_ID||authorization.EXPIRA<Date.now())throw new Error('AUTORIZACION_QR_INVALIDA');qrAuthorizations.delete(data.AUTORIZACION_QR);}
    const vehicle=find('vehicles',data.VEHICULO_ID), driver=find('drivers',data.CONDUCTOR_ID);
    if(!vehicle||vehicle.ESTADO!=='Disponible')throw new Error('VEHICULO_NO_DISPONIBLE');if(!driver||driver.ESTADO!=='Disponible')throw new Error('CONDUCTOR_NO_DISPONIBLE');
    const row={ID:id('OPE'),VEHICULO_ID:vehicle.ID,CONDUCTOR_ID:driver.ID,ORIGEN:data.ORIGEN||'Ubicación actual',DESTINO:data.DESTINO||'',FECHA_INICIO:iso(),FECHA_FIN:'',ESTADO:'Activa',KM_INICIO:Number(data.KM_INICIO||vehicle.KILOMETRAJE||0),KM_FIN:'',DISTANCIA_KM:0,OBSERVACIONES:data.OBSERVACIONES||'',CREADO_POR:user.ID,CREADO_EN:iso(),ACTUALIZADO_EN:iso(),ELIMINADO:'NO'};
    localDb.operations.push(row);vehicle.ESTADO='En ruta';driver.ESTADO='En viaje';localDb.history.push({ID:id('HIS'),OPERACION_ID:row.ID,EVENTO:'INICIO',DETALLE:'Operación iniciada',FECHA_HORA:iso(),USUARIO_ID:user.ID,CREADO_EN:iso(),ELIMINADO:'NO'});audit(user,'INICIAR','OPERACIONES','Operación iniciada',row.ID);saveLocal();return{row};
  }
  function localFinishOperation(payload) {
    const user=requireLocalUser(), row=find('operations',payload.id||payload.OPERACION_ID);requireLocalPermission(user,'OPERACIONES','ACTUALIZAR');if(!row||row.ESTADO!=='Activa')throw new Error('OPERACION_NO_ACTIVA');if(!localFilterRows('operations',[row],user).length)throw new Error('PERMISO_DENEGADO');
    const kmEnd=Number(payload.KM_FIN||row.KM_INICIO||0);row.FECHA_FIN=iso();row.ESTADO='Finalizada';row.KM_FIN=kmEnd;row.DISTANCIA_KM=Math.max(0,kmEnd-Number(row.KM_INICIO||0));row.ACTUALIZADO_EN=iso();
    const vehicle=find('vehicles',row.VEHICULO_ID),driver=find('drivers',row.CONDUCTOR_ID);if(vehicle){vehicle.ESTADO='Disponible';vehicle.KILOMETRAJE=kmEnd;}if(driver)driver.ESTADO='Disponible';
    localDb.history.push({ID:id('HIS'),OPERACION_ID:row.ID,EVENTO:'FIN',DETALLE:'Operación finalizada',FECHA_HORA:iso(),USUARIO_ID:user.ID,CREADO_EN:iso(),ELIMINADO:'NO'});audit(user,'FINALIZAR','OPERACIONES','Operación finalizada',row.ID);saveLocal();return{row};
  }
  function localValidateVehicleQr(payload){
    const user=requireLocalUser();requireLocalPermission(user,'QR','LEER');const normalized=String(payload.codigo||payload.CODIGO||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    const vehicle=activeRows(localDb.vehicles).find(row=>String(row.QR_CODIGO||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===normalized||String(row.PATENTE||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===normalized);
    if(!vehicle)throw new Error('QR_NO_RECONOCIDO');if(vehicle.ESTADO!=='Disponible')throw new Error('VEHICULO_NO_DISPONIBLE');const authorization=id('QR-AUT');qrAuthorizations.set(authorization,{USUARIO_ID:user.ID,VEHICULO_ID:vehicle.ID,EXPIRA:Date.now()+300000});audit(user,'VALIDAR','QR',`Vehículo validado: ${vehicle.PATENTE}`,vehicle.ID);saveLocal();return{row:cleanRow(vehicle),autorizacionQr:authorization,validaPorSegundos:300};
  }
  function localSaveLocation(payload) {
    const user=requireLocalUser(),data=payload.data||payload;requireLocalPermission(user,'GPS','CREAR');let driverId=data.CONDUCTOR_ID||'';if(user.ROL_ID==='ROL-CONDUCTOR')driverId=localDriver(user)?.ID||'';if(!driverId){const driver=activeRows(localDb.drivers).find(x=>x.USUARIO_ID===user.ID);if(driver)driverId=driver.ID;}
    let operationId=data.OPERACION_ID||'',vehicleId=data.VEHICULO_ID||'';const active=activeRows(localDb.operations).find(x=>x.CONDUCTOR_ID===driverId&&x.ESTADO==='Activa');if(active){operationId=operationId||active.ID;vehicleId=vehicleId||active.VEHICULO_ID;}
    const row={ID:id('GPS'),OPERACION_ID:operationId,CONDUCTOR_ID:driverId,VEHICULO_ID:vehicleId,LATITUD:Number(data.LATITUD),LONGITUD:Number(data.LONGITUD),
      DIRECCION:data.DIRECCION||`${Number(data.LATITUD).toFixed(6)}, ${Number(data.LONGITUD).toFixed(6)}`,PRECISION_METROS:Number(data.PRECISION_METROS||0),
      VELOCIDAD_KMH:Number(data.VELOCIDAD_KMH||0),RUMBO:Number(data.RUMBO||0),BATERIA_PORCENTAJE:data.BATERIA_PORCENTAJE??'',DISPOSITIVO_ID:data.DISPOSITIVO_ID||'',
      FECHA_HORA:data.FECHA_HORA||iso(),FUENTE:data.FUENTE||'GPS real',CREADO_EN:iso(),ELIMINADO:'NO'};
    localDb.gps.push(row);if(localDb.gps.length>5000)localDb.gps=localDb.gps.slice(-5000);if(data.DISPOSITIVO_ID)localHeartbeat({data});saveLocal();return{row};
  }
  function localLatestLocations() {
    const user=requireLocalUser();requireLocalPermission(user,'GPS','LEER');const latest={};localFilterRows('gps',activeRows(localDb.gps),user).sort((a,b)=>new Date(b.FECHA_HORA)-new Date(a.FECHA_HORA)).forEach(row=>{const key=row.CONDUCTOR_ID||row.VEHICULO_ID||row.ID;if(!latest[key])latest[key]=row;});
    const rows=Object.values(latest).map(row=>({...row,CONDUCTOR_NOMBRE:find('drivers',row.CONDUCTOR_ID)?.NOMBRE||'',VEHICULO_PATENTE:find('vehicles',row.VEHICULO_ID)?.PATENTE||''}));return{rows,total:rows.length};
  }
  function localAssignRoute(payload){
    const user=requireLocalUser(),data=payload.data||payload;requireLocalPermission(user,'RUTAS','CREAR');
    const driver=find('drivers',data.CONDUCTOR_ID),vehicle=data.VEHICULO_ID?find('vehicles',data.VEHICULO_ID):null;
    if(!driver)throw new Error('CONDUCTOR_NO_ENCONTRADO');if(data.VEHICULO_ID&&!vehicle)throw new Error('VEHICULO_NO_ENCONTRADO');if(!data.DESTINO)throw new Error('CAMPO_REQUERIDO_DESTINO');
    const now=iso(),route={ID:id('RUT'),NOMBRE:data.NOMBRE||`Ruta a ${data.DESTINO}`,CONDUCTOR_ID:driver.ID,VEHICULO_ID:vehicle?.ID||'',OPERACION_ID:data.OPERACION_ID||'',
      ORIGEN:data.ORIGEN||'Ubicación actual',ORIGEN_LATITUD:data.ORIGEN_LATITUD||'',ORIGEN_LONGITUD:data.ORIGEN_LONGITUD||'',DESTINO:data.DESTINO,
      DESTINO_LATITUD:data.DESTINO_LATITUD||'',DESTINO_LONGITUD:data.DESTINO_LONGITUD||'',PARADAS_CODIFICADAS:data.PARADAS_CODIFICADAS||'',
      PROVEEDOR_NAVEGACION:['Google Maps','Waze'].includes(data.PROVEEDOR_NAVEGACION)?data.PROVEEDOR_NAVEGACION:'Google Maps',ESTADO:'Asignada',
      INSTRUCCIONES:data.INSTRUCCIONES||'',FECHA_ASIGNACION:now,FECHA_INICIO:'',FECHA_FIN:'',CREADO_POR:user.ID,CREADO_EN:now,ACTUALIZADO_EN:now,ELIMINADO:'NO'};
    localDb.routes.push(route);const notification=localCreateNotification({DESTINATARIO_USUARIO_ID:driver.USUARIO_ID||'',DESTINATARIO_CONDUCTOR_ID:driver.ID,
      TITULO:'Nueva ruta asignada',MENSAJE:`${route.NOMBRE}: ${route.ORIGEN} → ${route.DESTINO}`,TIPO:'Ruta',PRIORIDAD:data.PRIORIDAD||'Alta',RUTA_ID:route.ID,OPERACION_ID:route.OPERACION_ID,CREADO_POR:user.ID});
    audit(user,'ASIGNAR','RUTAS',`Ruta asignada a ${driver.NOMBRE}`,route.ID);saveLocal();return{row:route,notification};
  }
  function localUpdateRouteStatus(payload){
    const user=requireLocalUser(),route=find('routes',payload.id||payload.RUTA_ID);requireLocalPermission(user,'RUTAS','ACTUALIZAR');
    if(!route)throw new Error('RUTA_NO_ENCONTRADA');if(!localFilterRows('routes',[route],user).length)throw new Error('PERMISO_DENEGADO');
    const state=payload.ESTADO||payload.data?.ESTADO;if(!['Asignada','En curso','Completada','Cancelada'].includes(state))throw new Error('ESTADO_RUTA_INVALIDO');
    if(user.ROL_ID==='ROL-CONDUCTOR'&&!['En curso','Completada'].includes(state))throw new Error('PERMISO_DENEGADO');
    route.ESTADO=state;if(state==='En curso'&&!route.FECHA_INICIO)route.FECHA_INICIO=iso();if(['Completada','Cancelada'].includes(state))route.FECHA_FIN=iso();route.ACTUALIZADO_EN=iso();
    audit(user,'CAMBIAR_ESTADO','RUTAS',`Estado: ${state}`,route.ID);saveLocal();return{row:route};
  }
  function localCreateNotification(data){
    const now=iso(),row={ID:id('NOT'),DESTINATARIO_USUARIO_ID:data.DESTINATARIO_USUARIO_ID||'',DESTINATARIO_CONDUCTOR_ID:data.DESTINATARIO_CONDUCTOR_ID||'',
      TITULO:data.TITULO,MENSAJE:data.MENSAJE,TIPO:data.TIPO||'Información',PRIORIDAD:data.PRIORIDAD||'Normal',RUTA_ID:data.RUTA_ID||'',OPERACION_ID:data.OPERACION_ID||'',
      LEIDA:'NO',FECHA_ENVIO:now,FECHA_LECTURA:'',CREADO_POR:data.CREADO_POR||'',CREADO_EN:now,ACTUALIZADO_EN:now,ELIMINADO:'NO'};localDb.notifications.push(row);return row;
  }
  function localSendNotification(payload){
    const user=requireLocalUser(),data=payload.data||payload;requireLocalPermission(user,'NOTIFICACIONES','CREAR');if(!data.TITULO||!data.MENSAJE)throw new Error('DATOS_NOTIFICACION_REQUERIDOS');
    let driverId=data.DESTINATARIO_CONDUCTOR_ID||'',userId=data.DESTINATARIO_USUARIO_ID||'';if(driverId){const driver=find('drivers',driverId);if(!driver)throw new Error('CONDUCTOR_NO_ENCONTRADO');userId=userId||driver.USUARIO_ID||'';}
    if(!driverId&&!userId)throw new Error('DESTINATARIO_REQUERIDO');const row=localCreateNotification({...data,DESTINATARIO_CONDUCTOR_ID:driverId,DESTINATARIO_USUARIO_ID:userId,CREADO_POR:user.ID});
    audit(user,'ENVIAR','NOTIFICACIONES',row.TITULO,row.ID);saveLocal();return{row};
  }
  function localReadNotification(payload){
    const user=requireLocalUser(),row=find('notifications',payload.id||payload.NOTIFICACION_ID);requireLocalPermission(user,'NOTIFICACIONES','ACTUALIZAR');
    if(!row)throw new Error('NOTIFICACION_NO_ENCONTRADA');if(!localFilterRows('notifications',[row],user).length)throw new Error('PERMISO_DENEGADO');
    row.LEIDA='SI';row.FECHA_LECTURA=iso();row.ACTUALIZADO_EN=iso();saveLocal();return{row};
  }
  function localHeartbeat(payload){
    const user=requireLocalUser(),data=payload.data||payload,deviceId=String(data.DISPOSITIVO_ID||'').slice(0,120);if(!deviceId)throw new Error('CAMPO_REQUERIDO_DISPOSITIVO_ID');
    const driver=localDriver(user),sessionId=auth.sessionId||String(data.SESION_CLIENTE_ID||''),clientSessionId=String(data.SESION_CLIENTE_ID||'').slice(0,120);
    const operation=driver?activeRows(localDb.operations).find(row=>row.CONDUCTOR_ID===driver.ID&&row.ESTADO==='Activa'):null;
    const route=driver?(activeRows(localDb.routes).find(row=>row.CONDUCTOR_ID===driver.ID&&row.ESTADO==='En curso')||activeRows(localDb.routes).find(row=>row.CONDUCTOR_ID===driver.ID&&row.ESTADO==='Asignada')):null;
    const gpsActive=data.GPS_ACTIVO==='SI',drivingAssignment=Boolean(operation||(route&&route.ESTADO==='En curso'));
    const activity=!driver?'Sesión administrativa':drivingAssignment&&gpsActive?'Conduciendo':drivingAssignment?'Operación activa sin GPS':'Conectado';
    const existing=activeRows(localDb.connections).find(row=>row.USUARIO_ID===user.ID&&row.DISPOSITIVO_ID===deviceId&&row.SESION_ID===sessionId&&String(row.SESION_CLIENTE_ID||'')===clientSessionId);
    requireLocalPermission(user,'CONEXIONES',existing?'ACTUALIZAR':'CREAR');const now=iso(),values={USUARIO_ID:user.ID,CONDUCTOR_ID:driver?.ID||'',DISPOSITIVO_ID:deviceId,
      SESION_ID:sessionId,SESION_CLIENTE_ID:clientSessionId,SECCION_ACTUAL:String(data.SECCION_ACTUAL||'dashboard').slice(0,80),ACTIVIDAD:activity,
      VEHICULO_ID:operation?.VEHICULO_ID||route?.VEHICULO_ID||'',OPERACION_ID:operation?.ID||'',RUTA_ID:route?.ID||'',GPS_ACTIVO:gpsActive?'SI':'NO',PAGINA_VISIBLE:data.PAGINA_VISIBLE==='NO'?'NO':'SI',
      ESTADO:data.ESTADO||'En línea',ULTIMA_CONEXION:now,PLATAFORMA:data.PLATAFORMA||navigator.platform||'',NAVEGADOR:data.NAVEGADOR||navigator.userAgent,
      TIPO_RED:data.TIPO_RED||'',BATERIA_PORCENTAJE:data.BATERIA_PORCENTAJE??'',ACTUALIZADO_EN:now,ELIMINADO:'NO'};
    const row=existing?Object.assign(existing,values):{ID:id('CNX'),...values,CREADO_EN:now};if(!existing)localDb.connections.push(row);saveLocal();return{row,serverTime:now};
  }
  function localRealtimeSummary(){
    const user=requireLocalUser();requireLocalPermission(user,'PANEL_PRINCIPAL','LEER');const locations=hasLocalPermission(user,'GPS','LEER')?localLatestLocations():{rows:[],total:0};
    const connections=hasLocalPermission(user,'CONEXIONES','LEER')?localFilterRows('connections',activeRows(localDb.connections),user):[],latest={};connections.sort((a,b)=>new Date(b.ULTIMA_CONEXION)-new Date(a.ULTIMA_CONEXION)).forEach(row=>{const key=`${row.SESION_ID||row.USUARIO_ID}:${row.SESION_CLIENTE_ID||row.DISPOSITIVO_ID}`;if(!latest[key])latest[key]=row;});
    const limit=Date.now()-(config.ANTIGUEDAD_CONEXION_ACTIVA_MILISEGUNDOS||90000);const devices=Object.values(latest).map(row=>{const driver=find('drivers',row.CONDUCTOR_ID),operation=driver?activeRows(localDb.operations).find(item=>item.CONDUCTOR_ID===driver.ID&&item.ESTADO==='Activa'):null,route=driver?(activeRows(localDb.routes).find(item=>item.CONDUCTOR_ID===driver.ID&&item.ESTADO==='En curso')||activeRows(localDb.routes).find(item=>item.CONDUCTOR_ID===driver.ID&&item.ESTADO==='Asignada')):null,vehicleId=operation?.VEHICULO_ID||route?.VEHICULO_ID||row.VEHICULO_ID||'',vehicle=find('vehicles',vehicleId),online=new Date(row.ULTIMA_CONEXION).getTime()>=limit&&row.ESTADO!=='Desconectado',drivingAssignment=Boolean(operation||(route&&route.ESTADO==='En curso')),activity=!online?'Inactivo':!driver?'Sesión administrativa':drivingAssignment&&row.GPS_ACTIVO==='SI'?'Conduciendo':drivingAssignment?'Operación activa sin GPS':'Conectado';return{...row,USUARIO_NOMBRE:find('users',row.USUARIO_ID)?.NOMBRE||'',CONDUCTOR_NOMBRE:driver?.NOMBRE||'',VEHICULO_ID:vehicleId,VEHICULO_PATENTE:vehicle?.PATENTE||'',OPERACION_ID:operation?.ID||'',RUTA_ID:route?.ID||'',ACTIVIDAD:activity,EN_LINEA:online};});
    devices.sort((a,b)=>a.EN_LINEA!==b.EN_LINEA?(a.EN_LINEA?-1:1):new Date(b.ULTIMA_CONEXION)-new Date(a.ULTIMA_CONEXION));
    const routes=(hasLocalPermission(user,'RUTAS','LEER')?localFilterRows('routes',activeRows(localDb.routes),user):[]).filter(row=>['Asignada','En curso'].includes(row.ESTADO));
    const notifications=(hasLocalPermission(user,'NOTIFICACIONES','LEER')?localFilterRows('notifications',activeRows(localDb.notifications),user):[]).filter(row=>row.LEIDA!=='SI').slice(-50).reverse();
    return{locations:locations.rows,devices:devices.slice(0,100),routes,notifications,totals:{locations:locations.total,onlineDevices:devices.filter(row=>row.EN_LINEA).length,drivingSessions:devices.filter(row=>row.EN_LINEA&&row.ACTIVIDAD==='Conduciendo').length,sessionsWithoutGps:devices.filter(row=>row.EN_LINEA&&row.ACTIVIDAD==='Operación activa sin GPS').length,activeRoutes:routes.length,unreadNotifications:notifications.length},serverTime:iso()};
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

  async function localChangePassword(payload){const user=requireLocalUser();if(user.CONTRASENA_CIFRADA!==await digest(payload.contrasenaActual+':'+user.SAL_CONTRASENA))throw new Error('CONTRASENA_ACTUAL_INVALIDA');if(String(payload.nuevaContrasena??'').length===0)throw new Error('CONTRASENA_REQUERIDA');const salt=id('SALT');user.SAL_CONTRASENA=salt;user.CONTRASENA_CIFRADA=await digest(String(payload.nuevaContrasena)+':'+salt);user.ACTUALIZADO_EN=iso();saveLocal();return{changed:true};}
  function localClear(payload){const user=requireLocalUser();if(user.ROL_ID!=='ROL-ADMIN')throw new Error('PERMISO_DENEGADO');if(payload.confirmacion!=='LIMPIAR DATOS')throw new Error('CONFIRMACION_REQUERIDA');['vehicles','drivers','operations','gps','history','maintenance','documents','alerts','reports','audit','qr','routes','notifications','connections'].forEach(key=>localDb[key]=[]);audit(user,'LIMPIAR','CONFIGURACION','Datos operativos eliminados; empresa y usuarios conservados');saveLocal();return{cleared:true};}

  window.ConexionFlotas = {
    request,
    isRemote,
    backendLabel,
    getAuth: () => ({ ...auth }),
    setAuth,
    reloadLocal: () => { localDb = loadLocal(); },
  };
  })();
