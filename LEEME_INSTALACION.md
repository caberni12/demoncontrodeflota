# Sistema de Gestión de Flotas 2.2

Aplicación web en español para administrar vehículos, conductores, operaciones, rutas, GPS, documentos, mantenciones, notificaciones, roles y permisos. La base compartida utiliza Google Apps Script y Hojas de cálculo de Google.

## Funciones principales

- Panel principal diferente para administradores, supervisores y conductores.
- Inicio de sesión inmediato, adaptable a teléfonos y computadores, con textos breves y campos sin superposición.
- La interfaz identifica el servicio como **Base de datos central** o **Base de datos local**, sin mostrar nombres técnicos al usuario.
- Panel analítico con indicadores, actividad de los últimos siete días, distribución de la flota y acciones rápidas según permisos.
- Búsqueda predictiva de direcciones mientras se escribe, con selección de coincidencias y coordenadas automáticas para las rutas.
- Ubicaciones GPS de varios teléfonos con velocidad, precisión, batería, hora y dirección escrita.
- Modo de ubicación continua con preferencia guardada, estado visible del permiso y reactivación automática cuando el permiso ya está concedido.
- Indicadores de presencia unificados: verde para ubicaciones y dispositivos activos; rojo para ubicaciones o dispositivos inactivos.
- Control individual de sesiones abiertas por dispositivo o pestaña, mostrando usuario, conductor asociado, sección actual, vehículo, operación, ruta, GPS y visibilidad de la aplicación.
- Identificación automática de sesiones conduciendo y advertencia de operaciones activas sin GPS.
- Mapa de flota con actualización configurable cada 8 segundos.
- Presencia de dispositivos mediante señales periódicas de conexión.
- Asignación de rutas a un conductor y vehículo.
- Navegación mediante Google Maps o Waze.
- Notificaciones dirigidas a cada conductor.
- Validación QR del vehículo antes de iniciar una operación.
- Acceso por rol y filtrado de registros asociados al conductor.
- Carga rápida con una sola consulta para varios módulos, precarga según permisos, caché temporal y eliminación de solicitudes duplicadas.
- Modales instantáneos: el formulario aparece primero y las opciones que falten se completan silenciosamente después, sin bloquear su apertura.
- Indicadores de carga en ingreso, guardado, eliminación, rutas, notificaciones, GPS, QR y demás acciones; además se bloquean los clics duplicados mientras una acción está en curso.
- Botones de **Sincronizar** en la barra superior, el menú lateral y los módulos principales para solicitar datos vigentes de la base central.
- Almacenamiento local para pruebas y Google Apps Script para compartir datos entre dispositivos.

## Importante sobre el seguimiento

El navegador solicita al conductor autorización visible para usar su ubicación. Al activar **Ubicación continua**, el sistema recuerda la elección y la reactiva al volver a abrir una sesión si el permiso sigue concedido. También intenta mantener la pantalla activa en navegadores compatibles.

Un sitio web no puede seleccionar por sí solo la opción **Permitir siempre**, ni garantizar ubicación con el navegador completamente cerrado o con el teléfono suspendido. Ese permiso lo controla Android, iOS y el navegador. Para seguimiento permanente en segundo plano se requiere una aplicación móvil nativa para Android o iOS y consentimiento informado.

## Instalación o actualización de Google Apps Script

1. Cree una copia de seguridad de la Hoja de cálculo de Google actual.
2. Abra la hoja y seleccione **Extensiones > Apps Script**.
3. Agregue los archivos `.gs` numerados incluidos en la carpeta principal.
4. No agregue simultáneamente el archivo de `alternativa_archivo_unico`, porque contiene una copia de todos los módulos.
5. Copie el contenido de `appsscript.json` al manifiesto del proyecto.
6. Cambie `ID_HOJA_CALCULO` en `00_Configuracion.gs` solamente si el proyecto no está vinculado a la hoja.
7. Ejecute manualmente `prepararAccesoAdministrador()` y acepte las autorizaciones solicitadas.
   - La función instala o actualiza todas las hojas y catálogos.
   - Crea o repara el administrador y muestra un correo y una contraseña temporal en el registro de ejecución.
   - También invalida las sesiones anteriores del administrador para evitar conflictos.
8. Use **Implementar > Nueva implementación > Aplicación web**.
9. Copie la dirección terminada en `/exec`.
10. Pegue esa dirección en `DIRECCION_APLICACION` dentro de `configuracion.js`.

Para recibir la mejora completa de velocidad es necesario publicar una **versión nueva** de la aplicación web después de copiar el código actualizado. La interfaz mantiene compatibilidad con una implementación anterior, pero la consulta agrupada funciona únicamente con esta revisión del Apps Script.

## Carga rápida de módulos

El sistema abre primero el panel principal y luego prepara silenciosamente los módulos autorizados para el usuario. Al volver a un módulo muestra inmediatamente la última vista disponible y actualiza sus datos sin bloquear la navegación.

