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

import { qn } from "./features.js";

/** Contribución de cada característica al compuesto. */
const PESOS = {
  sonrisa: +1.0,
  comisurasAbajo: -0.9,
  cejasAbajo: -0.7,
  cejasInternasArriba: -0.4,
  cejasExternasArriba: 0.0, // Sin peso propio: modula a AU1. Ver `evidencia()`.
  tensionOcular: -0.5,
  tensionLabial: -0.5,
  aperturaBucal: 0.0, // Sin signo: apunta a habla, bostezo o llanto por igual.
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVIDENCIA RECTIFICADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EL ERROR QUE CORRIGE
 * Al probar la aplicación se observó que abrir mucho los ojos producía una
 * clasificación POSITIVA. La causa no era el umbral: era el signo.
 *
 * Los blendshapes son unipolares. Van de 0, la acción ausente, a 1, la acción
 * en su máximo. Codifican PRESENCIA, no polaridad. Lo mismo ocurre en FACS, que
 * puntúa la intensidad de cada unidad de acción en cinco niveles de A, traza, a
 * E, máximo: no existe una intensidad negativa de una unidad de acción
 * (Ekman y Friesen, 1978).
 *
 * El compuesto, en cambio, multiplicaba la puntuación z por un peso con signo.
 * Cuando un canal caía POR DEBAJO de su reposo, su z era negativa y, al
 * multiplicarla por un peso negativo, el producto salía positivo. Abrir los
 * ojos reduce el entrecerrado, la tensión ocular baja del reposo, y el sistema
 * lo contaba como evidencia de valencia positiva.
 *
 * Comprobado sobre el registro del 25-08-2026: el 15 % de las muestras
 * clasificadas como positivas no tenían la sonrisa elevada, y la tensión ocular
 * estaba por debajo del reposo el 36,6 % del tiempo.
 *
 * La ausencia de una acción no es evidencia de la acción contraria. Se rectifica
 * a cero: solo la presencia suma.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SORPRESA FRENTE A DISTRES
 *
 * También se observó que alzar las cejas se clasificaba como negativo. AU1, el
 * elevador de la ceja interna, entra con peso negativo porque forma parte de la
 * combinación de tristeza, AU1+AU4+AU15. Pero AU1 acompañada de AU2, el
 * elevador de la ceja externa, es sorpresa, cuya valencia no está declarada en
 * este trabajo. AU1 por sí sola no distingue una cosa de la otra: aparece en
 * ambas y significa distinto según qué la acompañe.
 *
 * La regla es la que sigue de esas combinaciones: AU2 cancela a AU1 en la
 * medida en que la acompaña. Si ambas suben por igual, el aporte es nulo y la
 * configuración se lee como sorpresa. Si sube AU1 sola, el aporte es completo y
 * se lee como distrés.
 */
function evidencia(z) {
  const rect = (c) => Math.max(0, z[c] ?? 0);
  const out = {};
  for (const c of Object.keys(PESOS)) out[c] = rect(c);
  // AU2 descuenta a AU1: lo que sube acompañado no cuenta como distrés.
  out.cejasInternasArriba = Math.max(0, out.cejasInternasArriba - out.cejasExternasArriba);
  return out;
}

/**
 * Centro y escala del compuesto, medidos sobre la línea base.
 *
 * POR QUE NO SE DIVIDE ENTRE LA SUMA DE PESOS ABSOLUTOS
 * Esa era la versión anterior, y comprimía la señal. Una suma ponderada de
 * variables tipificadas no tiene desviación típica igual a la suma de los pesos
 * absolutos: bajo independencia tiene la norma euclídea del vector de pesos.
 * Con estos pesos, 1,72 frente a 4,0. Dividir por 4,0 dejaba al compuesto con
 * una sigma real de 0,43, de modo que un corte nominal «de una sigma» se estaba
 * aplicando a algo comprimido 2,32 veces. Una expresión que activa dos o tres
 * canales quedaba diluida entre los siete.
 *
 * POR QUE SE MIDE EN VEZ DE CALCULARSE
 * La norma euclídea sería correcta solo si los canales fuesen independientes, y
 * no lo son: los músculos faciales covarían. Medir el centro y la escala del
 * compuesto sobre las propias muestras de la línea base no necesita ese
 * supuesto, y de paso absorbe el sesgo que introduce la rectificación, ya que
 * al rectificar cinco de los seis pesos con signo son negativos y el compuesto
 * en reposo queda desplazado hacia abajo.
 */
export const NORMA = { centro: 0, escala: null };

export function calibrarNorma(muestrasZ) {
  if (!muestrasZ?.length) return NORMA;
  const brutos = muestrasZ.map((z) => {
    const e = evidencia(z);
    let s = 0;
    for (const [c, w] of Object.entries(PESOS)) s += e[c] * w;
    return s;
  });
  const orden = [...brutos].sort((a, b) => a - b);
  NORMA.centro = orden[orden.length >> 1];
  const esc = qn(brutos);
  /* Si la línea base salió tan quieta que el compuesto no varía, no hay escala
     que medir y se cae a la norma euclídea, que es el valor teórico bajo
     independencia. Queda anotado que fue supuesta y no medida. */
  NORMA.escala = esc > 1e-3 ? esc : Math.hypot(...Object.values(PESOS));
  NORMA.medida = esc > 1e-3;
  return NORMA;
}

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
  const e = evidencia(z);
  let s = 0;
  for (const [k, w] of Object.entries(PESOS)) s += e[k] * w;
  const escala = NORMA.escala ?? Math.hypot(...Object.values(PESOS));
  return (s - NORMA.centro) / escala;
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
 * PONDERACIÓN POR CERCANÍA
 * Los fotogramas no pesan igual. Lo que ocurre en el instante previo a que la
 * mano toque el pictograma es la información relevante; lo que ocurrió seis
 * segundos antes, mucho menos. El peso decae exponencialmente hacia atrás con
 * una semivida configurable.
 *
 * Sin esta ponderación, un gesto de dos segundos justo antes de la selección
 * queda diluido entre seis segundos de reposo y el resumen dice «neutro»
 * aunque el momento comunicativo no lo fuera. Observado sobre datos reales del
 * participante: ventanas con 57 % de fotogramas expresivos se reportaban como
 * neutras porque «neutro» seguía siendo la categoría más frecuente.
 *
 * SE REPORTA MÁS QUE LA MODA
 * La moda de cuatro categorías sobre un rostro que la mayor parte del tiempo
 * está en reposo devuelve «neutro» casi siempre, y esconde que una parte
 * sustancial de la ventana no lo era. Junto al estado predominante se devuelve
 * el estado expresivo —el más fuerte de los no neutros— con su proporción, que
 * es lo que la persona cuidadora necesita para interpretar.
 */
export class Ventana {
  constructor(segundos = 5, minValidos = 0.4, semividaMs = 1500) {
    this.segundos = segundos;
    this.minValidos = minValidos;
    this.semividaMs = semividaMs;
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
   * Distribución ponderada de estados en la ventana.
   *
   * Si la proporción de fotogramas con rostro cae por debajo del mínimo, se
   * devuelve `suficiente: false` y el llamador registra «datos insuficientes»
   * en lugar de atribuir un estado (RF-27).
   */
  distribucion(ahora = performance.now()) {
    const total = this.muestras.length;
    const validas = this.muestras.filter((m) => m.estado !== null);
    const tasaValidez = total ? validas.length / total : 0;

    // Peso exponencial: 1 en el instante actual, 0,5 una semivida atrás.
    const peso = (m) => Math.pow(0.5, (ahora - m.t) / this.semividaMs);

    const acum = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    let sumaPesos = 0;
    let puntajePonderado = 0;
    for (const m of validas) {
      const w = peso(m);
      acum[m.estado] += w;
      puntajePonderado += m.puntaje * w;
      sumaPesos += w;
    }

    const proporciones = {};
    for (const e of ESTADOS) proporciones[e] = sumaPesos ? acum[e] / sumaPesos : 0;

    const predominante = sumaPesos
      ? ESTADOS.reduce((a, b) => (acum[a] >= acum[b] ? a : b))
      : null;

    // Estado expresivo: el no neutro con más peso, y cuánto ocupó de la ventana.
    const noNeutros = ESTADOS.filter((e) => e !== "neutro");
    const expresivo = sumaPesos
      ? noNeutros.reduce((a, b) => (acum[a] >= acum[b] ? a : b))
      : null;
    const proporcionExpresiva = sumaPesos
      ? noNeutros.reduce((s, e) => s + proporciones[e], 0)
      : 0;

    return {
      suficiente: tasaValidez >= this.minValidos && validas.length > 0,
      tasaValidez,
      fotogramasTotales: total,
      fotogramasValidos: validas.length,
      proporciones,
      predominante,
      // El más fuerte de los estados no neutros y el peso total de lo expresivo.
      expresivo,
      proporcionExpresiva,
      puntajePromedio: sumaPesos ? puntajePonderado / sumaPesos : 0,
    };
  }
}
