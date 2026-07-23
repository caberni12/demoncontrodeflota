/** Punto de entrada de la aplicación web. */
function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.accion) || 'salud');
    const request = Object.assign({}, e && e.parameter ? e.parameter : {}, { accion: action });
    return respuestaJson_(enrutarSolicitud_(request, e));
  } catch (error) {
    return respuestaJson_(respuestaError_(error));
  }
}

function doPost(e) {
  try {
    const request = parsearSolicitud_(e);
    return respuestaJson_(enrutarSolicitud_(request, e));
  } catch (error) {
    return respuestaJson_(respuestaError_(error));
  }
}
