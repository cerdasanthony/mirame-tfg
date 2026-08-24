/**
 * Módulo B — Clasificación descriptiva, estabilización temporal y ventana.
 *
 * El estado que se asigna describe la configuración del rostro. No es una
 * emoción ni una intención.
 *
 * DERIVACIÓN DE LOS UMBRALES
 * La entrada son puntuaciones z respecto de la línea base del participante, de
 * modo que los cortes se expresan en unidades de desviación estándar y no en
 * números arbitrarios. «Positivo» significa que el compuesto se aparta más de
 * una sigma por encima del reposo observado en esa misma persona. Ese criterio
 * es reproducible y se recalcula solo para cada participante y cada sesión.
 *
 * Los PESOS siguen siendo una decisión de diseño —qué características cuentan
 * y con qué signo— y deben justificarse en el informe. Lo que dejó de ser
 * arbitrario es la escala.
 */

export const ESTADOS = ["positivo", "neutro", "negativo leve", "negativo intenso"];

/** Contribución de cada característica al compuesto. */
const PESOS = {
  sonrisa: +1.0,
  comisurasAbajo: -0.9,
  cejasAbajo: -0.7,
  cejasInternasArriba: -0.4,
  tensionOcular: -0.5,
  tensionLabial: -0.5,
  aperturaBucal: 0.0, // Sin signo: apunta a habla, bostezo o llanto por igual.
};

/**
 * Cortes del compuesto, en unidades de sigma de la línea base.
 *
 * Son ajustables en caliente desde el panel del cuidador porque la anchura de
 * la banda neutra es justamente el parámetro que hay que calibrar con cada
 * participante: demasiado ancha y todo se clasifica como neutro, demasiado
 * estrecha y el estado oscila con el ruido. El valor definitivo debe salir del
 * reanálisis de sesiones grabadas, no de una elección a priori.
 */
const CLAVE_UMBRALES = "mirame.umbrales";

export const UMBRALES = {
  positivo: 1.0,
  neutro: -0.75,
  negativoLeve: -2.0,
};

try {
  Object.assign(UMBRALES, JSON.parse(localStorage.getItem(CLAVE_UMBRALES) ?? "{}"));
} catch { /* configuración corrupta: se conservan los valores por defecto */ }

export function fijarUmbrales(nuevos) {
  Object.assign(UMBRALES, nuevos);
  localStorage.setItem(CLAVE_UMBRALES, JSON.stringify(UMBRALES));
  return UMBRALES;
}

/**
 * Ancho de la histéresis, en sigmas.
 *
 * Un puntaje que oscila alrededor de un corte produce un estado que parpadea.
 * La histéresis exige superar el corte por este margen para ENTRAR a un estado,
 * y caer por debajo del corte menos el margen para SALIR de él. La franja
 * intermedia conserva el estado vigente en lugar de alternar.
 */
const HISTERESIS = 0.25;

/**
 * Compuesto en unidades de sigma.
 *
 * Se divide entre la suma de pesos absolutos para que el resultado siga
 * expresándose en sigmas y no dependa de cuántas características se sumen.
 */
export function puntaje(z) {
  let s = 0;
  let norma = 0;
  for (const [k, w] of Object.entries(PESOS)) {
    s += (z[k] ?? 0) * w;
    norma += Math.abs(w);
  }
  return norma ? s / norma : 0;
}

/** Estado que corresponde a un puntaje, sin considerar el estado previo. */
export function estadoDe(s) {
  if (s >= UMBRALES.positivo) return "positivo";
  if (s >= UMBRALES.neutro) return "neutro";
  if (s >= UMBRALES.negativoLeve) return "negativo leve";
  return "negativo intenso";
}

/**
 * Estado con histéresis: sólo se abandona el estado vigente si el puntaje se
 * aleja del corte lo suficiente como para descartar que sea oscilación.
 */
function estadoConHisteresis(s, vigente) {
  if (!vigente) return estadoDe(s);
  const candidato = estadoDe(s);
  if (candidato === vigente) return vigente;

  const iV = ESTADOS.indexOf(vigente);
  const iC = ESTADOS.indexOf(candidato);
  // Los cortes están ordenados de mayor a menor puntaje, igual que ESTADOS.
  const corte = iC > iV ? [UMBRALES.positivo, UMBRALES.neutro, UMBRALES.negativoLeve][iV]
                        : [UMBRALES.positivo, UMBRALES.neutro, UMBRALES.negativoLeve][iC];
  return iC > iV
    ? (s < corte - HISTERESIS ? candidato : vigente)   // baja de estado
    : (s > corte + HISTERESIS ? candidato : vigente);  // sube de estado
}

/** Distancia del puntaje al corte más cercano: margen de decisión. */
export function margen(s) {
  const cortes = [UMBRALES.positivo, UMBRALES.neutro, UMBRALES.negativoLeve];
  return Math.min(...cortes.map((c) => Math.abs(s - c)));
}

/**
 * Suavizado exponencial del puntaje.
 *
 * Reduce la variación de alta frecuencia que produce un rostro en movimiento y
 * que no corresponde a ningún cambio real. Actúa sobre la señal continua; la
 * histéresis y el dwell actúan sobre la decisión discreta. Son complementarios.
 */
const ALFA = 0.18;

export class Suavizador {
  constructor(alfa = ALFA) {
    this.alfa = alfa;
    this.valor = null;
  }
  agregar(s) {
    this.valor = this.valor === null ? s : this.alfa * s + (1 - this.alfa) * this.valor;
    return this.valor;
  }
  reiniciar() {
    this.valor = null;
  }
}

