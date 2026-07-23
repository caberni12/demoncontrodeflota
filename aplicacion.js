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
  let gpsWatchId = null;
  let mediaStream = null;
  let barcodeDetector = null;
  let scanFrameId = null;
  let facingMode = 'environment';

  const navGroups = [
    ['GENERAL', [
      ['dashboard','⌂','Panel principal'], ['operations','⇄','Operaciones'], ['gps','⌖','GPS en tiempo real']
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
    dashboard:'Panel principal',vehicles:'Vehículos',drivers:'Conductores',operations:'Operaciones',gps:'GPS en tiempo real',maintenance:'Mantenciones',
    documents:'Documentos',history:'Historial',alerts:'Alertas',users:'Usuarios',reports:'Reportes',audit:'Auditoría',company:'Empresa',settings:'Configuración'
  };

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
    if (/disponible|activo|activa|vigente|finalizada|completada|si/.test(text)) return 'ok';
    if (/ruta|viaje|info/.test(text)) return 'info';
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
      CREDENCIALES_INVALIDAS:'Correo o contraseña incorrectos.', CLAVE_INSTALACION_INVALIDA:'La clave de instalación no coincide con 00_Configuracion.gs.',
      CLAVE_INSTALACION_REQUERIDA:'Ingrese una clave de instalación.', CONTRASENA_MINIMO_8:'La contraseña debe tener al menos 8 caracteres.',
      DATOS_DE_ADMINISTRADOR_INVALIDOS:'Complete los datos del administrador y use una contraseña de 8 caracteres.',
      SISTEMA_YA_INICIALIZADO:'El sistema ya tiene usuarios registrados.', AUTENTICACION_REQUERIDA:'La sesión no está disponible.', SESION_INVALIDA:'La sesión dejó de ser válida.',
      SESION_EXPIRADA:'La sesión expiró.', PERMISO_DENEGADO:'Su rol no tiene permiso para realizar esta acción.', RECURSO_NO_ENCONTRADO:'El recurso solicitado no existe.',
      REGISTRO_NO_ENCONTRADO:'El registro no existe.', VEHICULO_NO_DISPONIBLE:'El vehículo no está disponible.', CONDUCTOR_NO_DISPONIBLE:'El conductor no está disponible.',
      OPERACION_NO_ACTIVA:'La operación ya no está activa.', CORREO_YA_EXISTE:'El correo ya está registrado.', DIRECCION_APLICACION_NO_CONFIGURADA:'Falta configurar la dirección de la aplicación en js/configuracion.js.',
      ID_HOJA_NO_CONFIGURADO:'Google Apps Script no tiene configurado el identificador de la hoja de cálculo.', TIEMPO_DE_ESPERA_AGOTADO:'El servicio de datos tardó demasiado en responder.',
      CONTRASENA_ACTUAL_INVALIDA:'La contraseña actual no es correcta.', FORMATO_LOGOTIPO_INVALIDO:'El formato del logotipo no es válido.', LOGOTIPO_DEMASIADO_GRANDE:'El logotipo supera el tamaño máximo de 1,5 MB.',
      ID_HOJA_NO_CONFIGURADO:'Google Apps Script no tiene configurado el identificador de la hoja de cálculo.', CONFIRMACION_REQUERIDA:'Debe escribir exactamente “LIMPIAR DATOS”.'
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
    event.preventDefault(); const form = new FormData(event.currentTarget); const button = $('button[type="submit"]', event.currentTarget);
    button.disabled = true; button.textContent = 'Instalando…';
    try {
      await api.request('bootstrap', Object.fromEntries(form.entries()));
      toast('Sistema instalado','El administrador inicial fue creado.'); event.currentTarget.reset(); await checkSystem();
    } catch (error) { toast('No fue posible instalar',translateError(error),'error'); }
    finally { button.disabled = false; button.textContent = 'Instalar y crear administrador'; }
  }

  async function handleLogin(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const button = $('button[type="submit"]',event.currentTarget);
    button.disabled = true; button.textContent = 'Ingresando…';
    try {
      const result = await api.request('login', Object.fromEntries(form.entries())); api.setAuth({ token:result.token, user:result.user, expiresAt:result.expiresAt });
      currentUser = result.user; showApp(); toast('Bienvenido',`Sesión iniciada como ${currentUser.ROL_NOMBRE}.`);
    } catch (error) { toast('Acceso denegado',translateError(error),'error'); }
    finally { button.disabled=false; button.textContent='Ingresar'; }
  }

  function showApp() {
    $('#authScreen').classList.add('hidden'); $('#appShell').classList.remove('hidden');
    $('#userName').textContent=currentUser.NOMBRE; $('#userRole').textContent=currentUser.ROL_NOMBRE || currentUser.ROL_ID; $('#userAvatar').textContent=initials(currentUser.NOMBRE);
    $('#backendName').textContent=api.backendLabel(); $('#backendDetail').textContent=api.isRemote()?'Datos compartidos en Hojas de cálculo de Google':'Datos privados en este navegador';
    setConnection(true, api.isRemote()?'Google Apps Script conectado':'Almacenamiento local activo'); buildNav(); refreshCompanyBranding(); go('dashboard');
  }

  function buildNav() {
    const isDriver = currentUser?.ROL_ID === 'ROL-CONDUCTOR';
    const isAdmin = currentUser?.ROL_ID === 'ROL-ADMIN';
    let html='';
    navGroups.forEach(([group,items]) => {
      const visible = items.filter(([id]) => {
        if (!isAdmin && ['users','audit','company','settings'].includes(id)) return false;
        if (isDriver && id === 'reports') return false;
        return true;
      });
      if (!visible.length) return;
      html += `<p class="nav-label">${group}</p>` + visible.map(([id,icon,label]) => `<button class="nav-button ${currentSection===id?'active':''}" data-nav="${id}"><i>${icon}</i>${label}</button>`).join('');
    });
    $('#nav').innerHTML=html;
  }

  async function go(section) {
    cleanupSection(); currentSection=section; buildNav(); $('#pageTitle').textContent=labels[section]; $('#breadcrumb').textContent=`Sistema / ${labels[section]}`;
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
      const data=await api.request('dashboard'), m=data.metrics || {};
      const operations=(data.recentOperations||[]).map(op=>`<tr><td><strong>${esc(op.ID)}</strong></td><td>${esc(op.VEHICULO_ID)}</td><td>${esc(op.CONDUCTOR_ID)}</td><td>${fmtDate(op.FECHA_INICIO,true)}</td><td>${status(op.ESTADO)}</td><td>${esc(op.ORIGEN||'')} → ${esc(op.DESTINO||'')}</td></tr>`).join('');
      const alerts=(data.alerts||[]).map(a=>`<div class="summary-row"><i>!</i><div><b>${esc(a.TITULO)}</b><span>${esc(a.MENSAJE)}</span></div><time>${fmtDate(a.FECHA_HORA,true)}</time></div>`).join('');
      return heading('RESUMEN OPERACIONAL',`Hola, ${esc(currentUser.NOMBRE.split(' ')[0])}`,'La base comienza vacía y se completa con los registros de su organización.',`<button class="btn soft" data-refresh>↻ Actualizar</button><button class="btn primary" data-nav="operations">＋ Nueva operación</button>`)+
        `<div class="kpi-grid">${metric('▣','Vehículos',m.vehicles||0,`${m.availableVehicles||0} disponibles`)}${metric('♙','Conductores',m.drivers||0,`${m.availableDrivers||0} disponibles`)}${metric('⇄','Operaciones activas',m.activeOperations||0,'Seguimiento en curso')}${metric('!','Alertas',m.unreadAlerts||0,`${m.expiredDocuments||0} documentos vencidos`)}</div>`+
        `<div class="dashboard-grid"><article class="card"><div class="card-header"><div><h3>Operaciones recientes</h3><p>Movimientos creados en el sistema</p></div></div>${operations?table(['Operación','Vehículo','Conductor','Inicio','Estado','Ruta'],operations):empty('⇄','Aún no hay operaciones','Registre vehículos y conductores para iniciar el primer recorrido.','<button class="btn primary" data-nav="operations">Crear operación</button>')}</article>`+
        `<article class="card"><div class="card-header"><div><h3>Alertas pendientes</h3><p>Eventos importantes</p></div></div>${alerts||empty('✓','Sin alertas','No existen alertas pendientes en la base.')}</article></div>`;
    },
    async vehicles(){return renderResourcePage('vehicles','FLOTA','Vehículos','Administre las unidades, patentes, kilometraje y códigos QR.',vehicleRows,['Vehículo','Patente','Año','Kilometraje','Estado','QR','']);},
    async drivers(){return renderResourcePage('drivers','PERSONAL','Conductores','Gestione licencias, disponibilidad y usuarios asociados.',driverRows,['Conductor','RUT','Licencia','Vencimiento','Estado','Usuario','']);},
    async maintenance(){return renderResourcePage('maintenance','PREVENCIÓN','Mantenciones','Programe trabajos preventivos y correctivos.',maintenanceRows,['Trabajo','Vehículo','Tipo','Fecha','Costo','Estado','']);},
    async documents(){return renderResourcePage('documents','VENCIMIENTOS','Documentos','Controle permisos, seguros, revisiones y licencias.',documentRows,['Documento','Asociado','Identificación','Vencimiento','Estado','Archivo','']);},
    async alerts(){return renderResourcePage('alerts','NOTIFICACIONES','Alertas','Registre y gestione eventos que requieren atención.',alertRows,['Nivel','Título','Módulo','Fecha','Leída','']);},
    async users(){return renderResourcePage('users','SEGURIDAD','Usuarios','Administre accesos, roles y estado de las cuentas.',userRows,['Usuario','Correo','Rol','Último acceso','Estado','']);},
    async operations(){return renderOperations();},
    async gps(){return renderGps();},
    async history(){return renderHistory();},
    async reports(){return renderReports();},
    async audit(){return renderAudit();},
    async company(){return renderCompany();},
    async settings(){return renderSettings();}
  };

  function metric(icon,label,value,detail){return `<article class="metric-card"><i class="metric-icon">${icon}</i><div><span>${label}</span><b>${value}</b><small>${detail}</small></div></article>`;}

  async function renderResourcePage(resource,tag,title,description,rowRenderer,headers) {
    const result=await api.request('list',{resource}); const rows=result.rows||[];
    const cannotCreate = currentUser.ROL_ID === 'ROL-CONDUCTOR' || (resource === 'users' && currentUser.ROL_ID !== 'ROL-ADMIN');
    const createButton=cannotCreate?'':`<button class="btn primary" data-add="${resource}">＋ Nuevo registro</button>`;
    const rowHtml=rows.map(row=>rowRenderer(row)).join('');
    return heading(tag,title,description,createButton)+`<article class="card"><div class="toolbar"><label class="search-box"><span>⌕</span><input data-table-search placeholder="Buscar en ${title.toLowerCase()}"></label><button class="btn soft push" data-export="${resource}">Exportar CSV</button></div><div data-filter-table>${table(headers,rowHtml,`No hay ${title.toLowerCase()} registrados.`)}</div></article>`;
  }

  function vehicleRows(v){return `<tr data-search-row="${esc(`${v.PATENTE} ${v.MARCA} ${v.MODELO} ${v.ESTADO}`.toLowerCase())}"><td><div class="entity"><i class="entity-icon">🚐</i><div><strong>${esc(v.MARCA||'Sin marca')} ${esc(v.MODELO||'')}</strong><span class="muted">${esc(v.ID)}</span></div></div></td><td><strong>${esc(v.PATENTE)}</strong></td><td>${esc(v.ANIO||'—')}</td><td>${number(v.KILOMETRAJE)} km</td><td>${status(v.ESTADO)}</td><td>${esc(v.QR_CODIGO||'—')}</td><td>${actions('vehicles',v.ID)}</td></tr>`;}
  function driverRows(d){return `<tr data-search-row="${esc(`${d.NOMBRE} ${d.RUT} ${d.ESTADO}`.toLowerCase())}"><td><div class="entity"><span class="avatar">${initials(d.NOMBRE)}</span><div><strong>${esc(d.NOMBRE)}</strong><span class="muted">${esc(d.TELEFONO||'')}</span></div></div></td><td>${esc(d.RUT)}</td><td>${esc(d.LICENCIA_CLASE||'—')}</td><td>${fmtDate(d.LICENCIA_VENCIMIENTO)}</td><td>${status(d.ESTADO)}</td><td>${esc(d.USUARIO_ID||'Sin asociar')}</td><td>${actions('drivers',d.ID)}</td></tr>`;}
  function maintenanceRows(m){return `<tr data-search-row="${esc(`${m.TITULO} ${m.VEHICULO_ID} ${m.ESTADO}`.toLowerCase())}"><td><strong>${esc(m.TITULO)}</strong><span class="muted">${esc(m.DESCRIPCION||'')}</span></td><td>${esc(m.VEHICULO_ID)}</td><td>${esc(m.TIPO)}</td><td>${fmtDate(m.FECHA_PROGRAMADA)}</td><td>$${number(m.COSTO)}</td><td>${status(m.ESTADO)}</td><td>${actions('maintenance',m.ID)}</td></tr>`;}
  function documentRows(d){return `<tr data-search-row="${esc(`${d.TIPO} ${d.IDENTIFICACION} ${d.ESTADO}`.toLowerCase())}"><td><strong>${esc(d.TIPO)}</strong><span class="muted">${esc(d.ID)}</span></td><td>${esc(d.ASOCIADO_TIPO)}</td><td>${esc(d.IDENTIFICACION)}</td><td>${fmtDate(d.FECHA_VENCIMIENTO)}</td><td>${status(d.ESTADO)}</td><td>${d.DIRECCION_ARCHIVO?`<a class="link-button" href="${esc(d.DIRECCION_ARCHIVO)}" target="_blank" rel="noopener">Abrir</a>`:'—'}</td><td>${actions('documents',d.ID)}</td></tr>`;}
  function alertRows(a){return `<tr data-search-row="${esc(`${a.NIVEL} ${a.TITULO} ${a.MODULO}`.toLowerCase())}"><td>${status(a.NIVEL)}</td><td><strong>${esc(a.TITULO)}</strong><span class="muted">${esc(a.MENSAJE)}</span></td><td>${esc(a.MODULO||'—')}</td><td>${fmtDate(a.FECHA_HORA||a.CREADO_EN,true)}</td><td>${status(a.LEIDA||'NO')}</td><td>${actions('alerts',a.ID)}</td></tr>`;}
  function userRows(u){return `<tr data-search-row="${esc(`${u.NOMBRE} ${u.CORREO} ${u.ROL_ID}`.toLowerCase())}"><td><div class="entity"><span class="avatar">${initials(u.NOMBRE)}</span><strong>${esc(u.NOMBRE)}</strong></div></td><td>${esc(u.CORREO)}</td><td>${esc(u.ROL_ID)}</td><td>${fmtDate(u.ULTIMO_ACCESO,true)}</td><td>${status(u.ESTADO)}</td><td>${actions('users',u.ID)}</td></tr>`;}
  function actions(resource,id){return `<div class="row-actions"><button data-edit="${resource}:${id}" title="Editar">✎</button><button data-delete="${resource}:${id}" title="Eliminar">×</button></div>`;}

  async function renderOperations() {
    const [ops,vehicles,drivers]=await Promise.all([api.request('list',{resource:'operations'}),api.request('list',{resource:'vehicles'}),api.request('list',{resource:'drivers'})]);
    const active=(ops.rows||[]).filter(o=>o.ESTADO==='Activa');
    const vehicleMap=Object.fromEntries((vehicles.rows||[]).map(v=>[v.ID,v])); const driverMap=Object.fromEntries((drivers.rows||[]).map(d=>[d.ID,d]));
    const activeHtml=active.map(op=>`<article class="operation-card"><header><div><h4>${esc(op.ID)} · ${esc(vehicleMap[op.VEHICULO_ID]?.PATENTE||op.VEHICULO_ID)}</h4><small>${esc(driverMap[op.CONDUCTOR_ID]?.NOMBRE||op.CONDUCTOR_ID)}</small></div>${status(op.ESTADO)}</header><div class="operation-route">${esc(op.ORIGEN||'Ubicación actual')} → ${esc(op.DESTINO)}</div><div class="operation-meta"><div><span>INICIO</span><b>${fmtDate(op.FECHA_INICIO,true)}</b></div><div><span>KM INICIAL</span><b>${number(op.KM_INICIO)}</b></div><div><span>GPS</span><b>Disponible</b></div></div><button class="btn danger small" data-finish-operation="${op.ID}" style="margin-top:12px">Finalizar operación</button></article>`).join('');
    const opRows=(ops.rows||[]).map(op=>`<tr><td><strong>${esc(op.ID)}</strong></td><td>${esc(vehicleMap[op.VEHICULO_ID]?.PATENTE||op.VEHICULO_ID)}</td><td>${esc(driverMap[op.CONDUCTOR_ID]?.NOMBRE||op.CONDUCTOR_ID)}</td><td>${esc(op.ORIGEN||'')} → ${esc(op.DESTINO||'')}</td><td>${fmtDate(op.FECHA_INICIO,true)}</td><td>${status(op.ESTADO)}</td></tr>`).join('');
    return heading('CONTROL DE VIAJES','Operaciones','Inicie y finalice recorridos con selección manual o código QR.',`<button class="btn soft" data-open-qr>▦ Escanear QR</button><button class="btn primary" data-new-operation>＋ Nueva operación</button>`)+
      `<div class="operation-banner"><i>▦</i><div><h3>Operación con seguimiento GPS</h3><p>Al iniciar una operación, el conductor puede enviar su posición desde el módulo GPS.</p></div><button class="btn soft" data-open-qr>Usar QR</button></div>`+
      `<div class="operation-layout"><article class="card"><div class="card-header"><div><h3>Operaciones activas</h3><p>${active.length} recorridos en curso</p></div></div>${activeHtml||empty('⇄','No hay operaciones activas','Cree la primera operación cuando existan un vehículo y un conductor disponibles.')}</article><article class="card"><div class="card-header"><div><h3>Requisitos</h3><p>Datos necesarios para comenzar</p></div></div><div class="summary-list"><div class="summary-row"><i>▣</i><div><b>Vehículo disponible</b><span>${(vehicles.rows||[]).filter(v=>v.ESTADO==='Disponible').length} unidades</span></div></div><div class="summary-row"><i>♙</i><div><b>Conductor disponible</b><span>${(drivers.rows||[]).filter(d=>d.ESTADO==='Disponible').length} personas</span></div></div></div></article></div>`+
      `<article class="card" style="margin-top:18px"><div class="card-header"><div><h3>Registro de operaciones</h3><p>Historial completo</p></div></div>${table(['Operación','Vehículo','Conductor','Ruta','Inicio','Estado'],opRows)}</article>`;
  }

  async function renderGps() {
    const locations=await api.request('latestLocations');
    return heading('MONITOREO','GPS en tiempo real','Cada teléfono del conductor envía sus coordenadas a la aplicación web de Google Apps Script.',`<button class="btn soft" data-refresh-locations>↻ Actualizar</button><button class="btn soft" data-capture-gps>⌖ Enviar mi ubicación</button><button class="btn primary" data-toggle-tracking>${gpsWatchId===null?'Iniciar GPS real':'Detener GPS real'}</button>`)+
      `<div class="gps-layout"><article class="card map-card"><div id="fleetMap" class="fleet-map"></div><div class="map-toolbar"><span class="gps-live"><i></i> Actualización cada ${Math.round(config.INTERVALO_GPS_MILISEGUNDOS/1000)} segundos</span><span class="muted" id="gpsLastSync">Preparando consulta…</span><span class="muted push">Mapa © colaboradores de OpenStreetMap</span></div></article><article class="card"><div class="card-header"><div><h3>Últimas posiciones</h3><p id="locationCount">${locations.total||0} conductores visibles</p></div></div><div class="driver-location-list" id="driverLocationList">${locationList(locations.rows||[])}</div></article></div>`+
      `<article class="card"><div class="card-header"><div><h3>Cómo funciona el GPS compartido</h3><p>Flujo requerido en cada teléfono</p></div></div><div class="info-grid"><div class="info-item"><span>Paso 1</span><b>El conductor inicia sesión desde su teléfono</b></div><div class="info-item"><span>Paso 2</span><b>Inicia la operación asignada</b></div><div class="info-item"><span>Paso 3</span><b>Activa “Iniciar GPS real”</b></div><div class="info-item"><span>Paso 4</span><b>El administrador ve el marcador en este mapa</b></div></div></article>`;
  }
  function locationList(rows){return rows.length?rows.map(row=>`<button class="driver-location" data-focus-location="${row.LATITUD},${row.LONGITUD}"><i>⌖</i><div><b>${esc(row.CONDUCTOR_NOMBRE||row.CONDUCTOR_ID||'Sin conductor')}</b><span>${esc(row.VEHICULO_PATENTE||row.VEHICULO_ID||'Sin vehículo')} · ${Number(row.VELOCIDAD_KMH||0).toFixed(0)} km/h</span></div><time>${fmtDate(row.FECHA_HORA,true)}</time></button>`).join(''):empty('⌖','Sin ubicaciones','Cuando un conductor envíe su GPS, aparecerá aquí.');}

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
    const logo=data.DIRECCION_LOGOTIPO||'assets/logo.svg';
    ['authCompanyName','sidebarCompanyName'].forEach(id=>{const node=$('#'+id);if(node)node.textContent=name;});
    const sub=$('#sidebarCompanySubtitle');if(sub)sub.textContent=subtitle;
    ['authCompanyLogo','sidebarCompanyLogo'].forEach(id=>{const image=$('#'+id);if(image){image.src=logo;image.onerror=()=>{image.onerror=null;image.src='assets/logo.svg';};}});
    if(data.COLOR_PRINCIPAL&&/^#[0-9A-F]{6}$/i.test(data.COLOR_PRINCIPAL)){document.documentElement.style.setProperty('--primary',data.COLOR_PRINCIPAL);}
    if(data.COLOR_SECUNDARIO&&/^#[0-9A-F]{6}$/i.test(data.COLOR_SECUNDARIO)){document.documentElement.style.setProperty('--primary-dark',data.COLOR_SECUNDARIO);}
    document.title=`${name} | Sistema de Gestión de Flotas`;
  }

  function companyValue(company,key,fallback=''){return esc(company?.[key]??fallback);}

  async function renderCompany(){
    const result=await api.request('list',{resource:'companies'});const company=(result.rows||[])[0]||{};currentCompany=company;applyBranding(company);
    const logo=company.DIRECCION_LOGOTIPO||'assets/logo.svg';
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
            <label class="field full"><span>Dirección</span><input name="DIRECCION" value="${companyValue(company,'DIRECCION')}"></label>
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

  async function renderSettings(){const remote=api.isRemote();return heading('PARÁMETROS','Configuración','Conexión, apariencia y limpieza controlada de registros operativos.')+`<div class="settings-grid"><article class="card"><div class="card-header"><div><h3>Conexión de datos</h3><p>Servicio utilizado por la interfaz</p></div>${status(remote?'Google Apps Script':'Almacenamiento local')}</div><div class="info-grid"><div class="info-item"><span>Modo</span><b>${remote?'Compartido en Hojas de cálculo de Google':'Guardado en este navegador'}</b></div><div class="info-item"><span>Dirección</span><b>${remote?esc(config.DIRECCION_APLICACION.slice(0,42)+'…'):'No configurada'}</b></div></div><p class="muted">Para conectar, abra <code>interfaz/js/configuracion.js</code> y pegue la dirección terminada en <code>/exec</code>.</p></article><article class="card"><div class="card-header"><div><h3>Apariencia</h3><p>Preferencias guardadas en el navegador</p></div></div><div class="setting-row"><div><b>Modo oscuro</b><span>Cambiar colores de la interfaz</span></div><label class="switch"><input id="darkSwitch" type="checkbox" ${document.body.classList.contains('dark')?'checked':''}><i></i></label></div><button class="btn soft" data-nav="company">Abrir configuración de empresa</button></article></div><div class="danger-zone" style="margin-top:18px"><h3>Limpiar datos operativos</h3><p>Elimina vehículos, conductores, operaciones, GPS, mantenciones, documentos, alertas, reportes y bitácora. Conserva usuarios, roles y configuración de empresa.</p><button class="btn danger" data-clear-data>Limpiar datos operativos</button></div>`;}

  function bindSection() {
    $$('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.nav)));
    $$('[data-add]').forEach(btn=>btn.addEventListener('click',()=>openResourceModal(btn.dataset.add)));
    $$('[data-edit]').forEach(btn=>btn.addEventListener('click',async()=>{const [resource,id]=btn.dataset.edit.split(':');const result=await api.request('get',{resource,id});openResourceModal(resource,result.row);}));
    $$('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteRecord(btn.dataset.delete)));
    $$('[data-export]').forEach(btn=>btn.addEventListener('click',()=>exportResource(btn.dataset.export)));
    $$('[data-table-search]').forEach(input=>input.addEventListener('input',()=>filterTable(input)));
    $$('[data-refresh],[data-retry]').forEach(btn=>btn.addEventListener('click',()=>go(currentSection)));
    $$('[data-new-operation]').forEach(btn=>btn.addEventListener('click',()=>openOperationModal()));
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
    $('[data-remove-company-logo]')?.addEventListener('click',()=>{$('#companyLogoPreview').src='assets/logo.svg';$('#companyLogo').value='';$('#removeLogoValue').value='SI';});
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

  async function openOperationModal(prefillVehicle='') {
    const [vehicles,drivers]=await Promise.all([api.request('list',{resource:'vehicles'}),api.request('list',{resource:'drivers'})]);
    const availableVehicles=(vehicles.rows||[]).filter(v=>v.ESTADO==='Disponible'), availableDrivers=(drivers.rows||[]).filter(d=>d.ESTADO==='Disponible');
    $('#modalEyebrow').textContent='OPERACIÓN';$('#modalTitle').textContent='Iniciar nueva operación';
    $('#modalBody').innerHTML=`<form class="form-grid" id="operationForm"><label class="field"><span>Vehículo</span><select name="VEHICULO_ID" required><option value="">Seleccione</option>${availableVehicles.map(v=>`<option value="${v.ID}" ${v.ID===prefillVehicle?'selected':''}>${esc(v.PATENTE)} · ${esc(v.MARCA)} ${esc(v.MODELO)}</option>`).join('')}</select></label><label class="field"><span>Conductor</span><select name="CONDUCTOR_ID" required><option value="">Seleccione</option>${availableDrivers.map(d=>`<option value="${d.ID}">${esc(d.NOMBRE)} · ${esc(d.RUT)}</option>`).join('')}</select></label><label class="field"><span>Origen</span><input name="ORIGEN" value="Ubicación actual"></label><label class="field"><span>Destino</span><input name="DESTINO" required></label><label class="field"><span>KM inicial</span><input name="KM_INICIO" type="number" min="0"></label><label class="field full"><span>Observaciones</span><textarea name="OBSERVACIONES"></textarea></label><div class="form-actions"><button class="btn soft" type="button" data-cancel-modal>Cancelar</button><button class="btn primary" type="submit">Iniciar operación</button></div></form>`;
    openModal();$('[data-cancel-modal]').onclick=closeModal;$('#operationForm').onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());try{await api.request('startOperation',{data});closeModal();toast('Operación iniciada','El vehículo y el conductor quedaron en ruta.');go('operations');}catch(error){toast('No se pudo iniciar',translateError(error),'error');}};
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
    gpsRefreshTimer = setInterval(() => refreshLocations(false, false), config.INTERVALO_GPS_MILISEGUNDOS);
  }

  async function refreshLocations(showToast = true, ajustar = false) {
    try {
      const result = await api.request('latestLocations', { marcaTiempo: Date.now() });
      const filas = result.rows || [];
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
          detalle: `<b>${esc(nombre)}</b><span>${esc(vehiculo)}</span><span>${Number(row.VELOCIDAD_KMH||0).toFixed(0)} km/h</span><small>${activo?'Ubicación reciente':'Ubicación antigua'} · ${fmtDate(row.FECHA_HORA,true)}</small>`
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
      position => sendPosition(position,'GPS real',true),
      error => toast('No se obtuvo ubicación',error.message,'error'),
      {enableHighAccuracy:true,timeout:20000,maximumAge:3000}
    );
  }

  function toggleTracking() {
    if (gpsWatchId === null) {
      if (!navigator.geolocation) return toast('GPS no compatible','','error');
      gpsWatchId = navigator.geolocation.watchPosition(
        position => sendPosition(position,'Seguimiento continuo',false),
        error => toast('Seguimiento GPS',error.message,'error'),
        {enableHighAccuracy:true,timeout:25000,maximumAge:3000}
      );
      toast('GPS real iniciado','La posición se enviará aproximadamente cada 10 segundos o cuando exista un desplazamiento relevante.');
      go('gps');
    } else {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
      ultimaUbicacionEnviada = null;
      toast('GPS detenido');
      go('gps');
    }
  }

  async function sendPosition(position, source, forzar = false) {
    const c = position.coords;
    const ahora = Date.now();
    if (!forzar && ultimaUbicacionEnviada) {
      const tiempo = ahora - ultimaUbicacionEnviada.tiempo;
      const movimiento = distanciaMetros(ultimaUbicacionEnviada.latitud, ultimaUbicacionEnviada.longitud, c.latitude, c.longitude);
      if (tiempo < 10000 && movimiento < 12) return;
    }
    try {
      await api.request('saveLocation',{data:{
        LATITUD:c.latitude,LONGITUD:c.longitude,PRECISION_METROS:c.accuracy||0,
        VELOCIDAD_KMH:c.speed==null?0:c.speed*3.6,RUMBO:c.heading||0,
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
  async function processQr(code){const result=await api.request('list',{resource:'vehicles'});const normalized=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');const vehicle=(result.rows||[]).find(v=>String(v.QR_CODIGO||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===normalized||String(v.PATENTE||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===normalized);if(!vehicle)return toast('QR no reconocido',String(code||''),'error');if(vehicle.ESTADO!=='Disponible')return toast('Vehículo no disponible',`${vehicle.PATENTE}: ${vehicle.ESTADO}`,'error');closeQr();openOperationModal(vehicle.ID);}

  async function logout(){try{await api.request('logout');}catch(_){}forceLogout();}
  function forceLogout(){cleanupSection();stopCamera();if(gpsWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null;api.setAuth({});currentUser=null;$('#appShell').classList.add('hidden');$('#authScreen').classList.remove('hidden');checkSystem();}
  function showProfile(){openInfoModal('Mi perfil',[['Nombre',currentUser.NOMBRE],['Correo',currentUser.CORREO],['Rol',currentUser.ROL_NOMBRE],['Estado',currentUser.ESTADO],['Último acceso',fmtDate(currentUser.ULTIMO_ACCESO,true)]]);}
  function openInfoModal(title,items){$('#modalEyebrow').textContent='INFORMACIÓN';$('#modalTitle').textContent=title;$('#modalBody').innerHTML=`<div class="info-grid">${items.map(([a,b])=>`<div class="info-item"><span>${a}</span><b>${esc(b||'—')}</b></div>`).join('')}</div>`;openModal();}
  function openPasswordModal(){$('#modalEyebrow').textContent='SEGURIDAD';$('#modalTitle').textContent='Cambiar contraseña';$('#modalBody').innerHTML=`<form class="form-grid" id="passwordForm"><label class="field full"><span>Contraseña actual</span><input name="contrasenaActual" type="password" required></label><label class="field full"><span>Nueva contraseña</span><input name="nuevaContrasena" type="password" minlength="8" required></label><div class="form-actions"><button class="btn soft" type="button" data-cancel-modal>Cancelar</button><button class="btn primary" type="submit">Cambiar contraseña</button></div></form>`;openModal();$('[data-cancel-modal]').onclick=closeModal;$('#passwordForm').onsubmit=async event=>{event.preventDefault();try{await api.request('changePassword',Object.fromEntries(new FormData(event.currentTarget).entries()));closeModal();toast('Contraseña actualizada');}catch(error){toast('No se pudo cambiar',translateError(error),'error');}};}

  function bindGlobal() {
    $('#setupForm').addEventListener('submit',handleSetup);$('#loginForm').addEventListener('submit',handleLogin);$('#showPassword').addEventListener('click',()=>{const input=$('#loginPassword');input.type=input.type==='password'?'text':'password';});
    $('#retryConnection').addEventListener('click',checkSystem);$('#recheckConnection').addEventListener('click',checkSystem);$('#useLocalMode').addEventListener('click',()=>{sessionStorage.setItem('flotas_forzar_local','1');location.reload();});
    $('#openSidebar').addEventListener('click',openSidebar);$('#closeSidebar').addEventListener('click',closeSidebar);$('#overlay').addEventListener('click',closeSidebar);$('#logoutButton').addEventListener('click',logout);
    $('#themeButton').addEventListener('click',()=>setTheme(!document.body.classList.contains('dark')));$('#profileButton').addEventListener('click',()=>$('#profileMenu').classList.toggle('open'));
    $('#profileMenu').addEventListener('click',event=>{const action=event.target.dataset.profileAction;if(action==='profile')showProfile();if(action==='password')openPasswordModal();if(action==='logout')logout();$('#profileMenu').classList.remove('open');});
    $('#closeModal').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',event=>{if(event.target===$('#modalBackdrop'))closeModal();});
    $('#closeQr').addEventListener('click',closeQr);$('#qrBackdrop').addEventListener('click',event=>{if(event.target===$('#qrBackdrop'))closeQr();});$('#startCamera').addEventListener('click',()=>startCamera($('#cameraSelect').value));$('#cameraSelect').addEventListener('change',event=>startCamera(event.target.value));$('#switchCamera').addEventListener('click',()=>{facingMode=facingMode==='environment'?'user':'environment';startCamera();});$('#validateQr').addEventListener('click',()=>processQr($('#manualQr').value));
    window.addEventListener('flotas:guardado-local',()=>{setSave('Datos guardados');});window.addEventListener('flotas:sesion-cambiada',event=>{if(!event.detail?.token&&currentUser)forceLogout();});
    window.addEventListener('storage',event=>{if(event.key===config.CLAVE_ALMACENAMIENTO_LOCAL&&!api.isRemote()){api.reloadLocal();if(currentUser)go(currentSection);}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeModal();closeQr();$('#profileMenu').classList.remove('open');}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentSection==='gps'&&currentUser)refreshLocations(false,false);});
  }

  function init(){bindGlobal();setTheme(localStorage.getItem('flotas_tema')==='dark');checkSystem();}
  init();
})();
