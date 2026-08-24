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

/** Asigna uno de los cuatro estados observables. */
export function clasificar(normalizadas) {
  const s = puntaje(normalizadas);
  let estado;
  if (s >= UMBRALES.positivo) estado = "positivo";
  else if (s >= UMBRALES.neutro) estado = "neutro";
  else if (s >= UMBRALES.negativoLeve) estado = "negativo leve";
  else estado = "negativo intenso";
  return { estado, puntaje: s };
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