/**
 * Estabilizador temporal: dwell time progresivo con retroceso gradual.
 *
 * Un cambio de estado no se aplica en cuanto el puntaje cruza un corte. Se
 * acumula evidencia mientras el candidato se sostiene, y esa evidencia se
 * DESCUENTA gradualmente —no se reinicia— si el candidato desaparece. El
 * retroceso gradual es lo que distingue una señal genuina que titila de una
 * fluctuación pasajera: la primera vuelve y retoma lo acumulado, la segunda se
 * disipa.
 *
 * `factorRetroceso` gobierna esa asimetría. Con 0,5 la evidencia se pierde a la
 * mitad de la velocidad con que se gana, de modo que un parpadeo aislado no
 * borra el progreso pero una desaparición sostenida sí.
 */
export class Estabilizador {
  constructor({ dwellMs = 500, factorRetroceso = 0.5 } = {}) {
    this.dwellMs = dwellMs;
    this.factorRetroceso = factorRetroceso;
    this.estado = null;
    this.candidato = null;
    this.evidenciaMs = 0;
  }

  reiniciar() {
    this.estado = null;
    this.candidato = null;
    this.evidenciaMs = 0;
  }

  /**
   * Alimenta el estabilizador con un puntaje y el tiempo transcurrido.
   * Devuelve el estado comprometido, que puede no ser el del puntaje actual.
   */
  actualizar(s, dtMs) {
    const propuesto = estadoConHisteresis(s, this.estado);

    if (this.estado === null) {
      this.estado = propuesto;
      this.candidato = null;
      this.evidenciaMs = 0;
      return this.estado;
    }

    if (propuesto === this.estado) {
      // El estado vigente se confirma: la evidencia de cambio retrocede.
      this.evidenciaMs = Math.max(0, this.evidenciaMs - dtMs * this.factorRetroceso);
      if (this.evidenciaMs === 0) this.candidato = null;
      return this.estado;
    }

    if (propuesto !== this.candidato) {
      // Cambió el candidato: la evidencia acumulada no le sirve.
      this.candidato = propuesto;
      this.evidenciaMs = 0;
    }
    this.evidenciaMs += dtMs;

    if (this.evidenciaMs >= this.dwellMs) {
      this.estado = this.candidato;
      this.candidato = null;
      this.evidenciaMs = 0;
    }
    return this.estado;
  }

  get progresoCambio() {
    return this.candidato ? Math.min(1, this.evidenciaMs / this.dwellMs) : 0;
  }
}

/**
 * Clasifica un fotograma aplicando, en orden: suavizado de la señal, histéresis
 * sobre el corte y dwell time sobre la decisión.
 */
export function clasificar(z, { suavizador = null, estabilizador = null, dtMs = 33 } = {}) {
  const crudo = puntaje(z);
  const s = suavizador ? suavizador.agregar(crudo) : crudo;
  const estado = estabilizador ? estabilizador.actualizar(s, dtMs) : estadoDe(s);

  return {
    estado,
    puntaje: s,
    puntajeCrudo: crudo,
    margen: margen(s),
    // Margen pequeño: el puntaje quedó sobre la frontera entre dos estados y la
    // etiqueta es arbitraria. Debe reportarse como tal.
    incierto: margen(s) < HISTERESIS,
    cambiando: estabilizador ? estabilizador.progresoCambio : 0,
  };
}

/**
 * Ventana temporal deslizante (RF-13, RF-15, RF-27).
 *
 * Guarda los estados de los últimos `segundos` y calcula su distribución. Los
 * fotogramas sin rostro válido entran como `null` y cuentan para la tasa de
 * validez.
 */
export class Ventana {
  constructor(segundos = 8, minValidos = 0.4) {
    this.segundos = segundos;
    this.minValidos = minValidos;
    this.muestras = [];
  }

  agregar(estado, puntajeValor, t = performance.now()) {
    this.muestras.push({ estado, puntaje: puntajeValor, t });
    this.podar(t);
  }

  agregarSinRostro(t = performance.now()) {
    this.agregar(null, null, t);
  }

  /** Rostro presente pero demasiado girado para confiar en los blendshapes. */
  agregarDescartado(t = performance.now()) {
    this.agregar(null, null, t);
  }

  podar(t) {
    const corte = t - this.segundos * 1000;
    while (this.muestras.length && this.muestras[0].t < corte) this.muestras.shift();
  }

  /**
   * Distribución de estados en la ventana.
   *
   * Si la proporción de fotogramas con rostro cae por debajo del mínimo, se
   * devuelve `suficiente: false` y el llamador registra «datos insuficientes»
   * en lugar de atribuir un estado (RF-27).
   */
  distribucion() {
    const total = this.muestras.length;
    const validas = this.muestras.filter((m) => m.estado !== null);
    const tasaValidez = total ? validas.length / total : 0;

    const conteo = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    for (const m of validas) conteo[m.estado]++;

    const proporciones = {};
    for (const e of ESTADOS) {
      proporciones[e] = validas.length ? conteo[e] / validas.length : 0;
    }

    const promedio = validas.length
      ? validas.reduce((a, m) => a + m.puntaje, 0) / validas.length
      : 0;

    let predominante = null;
    if (validas.length) {
      predominante = ESTADOS.reduce((a, b) => (conteo[a] >= conteo[b] ? a : b));
    }

    return {
      suficiente: tasaValidez >= this.minValidos && validas.length > 0,
      tasaValidez,
      fotogramasTotales: total,
      fotogramasValidos: validas.length,
      proporciones,
      predominante,
      puntajePromedio: promedio,
    };
  }
}