En `configuracion.js` puede ajustar:

- `CACHE_MODULOS_MILISEGUNDOS`: tiempo durante el cual un listado puede reutilizarse sin otra consulta.
- `CACHE_TIEMPO_REAL_MILISEGUNDOS`: caché breve para paneles de estado.
- `CACHE_MAXIMA_ANTIGUEDAD_MILISEGUNDOS`: tiempo máximo de la vista inmediata mientras se actualiza en segundo plano.
- `PRECARGA_MAXIMA_CONSULTAS`: máximo de módulos incluidos en una precarga.

El botón **Sincronizar** ignora temporalmente la caché, solicita los datos vigentes y prepara nuevamente los módulos autorizados. Mientras trabaja muestra su indicador de progreso.

Los formularios de vehículos, conductores, mantenciones, rutas, operaciones y notificaciones no esperan una consulta para mostrarse. Cuando necesitan listas auxiliares, el modal ya queda visible y el botón principal indica **Preparando opciones…** hasta que pueda utilizarse de forma segura.

## Publicación de la interfaz

Publique juntos estos archivos mediante un servidor HTTPS:

- `index.html`
- `estilos.css`
- `configuracion.js`
- `conexion.js`
- `mapa.js`
- `aplicacion.js`
- `logo.svg`

La cámara y el GPS normalmente requieren HTTPS. Para una prueba en el mismo computador puede utilizar `localhost`.

## Primera entrada

1. En Apps Script ejecute `prepararAccesoAdministrador()`.
2. Copie del registro de ejecución el correo y la contraseña temporal.
3. Abra la interfaz e inicie sesión con esos datos.
4. Cambie la contraseña temporal desde el menú de perfil.

Las contraseñas pueden contener solo números, solo letras o cualquier combinación de letras, números y símbolos. Se distinguen mayúsculas y minúsculas. Por seguridad se recomienda utilizar ocho caracteres o más, aunque el sistema no obliga a una composición específica.

Si ya existe una fila de usuario incompleta o una contraseña dejó de funcionar, vuelva a ejecutar `prepararAccesoAdministrador()`. La función repara el administrador, activa su acceso, genera una nueva contraseña temporal e invalida sus sesiones anteriores.

## Flujo recomendado del administrador

1. Cree los usuarios de los conductores con rol **Conductor**.
2. Cree cada conductor y asocie su `USUARIO_ID`.
3. Registre los vehículos y sus códigos QR.
4. Abra **Rutas asignadas**, seleccione conductor, vehículo, destino y Google Maps o Waze.
5. El sistema creará una notificación para el conductor.
6. Supervise **GPS en tiempo real** para ver ubicación, dirección y estado de conexión.

## Flujo recomendado del conductor

1. Inicie sesión desde el teléfono.
2. Revise **Rutas asignadas** y **Notificaciones**.
3. Pulse el botón de navegación de la ruta.
4. Escanee el QR del vehículo para validarlo e iniciar la operación.
5. Pulse **Activar ubicación continua** y autorice el permiso solicitado.
6. Finalice la operación y marque la ruta como completada.

## Búsqueda de direcciones

Los campos de dirección de empresa, rutas y operaciones consultan coincidencias mientras se escribe. La búsqueda comienza al ingresar tres caracteres y muestra hasta seis resultados. Al escoger un destino en una ruta, se guardan también su latitud y longitud.

En `configuracion.js` puede ajustar el país, el mínimo de caracteres y el tiempo de espera mediante:

- `PAIS_BUSQUEDA_DIRECCIONES`
- `MINIMO_CARACTERES_DIRECCION`
- `ESPERA_BUSQUEDA_DIRECCION_MILISEGUNDOS`

## Roles y aislamiento de información

- **Administrador:** acceso completo.
- **Supervisor:** gestión operacional sin eliminación.
- **Conductor:** ve únicamente información vinculada a su usuario y conductor asociado.

Los permisos se almacenan en la hoja `PERMISOS`. La interfaz oculta los módulos no autorizados y el servicio vuelve a validar cada lectura o cambio para impedir el acceso directo a registros ajenos.

## Configuración de intervalos

En `configuracion.js` puede ajustar:

- `INTERVALO_GPS_MILISEGUNDOS`
- `INTERVALO_TIEMPO_REAL_MILISEGUNDOS`
- `INTERVALO_CONEXION_MILISEGUNDOS`
- `INTERVALO_NOTIFICACIONES_MILISEGUNDOS`

Google Apps Script usa consultas periódicas, no conexiones WebSocket. Los valores muy bajos pueden consumir rápidamente las cuotas del servicio.

## Modo local

Si `DIRECCION_APLICACION` está vacía, el sistema utiliza almacenamiento del navegador. Este modo sirve para pruebas, pero no comparte información entre teléfonos o computadores. Para ubicación y notificaciones entre dispositivos debe configurarse Google Apps Script.
