(function () {
  'use strict';

  const TAMANO_BALDOSA = 256;
  const limitar = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor));

  function latitudLongitudAMundo(latitud, longitud, nivel) {
    const escala = TAMANO_BALDOSA * Math.pow(2, nivel);
    const latitudLimitada = limitar(Number(latitud), -85.05112878, 85.05112878);
    const seno = Math.sin(latitudLimitada * Math.PI / 180);
    return {
      x: (Number(longitud) + 180) / 360 * escala,
      y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * escala
    };
  }

  function mundoALatitudLongitud(x, y, nivel) {
    const escala = TAMANO_BALDOSA * Math.pow(2, nivel);
    const longitud = x / escala * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / escala;
    const latitud = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { latitud, longitud };
  }

  class MapaFlotas {
    constructor(contenedor, opciones = {}) {
      if (!contenedor) throw new Error('CONTENEDOR_MAPA_NO_DISPONIBLE');
      this.contenedor = contenedor;
      this.centro = Array.isArray(opciones.centro) ? opciones.centro.map(Number) : [-33.4489, -70.6693];
      this.nivel = limitar(Number(opciones.nivel || 12), 3, 19);
      this.marcadores = [];
      this.arrastrando = false;
      this.movimientoInicial = null;
      this.centroInicial = null;
      this.ajustadoUnaVez = false;
      this.crearEstructura();
      this.vincularEventos();
      this.manejadorCambioTamano = () => this.dibujar();
      if ('ResizeObserver' in window) {
        this.observador = new ResizeObserver(this.manejadorCambioTamano);
        this.observador.observe(this.contenedor);
      } else {
        this.observador = null;
        window.addEventListener('resize', this.manejadorCambioTamano);
      }
      this.dibujar();
    }

    crearEstructura() {
      this.contenedor.innerHTML = '';
      this.contenedor.classList.add('mapa-flotas');
      this.capaBaldosas = document.createElement('div');
      this.capaBaldosas.className = 'mapa-baldosas';
      this.capaMarcadores = document.createElement('div');
      this.capaMarcadores.className = 'mapa-marcadores';
      this.aviso = document.createElement('div');
      this.aviso.className = 'mapa-aviso';
      this.aviso.innerHTML = '<b>Mapa preparado</b><span>Las ubicaciones aparecerán cuando los conductores envíen su GPS.</span>';
      this.controles = document.createElement('div');
      this.controles.className = 'mapa-controles';
      this.controles.innerHTML = '<button type="button" data-mapa-acercar aria-label="Acercar">＋</button><button type="button" data-mapa-alejar aria-label="Alejar">−</button><button type="button" data-mapa-centrar aria-label="Centrar ubicaciones">⌖</button>';
      this.contenedor.append(this.capaBaldosas, this.capaMarcadores, this.aviso, this.controles);
    }

    vincularEventos() {
      this.controles.querySelector('[data-mapa-acercar]').addEventListener('click', () => this.cambiarNivel(1));
      this.controles.querySelector('[data-mapa-alejar]').addEventListener('click', () => this.cambiarNivel(-1));
      this.controles.querySelector('[data-mapa-centrar]').addEventListener('click', () => this.ajustarAMarcadores());
      this.contenedor.addEventListener('wheel', evento => {
        evento.preventDefault();
        this.cambiarNivel(evento.deltaY < 0 ? 1 : -1);
      }, { passive: false });
      this.contenedor.addEventListener('pointerdown', evento => {
        if (evento.target.closest('button')) return;
        this.arrastrando = true;
        this.movimientoInicial = { x: evento.clientX, y: evento.clientY };
        this.centroInicial = latitudLongitudAMundo(this.centro[0], this.centro[1], this.nivel);
        this.contenedor.setPointerCapture(evento.pointerId);
        this.contenedor.classList.add('arrastrando');
      });
      this.contenedor.addEventListener('pointermove', evento => {
        if (!this.arrastrando) return;
        const dx = evento.clientX - this.movimientoInicial.x;
        const dy = evento.clientY - this.movimientoInicial.y;
        const nuevo = mundoALatitudLongitud(this.centroInicial.x - dx, this.centroInicial.y - dy, this.nivel);
        this.centro = [nuevo.latitud, nuevo.longitud];
        this.dibujar();
      });
      const terminar = () => { this.arrastrando = false; this.contenedor.classList.remove('arrastrando'); };
      this.contenedor.addEventListener('pointerup', terminar);
      this.contenedor.addEventListener('pointercancel', terminar);
    }

    cambiarNivel(cambio) {
      const nuevoNivel = limitar(this.nivel + cambio, 3, 19);
      if (nuevoNivel === this.nivel) return;
      this.nivel = nuevoNivel;
      this.dibujar();
    }

    establecerVista(latitud, longitud, nivel = this.nivel) {
      if (!Number.isFinite(Number(latitud)) || !Number.isFinite(Number(longitud))) return;
      this.centro = [Number(latitud), Number(longitud)];
      this.nivel = limitar(Number(nivel), 3, 19);
      this.dibujar();
    }

    actualizarMarcadores(marcadores, ajustar = false) {
      this.marcadores = (marcadores || []).filter(item => Number.isFinite(Number(item.latitud)) && Number.isFinite(Number(item.longitud)));
      this.aviso.hidden = this.marcadores.length > 0;
      if ((ajustar || !this.ajustadoUnaVez) && this.marcadores.length) {
        this.ajustarAMarcadores();
        this.ajustadoUnaVez = true;
      } else {
        this.dibujar();
      }
    }

    ajustarAMarcadores() {
      if (!this.marcadores.length) return this.dibujar();
      const latitudes = this.marcadores.map(item => Number(item.latitud));
      const longitudes = this.marcadores.map(item => Number(item.longitud));
      const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
      const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
      this.centro = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
      const ancho = Math.max(this.contenedor.clientWidth - 90, 240);
      const alto = Math.max(this.contenedor.clientHeight - 90, 220);
      let nivelElegido = 16;
      for (let nivel = 16; nivel >= 3; nivel -= 1) {
        const a = latitudLongitudAMundo(maxLat, minLng, nivel);
        const b = latitudLongitudAMundo(minLat, maxLng, nivel);
        if (Math.abs(b.x - a.x) <= ancho && Math.abs(b.y - a.y) <= alto) { nivelElegido = nivel; break; }
      }
      this.nivel = nivelElegido;
      this.dibujar();
    }

    dibujar() {
      const ancho = this.contenedor.clientWidth || 800;
      const alto = this.contenedor.clientHeight || 480;
      const centroMundo = latitudLongitudAMundo(this.centro[0], this.centro[1], this.nivel);
      const izquierda = centroMundo.x - ancho / 2;
      const arriba = centroMundo.y - alto / 2;
      this.dibujarBaldosas(izquierda, arriba, ancho, alto);
      this.dibujarMarcadores(izquierda, arriba);
    }

    dibujarBaldosas(izquierda, arriba, ancho, alto) {
      this.capaBaldosas.innerHTML = '';
      const total = Math.pow(2, this.nivel);
      const inicioX = Math.floor(izquierda / TAMANO_BALDOSA);
      const finX = Math.floor((izquierda + ancho) / TAMANO_BALDOSA);
      const inicioY = Math.floor(arriba / TAMANO_BALDOSA);
      const finY = Math.floor((arriba + alto) / TAMANO_BALDOSA);
      const fragmento = document.createDocumentFragment();
      for (let x = inicioX; x <= finX; x += 1) {
        for (let y = inicioY; y <= finY; y += 1) {
          if (y < 0 || y >= total) continue;
          const xNormalizado = ((x % total) + total) % total;
          const imagen = document.createElement('img');
          imagen.alt = '';
          imagen.draggable = false;
          imagen.loading = 'eager';
          imagen.src = `https://tile.openstreetmap.org/${this.nivel}/${xNormalizado}/${y}.png`;
          imagen.style.left = `${x * TAMANO_BALDOSA - izquierda}px`;
          imagen.style.top = `${y * TAMANO_BALDOSA - arriba}px`;
          imagen.addEventListener('error', () => imagen.classList.add('error-baldosa'));
          fragmento.appendChild(imagen);
        }
      }
      this.capaBaldosas.appendChild(fragmento);
    }

    dibujarMarcadores(izquierda, arriba) {
      this.capaMarcadores.innerHTML = '';
      const fragmento = document.createDocumentFragment();
      this.marcadores.forEach(item => {
        const punto = latitudLongitudAMundo(item.latitud, item.longitud, this.nivel);
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = `mapa-marcador ${item.activo ? 'activo' : 'antiguo'}`;
        boton.style.left = `${punto.x - izquierda}px`;
        boton.style.top = `${punto.y - arriba}px`;
        boton.setAttribute('aria-label', `Ubicación de ${item.nombre || 'conductor'}`);
        boton.innerHTML = `<i>⌖</i><span>${item.nombre || 'Conductor'}</span>`;
        const detalle = document.createElement('div');
        detalle.className = 'mapa-detalle';
        detalle.innerHTML = item.detalle || '';
        boton.appendChild(detalle);
        boton.addEventListener('click', evento => {
          evento.stopPropagation();
          this.capaMarcadores.querySelectorAll('.mapa-marcador.abierto').forEach(nodo => { if (nodo !== boton) nodo.classList.remove('abierto'); });
          boton.classList.toggle('abierto');
        });
        fragmento.appendChild(boton);
      });
      this.capaMarcadores.appendChild(fragmento);
    }

    eliminar() {
      if (this.observador) this.observador.disconnect();
      if (!this.observador && this.manejadorCambioTamano) window.removeEventListener('resize', this.manejadorCambioTamano);
      this.contenedor.innerHTML = '';
    }
  }

  window.MapaFlotas = MapaFlotas;
})();
