/**
 * Módulo C — Reordenamiento heurístico de la interfaz.
 *
 * QUÉ HACE
 * Cuando un estado observable se mantiene de forma sostenida por encima de un
 * umbral, el pictograma asociado se sitúa en la primera posición del tablero.
 * Nada más: todos los pictogramas siguen presentes y seleccionables, y el
 * sistema nunca elige por la persona usuaria.
 *
 * QUÉ NO HACE, DELIBERADAMENTE
 * No infiere intenciones ni necesidades. Que el rostro sostenga una
 * configuración negativa no significa que a la persona le duela algo: significa
 * que el clasificador midió esa configuración durante varios segundos. Por eso
 * el mapeo entre estado y pictograma NO está fijado en el código, lo configura
 * la persona cuidadora, y por defecto la aplicación arranca con el módulo
 * DESACTIVADO.
 *
 * El valor por defecto para los estados negativos es «ayuda» y no «dolor». Pedir
 * ayuda es una lectura general y reversible; afirmar dolor es un diagnóstico
 * que este sistema no está en condiciones de sostener. Quien conozca al
 * participante puede cambiarlo, pero esa decisión queda registrada como suya.
 *
 * PARA EL ESTUDIO
 * El interruptor existe porque el diseño de caso único necesita una fase de
 * línea base sin reordenamiento y una fase posterior con él (RF-21). El estado
 * del interruptor se guarda con cada selección, junto con si la selección
 * coincidió o no con la sugerencia (RF-20). Ese registro de «se sugirió X, se
 * eligió Y» es probablemente el dato más informativo del sistema.
 */

const CLAVE_CONFIG = "mirame.heuristica";

const POR_DEFECTO = {
  activa: false,
  umbralMs: 3000,
  // Tolerancia a huecos: un desvío breve de la mirada no debería reiniciar una
  // acumulación de casi tres segundos.
  toleranciaMs: 600,
  mapa: {
    positivo: "jugar",
    neutro: null,
    "negativo leve": "ayuda",
    "negativo intenso": "ayuda",
  },
};

export function cargarConfig() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_CONFIG) ?? "{}");
    return { ...POR_DEFECTO, ...guardada, mapa: { ...POR_DEFECTO.mapa, ...(guardada.mapa ?? {}) } };
  } catch {
    return { ...POR_DEFECTO };
  }
}

export function guardarConfig(config) {
  localStorage.setItem(CLAVE_CONFIG, JSON.stringify(config));
}

export class Heuristica {
  constructor(config = cargarConfig()) {
    this.config = config;
    this.estadoActual = null;
    this.acumuladoMs = 0;
    this.ultimoTic = null;
    this.ultimoValido = 0;
    this.promovido = null;
  }

  get activa() {
    return this.config.activa;
  }

  set activa(v) {
    this.config.activa = v;
    guardarConfig(this.config);
    if (!v) this.reiniciar();
  }

  reiniciar() {
    this.estadoActual = null;
    this.acumuladoMs = 0;
    this.ultimoTic = null;
    this.promovido = null;
  }

  /**
   * Alimenta el detector con el estado del fotograma actual.
   *
   * `estado` es null cuando no hubo rostro válido. Devuelve la clave del
   * pictograma promovido —o null— y el progreso hacia el umbral, para poder
   * mostrárselo a la persona cuidadora.
   */
  actualizar(estado, ahora = performance.now()) {
    if (!this.config.activa) return { promovido: null, progreso: 0, estado: null };

    if (estado === null) {
      // Sin dato: se congela la acumulación. Si el hueco se alarga más que la
      // tolerancia, se descarta lo acumulado porque ya no describe un estado
      // sostenido y observado.
      if (this.ultimoValido && ahora - this.ultimoValido > this.config.toleranciaMs) {
        this.reiniciar();
      }
      this.ultimoTic = null;
      return { promovido: this.promovido, progreso: this.progreso, estado: this.estadoActual };
    }

    this.ultimoValido = ahora;

    if (estado !== this.estadoActual) {
      this.estadoActual = estado;
      this.acumuladoMs = 0;
      this.promovido = null;
    } else if (this.ultimoTic !== null) {
      this.acumuladoMs += ahora - this.ultimoTic;
    }
    this.ultimoTic = ahora;

    if (this.acumuladoMs >= this.config.umbralMs) {
      this.promovido = this.config.mapa[estado] ?? null;
    }

    return { promovido: this.promovido, progreso: this.progreso, estado: this.estadoActual };
  }

  get progreso() {
    return Math.min(1, this.acumuladoMs / this.config.umbralMs);
  }

  /** Instantánea del estado del módulo, para adjuntar al registro de selección. */
  instantanea() {
    return {
      heuristicaActiva: this.config.activa,
      sugerencia: this.promovido,
      estadoSostenido: this.promovido ? this.estadoActual : null,
      umbralMs: this.config.umbralMs,
    };
  }
}
