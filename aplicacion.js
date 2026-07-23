(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const api = window.ConexionFlotas;
  const config = window.CONFIGURACION_FLOTAS;

  let currentUser = null;
  let currentCompany = null;
  let currentSection = 'dashboard';
  let mapaFlota = null;
  let ultimaUbicacionEnviada = null;
  let gpsRefreshTimer = null;
  let realtimeTimer = null;
  let heartbeatTimer = null;
  let notificationTimer = null;
  let gpsWatchId = null;
  let mediaStream = null;
  let barcodeDetector = null;
  let scanFrameId = null;
  let facingMode = 'environment';
  let batteryLevel = '';
  let lastAddressLookup = { key:'', address:'', time:0 };
  let lastAddressSearchAt = 0;
  let addressSearchQueue = Promise.resolve();
  const addressSearchCache = new Map();
  let geolocationPermissionState = 'desconocido';
  let geolocationPermissionHandle = null;
  let wakeLock = null;
  let lastGpsErrorAt = 0;
  const trackingPreferenceKey = 'flotas_ubicacion_continua_v1';
  const deviceId = (() => {
    const key='flotas_dispositivo_id_v1';let value=localStorage.getItem(key);
    if(!value){value=`DISP-${crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)}`;localStorage.setItem(key,value);}
    return value;
  })();
  const clientSessionId = (() => {
    const key='flotas_sesion_cliente_v1';let value=sessionStorage.getItem(key);
    if(!value){value=`SES-CLI-${crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)}`;sessionStorage.setItem(key,value);}
    return value;
  })();

  const navGroups = [
    ['GENERAL', [
      ['dashboard','⌂','Panel principal'], ['routes','➜','Rutas asignadas'], ['operations','⇄','Operaciones'], ['gps','⌖','GPS en tiempo real'],
      ['notifications','🔔','Notificaciones']
    ]],
    ['GESTIÓN', [
      ['vehicles','▣','Vehículos'], ['drivers','♙','Conductores'], ['maintenance','⚙','Mantenciones'],
      ['documents','▤','Documentos'], ['history','↻','Historial'], ['alerts','!','Alertas']
    ]],
    ['ADMINISTRACIÓN', [
      ['users','♚','Usuarios'], ['company','🏢','Empresa'], ['reports','▥','Reportes'], ['audit','☷','Auditoría'], ['settings','⚒','Configuración']
    ]]
  ];

  const resourceFields = {
    vehicles: {
      title:'Vehículo', eyebrow:'FLOTA', fields:[
        ['PATENTE','Patente','text',true],['MARCA','Marca','text',true],['MODELO','Modelo','text',true],['ANIO','Año','number',false],
        ['COLOR','Color','text',false],['COMBUSTIBLE','Combustible','select',['Diésel','Gasolina','Eléctrico','Híbrido','Gas']],
        ['VIN','VIN / chasis','text',false],['KILOMETRAJE','Kilometraje','number',false],
        ['ESTADO','Estado','select',['Disponible','En ruta','Mantención','Inactivo']],['PROXIMA_MANTENCION','Próxima mantención','date',false]
      ]
    },
    drivers: {
      title:'Conductor', eyebrow:'PERSONAL', fields:[
        ['NOMBRE','Nombre completo','text',true],['RUT','RUT','text',true],['TELEFONO','Teléfono','text',false],['CORREO','Correo','email',false],
        ['LICENCIA_CLASE','Clase de licencia','select',['A1','A2','A3','A4','A5','B','C','D','E','F']],
        ['LICENCIA_VENCIMIENTO','Vencimiento licencia','date',false],['ESTADO','Estado','select',['Disponible','En viaje','Licencia vencida','Inactivo']],
        ['USUARIO_ID','Usuario asociado','userSelect',false]
      ]
    },
    maintenance: {
      title:'Mantención', eyebrow:'TALLER', fields:[
        ['VEHICULO_ID','Vehículo','vehicleSelect',true],['TIPO','Tipo','select',['Preventiva','Correctiva','Inspección']],['TITULO','Trabajo','text',true],
        ['DESCRIPCION','Descripción','textarea',false],['FECHA_PROGRAMADA','Fecha programada','date',true],['FECHA_REALIZADA','Fecha realizada','date',false],
        ['KILOMETRAJE','Kilometraje','number',false],['COSTO','Costo','number',false],['ESTADO','Estado','select',['Programada','En proceso','Completada','Atrasada','Cancelada']],
        ['TALLER','Taller','text',false],['OBSERVACIONES','Observaciones','textarea',false]
      ]
    },
    documents: {
      title:'Documento', eyebrow:'DOCUMENTACIÓN', fields:[
        ['TIPO','Tipo','select',['SOAP','Revisión técnica','Permiso de circulación','Licencia de conducir','Certificado de gases','Seguro','Otro']],
        ['ASOCIADO_TIPO','Asociado a','select',['Vehículo','Conductor','Empresa']],['ASOCIADO_ID','ID asociado','text',false],['IDENTIFICACION','Patente o RUT','text',true],
        ['FECHA_EMISION','Fecha emisión','date',false],['FECHA_VENCIMIENTO','Fecha vencimiento','date',true],['ESTADO','Estado','select',['Vigente','Por vencer','Vencido','Anulado']],
        ['DIRECCION_ARCHIVO','URL de archivo en Drive','url',false],['OBSERVACIONES','Observaciones','textarea',false]
      ]
    },
    users: {
      title:'Usuario', eyebrow:'SEGURIDAD', fields:[
        ['NOMBRE','Nombre completo','text',true],['CORREO','Correo','email',true],['CONTRASENA','Contraseña','password',true],
        ['ROL_ID','Rol','select',[['ROL-ADMIN','Administrador'],['ROL-SUPERVISOR','Supervisor'],['ROL-CONDUCTOR','Conductor']]],
        ['ESTADO','Estado','select',['Activo','Inactivo','Bloqueado']],['TELEFONO','Teléfono','text',false]
      ]
    },
    alerts: {
      title:'Alerta', eyebrow:'NOTIFICACIÓN', fields:[
        ['TIPO','Tipo','text',true],['NIVEL','Nivel','select',['Info','Advertencia','Crítica']],['TITULO','Título','text',true],
        ['MENSAJE','Mensaje','textarea',true],['MODULO','Módulo','text',false],['REGISTRO_ID','ID relacionado','text',false],['LEIDA','Leída','select',['NO','SI']]
      ]
    }
  };

  const labels = {
    dashboard:'Panel principal',routes:'Rutas asignadas',vehicles:'Vehículos',drivers:'Conductores',operations:'Operaciones',gps:'GPS en tiempo real',maintenance:'Mantenciones',
    notifications:'Notificaciones',documents:'Documentos',history:'Historial',alerts:'Alertas',users:'Usuarios',reports:'Reportes',audit:'Auditoría',company:'Empresa',settings:'Configuración'
  };

  const navPermission = {
    dashboard:'PANEL_PRINCIPAL',routes:'RUTAS',operations:'OPERACIONES',gps:'GPS',notifications:'NOTIFICACIONES',
    vehicles:'VEHICULOS',drivers:'CONDUCTORES',maintenance:'MANTENCIONES',documents:'DOCUMENTOS',history:'HISTORIAL',
    alerts:'ALERTAS',users:'USUARIOS',company:'CONFIGURACION',reports:'REPORTES',audit:'BITACORA',settings:'CONFIGURACION'
  };
  const resourcePermission={vehicles:'VEHICULOS',drivers:'CONDUCTORES',maintenance:'MANTENCIONES',documents:'DOCUMENTOS',alerts:'ALERTAS',users:'USUARIOS'};
  function hasPermission(module,action='LEER'){
    const permissions=currentUser?.PERMISOS||[];
    return currentUser?.ROL_ID==='ROL-ADMIN'||permissions.includes('*:*')||permissions.includes(`${module}:${action}`);
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const fmtDate = (value, time = false) => {
    if (!value) return '—';
    const date = new Date(value); if (Number.isNaN(date.getTime())) return esc(value);
    return new Intl.DateTimeFormat('es-CL', time ? { dateStyle:'short', timeStyle:'short' } : { dateStyle:'medium' }).format(date);
  };
  const number = value => new Intl.NumberFormat('es-CL').format(Number(value || 0));
  const initials = name => String(name || 'U').split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase();
  const statusClass = value => {
    const text = String(value || '').toLowerCase();
    if (/\b(inactivo|inactiva|desconectado|desconectada|bloqueado|bloqueada)\b|sin gps/.test(text)) return 'bad';
    if (/\b(disponible|activo|activa|vigente|finalizada|completada|conduciendo|conectado|conectada|sí|si)\b|en línea/.test(text)) return 'ok';
    if (/ruta|viaje|info|sesión administrativa/.test(text)) return 'info';
    if (/programada|proceso|por vencer|advertencia|mantención/.test(text)) return 'warn';
    return 'bad';
  };
  const status = value => `<span class="status ${statusClass(value)}">${esc(value || 'Sin estado')}</span>`;
  const heading = (tag, title, description, actions = '') => `<div class="heading"><div><p class="tag">${tag}</p><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
  const empty = (icon, title, text, action = '') => `<div class="empty-state"><div><i>${icon}</i><h3>${title}</h3><p>${text}</p>${action}</div></div>`;
  const table = (headers, rows, emptyText = 'Sin registros.') => `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="muted">${emptyText}</td></tr>`}</tbody></table></div>`;

  function translateError(error) {
    const key = String(error?.message || error || 'ERROR');
    const messages = {
      CREDENCIALES_INVALIDAS:'Correo o contraseña incorrectos. El propietario puede ejecutar prepararAccesoAdministrador() en Apps Script.', CLAVE_INSTALACION_INVALIDA:'La clave de instalación no coincide con la generada por instalarSistema().',
      CLAVE_INSTALACION_REQUERIDA:'Ingrese una clave de instalación.', CONTRASENA_REQUERIDA:'Ingrese la contraseña elegida.',
      DATOS_DE_ADMINISTRADOR_INVALIDOS:'Complete los datos del administrador e ingrese una contraseña.',
      SISTEMA_YA_INICIALIZADO:'El sistema ya tiene usuarios registrados.', AUTENTICACION_REQUERIDA:'La sesión no está disponible.', SESION_INVALIDA:'La sesión dejó de ser válida.',
      SESION_EXPIRADA:'La sesión expiró.', PERMISO_DENEGADO:'Su rol no tiene permiso para realizar esta acción.', RECURSO_NO_ENCONTRADO:'El recurso solicitado no existe.',
      REGISTRO_NO_ENCONTRADO:'El registro no existe.', VEHICULO_NO_DISPONIBLE:'El vehículo no está disponible.', CONDUCTOR_NO_DISPONIBLE:'El conductor no está disponible.',
      OPERACION_NO_ACTIVA:'La operación ya no está activa.', CORREO_YA_EXISTE:'El correo ya está registrado.', DIRECCION_APLICACION_NO_CONFIGURADA:'Falta configurar la dirección de la aplicación en configuracion.js.',
      ID_HOJA_NO_CONFIGURADO:'Google Apps Script no tiene configurado el identificador de la hoja de cálculo.', TIEMPO_DE_ESPERA_AGOTADO:'El servicio de datos tardó demasiado en responder.',
      CONTRASENA_ACTUAL_INVALIDA:'La contraseña actual no es correcta.', FORMATO_LOGOTIPO_INVALIDO:'El formato del logotipo no es válido.', LOGOTIPO_DEMASIADO_GRANDE:'El logotipo supera el tamaño máximo de 1,5 MB.',
      ID_HOJA_NO_CONFIGURADO:'Google Apps Script no tiene configurado el identificador de la hoja de cálculo.', CONFIRMACION_REQUERIDA:'Debe escribir exactamente “LIMPIAR DATOS”.',
      CONDUCTOR_NO_ASOCIADO:'La cuenta no está asociada a un conductor.', CONDUCTOR_NO_ENCONTRADO:'El conductor seleccionado no existe.', VEHICULO_NO_ENCONTRADO:'El vehículo seleccionado no existe.',
      QR_NO_RECONOCIDO:'El código QR no corresponde a un vehículo registrado.', CODIGO_QR_REQUERIDO:'Ingrese o escanee un código QR.', RUTA_NO_ENCONTRADA:'La ruta no existe.',
      ESTADO_RUTA_INVALIDO:'El estado solicitado para la ruta no es válido.', DESTINATARIO_REQUERIDO:'Seleccione un conductor destinatario.', NOTIFICACION_NO_ENCONTRADA:'La notificación no existe.',
      COORDENADAS_INVALIDAS:'Las coordenadas recibidas no son válidas.', AUTORIZACION_QR_INVALIDA:'Valide nuevamente el QR del vehículo. La autorización dura cinco minutos.',
      ACCION_ESPECIAL_REQUERIDA:'Utilice el botón específico del módulo para realizar esta acción.'
    };
    if (messages[key]) return messages[key];
    if (key.startsWith('CAMPO_REQUERIDO_')) return `El campo ${key.replace('CAMPO_REQUERIDO_','')} es obligatorio.`;
    return key.replaceAll('_',' ');
  }

  function toast(title, message = '', type = 'success') {
    const node = document.createElement('div'); node.className = `toast ${type === 'error' ? 'error' : ''}`;
    node.innerHTML = `<i>${type === 'error' ? '!' : '✓'}</i><div><b>${esc(title)}</b><small>${esc(message)}</small></div><button aria-label="Cerrar">×</button>`;
    $('#toastStack').append(node); $('button', node).addEventListener('click', () => node.remove()); setTimeout(() => node.remove(), 4200);
  }

  function setConnection(ok, text) {
    const box = $('#connectionStatus'); box.classList.toggle('error', !ok); $('span', box).textContent = text;
  }
  function setSave(text, mode = '') {
    const box = $('#saveStatus'); box.className = `save-status ${mode}`; $('span', box).textContent = text;
  }
  async function updateBattery(){
    try{const battery=await navigator.getBattery?.();if(battery){const assign=()=>{batteryLevel=Math.round(battery.level*100);};assign();battery.addEventListener('levelchange',assign);}}catch(_){}
  }
  function connectionType(){return navigator.connection?.effectiveType||navigator.connection?.type||'';}
  async function sendHeartbeat(state='En línea'){
    if(!currentUser)return;
    try{await api.request('heartbeat',{data:{DISPOSITIVO_ID:deviceId,SESION_CLIENTE_ID:clientSessionId,SECCION_ACTUAL:currentSection,GPS_ACTIVO:gpsWatchId===null?'NO':'SI',PAGINA_VISIBLE:document.hidden?'NO':'SI',ESTADO:state,PLATAFORMA:navigator.platform||'',NAVEGADOR:navigator.userAgent,TIPO_RED:connectionType(),BATERIA_PORCENTAJE:batteryLevel}});setConnection(navigator.onLine!==false,api.isRemote()?'Servicio conectado':'Modo local activo');}
    catch(error){setConnection(false,'Sin conexión con el servicio');}
  }
  async function refreshNotificationBadge(){
    if(!currentUser||!hasPermission('NOTIFICACIONES','LEER'))return;
    try{const result=await api.request('list',{resource:'notifications'}),count=(result.rows||[]).filter(row=>row.LEIDA!=='SI').length,badge=$('#notificationBadge');badge.textContent=count>99?'99+':String(count);badge.hidden=count===0;}catch(_){}
  }
  function stopRealtimeServices(){
    [heartbeatTimer,notificationTimer,realtimeTimer].forEach(timer=>{if(timer)clearInterval(timer);});
    heartbeatTimer=null;notificationTimer=null;realtimeTimer=null;
  }
  function startRealtimeServices(){
    stopRealtimeServices();updateBattery();sendHeartbeat();refreshNotificationBadge();
    heartbeatTimer=setInterval(()=>sendHeartbeat(),config.INTERVALO_CONEXION_MILISEGUNDOS||20000);
    notificationTimer=setInterval(refreshNotificationBadge,config.INTERVALO_NOTIFICACIONES_MILISEGUNDOS||15000);
    resumeTrackingIfAllowed();
  }

  async function checkSystem() {
    hideAuthCards();
    $('#authBackendLabel').textContent = `Conectando con ${api.backendLabel()}…`;
    try {
      const statusData = await api.request('status');
      applyBranding(statusData.company || null);
      $('#authBackendLabel').textContent = `${api.backendLabel()} · Conectado`;
      if (statusData.needsSetup) {
        $('#setupForm').classList.remove('hidden');
      } else if (api.getAuth().token) {
        try {
          const me = await api.request('me'); currentUser = me.user; showApp();
        } catch (_) {
          api.setAuth({}); $('#loginForm').classList.remove('hidden');
        }
      } else {
        $('#loginForm').classList.remove('hidden');
      }
    } catch (error) {
      $('#connectionErrorText').textContent = translateError(error);
      $('#connectionError').classList.remove('hidden');
      $('#authBackendLabel').textContent = `${api.backendLabel()} · Error`;
    }
  }

  function hideAuthCards() { ['setupForm','loginForm','connectionError'].forEach(id => $('#' + id).classList.add('hidden')); }

  async function handleSetup(event) {
    event.preventDefault(); const formElement=event.currentTarget;const form = new FormData(formElement); const button = $('button[type="submit"]', formElement);
    button.disabled = true; button.textContent = 'Instalando…';
    try {
      await api.request('bootstrap', Object.fromEntries(form.entries()));
      toast('Sistema instalado','El administrador inicial fue creado.'); formElement.reset(); await checkSystem();
    } catch (error) { toast('No fue posible instalar',translateError(error),'error'); }
    finally { button.disabled = false; button.textContent = 'Instalar y crear administrador'; }
  }

  async function handleLogin(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const button = $('button[type="submit"]',event.currentTarget);
    button.disabled = true; button.textContent = 'Ingresando…';
    try {
      const result = await api.request('login', Object.fromEntries(form.entries())); api.setAuth({ token:result.token, sessionId:result.sessionId||'', user:result.user, expiresAt:result.expiresAt });
      currentUser = result.user; showApp(); toast('Bienvenido',`Sesión iniciada como ${currentUser.ROL_NOMBRE}.`);
    } catch (error) { toast('Acceso denegado',translateError(error),'error'); }
    finally { button.disabled=false; button.textContent='Ingresar'; }
  }

  function showApp() {
    $('#authScreen').classList.add('hidden'); $('#appShell').classList.remove('hidden');
    $('#userName').textContent=currentUser.NOMBRE; $('#userRole').textContent=currentUser.ROL_NOMBRE || currentUser.ROL_ID; $('#userAvatar').textContent=initials(currentUser.NOMBRE);
    $('#backendName').textContent=api.backendLabel(); $('#backendDetail').textContent=api.isRemote()?'Datos compartidos en Hojas de cálculo de Google':'Datos privados en este navegador';
    setConnection(true, api.isRemote()?'Google Apps Script conectado':'Almacenamiento local activo'); buildNav(); refreshCompanyBranding(); startRealtimeServices(); go('dashboard');
  }

  function buildNav() {
    let html='';
    navGroups.forEach(([group,items]) => {
      const visible = items.filter(([id]) => hasPermission(navPermission[id]||'PANEL_PRINCIPAL','LEER'));
      if (!visible.length) return;
      html += `<p class="nav-label">${group}</p>` + visible.map(([id,icon,label]) => `<button class="nav-button ${currentSection===id?'active':''}" data-nav="${id}"><i>${icon}</i>${label}</button>`).join('');
    });
    $('#nav').innerHTML=html;
  }

  async function go(section) {
    cleanupSection(); currentSection=section; buildNav(); sendHeartbeat(); $('#pageTitle').textContent=labels[section]; $('#breadcrumb').textContent=`Sistema / ${labels[section]}`;
    $('#content').innerHTML=`<div class="card">${empty('…','Cargando módulo','Consultando la información disponible.')}</div>`;
    closeSidebar();
    try {
      const html = await renderers[section](); $('#content').innerHTML=html; bindSection();
      if (section==='gps') setTimeout(initMap,80);
    } catch (error) {
      if (['AUTENTICACION_REQUERIDA','SESION_INVALIDA','SESION_EXPIRADA'].includes(error.message)) return forceLogout();
      $('#content').innerHTML=`<div class="card">${empty('!','No se pudo cargar el módulo',translateError(error),'<button class="btn primary" data-retry>Reintentar</button>')}</div>`;
      bindSection(); setConnection(false,'Error del servicio de datos');
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function cleanupSection() {
    if (gpsRefreshTimer) clearInterval(gpsRefreshTimer); gpsRefreshTimer=null;
    if (mapaFlota) { mapaFlota.eliminar(); mapaFlota=null; }
  }

  const renderers = {
    async dashboard() {
      await sendHeartbeat();
      const [data,realtime]=await Promise.all([api.request('dashboard'),api.request('realtimeSummary')]), m=data.metrics || {};
      const operations=(data.recentOperations||[]).map(op=>`<tr><td><strong>${esc(op.ID)}</strong></td><td>${esc(op.VEHICULO_ID)}</td><td>${esc(op.CONDUCTOR_ID)}</td><td>${fmtDate(op.FECHA_INICIO,true)}</td><td>${status(op.ESTADO)}</td><td>${esc(op.ORIGEN||'')} → ${esc(op.DESTINO||'')}</td></tr>`).join('');
      const notifications=(data.notifications||[]).map(notificationCard).join('');
      const routes=(data.routes||[]).filter(r=>['Asignada','En curso'].includes(r.ESTADO));
      const headingActions=`<button class="btn soft" data-refresh>↻ Actualizar</button>${hasPermission('RUTAS','CREAR')?'<button class="btn primary" data-new-route>＋ Asignar ruta</button>':''}`;
      const driverHero=currentUser.ROL_ID==='ROL-CONDUCTOR'&&routes.length?`<div class="driver-home"><article class="card driver-route-hero"><div class="card-header"><div><h3>Próxima ruta asignada</h3><p>Lista para iniciar navegación</p></div>${status(routes[0].ESTADO)}</div>${routeCard(routes[0],true)}</article><article class="card"><div class="card-header"><div><h3>Mi conexión</h3><p>Estado del dispositivo</p></div></div><div class="tracking-notice ${gpsWatchId===null?'inactive':'active'}" data-tracking-notice><i data-tracking-icon>${gpsWatchId===null?'○':'●'}</i><div><b data-tracking-title>${gpsWatchId===null?'Ubicación continua detenida':'Ubicación continua activada'}</b><span data-tracking-detail>${trackingDetail()}</span></div></div><button class="btn ${gpsWatchId===null?'primary':'danger'} full" data-toggle-tracking>${gpsWatchId===null?'Activar ubicación continua':'Detener ubicación continua'}</button></article></div>`:'';
      return heading('RESUMEN OPERACIONAL',`Hola, ${esc(currentUser.NOMBRE.split(' ')[0])}`,'Información actualizada de flota, rutas, dispositivos y avisos según sus permisos.',headingActions)+
        driverHero+
        `<div class="kpi-grid">${metric('▣','Vehículos',m.vehicles||0,`${m.availableVehicles||0} disponibles`)}${metric('♙','Conductores',m.drivers||0,`${m.availableDrivers||0} disponibles`)}${metric('⇄','Operaciones activas',m.activeOperations||0,'Seguimiento en curso')}${metric('!','Alertas',m.unreadAlerts||0,`${m.expiredDocuments||0} documentos vencidos`)}</div>`+
        `<div class="live-strip">${liveStat('⌖','Sesiones abiertas',realtime.totals?.onlineDevices??m.onlineDevices??0,'online')}${liveStat('🚐','Conduciendo',realtime.totals?.drivingSessions||0,'online')}${liveStat('!','Operación sin GPS',realtime.totals?.sessionsWithoutGps||0,(realtime.totals?.sessionsWithoutGps||0)?'warning':'')}${liveStat('🔔','Mensajes sin leer',m.unreadNotifications||0,(m.unreadNotifications||0)?'warning':'')}</div>`+
        `<div class="dashboard-insights"><article class="card"><div class="card-header"><div><h3>Operaciones de los últimos 7 días</h3><p>Actividad diaria visible para su rol</p></div></div>${weeklyBars(data.charts?.operationsByDay||[])}</article><article class="card"><div class="card-header"><div><h3>Estado de la flota</h3><p>Distribución actual de vehículos</p></div></div>${stateDonut(data.charts?.vehicleStates||[])}</article><article class="card"><div class="card-header"><div><h3>Acciones rápidas</h3><p>Accesos según sus permisos</p></div></div>${quickActions()}</article></div>`+
        `${hasPermission('CONEXIONES','LEER')?`<article class="card session-control-card"><div class="card-header"><div><h3>Control de sesiones abiertas</h3><p>Usuario, conductor, módulo abierto, vehículo, operación, ruta y GPS por cada sesión.</p></div><button class="link-button" data-nav="gps">Abrir monitoreo</button></div><div class="device-list dashboard-session-list">${(realtime.devices||[]).slice(0,12).map(deviceCard).join('')||empty('○','Sin sesiones registradas','Las sesiones aparecerán cuando los usuarios ingresen al sistema.')}</div></article>`:''}`+
        `<div class="dashboard-grid"><article class="card"><div class="card-header"><div><h3>Operaciones recientes</h3><p>Movimientos creados en el sistema</p></div></div>${operations?table(['Operación','Vehículo','Conductor','Inicio','Estado','Ruta'],operations):empty('⇄','Aún no hay operaciones','No existen recorridos visibles para esta cuenta.',hasPermission('OPERACIONES','CREAR')?'<button class="btn primary" data-nav="operations">Crear operación</button>':'')}</article>`+
        `<article class="card"><div class="card-header"><div><h3>Notificaciones pendientes</h3><p>Mensajes dirigidos al usuario</p></div><button class="link-button" data-nav="notifications">Ver todas</button></div><div class="notification-list">${notifications||empty('✓','Sin notificaciones','No existen mensajes pendientes.')}</div></article></div>`;
    },
    async vehicles(){return renderResourcePage('vehicles','FLOTA','Vehículos','Administre las unidades, patentes, kilometraje y códigos QR.',vehicleRows,['Vehículo','Patente','Año','Kilometraje','Estado','QR','']);},
    async drivers(){return renderResourcePage('drivers','PERSONAL','Conductores','Gestione licencias, disponibilidad y usuarios asociados.',driverRows,['Conductor','RUT','Licencia','Vencimiento','Estado','Usuario','']);},
    async maintenance(){return renderResourcePage('maintenance','PREVENCIÓN','Mantenciones','Programe trabajos preventivos y correctivos.',maintenanceRows,['Trabajo','Vehículo','Tipo','Fecha','Costo','Estado','']);},
    async documents(){return renderResourcePage('documents','VENCIMIENTOS','Documentos','Controle permisos, seguros, revisiones y licencias.',documentRows,['Documento','Asociado','Identificación','Vencimiento','Estado','Archivo','']);},
    async alerts(){return renderResourcePage('alerts','NOTIFICACIONES','Alertas','Registre y gestione eventos que requieren atención.',alertRows,['Nivel','Título','Módulo','Fecha','Leída','']);},
    async users(){return renderResourcePage('users','SEGURIDAD','Usuarios','Administre accesos, roles y estado de las cuentas.',userRows,['Usuario','Correo','Rol','Último acceso','Estado','']);},
    async operations(){return renderOperations();},
    async routes(){return renderRoutes();},
    async gps(){return renderGps();},
    async notifications(){return renderNotifications();},
    async history(){return renderHistory();},
    async reports(){return renderReports();},
    async audit(){return renderAudit();},
    async company(){return renderCompany();},
    async settings(){return renderSettings();}
  };

  function metric(icon,label,value,detail){return `<article class="metric-card"><i class="metric-icon">${icon}</i><div><span>${label}</span><b>${value}</b><small>${detail}</small></div></article>`;}
  function liveStat(icon,label,value,mode=''){return `<article class="live-stat ${mode}"><i>${icon}</i><div><span>${label}</span><b>${number(value)}</b></div></article>`;}
  function navigationUrl(route){
    const latitude=Number(route.DESTINO_LATITUD),longitude=Number(route.DESTINO_LONGITUD);
    const destination=Number.isFinite(latitude)&&Number.isFinite(longitude)&&route.DESTINO_LATITUD!==''?`${latitude},${longitude}`:route.DESTINO;
    if(route.PROVEEDOR_NAVEGACION==='Waze')return `https://www.waze.com/ul?q=${encodeURIComponent(destination||'')}&navigate=yes`;
    const params=new URLSearchParams({api:'1',destination:destination||'',travelmode:'driving'});
    if(route.ORIGEN&&route.ORIGEN!=='Ubicación actual')params.set('origin',route.ORIGEN);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
  function routeCard(route,hero=false){
    const canUpdate=hasPermission('RUTAS','ACTUALIZAR'),driver=currentUser?.ROL_ID==='ROL-CONDUCTOR';
    const actions=[`<a class="btn primary small" href="${esc(navigationUrl(route))}" target="_blank" rel="noopener">Navegar con ${esc(route.PROVEEDOR_NAVEGACION||'Google Maps')}</a>`];
    if(canUpdate&&route.ESTADO==='Asignada')actions.push(`<button class="btn soft small" data-route-state="${route.ID}:En curso">Iniciar ruta</button>`);
    if(canUpdate&&route.ESTADO==='En curso')actions.push(`<button class="btn soft small" data-route-state="${route.ID}:Completada">Completar</button>`);
    if(canUpdate&&!driver&&!['Completada','Cancelada'].includes(route.ESTADO))actions.push(`<button class="btn danger small" data-route-state="${route.ID}:Cancelada">Cancelar</button>`);
    return `<div class="${hero?'':'route-card'}"><header><div><h4>${esc(route.NOMBRE||route.ID)}</h4><p>${esc(route.CONDUCTOR_NOMBRE||route.CONDUCTOR_ID||'Sin conductor')} · ${esc(route.VEHICULO_PATENTE||route.VEHICULO_ID||'Vehículo por definir')}</p></div>${status(route.ESTADO)}</header><div class="route-path"><i></i><span>${esc(route.ORIGEN||'Ubicación actual')}</span><i class="end"></i><span>${esc(route.DESTINO||'Sin destino')}</span></div>${route.INSTRUCCIONES?`<p>${esc(route.INSTRUCCIONES)}</p>`:''}<div class="route-actions">${actions.join('')}</div><div class="route-meta"><span>Asignada: ${fmtDate(route.FECHA_ASIGNACION,true)}</span><span>Proveedor: ${esc(route.PROVEEDOR_NAVEGACION||'Google Maps')}</span></div></div>`;
  }
  function notificationCard(item){
    const priority=String(item.PRIORIDAD||'Normal').toLowerCase();
    return `<article class="notification-card"><header><div><h4>${esc(item.TITULO)}</h4><p>${esc(item.MENSAJE)}</p></div><span class="priority ${esc(priority)}">${esc(item.PRIORIDAD||'Normal')}</span></header><div class="route-meta"><span>${fmtDate(item.FECHA_ENVIO||item.CREADO_EN,true)}</span><span>${esc(item.TIPO||'Información')}</span></div>${item.LEIDA!=='SI'?`<button class="link-button" data-read-notification="${item.ID}" type="button">Marcar como leída</button>`:''}</article>`;
  }
  function deviceCard(item){
    const activity=item.EN_LINEA?(item.ACTIVIDAD||'Conectado'):'Inactivo',sectionName=labels[item.SECCION_ACTUAL]||item.SECCION_ACTUAL||'Sin identificar';
    const sessionReference=String(item.SESION_CLIENTE_ID||item.SESION_ID||item.DISPOSITIVO_ID||'').slice(-10);
    return `<article class="device-card ${item.EN_LINEA?'online':'offline'} ${activity==='Conduciendo'?'driving':''}"><i class="device-dot"></i><div><div class="device-title"><b>${esc(item.USUARIO_NOMBRE||'Usuario')}</b>${status(activity)}</div><span><strong>Conductor:</strong> ${esc(item.CONDUCTOR_NOMBRE||'No asociado')}</span><div class="session-facts"><span><b>Sección</b>${esc(sectionName)}</span><span><b>Vehículo</b>${esc(item.VEHICULO_PATENTE||item.VEHICULO_ID||'Sin asignar')}</span><span><b>Operación</b>${esc(item.OPERACION_ID||'Sin operación')}</span><span><b>Ruta</b>${esc(item.RUTA_ID||'Sin ruta')}</span><span><b>GPS</b>${item.GPS_ACTIVO==='SI'?'Activo':'Inactivo'}</span><span><b>Visibilidad</b>${item.PAGINA_VISIBLE==='NO'?'Segundo plano':'Visible'}</span></div><small>Sesión ${esc(sessionReference||'sin referencia')} · ${esc(item.PLATAFORMA||'Dispositivo')} · Última señal: ${fmtDate(item.ULTIMA_CONEXION,true)}${item.BATERIA_PORCENTAJE!==''?` · Batería ${number(item.BATERIA_PORCENTAJE)}%`:''}</small></div></article>`;
  }
  function weeklyBars(series=[]){
    const max=Math.max(1,...series.map(item=>Number(item.TOTAL||0)));
    return `<div class="weekly-chart">${series.map(item=>`<div class="weekly-column"><b>${number(item.TOTAL)}</b><i style="height:${Math.max(8,Math.round(Number(item.TOTAL||0)/max*100))}%"></i><span>${esc(item.ETIQUETA||'')}</span></div>`).join('')}</div>`;
  }
  function stateDonut(states=[]){
    const colors=['#0e9f91','#2e6fe8','#e8a128','#d65454','#8b67cc','#718393'],total=states.reduce((sum,item)=>sum+Number(item.TOTAL||0),0);
    let current=0;const stops=states.map((item,index)=>{const start=current;current+=total?Number(item.TOTAL||0)/total*360:0;return `${colors[index%colors.length]} ${start.toFixed(1)}deg ${current.toFixed(1)}deg`;});
    const background=total?`conic-gradient(${stops.join(',')})`:'conic-gradient(#dfe8ec 0deg 360deg)';
    return `<div class="donut-layout"><div class="donut-chart" style="background:${background}"><span><b>${number(total)}</b><small>vehículos</small></span></div><div class="chart-legend">${states.map((item,index)=>`<div><i style="background:${colors[index%colors.length]}"></i><span>${esc(item.ESTADO)}</span><b>${number(item.TOTAL)}</b></div>`).join('')||'<p class="muted">Sin datos registrados.</p>'}</div></div>`;
  }
  function quickActions(){
    const actions=[];
    if(hasPermission('RUTAS','CREAR'))actions.push(['routes','➜','Asignar ruta']);
    if(hasPermission('OPERACIONES','CREAR'))actions.push(['operations','⇄','Iniciar operación']);
    if(hasPermission('NOTIFICACIONES','CREAR'))actions.push(['notifications','🔔','Enviar aviso']);
    if(hasPermission('VEHICULOS','CREAR'))actions.push(['vehicles','▣','Registrar vehículo']);
    return `<div class="quick-actions">${actions.map(([section,icon,label])=>`<button data-nav="${section}"><i>${icon}</i><span>${label}</span></button>`).join('')||'<p class="muted">No hay acciones rápidas habilitadas para este rol.</p>'}</div>`;
  }
  function searchAddresses(query){
    const normalized=String(query||'').trim().toLowerCase(),cached=addressSearchCache.get(normalized);
    if(cached)return Promise.resolve(cached);
    const task=addressSearchQueue.catch(()=>{}).then(async()=>{
      const wait=Math.max(0,1000-(Date.now()-lastAddressSearchAt));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
      lastAddressSearchAt=Date.now();
      const url=new URL(config.DIRECCION_BUSQUEDA_DIRECCIONES);url.searchParams.set('format','jsonv2');url.searchParams.set('q',query);url.searchParams.set('limit','6');url.searchParams.set('addressdetails','1');url.searchParams.set('accept-language','es');
      if(config.PAIS_BUSQUEDA_DIRECCIONES)url.searchParams.set('countrycodes',config.PAIS_BUSQUEDA_DIRECCIONES);
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
      try{const response=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});if(!response.ok)throw new Error('BUSQUEDA_DIRECCION_NO_DISPONIBLE');const result=await response.json();addressSearchCache.set(normalized,result);if(addressSearchCache.size>80)addressSearchCache.delete(addressSearchCache.keys().next().value);return result;}
      finally{clearTimeout(timer);}
    });
    addressSearchQueue=task;return task;
  }
  function bindAddressAutocomplete(root=document){
    $$('[data-address-autocomplete]',root).forEach(input=>{
      if(input.dataset.addressBound==='1')return;input.dataset.addressBound='1';input.setAttribute('autocomplete','off');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
      const suggestions=document.createElement('div');suggestions.className='address-suggestions';suggestions.setAttribute('role','listbox');suggestions.hidden=true;input.insertAdjacentElement('afterend',suggestions);
      let timer=null,sequence=0,activeIndex=-1,items=[];
      const close=()=>{suggestions.hidden=true;suggestions.innerHTML='';items=[];activeIndex=-1;input.setAttribute('aria-expanded','false');};
      const select=item=>{input.value=item.display_name||'';const form=input.closest('form')||root;const latName=input.dataset.latTarget,lngName=input.dataset.lngTarget;if(latName&&form.querySelector(`[name="${latName}"]`))form.querySelector(`[name="${latName}"]`).value=item.lat||'';if(lngName&&form.querySelector(`[name="${lngName}"]`))form.querySelector(`[name="${lngName}"]`).value=item.lon||'';input.dispatchEvent(new Event('direccion:seleccionada',{bubbles:true}));close();};
      const render=result=>{items=result||[];if(!items.length){suggestions.innerHTML='<p>No se encontraron coincidencias. Puede conservar la dirección escrita.</p>';suggestions.hidden=false;return;}suggestions.innerHTML=items.map((item,index)=>`<button type="button" role="option" data-address-index="${index}"><i>⌖</i><span><b>${esc(item.display_name||'Dirección')}</b><small>${esc(item.type||item.category||'Lugar')}</small></span></button>`).join('');suggestions.hidden=false;input.setAttribute('aria-expanded','true');$$('[data-address-index]',suggestions).forEach(button=>button.addEventListener('mousedown',event=>{event.preventDefault();select(items[Number(button.dataset.addressIndex)]);}));};
      input.addEventListener('input',()=>{
        const form=input.closest('form')||root;[input.dataset.latTarget,input.dataset.lngTarget].filter(Boolean).forEach(name=>{const field=form.querySelector(`[name="${name}"]`);if(field)field.value='';});
        clearTimeout(timer);const query=input.value.trim();sequence+=1;const ownSequence=sequence;if(query.length<(config.MINIMO_CARACTERES_DIRECCION||3))return close();
        timer=setTimeout(async()=>{suggestions.innerHTML='<p>Buscando direcciones…</p>';suggestions.hidden=false;try{const result=await searchAddresses(query);if(ownSequence===sequence)render(result);}catch(_){if(ownSequence===sequence){suggestions.innerHTML='<p>No fue posible consultar direcciones. Puede continuar escribiéndola manualmente.</p>';suggestions.hidden=false;}}},config.ESPERA_BUSQUEDA_DIRECCION_MILISEGUNDOS||450);
      });
      input.addEventListener('keydown',event=>{const buttons=$$('button',suggestions);if(!buttons.length)return;if(event.key==='ArrowDown'){event.preventDefault();activeIndex=(activeIndex+1)%buttons.length;}else if(event.key==='ArrowUp'){event.preventDefault();activeIndex=(activeIndex-1+buttons.length)%buttons.length;}else if(event.key==='Enter'&&activeIndex>=0){event.preventDefault();select(items[activeIndex]);return;}else if(event.key==='Escape')return close();else return;buttons.forEach((button,index)=>button.classList.toggle('active',index===activeIndex));buttons[activeIndex]?.scrollIntoView({block:'nearest'});});
      input.addEventListener('blur',()=>setTimeout(close,180));
    });
  }

  async function renderResourcePage(resource,tag,title,description,rowRenderer,headers) {
    const result=await api.request('list',{resource}); const rows=result.rows||[];
    const createButton=hasPermission(resourcePermission[resource],'CREAR')?`<button class="btn primary" data-add="${resource}">＋ Nuevo registro</button>`:'';
    const rowHtml=rows.map(row=>rowRenderer(row)).join('');
    return heading(tag,title,description,createButton)+`<article class="card"><div class="toolbar"><label class="search-box"><span>⌕</span><input data-table-search placeholder="Buscar en ${title.toLowerCase()}"></label><button class="btn soft push" data-export="${resource}">Exportar CSV</button></div><div data-filter-table>${table(headers,rowHtml,`No hay ${title.toLowerCase()} registrados.`)}</div></article>`;
  }

  function vehicleRows(v){return `<tr data-search-row="${esc(`${v.PATENTE} ${v.MARCA} ${v.MODELO} ${v.ESTADO}`.toLowerCase())}"><td><div class="entity"><i class="entity-icon">🚐</i><div><strong>${esc(v.MARCA||'Sin marca')} ${esc(v.MODELO||'')}</strong><span class="muted">${esc(v.ID)}</span></div></div></td><td><strong>${esc(v.PATENTE)}</strong></td><td>${esc(v.ANIO||'—')}</td><td>${number(v.KILOMETRAJE)} km</td><td>${status(v.ESTADO)}</td><td>${esc(v.QR_CODIGO||'—')}</td><td>${actions('vehicles',v.ID)}</td></tr>`;}
  function driverRows(d){return `<tr data-search-row="${esc(`${d.NOMBRE} ${d.RUT} ${d.ESTADO}`.toLowerCase())}"><td><div class="entity"><span class="avatar">${initials(d.NOMBRE)}</span><div><strong>${esc(d.NOMBRE)}</strong><span class="muted">${esc(d.TELEFONO||'')}</span></div></div></td><td>${esc(d.RUT)}</td><td>${esc(d.LICENCIA_CLASE||'—')}</td><td>${fmtDate(d.LICENCIA_VENCIMIENTO)}</td><td>${status(d.ESTADO)}</td><td>${esc(d.USUARIO_ID||'Sin asociar')}</td><td>${actions('drivers',d.ID)}</td></tr>`;}
  function maintenanceRows(m){return `<tr data-search-row="${esc(`${m.TITULO} ${m.VEHICULO_ID} ${m.ESTADO}`.toLowerCase())}"><td><strong>${esc(m.TITULO)}</strong><span class="muted">${esc(m.DESCRIPCION||'')}</span></td><td>${esc(m.VEHICULO_ID)}</td><td>${esc(m.TIPO)}</td><td>${fmtDate(m.FECHA_PROGRAMADA)}</td><td>$${number(m.COSTO)}</td><td>${status(m.ESTADO)}</td><td>${actions('maintenance',m.ID)}</td></tr>`;}
  function documentRows(d){return `<tr data-search-row="${esc(`${d.TIPO} ${d.IDENTIFICACION} ${d.ESTADO}`.toLowerCase())}"><td><strong>${esc(d.TIPO)}</strong><span class="muted">${esc(d.ID)}</span></td><td>${esc(d.ASOCIADO_TIPO)}</td><td>${esc(d.IDENTIFICACION)}</td><td>${fmtDate(d.FECHA_VENCIMIENTO)}</td><td>${status(d.ESTADO)}</td><td>${d.DIRECCION_ARCHIVO?`<a class="link-button" href="${esc(d.DIRECCION_ARCHIVO)}" target="_blank" rel="noopener">Abrir</a>`:'—'}</td><td>${actions('documents',d.ID)}</td></tr>`;}
  function alertRows(a){return `<tr data-search-row="${esc(`${a.NIVEL} ${a.TITULO} ${a.MODULO}`.toLowerCase())}"><td>${status(a.NIVEL)}</td><td><strong>${esc(a.TITULO)}</strong><span class="muted">${esc(a.MENSAJE)}</span></td><td>${esc(a.MODULO||'—')}</td><td>${fmtDate(a.FECHA_HORA||a.CREADO_EN,true)}</td><td>${status(a.LEIDA||'NO')}</td><td>${actions('alerts',a.ID)}</td></tr>`;}
  function userRows(u){return `<tr data-search-row="${esc(`${u.NOMBRE} ${u.CORREO} ${u.ROL_ID}`.toLowerCase())}"><td><div class="entity"><span class="avatar">${initials(u.NOMBRE)}</span><strong>${esc(u.NOMBRE)}</strong></div></td><td>${esc(u.CORREO)}</td><td>${esc(u.ROL_ID)}</td><td>${fmtDate(u.ULTIMO_ACCESO,true)}</td><td>${status(u.ESTADO)}</td><td>${actions('users',u.ID)}</td></tr>`;}
  function actions(resource,id){const module=resourcePermission[resource];const buttons=[];if(hasPermission(module,'ACTUALIZAR'))buttons.push(`<button data-edit="${resource}:${id}" title="Editar">✎</button>`);if(hasPermission(module,'ELIMINAR'))buttons.push(`<button data-delete="${resource}:${id}" title="Eliminar">×</button>`);return buttons.length?`<div class="row-actions">${buttons.join('')}</div>`:'—';}

  async function renderOperations() {
    const [ops,vehicles,drivers]=await Promise.all([api.request('list',{resource:'operations'}),api.request('list',{resource:'vehicles'}),api.request('list',{resource:'drivers'})]);
    const active=(ops.rows||[]).filter(o=>o.ESTADO==='Activa');
    const vehicleMap=Object.fromEntries((vehicles.rows||[]).map(v=>[v.ID,v])); const driverMap=Object.fromEntries((drivers.rows||[]).map(d=>[d.ID,d]));
    const activeHtml=active.map(op=>`<article class="operation-card"><header><div><h4>${esc(op.ID)} · ${esc(vehicleMap[op.VEHICULO_ID]?.PATENTE||op.VEHICULO_ID)}</h4><small>${esc(driverMap[op.CONDUCTOR_ID]?.NOMBRE||op.CONDUCTOR_ID)}</small></div>${status(op.ESTADO)}</header><div class="operation-route">${esc(op.ORIGEN||'Ubicación actual')} → ${esc(op.DESTINO)}</div><div class="operation-meta"><div><span>INICIO</span><b>${fmtDate(op.FECHA_INICIO,true)}</b></div><div><span>KM INICIAL</span><b>${number(op.KM_INICIO)}</b></div><div><span>GPS</span><b>Disponible</b></div></div>${hasPermission('OPERACIONES','ACTUALIZAR')?`<button class="btn danger small" data-finish-operation="${op.ID}" style="margin-top:12px">Finalizar operación</button>`:''}</article>`).join('');
    const opRows=(ops.rows||[]).map(op=>`<tr><td><strong>${esc(op.ID)}</strong></td><td>${esc(vehicleMap[op.VEHICULO_ID]?.PATENTE||op.VEHICULO_ID)}</td><td>${esc(driverMap[op.CONDUCTOR_ID]?.NOMBRE||op.CONDUCTOR_ID)}</td><td>${esc(op.ORIGEN||'')} → ${esc(op.DESTINO||'')}</td><td>${fmtDate(op.FECHA_INICIO,true)}</td><td>${status(op.ESTADO)}</td></tr>`).join('');
    const createActions=hasPermission('OPERACIONES','CREAR')?(currentUser.ROL_ID==='ROL-CONDUCTOR'
      ? '<button class="btn primary" data-open-qr>▦ Validar QR e iniciar</button>'
      : '<button class="btn soft" data-open-qr>▦ Escanear QR</button><button class="btn primary" data-new-operation>＋ Nueva operación</button>'):'';
    return heading('CONTROL DE VIAJES','Operaciones','Inicie y finalice recorridos con selección manual o código QR.',createActions)+
      `<div class="operation-banner"><i>▦</i><div><h3>Operación con seguimiento GPS</h3><p>Al iniciar una operación, el conductor puede autorizar el envío visible de su posición desde el módulo GPS.</p></div>${hasPermission('OPERACIONES','CREAR')?'<button class="btn soft" data-open-qr>Usar QR</button>':''}</div>`+
      `<div class="operation-layout"><article class="card"><div class="card-header"><div><h3>Operaciones activas</h3><p>${active.length} recorridos en curso</p></div></div>${activeHtml||empty('⇄','No hay operaciones activas','Cree la primera operación cuando existan un vehículo y un conductor disponibles.')}</article><article class="card"><div class="card-header"><div><h3>Requisitos</h3><p>Datos necesarios para comenzar</p></div></div><div class="summary-list"><div class="summary-row"><i>▣</i><div><b>Vehículo disponible</b><span>${(vehicles.rows||[]).filter(v=>v.ESTADO==='Disponible').length} unidades</span></div></div><div class="summary-row"><i>♙</i><div><b>Conductor disponible</b><span>${(drivers.rows||[]).filter(d=>d.ESTADO==='Disponible').length} personas</span></div></div></div></article></div>`+
      `<article class="card" style="margin-top:18px"><div class="card-header"><div><h3>Registro de operaciones</h3><p>Historial completo</p></div></div>${table(['Operación','Vehículo','Conductor','Ruta','Inicio','Estado'],opRows)}</article>`;
  }

  async function renderRoutes(){
    const [routesResult,driversResult,vehiclesResult,realtime]=await Promise.all([
      api.request('list',{resource:'routes'}),api.request('list',{resource:'drivers'}),api.request('list',{resource:'vehicles'}),api.request('realtimeSummary')
    ]);
    const drivers=Object.fromEntries((driversResult.rows||[]).map(row=>[row.ID,row]));
    const vehicles=Object.fromEntries((vehiclesResult.rows||[]).map(row=>[row.ID,row]));
    const routes=(routesResult.rows||[]).sort((a,b)=>new Date(b.FECHA_ASIGNACION||0)-new Date(a.FECHA_ASIGNACION||0)).map(route=>({...route,
      CONDUCTOR_NOMBRE:drivers[route.CONDUCTOR_ID]?.NOMBRE||route.CONDUCTOR_ID,VEHICULO_PATENTE:vehicles[route.VEHICULO_ID]?.PATENTE||route.VEHICULO_ID
    }));
    const active=routes.filter(route=>['Asignada','En curso'].includes(route.ESTADO)),finished=routes.filter(route=>!['Asignada','En curso'].includes(route.ESTADO));
    const create=hasPermission('RUTAS','CREAR')?'<button class="btn primary" data-new-route>＋ Asignar ruta</button>':'';
    return heading('PLANIFICACIÓN','Rutas asignadas','Asigne recorridos y permita que cada conductor navegue con Google Maps o Waze.',`<button class="btn soft" data-refresh>↻ Actualizar</button>${create}`)+
      `<div class="live-strip">${liveStat('➜','Rutas activas',active.length)}${liveStat('✓','Completadas',finished.filter(r=>r.ESTADO==='Completada').length,'online')}${liveStat('⌖','Sesiones abiertas',realtime.totals?.onlineDevices||0,'online')}${liveStat('🚐','Conduciendo',realtime.totals?.drivingSessions||0,'online')}</div>`+
      `<div class="route-layout"><article class="card"><div class="card-header"><div><h3>Asignaciones vigentes</h3><p>${active.length} rutas pendientes o en curso</p></div></div><div class="route-list">${active.map(route=>routeCard(route)).join('')||empty('➜','Sin rutas activas','No existen recorridos pendientes para este usuario.')}</div></article>`+
      `<article class="card"><div class="card-header"><div><h3>Sesiones y conductores</h3><p>Usuario y actividad de cada sesión abierta</p></div></div><div class="device-list">${(realtime.devices||[]).map(deviceCard).join('')||empty('○','Sin sesiones','Las conexiones aparecerán cuando los usuarios inicien sesión.')}</div></article></div>`+
      `<article class="card" style="margin-top:18px"><div class="card-header"><div><h3>Historial de rutas</h3><p>Recorridos completados o cancelados</p></div></div><div class="route-list">${finished.slice(0,30).map(route=>routeCard(route)).join('')||empty('✓','Sin historial','Todavía no se han cerrado rutas.')}</div></article>`;
  }

  async function renderNotifications(){
    const result=await api.request('list',{resource:'notifications'}),items=(result.rows||[]).sort((a,b)=>new Date(b.FECHA_ENVIO||0)-new Date(a.FECHA_ENVIO||0));
    const send=hasPermission('NOTIFICACIONES','CREAR')?'<button class="btn primary" data-new-notification>＋ Enviar notificación</button>':'';
    return heading('COMUNICACIONES','Notificaciones','Mensajes dirigidos a cada conductor según su cuenta asociada.',`<button class="btn soft" data-refresh>↻ Actualizar</button>${send}`)+
      `<div class="live-strip">${liveStat('🔔','Total',items.length)}${liveStat('!','Sin leer',items.filter(i=>i.LEIDA!=='SI').length,'warning')}${liveStat('✓','Leídas',items.filter(i=>i.LEIDA==='SI').length,'online')}${liveStat('➜','Relacionadas con rutas',items.filter(i=>i.RUTA_ID).length)}</div>`+
      `<article class="card"><div class="notification-list">${items.map(notificationCard).join('')||empty('🔔','Sin notificaciones','No hay mensajes disponibles para esta cuenta.')}</div></article>`;
  }

  async function renderGps() {
    const realtime=await api.request('realtimeSummary'),locations={rows:realtime.locations||[],total:realtime.totals?.locations||0};
    return heading('MONITOREO','GPS en tiempo real','Posición, dirección escrita, velocidad y conexión de los teléfonos autorizados.',`<button class="btn soft" data-refresh-locations>↻ Actualizar</button><button class="btn soft" data-capture-gps>⌖ Enviar ahora</button><button class="btn ${gpsWatchId===null?'primary':'danger'}" data-toggle-tracking>${gpsWatchId===null?'Activar ubicación continua':'Detener ubicación continua'}</button>`)+
      `<div class="tracking-notice ${gpsWatchId===null?'inactive':'active'}" data-tracking-notice><i data-tracking-icon>${gpsWatchId===null?'○':'●'}</i><div><b data-tracking-title>${gpsWatchId===null?'Ubicación continua detenida':'Ubicación continua activada'}</b><span data-tracking-detail>${trackingDetail()}</span></div></div>`+
      `<div class="tracking-details"><div><span>Permiso del navegador</span><b data-tracking-permission>${permissionLabel()}</b></div><div><span>Reactivación automática</span><b data-tracking-preference>${trackingPreferenceEnabled()?'Activada':'Desactivada'}</b></div><div><span>Protección de pantalla activa</span><b data-wake-lock>${wakeLockLabel()}</b></div></div>`+
      `<div class="live-strip">${liveStat('⌖','Ubicaciones visibles',locations.total)}${liveStat('●','Sesiones abiertas',realtime.totals?.onlineDevices||0,'online')}${liveStat('🚐','Conduciendo',realtime.totals?.drivingSessions||0,'online')}${liveStat('!','Operación sin GPS',realtime.totals?.sessionsWithoutGps||0,(realtime.totals?.sessionsWithoutGps||0)?'warning':'')}</div>`+
      `<div class="gps-layout"><article class="card map-card"><div id="fleetMap" class="fleet-map"></div><div class="map-toolbar"><span class="gps-live"><i></i> Consulta cada ${Math.round(config.INTERVALO_TIEMPO_REAL_MILISEGUNDOS/1000)} segundos</span><span class="map-status-legend"><b class="active"></b> Activo <b class="inactive"></b> Inactivo</span><span class="muted" id="gpsLastSync">Preparando consulta…</span><span class="muted push">Mapa © colaboradores de OpenStreetMap</span></div></article><article class="card"><div class="card-header"><div><h3>Últimas posiciones</h3><p id="locationCount">${locations.total} conductores visibles</p></div></div><div class="driver-location-list" id="driverLocationList">${locationList(locations.rows)}</div><div class="card-header" style="margin-top:18px"><div><h3>Sesiones y conductores</h3><p>Usuario, actividad y sección abierta</p></div></div><div class="device-list" id="deviceList">${(realtime.devices||[]).map(deviceCard).join('')||empty('○','Sin sesiones','Esperando señales de los dispositivos.')}</div></article></div>`;
  }
  function locationList(rows){return rows.length?rows.map(row=>{const active=antiguedadUbicacion(row.FECHA_HORA)<=config.ANTIGUEDAD_UBICACION_ACTIVA_MILISEGUNDOS;return `<button class="driver-location ${active?'active':'inactive'}" data-focus-location="${row.LATITUD},${row.LONGITUD}"><i>●</i><div><b>${esc(row.CONDUCTOR_NOMBRE||row.CONDUCTOR_ID||'Sin conductor')}</b><span>${esc(row.VEHICULO_PATENTE||row.VEHICULO_ID||'Sin vehículo')} · ${Number(row.VELOCIDAD_KMH||0).toFixed(0)} km/h · ${active?'Activo':'Inactivo'}</span><span class="address-line">${esc(row.DIRECCION||`${Number(row.LATITUD).toFixed(5)}, ${Number(row.LONGITUD).toFixed(5)}`)}</span></div><time>${fmtDate(row.FECHA_HORA,true)}</time></button>`;}).join(''):empty('⌖','Sin ubicaciones','Cuando un conductor autorice y envíe su GPS, aparecerá aquí.');}

  async function renderHistory(){const [history,ops]=await Promise.all([api.request('list',{resource:'history'}),api.request('list',{resource:'operations'})]);const rows=(history.rows||[]).map(h=>`<tr><td>${esc(h.OPERACION_ID)}</td><td>${esc(h.EVENTO)}</td><td>${esc(h.DETALLE)}</td><td>${fmtDate(h.FECHA_HORA,true)}</td><td>${esc(h.USUARIO_ID||'—')}</td></tr>`).join('');return heading('TRAZABILIDAD','Historial','Eventos de inicio, cierre y cambios de las operaciones.',`<button class="btn soft" data-export="history">Exportar CSV</button>`)+`<article class="card">${table(['Operación','Evento','Detalle','Fecha','Usuario'],rows)}</article>`;}
  async function renderReports(){return heading('ANÁLISIS','Reportes','Exporte los registros de cada módulo en formato CSV.')+`<div class="kpi-grid">${['vehicles','drivers','operations','gps'].map(r=>`<button class="metric-card" data-export="${r}"><i class="metric-icon">⇩</i><div><span>Exportar</span><b style="font-size:17px">${labels[r]||r}</b><small>Archivo CSV</small></div></button>`).join('')}</div><article class="card">${empty('▥','Reportes listos para usar','Los archivos se generan con los datos actuales de Hojas de cálculo de Google o del almacenamiento local.')}</article>`;}
  async function renderAudit(){const result=await api.request('list',{resource:'audit'});const rows=(result.rows||[]).map(a=>`<tr><td>${fmtDate(a.FECHA_HORA||a.CREADO_EN,true)}</td><td>${esc(a.USUARIO_NOMBRE)}</td><td><strong>${esc(a.ACCION)}</strong></td><td>${esc(a.MODULO)}</td><td>${esc(a.DETALLE)}</td></tr>`).join('');return heading('BITÁCORA','Auditoría','Registro de las acciones realizadas en el sistema.',`<button class="btn soft" data-export="audit">Exportar CSV</button>`)+`<article class="card">${table(['Fecha','Usuario','Acción','Módulo','Detalle'],rows)}</article>`;}
  async function refreshCompanyBranding(){
    try{const result=await api.request('list',{resource:'companies'});currentCompany=(result.rows||[])[0]||null;applyBranding(currentCompany);}catch(_){applyBranding(currentCompany);}
  }

  function applyBranding(company){
    if(company)currentCompany=company;
    const data=currentCompany||{};
    const name=data.NOMBRE_FANTASIA||data.RAZON_SOCIAL||'Sistema de Gestión de Flotas';
    const subtitle=data.GIRO||'Gestión integral';
    const logo=data.DIRECCION_LOGOTIPO||'logo.svg';
    ['authCompanyName','sidebarCompanyName'].forEach(id=>{const node=$('#'+id);if(node)node.textContent=name;});
    const sub=$('#sidebarCompanySubtitle');if(sub)sub.textContent=subtitle;
    ['authCompanyLogo','sidebarCompanyLogo'].forEach(id=>{const image=$('#'+id);if(image){image.src=logo;image.onerror=()=>{image.onerror=null;image.src='logo.svg';};}});
    if(data.COLOR_PRINCIPAL&&/^#[0-9A-F]{6}$/i.test(data.COLOR_PRINCIPAL)){document.documentElement.style.setProperty('--primary',data.COLOR_PRINCIPAL);}
    if(data.COLOR_SECUNDARIO&&/^#[0-9A-F]{6}$/i.test(data.COLOR_SECUNDARIO)){document.documentElement.style.setProperty('--primary-dark',data.COLOR_SECUNDARIO);}
    document.title=`${name} | Sistema de Gestión de Flotas`;
  }

  function companyValue(company,key,fallback=''){return esc(company?.[key]??fallback);}

  async function renderCompany(){
    const result=await api.request('list',{resource:'companies'});const company=(result.rows||[])[0]||{};currentCompany=company;applyBranding(company);
    const logo=company.DIRECCION_LOGOTIPO||'logo.svg';
    return heading('IDENTIDAD INSTITUCIONAL','Empresa','Administre el logotipo, los datos legales, la ubicación y las preferencias generales de la organización.',`<span class="status ok">Configuración permanente</span>`)+
    `<form id="companyForm" class="company-layout">
      <article class="card company-logo-card">
        <div class="card-header"><div><h3>Logotipo de la empresa</h3><p>Se mostrará en el acceso y en el menú principal</p></div></div>
        <div class="company-logo-preview"><img id="companyLogoPreview" src="${esc(logo)}" alt="Vista previa del logotipo"></div>
        <label class="field"><span>Cargar logotipo</span><input id="companyLogo" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <p class="helper">Formatos permitidos: PNG, JPG o WebP. Tamaño recomendado: hasta 1,5 MB.</p>
        <input id="removeLogoValue" type="hidden" value="NO">
        <button class="btn soft full" data-remove-company-logo type="button">Quitar logotipo actual</button>
        <div class="brand-colors">
          <label class="field"><span>Color principal</span><input name="COLOR_PRINCIPAL" type="color" value="${companyValue(company,'COLOR_PRINCIPAL','#0b5f59')}"></label>
          <label class="field"><span>Color secundario</span><input name="COLOR_SECUNDARIO" type="color" value="${companyValue(company,'COLOR_SECUNDARIO','#074640')}"></label>
        </div>
      </article>
      <div class="company-form-column">
        <article class="card">
          <div class="card-header"><div><h3>Identificación de la empresa</h3><p>Datos comerciales y legales</p></div></div>
          <div class="form-grid">
            <label class="field"><span>RUT</span><input name="RUT" value="${companyValue(company,'RUT')}" placeholder="76.123.456-7"></label>
            <label class="field"><span>Razón social</span><input name="RAZON_SOCIAL" value="${companyValue(company,'RAZON_SOCIAL')}" required></label>
            <label class="field"><span>Nombre de fantasía</span><input name="NOMBRE_FANTASIA" value="${companyValue(company,'NOMBRE_FANTASIA')}" required></label>
            <label class="field"><span>Giro o actividad</span><input name="GIRO" value="${companyValue(company,'GIRO')}"></label>
            <label class="field"><span>Representante legal</span><input name="REPRESENTANTE_LEGAL" value="${companyValue(company,'REPRESENTANTE_LEGAL')}"></label>
            <label class="field"><span>RUT del representante</span><input name="RUT_REPRESENTANTE" value="${companyValue(company,'RUT_REPRESENTANTE')}"></label>
          </div>
        </article>
        <article class="card">
          <div class="card-header"><div><h3>Contacto y ubicación</h3><p>Información para documentos y comunicaciones</p></div></div>
          <div class="form-grid">
            <label class="field full"><span>Dirección</span><input name="DIRECCION" value="${companyValue(company,'DIRECCION')}" data-address-autocomplete placeholder="Comience a escribir una dirección"></label>
            <label class="field"><span>Comuna</span><input name="COMUNA" value="${companyValue(company,'COMUNA')}"></label>
            <label class="field"><span>Ciudad</span><input name="CIUDAD" value="${companyValue(company,'CIUDAD')}"></label>
            <label class="field"><span>Región</span><input name="REGION" value="${companyValue(company,'REGION')}"></label>
            <label class="field"><span>País</span><input name="PAIS" value="${companyValue(company,'PAIS','Chile')}"></label>
            <label class="field"><span>Teléfono principal</span><input name="TELEFONO_PRINCIPAL" value="${companyValue(company,'TELEFONO_PRINCIPAL')}"></label>
            <label class="field"><span>Teléfono secundario</span><input name="TELEFONO_SECUNDARIO" value="${companyValue(company,'TELEFONO_SECUNDARIO')}"></label>
            <label class="field"><span>Correo institucional</span><input name="CORREO" type="email" value="${companyValue(company,'CORREO')}"></label>
            <label class="field"><span>Sitio web</span><input name="SITIO_WEB" type="url" value="${companyValue(company,'SITIO_WEB')}" placeholder="https://..."></label>
          </div>
        </article>
        <article class="card">
          <div class="card-header"><div><h3>Preferencias generales</h3><p>Formato utilizado por el sistema</p></div></div>
          <div class="form-grid">
            <label class="field"><span>Zona horaria</span><select name="ZONA_HORARIA"><option ${company.ZONA_HORARIA==='America/Santiago'?'selected':''}>America/Santiago</option><option ${company.ZONA_HORARIA==='America/Sao_Paulo'?'selected':''}>America/Sao_Paulo</option><option ${company.ZONA_HORARIA==='UTC'?'selected':''}>UTC</option></select></label>
            <label class="field"><span>Moneda</span><select name="MONEDA"><option value="CLP" ${company.MONEDA==='CLP'?'selected':''}>Peso chileno</option><option value="USD" ${company.MONEDA==='USD'?'selected':''}>Dólar estadounidense</option><option value="EUR" ${company.MONEDA==='EUR'?'selected':''}>Euro</option></select></label>
            <label class="field"><span>Unidad de distancia</span><select name="UNIDAD_DISTANCIA"><option value="km" ${company.UNIDAD_DISTANCIA!=='mi'?'selected':''}>Kilómetros</option><option value="mi" ${company.UNIDAD_DISTANCIA==='mi'?'selected':''}>Millas</option></select></label>
            <label class="field"><span>Formato de fecha</span><select name="FORMATO_FECHA"><option value="DD-MM-AAAA" ${company.FORMATO_FECHA!=='AAAA-MM-DD'?'selected':''}>Día-Mes-Año</option><option value="AAAA-MM-DD" ${company.FORMATO_FECHA==='AAAA-MM-DD'?'selected':''}>Año-Mes-Día</option></select></label>
            <label class="field full"><span>Texto de pie institucional</span><textarea name="TEXTO_PIE" placeholder="Texto para reportes y documentos">${companyValue(company,'TEXTO_PIE')}</textarea></label>
            <label class="field"><span>Estado</span><select name="ESTADO"><option ${company.ESTADO!=='Inactivo'?'selected':''}>Activo</option><option ${company.ESTADO==='Inactivo'?'selected':''}>Inactivo</option></select></label>
          </div>
          <div class="form-actions"><button class="btn primary" type="submit">Guardar configuración de empresa</button></div>
        </article>
      </div>
    </form>`;
  }

  function readImageFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('NO_SE_PUDO_LEER_LOGO'));reader.readAsDataURL(file);});}

  async function saveCompany(event){
    event.preventDefault();const form=event.currentTarget;const button=$('button[type="submit"]',form);button.disabled=true;setSave('Guardando empresa…','saving');
    try{
      const formData=new FormData(form),data=Object.fromEntries(formData.entries());const file=$('#companyLogo')?.files?.[0];
      const payload={data,eliminarLogotipo:$('#removeLogoValue')?.value||'NO'};
      if(file){if(file.size>1572864)throw new Error('LOGOTIPO_DEMASIADO_GRANDE');payload.logotipoBase64=await readImageFile(file);payload.nombreLogotipo=file.name;payload.tipoLogotipo=file.type;}
      const result=await api.request('saveCompany',payload);currentCompany=result.row||data;applyBranding(currentCompany);toast('Empresa guardada','La identidad y la información institucional fueron actualizadas.');setSave('Datos guardados');go('company');
    }catch(error){setSave('Error al guardar','error');toast('No se pudo guardar la empresa',translateError(error),'error');}finally{button.disabled=false;}
  }

  async function renderSettings(){const remote=api.isRemote();return heading('PARÁMETROS','Configuración','Conexión, apariencia y limpieza controlada de registros operativos.')+`<div class="settings-grid"><article class="card"><div class="card-header"><div><h3>Conexión de datos</h3><p>Servicio utilizado por la interfaz</p></div>${status(remote?'Google Apps Script':'Almacenamiento local')}</div><div class="info-grid"><div class="info-item"><span>Modo</span><b>${remote?'Compartido en Hojas de cálculo de Google':'Guardado en este navegador'}</b></div><div class="info-item"><span>Dirección</span><b>${remote?esc(config.DIRECCION_APLICACION.slice(0,42)+'…'):'No configurada'}</b></div></div><p class="muted">Para conectar, abra <code>configuracion.js</code> y pegue la dirección terminada en <code>/exec</code>.</p></article><article class="card"><div class="card-header"><div><h3>Apariencia</h3><p>Preferencias guardadas en el navegador</p></div></div><div class="setting-row"><div><b>Modo oscuro</b><span>Cambiar colores de la interfaz</span></div><label class="switch"><input id="darkSwitch" type="checkbox" ${document.body.classList.contains('dark')?'checked':''}><i></i></label></div><button class="btn soft" data-nav="company">Abrir configuración de empresa</button></article></div><div class="danger-zone" style="margin-top:18px"><h3>Limpiar datos operativos</h3><p>Elimina vehículos, conductores, operaciones, GPS, rutas, conexiones, mantenciones, documentos, notificaciones, alertas, reportes y bitácora. Conserva usuarios, roles y configuración de empresa.</p><button class="btn danger" data-clear-data>Limpiar datos operativos</button></div>`;}

  function bindSection() {
    $$('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.nav)));
    $$('[data-add]').forEach(btn=>btn.addEventListener('click',()=>openResourceModal(btn.dataset.add)));
    $$('[data-edit]').forEach(btn=>btn.addEventListener('click',async()=>{const [resource,id]=btn.dataset.edit.split(':');const result=await api.request('get',{resource,id});openResourceModal(resource,result.row);}));
    $$('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteRecord(btn.dataset.delete)));
    $$('[data-export]').forEach(btn=>btn.addEventListener('click',()=>exportResource(btn.dataset.export)));
    $$('[data-table-search]').forEach(input=>input.addEventListener('input',()=>filterTable(input)));
    $$('[data-refresh],[data-retry]').forEach(btn=>btn.addEventListener('click',()=>go(currentSection)));
    $$('[data-new-operation]').forEach(btn=>btn.addEventListener('click',()=>openOperationModal()));
    $$('[data-new-route]').forEach(btn=>btn.addEventListener('click',openRouteModal));
    $$('[data-route-state]').forEach(btn=>btn.addEventListener('click',()=>changeRouteState(btn.dataset.routeState)));
    $$('[data-new-notification]').forEach(btn=>btn.addEventListener('click',openNotificationModal));
    $$('[data-read-notification]').forEach(btn=>btn.addEventListener('click',()=>readNotification(btn.dataset.readNotification)));
    $$('[data-finish-operation]').forEach(btn=>btn.addEventListener('click',()=>finishOperation(btn.dataset.finishOperation)));
    $$('[data-open-qr]').forEach(btn=>btn.addEventListener('click',openQr));
    $$('[data-refresh-locations]').forEach(btn=>btn.addEventListener('click',refreshLocations));
    $$('[data-capture-gps]').forEach(btn=>btn.addEventListener('click',captureGps));
    $$('[data-toggle-tracking]').forEach(btn=>btn.addEventListener('click',toggleTracking));
    $$('[data-focus-location]').forEach(btn=>btn.addEventListener('click',()=>{const [lat,lng]=btn.dataset.focusLocation.split(',').map(Number);mapaFlota?.establecerVista(lat,lng,16);}));
    $('[data-clear-data]')?.addEventListener('click',clearData);
    $('#darkSwitch')?.addEventListener('change',event=>setTheme(event.target.checked));
    $('#companyForm')?.addEventListener('submit',saveCompany);
    $('#companyLogo')?.addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>1572864){event.target.value='';return toast('Logotipo demasiado grande','El archivo debe pesar como máximo 1,5 MB.','error');}$('#companyLogoPreview').src=await readImageFile(file);$('#removeLogoValue').value='NO';});
    $('[data-remove-company-logo]')?.addEventListener('click',()=>{$('#companyLogoPreview').src='logo.svg';$('#companyLogo').value='';$('#removeLogoValue').value='SI';});
    bindAddressAutocomplete($('#content'));
  }

  async function openResourceModal(resource, record = null) {
    const definition=resourceFields[resource]; if(!definition)return;
    let users=[],vehicles=[];
    if(definition.fields.some(f=>f[2]==='userSelect')) users=(await api.request('list',{resource:'users'})).rows||[];
    if(definition.fields.some(f=>f[2]==='vehicleSelect')) vehicles=(await api.request('list',{resource:'vehicles'})).rows||[];
    $('#modalEyebrow').textContent=definition.eyebrow; $('#modalTitle').textContent=`${record?'Editar':'Nuevo'} ${definition.title.toLowerCase()}`;
    const controls=definition.fields.map(([name,label,type,option])=>{
      const required=(option===true && !(record && name==='CONTRASENA'))?'required':''; const current=record?.[name]??''; let control='';
      if(type==='select'){
        const options=Array.isArray(option)?option:[]; control=`<select name="${name}" ${required}><option value="">Seleccione</option>${options.map(item=>{const value=Array.isArray(item)?item[0]:item, text=Array.isArray(item)?item[1]:item;return `<option value="${esc(value)}" ${String(current)===String(value)?'selected':''}>${esc(text)}</option>`}).join('')}</select>`;
      }else if(type==='userSelect')control=`<select name="${name}"><option value="">Sin asociar</option>${users.map(u=>`<option value="${u.ID}" ${current===u.ID?'selected':''}>${esc(u.NOMBRE)} · ${esc(u.CORREO)}</option>`).join('')}</select>`;
      else if(type==='vehicleSelect')control=`<select name="${name}" required><option value="">Seleccione</option>${vehicles.map(v=>`<option value="${v.ID}" ${current===v.ID?'selected':''}>${esc(v.PATENTE)} · ${esc(v.MARCA)} ${esc(v.MODELO)}</option>`).join('')}</select>`;
      else if(type==='textarea')control=`<textarea name="${name}" ${required}>${esc(current)}</textarea>`;
      else{const value=(type==='date'&&current)?String(current).slice(0,10):current;control=`<input name="${name}" type="${type}" value="${esc(value)}" ${required}>`;}
      const full=['DESCRIPCION','OBSERVACIONES','MENSAJE','DIRECCION_ARCHIVO'].includes(name)?'full':'';return `<label class="field ${full}"><span>${label}</span>${control}</label>`;
    }).join('');
    $('#modalBody').innerHTML=`<form class="form-grid" id="resourceForm">${controls}<div class="form-actions"><button class="btn soft" type="button" data-cancel-modal>Cancelar</button><button class="btn primary" type="submit">Guardar registro</button></div></form>`;
    openModal(); $('[data-cancel-modal]').addEventListener('click',closeModal); $('#resourceForm').addEventListener('submit',event=>saveResource(event,resource,record?.ID));
  }

  async function saveResource(event,resource,id){event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());Object.keys(data).forEach(key=>{if(data[key]==='')delete data[key]});const button=$('button[type="submit"]',event.currentTarget);button.disabled=true;try{setSave('Guardando…','saving');await api.request(id?'update':'create',{resource,id,data});closeModal();toast('Registro guardado','La información quedó almacenada.');setSave('Datos guardados');go(currentSection);}catch(error){setSave('Error al guardar','error');toast('No se pudo guardar',translateError(error),'error');}finally{button.disabled=false;}}

  async function deleteRecord(value){const [resource,id]=value.split(':');if(!confirm('¿Eliminar este registro? La eliminación será lógica en Hojas de cálculo de Google.'))return;try{await api.request('delete',{resource,id});toast('Registro eliminado');go(currentSection);}catch(error){toast('No se pudo eliminar',translateError(error),'error');}}
  function filterTable(input){const q=input.value.trim().toLowerCase();$$('[data-search-row]').forEach(row=>row.style.display=row.dataset.searchRow.includes(q)?'':'none');}

  async function openRouteModal(){
    try{
      const [drivers,vehicles]=await Promise.all([api.request('list',{resource:'drivers'}),api.request('list',{resource:'vehicles'})]);
      $('#modalEyebrow').textContent='PLANIFICACIÓN';$('#modalTitle').textContent='Asignar nueva ruta';
      $('#modalBody').innerHTML=`<form class="form-grid" id="routeForm"><label class="field"><span>Conductor</span><select name="CONDUCTOR_ID" required><option value="">Seleccione</option>${(drivers.rows||[]).filter(d=>d.ESTADO!=='Inactivo').map(d=>`<option value="${d.ID}">${esc(d.NOMBRE)} · ${esc(d.RUT||'')}</option>`).join('')}</select></label><label class="field"><span>Vehículo</span><select name="VEHICULO_ID"><option value="">Por definir</option>${(vehicles.rows||[]).filter(v=>v.ESTADO!=='Inactivo').map(v=>`<option value="${v.ID}">${esc(v.PATENTE)} · ${esc(v.MARCA||'')} ${esc(v.MODELO||'')}</option>`).join('')}</select></label><label class="field"><span>Nombre de la ruta</span><input name="NOMBRE" placeholder="Ej. Entrega sector norte"></label><label class="field"><span>Aplicación de navegación</span><select name="PROVEEDOR_NAVEGACION"><option>Google Maps</option><option>Waze</option></select></label><label class="field full"><span>Origen en palabras</span><input name="ORIGEN" value="Ubicación actual" data-address-autocomplete data-lat-target="ORIGEN_LATITUD" data-lng-target="ORIGEN_LONGITUD" placeholder="Comience a escribir el origen"><input name="ORIGEN_LATITUD" type="hidden"><input name="ORIGEN_LONGITUD" type="hidden"></label><label class="field full"><span>Destino en palabras</span><input name="DESTINO" required data-address-autocomplete data-lat-target="DESTINO_LATITUD" data-lng-target="DESTINO_LONGITUD" placeholder="Comience a escribir el destino"></label><label class="field"><span>Latitud destino</span><input name="DESTINO_LATITUD" type="number" step="any" readonly placeholder="Se completará automáticamente"></label><label class="field"><span>Longitud destino</span><input name="DESTINO_LONGITUD" type="number" step="any" readonly placeholder="Se completará automáticamente"></label><label class="field"><span>Prioridad</span><select name="PRIORIDAD"><option>Normal</option><option selected>Alta</option><option>Urgente</option></select></label><label class="field full"><span>Instrucciones al conductor</span><textarea name="INSTRUCCIONES" placeholder="Indicaciones, horarios, contacto o restricciones"></textarea></label><div class="form-actions"><button class="btn soft" type="button" data-cancel-modal>Cancelar</button><button class="btn primary" type="submit">Asignar y notificar</button></div></form>`;
      openModal();bindAddressAutocomplete($('#routeForm'));$('[data-cancel-modal]').onclick=closeModal;$('#routeForm').onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());try{await api.request('assignRoute',{data});closeModal();toast('Ruta asignada','El conductor recibió una notificación en su bandeja.');go('routes');}catch(error){toast('No se pudo asignar',translateError(error),'error');}};
    }catch(error){toast('No se pudo abrir el formulario',translateError(error),'error');}
  }
  async function changeRouteState(value){const split=value.indexOf(':'),id=value.slice(0,split),state=value.slice(split+1);try{await api.request('updateRouteStatus',{id,ESTADO:state});toast('Ruta actualizada',`Nuevo estado: ${state}.`);go(currentSection);}catch(error){toast('No se pudo actualizar',translateError(error),'error');}}
  async function openNotificationModal(){
    try{
      const drivers=await api.request('list',{resource:'drivers'});
      $('#modalEyebrow').textContent='COMUNICACIONES';$('#modalTitle').textContent='Enviar notificación';
      $('#modalBody').innerHTML=`<form class="form-grid" id="notificationForm"><label class="field full"><span>Conductor destinatario</span><select name="DESTINATARIO_CONDUCTOR_ID" required><option value="">Seleccione</option>${(drivers.rows||[]).map(d=>`<option value="${d.ID}">${esc(d.NOMBRE)} · ${esc(d.RUT||'')}</option>`).join('')}</select></label><label class="field"><span>Tipo</span><select name="TIPO"><option>Información</option><option>Ruta</option><option>Operación</option><option>Seguridad</option><option>Documento</option></select></label><label class="field"><span>Prioridad</span><select name="PRIORIDAD"><option>Baja</option><option selected>Normal</option><option>Alta</option><option>Urgente</option></select></label><label class="field full"><span>Título</span><input name="TITULO" required></label><label class="field full"><span>Mensaje</span><textarea name="MENSAJE" required></textarea></label><div class="form-actions"><button class="btn soft" type="button" data-cancel-modal>Cancelar</button><button class="btn primary" type="submit">Enviar notificación</button></div></form>`;
      openModal();$('[data-cancel-modal]').onclick=closeModal;$('#notificationForm').onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());try{await api.request('sendNotification',{data});closeModal();toast('Notificación enviada','El mensaje aparecerá en la cuenta del conductor.');go('notifications');}catch(error){toast('No se pudo enviar',translateError(error),'error');}};
    }catch(error){toast('No se pudo cargar conductores',translateError(error),'error');}
  }
  async function readNotification(id){try{await api.request('readNotification',{id});await refreshNotificationBadge();if(currentSection==='notifications'||currentSection==='dashboard')go(currentSection);}catch(error){toast('No se pudo actualizar',translateError(error),'error');}}

  async function openOperationModal(prefillVehicle=null) {
    const [vehicles,drivers]=await Promise.all([api.request('list',{resource:'vehicles'}),api.request('list',{resource:'drivers'})]);
    const prefillObject=typeof prefillVehicle==='object'&&prefillVehicle?prefillVehicle:null,prefillId=prefillObject?.ID||String(prefillVehicle||'');
    const availableVehicles=(vehicles.rows||[]).filter(v=>v.ESTADO==='Disponible');
    if(prefillObject&&!availableVehicles.some(v=>v.ID===prefillObject.ID))availableVehicles.unshift(prefillObject);
    const availableDrivers=(drivers.rows||[]).filter(d=>d.ESTADO==='Disponible'||d.ID===currentUser.CONDUCTOR_ID);
    $('#modalEyebrow').textContent='OPERACIÓN';$('#modalTitle').textContent='Iniciar nueva operación';
    $('#modalBody').innerHTML=`<form class="form-grid" id="operationForm">${prefillObject?`<div class="tracking-notice active full"><i>✓</i><div><b>QR validado: ${esc(prefillObject.PATENTE)}</b><span>${esc(prefillObject.MARCA||'')} ${esc(prefillObject.MODELO||'')} · ${esc(prefillObject.QR_CODIGO||'')}</span></div></div><input type="hidden" name="AUTORIZACION_QR" value="${esc(prefillObject.AUTORIZACION_QR||'')}">`:''}<label class="field"><span>Vehículo</span><select name="VEHICULO_ID" required><option value="">Seleccione</option>${availableVehicles.map(v=>`<option value="${v.ID}" ${v.ID===prefillId?'selected':''}>${esc(v.PATENTE)} · ${esc(v.MARCA)} ${esc(v.MODELO)}</option>`).join('')}</select></label><label class="field"><span>Conductor</span><select name="CONDUCTOR_ID" required><option value="">Seleccione</option>${availableDrivers.map(d=>`<option value="${d.ID}" ${d.ID===currentUser.CONDUCTOR_ID?'selected':''}>${esc(d.NOMBRE)} · ${esc(d.RUT)}</option>`).join('')}</select></label><label class="field"><span>Origen</span><input name="ORIGEN" value="Ubicación actual" data-address-autocomplete placeholder="Comience a escribir el origen"></label><label class="field"><span>Destino</span><input name="DESTINO" required data-address-autocomplete placeholder="Comience a escribir el destino"></label><label class="field"><span>KM inicial</span><input name="KM_INICIO" type="number" min="0"></label><label class="field full"><span>Observaciones</span><textarea name="OBSERVACIONES"></textarea></label><div class="form-actions"><button class="btn soft" type="button" data-cancel-modal>Cancelar</button><button class="btn primary" type="submit">Iniciar operación</button></div></form>`;
    openModal();bindAddressAutocomplete($('#operationForm'));$('[data-cancel-modal]').onclick=closeModal;$('#operationForm').onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());try{await api.request('startOperation',{data});closeModal();toast('Operación iniciada','El vehículo y el conductor quedaron en ruta.');go('operations');}catch(error){toast('No se pudo iniciar',translateError(error),'error');}};
  }
  async function finishOperation(id){const km=prompt('Kilometraje final del vehículo:','0');if(km===null)return;try{await api.request('finishOperation',{id,KM_FIN:Number(km)});toast('Operación finalizada');go('operations');}catch(error){toast('No se pudo finalizar',translateError(error),'error');}}

  function antiguedadUbicacion(fecha) {
    const tiempo = new Date(fecha || 0).getTime();
    return Number.isFinite(tiempo) ? Date.now() - tiempo : Number.MAX_SAFE_INTEGER;
  }

  function distanciaMetros(lat1, lon1, lat2, lon2) {
    const radio = 6371000;
    const rad = valor => Number(valor) * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * radio * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function initMap() {
    const contenedor = $('#fleetMap');
    if (!contenedor || !window.MapaFlotas) {
      toast('Mapa no disponible','No se pudo iniciar el componente del mapa.','error');
      return;
    }
    mapaFlota = new MapaFlotas(contenedor, {
      centro: config.CENTRO_MAPA,
      nivel: config.NIVEL_ACERCAMIENTO_MAPA
    });
    await refreshLocations(false, true);
    gpsRefreshTimer = setInterval(() => refreshLocations(false, false), config.INTERVALO_TIEMPO_REAL_MILISEGUNDOS||config.INTERVALO_GPS_MILISEGUNDOS);
  }

  async function refreshLocations(showToast = true, ajustar = false) {
    try {
      const result = await api.request('realtimeSummary', { marcaTiempo: Date.now() });
      const filas = result.locations || [];
      const marcadores = filas.map(row => {
        const latitud = Number(row.LATITUD), longitud = Number(row.LONGITUD);
        if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;
        const activo = antiguedadUbicacion(row.FECHA_HORA) <= config.ANTIGUEDAD_UBICACION_ACTIVA_MILISEGUNDOS;
        const nombre = row.CONDUCTOR_NOMBRE || row.CONDUCTOR_ID || 'Conductor';
        const vehiculo = row.VEHICULO_PATENTE || row.VEHICULO_ID || 'Sin vehículo';
        return {
          id: row.CONDUCTOR_ID || row.VEHICULO_ID || row.ID,
          latitud,
          longitud,
          nombre,
          activo,
          detalle: `<b>${esc(nombre)}</b><span>${esc(vehiculo)}</span><span>${esc(row.DIRECCION||`${latitud.toFixed(5)}, ${longitud.toFixed(5)}`)}</span><span>${Number(row.VELOCIDAD_KMH||0).toFixed(0)} km/h</span><small>${activo?'Activo · Ubicación reciente':'Inactivo · Sin actualización reciente'} · ${fmtDate(row.FECHA_HORA,true)}</small>`
        };
      }).filter(Boolean);
      mapaFlota?.actualizarMarcadores(marcadores, ajustar);
      const list = $('#driverLocationList');
      if (list) {
        list.innerHTML = locationList(filas);
        $('#locationCount').textContent = `${filas.length} conductores visibles`;
        $$('[data-focus-location]').forEach(btn => btn.onclick = () => {
          const [lat,lng] = btn.dataset.focusLocation.split(',').map(Number);
          mapaFlota?.establecerVista(lat,lng,16);
        });
      }
      const sincronizacion = $('#gpsLastSync');
      if (sincronizacion) sincronizacion.textContent = `Última consulta: ${new Intl.DateTimeFormat('es-CL',{timeStyle:'medium'}).format(new Date())}`;
      const devices=$('#deviceList');if(devices)devices.innerHTML=(result.devices||[]).map(deviceCard).join('')||empty('○','Sin conexiones','Esperando señales de dispositivos.');
      if (showToast) toast('Mapa actualizado',`${filas.length} ubicaciones visibles.`);
      setConnection(true,api.isRemote()?'Aplicación de Google conectada':'Modo local activo');
    } catch (error) {
      setConnection(false,'Error GPS');
      if (showToast) toast('No se pudo actualizar',translateError(error),'error');
    }
  }

  function captureGps() {
    if (!navigator.geolocation) return toast('GPS no compatible','Este navegador no ofrece geolocalización.','error');
    navigator.geolocation.getCurrentPosition(
      position => {geolocationPermissionState='granted';updateTrackingUi();sendPosition(position,'GPS real',true);},
      error => handleTrackingError(error,'No se obtuvo ubicación'),
      {enableHighAccuracy:true,timeout:20000,maximumAge:3000}
    );
  }

  function trackingPreferenceEnabled(){return localStorage.getItem(trackingPreferenceKey)==='1';}
  function permissionLabel(state=geolocationPermissionState){
    return ({granted:'Concedido',prompt:'Pendiente de autorización',denied:'Bloqueado',desconocido:'No disponible'})[state]||'No disponible';
  }
  function wakeLockLabel(){
    if(!navigator.wakeLock)return 'No compatible';
    if(wakeLock&&!wakeLock.released)return 'Activa';
    return gpsWatchId===null?'No requerida':'En espera';
  }
  function trackingDetail(){
    if(gpsWatchId!==null)return 'La preferencia quedó guardada y se reanudará cuando vuelva a abrir la sesión con el permiso concedido. Mantenga la aplicación abierta; el teléfono todavía puede suspender el navegador.';
    if(trackingPreferenceEnabled())return 'La preferencia está guardada. Se reactivará automáticamente cuando el navegador tenga el permiso concedido y la aplicación esté abierta.';
    return 'Actívela una vez y acepte el permiso del teléfono. El navegador no permite conceder “Siempre” automáticamente ni garantiza datos con la aplicación cerrada.';
  }
  function updateTrackingUi(){
    const active=gpsWatchId!==null;
    $$('[data-tracking-notice]').forEach(node=>{node.classList.toggle('active',active);node.classList.toggle('inactive',!active);});
    $$('[data-tracking-icon]').forEach(node=>{node.textContent=active?'●':'○';});
    $$('[data-tracking-title]').forEach(node=>{node.textContent=active?'Ubicación continua activada':'Ubicación continua detenida';});
    $$('[data-tracking-detail]').forEach(node=>{node.textContent=trackingDetail();});
    $$('[data-tracking-permission]').forEach(node=>{node.textContent=permissionLabel();});
    $$('[data-tracking-preference]').forEach(node=>{node.textContent=trackingPreferenceEnabled()?'Activada':'Desactivada';});
    $$('[data-wake-lock]').forEach(node=>{node.textContent=wakeLockLabel();});
    $$('[data-toggle-tracking]').forEach(button=>{button.textContent=active?'Detener ubicación continua':'Activar ubicación continua';button.classList.toggle('primary',!active);button.classList.toggle('danger',active);});
  }
  async function monitorGeolocationPermission(){
    if(!navigator.permissions?.query){geolocationPermissionState='desconocido';updateTrackingUi();return geolocationPermissionState;}
    try{
      if(!geolocationPermissionHandle){
        geolocationPermissionHandle=await navigator.permissions.query({name:'geolocation'});
        geolocationPermissionHandle.addEventListener?.('change',()=>{
          geolocationPermissionState=geolocationPermissionHandle.state||'desconocido';
          if(geolocationPermissionState==='denied'&&gpsWatchId!==null)stopTracking({remember:false,silent:true});
          if(geolocationPermissionState==='granted'&&trackingPreferenceEnabled()&&currentUser&&gpsWatchId===null)startTracking({silent:true});
          updateTrackingUi();
        });
      }
      geolocationPermissionState=geolocationPermissionHandle.state||'desconocido';
    }catch(_){geolocationPermissionState='desconocido';}
    updateTrackingUi();return geolocationPermissionState;
  }
  async function requestWakeLock(){
    if(!navigator.wakeLock?.request||document.hidden||gpsWatchId===null)return;
    try{
      if(!wakeLock||wakeLock.released){
        wakeLock=await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release',()=>{wakeLock=null;updateTrackingUi();});
      }
    }catch(_){wakeLock=null;}
    updateTrackingUi();
  }
  async function releaseWakeLock(){
    const activeLock=wakeLock;wakeLock=null;
    try{await activeLock?.release?.();}catch(_){}
    updateTrackingUi();
  }
  function handleTrackingError(error,title='Seguimiento GPS'){
    const messages={1:'El permiso de ubicación está bloqueado. Habilítelo en la configuración del navegador.',2:'El teléfono no pudo determinar la ubicación. Revise el GPS y la señal.',3:'La ubicación tardó demasiado. El sistema seguirá intentando.'};
    if(error?.code===1){
      geolocationPermissionState='denied';
      if(gpsWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId=null;releaseWakeLock();
    }
    updateTrackingUi();
    if(Date.now()-lastGpsErrorAt>8000){lastGpsErrorAt=Date.now();toast(title,messages[error?.code]||error?.message||'No fue posible obtener la ubicación.','error');}
  }
  async function startTracking({silent=false}={}){
    if(gpsWatchId!==null)return true;
    if(!navigator.geolocation){if(!silent)toast('GPS no compatible','Este navegador no ofrece geolocalización.','error');return false;}
    await monitorGeolocationPermission();
    if(geolocationPermissionState==='denied'){if(!silent)toast('Permiso de ubicación bloqueado','Abra la configuración del navegador y cambie el permiso de ubicación a permitido.','error');return false;}
    try{
      gpsWatchId=navigator.geolocation.watchPosition(
        position=>{geolocationPermissionState='granted';updateTrackingUi();sendPosition(position,'Seguimiento continuo',false);},
        error=>handleTrackingError(error),
        {enableHighAccuracy:true,timeout:25000,maximumAge:3000}
      );
      localStorage.setItem(trackingPreferenceKey,'1');
      requestWakeLock();updateTrackingUi();sendHeartbeat();
      if(!silent)toast('Ubicación continua activada',`La posición se enviará aproximadamente cada ${Math.round(config.INTERVALO_GPS_MILISEGUNDOS/1000)} segundos mientras la aplicación pueda ejecutarse.`);
      return true;
    }catch(error){handleTrackingError(error);return false;}
  }
  function stopTracking({remember=true,silent=false}={}){
    if(gpsWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId=null;ultimaUbicacionEnviada=null;
    if(remember)localStorage.setItem(trackingPreferenceKey,'0');
    releaseWakeLock();updateTrackingUi();
    if(!silent)toast('Ubicación continua detenida');
  }
  async function resumeTrackingIfAllowed(){
    if(!currentUser||!trackingPreferenceEnabled()||gpsWatchId!==null)return;
    const state=await monitorGeolocationPermission();
    if(state==='granted')await startTracking({silent:true});
  }
  async function toggleTracking() {
    if(gpsWatchId===null)await startTracking();
    else{stopTracking();sendHeartbeat();}
    if(currentSection!=='gps')go('gps');else updateTrackingUi();
  }

  async function resolveAddress(latitude,longitude){
    const fallback=`${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
    if(!config.RESOLVER_DIRECCIONES)return fallback;
    const now=Date.now(),sameArea=lastAddressLookup.address&&distanciaMetros(latitude,longitude,lastAddressLookup.latitude,lastAddressLookup.longitude)<35;
    if(sameArea&&now-lastAddressLookup.time<60000)return lastAddressLookup.address;
    if(now-lastAddressLookup.time<30000&&lastAddressLookup.address)return lastAddressLookup.address;
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
      const url=new URL(config.DIRECCION_GEOCODIFICACION_INVERSA);url.searchParams.set('format','jsonv2');url.searchParams.set('lat',latitude);url.searchParams.set('lon',longitude);url.searchParams.set('zoom','18');url.searchParams.set('addressdetails','0');url.searchParams.set('accept-language','es');
      const response=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});clearTimeout(timer);if(!response.ok)throw new Error('GEOCODIFICACION_NO_DISPONIBLE');
      const data=await response.json(),address=data.display_name||fallback;lastAddressLookup={address,time:now,latitude,longitude};return address;
    }catch(_){return fallback;}
  }

  async function sendPosition(position, source, forzar = false) {
    const c = position.coords;
    const ahora = Date.now();
    if (!forzar && ultimaUbicacionEnviada) {
      const tiempo = ahora - ultimaUbicacionEnviada.tiempo;
      const movimiento = distanciaMetros(ultimaUbicacionEnviada.latitud, ultimaUbicacionEnviada.longitud, c.latitude, c.longitude);
      if (tiempo < config.INTERVALO_GPS_MILISEGUNDOS && movimiento < 12) return;
    }
    try {
      const address=await resolveAddress(c.latitude,c.longitude);
      await api.request('saveLocation',{data:{
        LATITUD:c.latitude,LONGITUD:c.longitude,PRECISION_METROS:c.accuracy||0,
        VELOCIDAD_KMH:c.speed==null?0:c.speed*3.6,RUMBO:c.heading||0,
        DIRECCION:address,BATERIA_PORCENTAJE:batteryLevel,DISPOSITIVO_ID:deviceId,TIPO_RED:connectionType(),
        PLATAFORMA:navigator.platform||'',NAVEGADOR:navigator.userAgent,
        FECHA_HORA:new Date(position.timestamp).toISOString(),FUENTE:source
      }});
      ultimaUbicacionEnviada = {tiempo:ahora,latitud:c.latitude,longitud:c.longitude};
      setSave('Ubicación enviada');
      if (currentSection==='gps') refreshLocations(false,false);
    } catch(error) {
      setSave('Error GPS','error');
      toast('No se pudo enviar GPS',translateError(error),'error');
    }
  }

  async function exportResource(resource){try{const result=await api.request('list',{resource});const rows=result.rows||[];if(!rows.length)return toast('Sin datos','No hay registros para exportar.','error');const headers=[...new Set(rows.flatMap(Object.keys))];const csv=[headers,...rows.map(row=>headers.map(h=>row[h]??''))].map(line=>line.map(value=>`"${String(value).replaceAll('"','""')}"`).join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${resource}_${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);toast('CSV generado',`${rows.length} registros exportados.`);}catch(error){toast('No se pudo exportar',translateError(error),'error');}}

  async function clearData(){const confirmation=prompt('Escriba exactamente LIMPIAR DATOS para continuar:','');if(confirmation===null)return;try{await api.request('clearOperationalData',{confirmacion:confirmation});toast('Datos operativos eliminados','Se conservaron los usuarios, roles y la configuración de empresa.');go('settings');}catch(error){toast('No se pudo limpiar',translateError(error),'error');}}
  function setTheme(dark){document.body.classList.toggle('dark',dark);localStorage.setItem('flotas_tema',dark?'dark':'light');}

  function openModal(){$('#modalBackdrop').classList.add('open');document.body.classList.add('modal-open');}
  function closeModal(){$('#modalBackdrop').classList.remove('open');document.body.classList.remove('modal-open');}
  function openSidebar(){$('#sidebar').classList.add('open');$('#overlay').classList.add('open');}
  function closeSidebar(){$('#sidebar').classList.remove('open');$('#overlay').classList.remove('open');}

  async function openQr(){openQrBackdrop();await enumerateCameras();}
  function openQrBackdrop(){$('#qrBackdrop').classList.add('open');document.body.classList.add('modal-open');}
  function closeQr(){stopCamera();$('#qrBackdrop').classList.remove('open');if(!$('#modalBackdrop').classList.contains('open'))document.body.classList.remove('modal-open');}
  async function enumerateCameras(){try{const devices=await navigator.mediaDevices?.enumerateDevices();const cameras=(devices||[]).filter(d=>d.kind==='videoinput');$('#cameraSelect').innerHTML=cameras.length?cameras.map((c,i)=>`<option value="${c.deviceId}">${esc(c.label||`Cámara ${i+1}`)}</option>`).join(''):'<option value="">Cámara predeterminada</option>';}catch(_) {}}
  async function startCamera(deviceId=''){if(!navigator.mediaDevices?.getUserMedia)return toast('Cámara no compatible','Use el código manual.','error');stopCamera();try{mediaStream=await navigator.mediaDevices.getUserMedia({video:deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:facingMode}},audio:false});$('#qrVideo').srcObject=mediaStream;await $('#qrVideo').play();$('#cameraEmpty').classList.add('hidden');$('#scannerStatus').classList.add('active');$('#scannerStatus span').textContent='Buscando QR…';await enumerateCameras();if('BarcodeDetector'in window){barcodeDetector=new BarcodeDetector({formats:['qr_code']});scanFrame();}else $('#scannerStatus span').textContent='Cámara activa · use ingreso manual';}catch(error){toast('No se pudo abrir la cámara','Revise el permiso del navegador.','error');}}
  async function scanFrame(){if(!barcodeDetector||!mediaStream)return;try{if($('#qrVideo').readyState>=2){const codes=await barcodeDetector.detect($('#qrVideo'));if(codes.length)return processQr(codes[0].rawValue);}}catch(_){}scanFrameId=requestAnimationFrame(scanFrame);}
  function stopCamera(){if(scanFrameId)cancelAnimationFrame(scanFrameId);scanFrameId=null;if(mediaStream)mediaStream.getTracks().forEach(track=>track.stop());mediaStream=null;if($('#qrVideo'))$('#qrVideo').srcObject=null;$('#cameraEmpty')?.classList.remove('hidden');$('#scannerStatus')?.classList.remove('active');if($('#scannerStatus span'))$('#scannerStatus span').textContent='Cámara detenida';}
  async function processQr(code){try{const result=await api.request('validateVehicleQr',{codigo:String(code||'').trim()});const vehicle=result.row;if(!vehicle)throw new Error('QR_NO_RECONOCIDO');vehicle.AUTORIZACION_QR=result.autorizacionQr||'';closeQr();toast('Vehículo validado',`${vehicle.PATENTE} quedó listo para asociarlo a la operación.`);openOperationModal(vehicle);}catch(error){toast('No se pudo validar el QR',translateError(error),'error');}}

  async function logout(){try{await api.request('logout',{data:{SESION_CLIENTE_ID:clientSessionId}});}catch(_){}forceLogout();}
  function forceLogout(){cleanupSection();stopRealtimeServices();stopCamera();stopTracking({remember:false,silent:true});currentUser=null;api.setAuth({});$('#appShell').classList.add('hidden');$('#authScreen').classList.remove('hidden');checkSystem();}
  function showProfile(){openInfoModal('Mi perfil',[['Nombre',currentUser.NOMBRE],['Correo',currentUser.CORREO],['Rol',currentUser.ROL_NOMBRE],['Estado',currentUser.ESTADO],['Último acceso',fmtDate(currentUser.ULTIMO_ACCESO,true)]]);}
  function openInfoModal(title,items){$('#modalEyebrow').textContent='INFORMACIÓN';$('#modalTitle').textContent=title;$('#modalBody').innerHTML=`<div class="info-grid">${items.map(([a,b])=>`<div class="info-item"><span>${a}</span><b>${esc(b||'—')}</b></div>`).join('')}</div>`;openModal();}
  function openPasswordModal(){$('#modalEyebrow').textContent='SEGURIDAD';$('#modalTitle').textContent='Cambiar contraseña';$('#modalBody').innerHTML=`<form class="form-grid" id="passwordForm"><label class="field full"><span>Contraseña actual</span><input name="contrasenaActual" type="password" required></label><label class="field full"><span>Nueva contraseña</span><input name="nuevaContrasena" type="password" required placeholder="Letras, números o símbolos"></label><p class="helper full">Puede elegir cualquier combinación. La contraseña distingue mayúsculas y minúsculas.</p><div class="form-actions"><button class="btn soft" type="button" data-cancel-modal>Cancelar</button><button class="btn primary" type="submit">Cambiar contraseña</button></div></form>`;openModal();$('[data-cancel-modal]').onclick=closeModal;$('#passwordForm').onsubmit=async event=>{event.preventDefault();try{await api.request('changePassword',Object.fromEntries(new FormData(event.currentTarget).entries()));closeModal();toast('Contraseña actualizada');}catch(error){toast('No se pudo cambiar',translateError(error),'error');}};}

  function bindGlobal() {
    $('#setupForm').addEventListener('submit',handleSetup);$('#loginForm').addEventListener('submit',handleLogin);$('#showPassword').addEventListener('click',()=>{const input=$('#loginPassword');input.type=input.type==='password'?'text':'password';});
    $('#retryConnection').addEventListener('click',checkSystem);$('#recheckConnection').addEventListener('click',checkSystem);$('#useLocalMode').addEventListener('click',()=>{sessionStorage.setItem('flotas_forzar_local','1');location.reload();});
    $('#openSidebar').addEventListener('click',openSidebar);$('#closeSidebar').addEventListener('click',closeSidebar);$('#overlay').addEventListener('click',closeSidebar);$('#logoutButton').addEventListener('click',logout);
    $('#notificationButton').addEventListener('click',()=>{if(currentUser&&hasPermission('NOTIFICACIONES','LEER'))go('notifications');});
    $('#themeButton').addEventListener('click',()=>setTheme(!document.body.classList.contains('dark')));$('#profileButton').addEventListener('click',()=>$('#profileMenu').classList.toggle('open'));
    $('#profileMenu').addEventListener('click',event=>{const action=event.target.dataset.profileAction;if(action==='profile')showProfile();if(action==='password')openPasswordModal();if(action==='logout')logout();$('#profileMenu').classList.remove('open');});
    $('#closeModal').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',event=>{if(event.target===$('#modalBackdrop'))closeModal();});
    $('#closeQr').addEventListener('click',closeQr);$('#qrBackdrop').addEventListener('click',event=>{if(event.target===$('#qrBackdrop'))closeQr();});$('#startCamera').addEventListener('click',()=>startCamera($('#cameraSelect').value));$('#cameraSelect').addEventListener('change',event=>startCamera(event.target.value));$('#switchCamera').addEventListener('click',()=>{facingMode=facingMode==='environment'?'user':'environment';startCamera();});$('#validateQr').addEventListener('click',()=>processQr($('#manualQr').value));
    window.addEventListener('flotas:guardado-local',()=>{setSave('Datos guardados');});window.addEventListener('flotas:sesion-cambiada',event=>{if(!event.detail?.token&&currentUser)forceLogout();});
    window.addEventListener('storage',event=>{if(event.key===config.CLAVE_ALMACENAMIENTO_LOCAL&&!api.isRemote()){api.reloadLocal();if(currentUser)go(currentSection);}});
    window.addEventListener('online',()=>{setConnection(true,'Conexión restablecida');sendHeartbeat();});window.addEventListener('offline',()=>setConnection(false,'Sin conexión a Internet'));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeModal();closeQr();$('#profileMenu').classList.remove('open');}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){if(currentUser)sendHeartbeat('En segundo plano');releaseWakeLock();return;}if(currentUser){sendHeartbeat('En línea');resumeTrackingIfAllowed();if(gpsWatchId!==null)requestWakeLock();if(currentSection==='gps')refreshLocations(false,false);}});
  }

  function init(){bindGlobal();setTheme(localStorage.getItem('flotas_tema')==='dark');checkSystem();}
  init();
})();
