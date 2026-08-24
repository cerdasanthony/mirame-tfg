/**
 * Módulo B — Clasificación descriptiva y ventana temporal.
 *
 * ADVERTENCIA METODOLÓGICA
 * Los pesos y los umbrales de este archivo son VALORES INICIALES, puestos para
 * que el sistema funcione de extremo a extremo. No están calibrados ni
 * validados con ningún participante. Se ajustan en el Sprint 6 con las
 * grabaciones de calibración, y el procedimiento de ajuste debe quedar
 * documentado en el informe.
 *
 * El estado que se asigna describe la configuración del rostro. No es una
 * emoción ni una intención.
 */

export const ESTADOS = ["positivo", "neutro", "negativo leve", "negativo intenso"];

/** Contribución de cada característica al puntaje compuesto. */
const PESOS = {
  sonrisa: +1.0,
  comisurasAbajo: -0.9,
  cejasAbajo: -0.7,
  cejasInternasArriba: -0.4,
  tensionOcular: -0.5,
  tensionLabial: -0.5,
  aperturaBucal: 0.0, // Sin signo asignado: apunta a habla, bostezo o llanto.
};

/** Cortes del puntaje compuesto. Sujetos a calibración. */
const UMBRALES = {
  positivo: 0.15,
  neutro: -0.10,
  negativoLeve: -0.35,
};

/** Puntaje compuesto en [-1, 1] a partir de las características normalizadas. */
export function puntaje(normalizadas) {
  let s = 0;
  for (const [k, w] of Object.entries(PESOS)) s += (normalizadas[k] ?? 0) * w;
  return Math.max(-1, Math.min(1, s));
}

/** Asigna uno de los cuatro estados a partir de un puntaje ya calculado. */
function estadoDe(s) {
  if (s >= UMBRALES.positivo) return "positivo";
  if (s >= UMBRALES.neutro) return "neutro";
  if (s >= UMBRALES.negativoLeve) return "negativo leve";
  return "negativo intenso";
}

/** Distancia del puntaje al corte más cercano: margen de decisión. */
function margen(s) {
  const cortes = [UMBRALES.positivo, UMBRALES.neutro, UMBRALES.negativoLeve];
  return Math.min(...cortes.map((c) => Math.abs(s - c)));
}

/**
 * Suavizado exponencial del puntaje.
 *
 * Clasificar cada fotograma de forma independiente produce un resultado que
 * salta constantemente: el rostro de un niño en movimiento genera variaciones
 * de alta frecuencia que no corresponden a ningún cambio real. La media móvil
 * exponencial conserva la reactividad ante cambios sostenidos y descarta el
 * ruido de fotograma a fotograma.
 *
 * ALFA es el peso del fotograma nuevo. Más bajo suaviza más y responde más
 * lento. Requiere calibración junto con los umbrales.
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
 * Clasifica un fotograma.
 *
 * `suavizador` es opcional; sin él la clasificación es instantánea y ruidosa.
 * Devuelve además el margen de decisión, para poder marcar como incierta una
 * clasificación que quedó pegada a un umbral.
 */
export function clasificar(normalizadas, suavizador = null) {
  const crudo = puntaje(normalizadas);
  const s = suavizador ? suavizador.agregar(crudo) : crudo;
  return {
    estado: estadoDe(s),
    puntaje: s,
    puntajeCrudo: crudo,
    margen: margen(s),
    // Un margen pequeño significa que el puntaje quedó sobre la frontera entre
    // dos estados: la etiqueta es arbitraria y debe reportarse como tal.
    incierto: margen(s) < 0.05,
  };
}

/**
 * Ventana temporal deslizante (RF-13, RF-15, RF-27).
 *
 * Guarda los estados de los últimos `segundos` y calcula su distribución. Los
 * fotogramas sin rostro entran como `null` y cuentan para la tasa de validez.
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
