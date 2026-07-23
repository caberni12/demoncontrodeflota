/** Módulo de mantenciones. */
function mantencionesAbiertas_() {
  return listarRegistros_('MANTENCIONES', {}).filter(function(row) {
    return ['Programada','En proceso','Atrasada'].indexOf(row.ESTADO) >= 0;
  });
}
