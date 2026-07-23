/**
 * CONFIGURACIÓN DE LA INTERFAZ
 * Pegue en DIRECCION_APLICACION la dirección terminada en /exec del despliegue de Google Apps Script.
 */
window.CONFIGURACION_FLOTAS = Object.freeze({
  MODO: 'automatico',
  DIRECCION_APLICACION: '',
  CLAVE_ALMACENAMIENTO_LOCAL: 'sistema_gestion_flotas_base_local_v3',
  CLAVE_SESION_LOCAL: 'sistema_gestion_flotas_sesion_v3',
  TIEMPO_ESPERA_MILISEGUNDOS: 25000,
  INTERVALO_GPS_MILISEGUNDOS: 10000,
  ANTIGUEDAD_UBICACION_ACTIVA_MILISEGUNDOS: 120000,
  CENTRO_MAPA: [-33.4489, -70.6693],
  NIVEL_ACERCAMIENTO_MAPA: 12
});
