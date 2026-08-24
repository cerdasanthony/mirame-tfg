/**
 * Módulo A — Características faciales observables y línea base.
 *
 * De los 52 blendshapes que entrega MediaPipe se toma un subconjunto reducido y
 * se agrupa en siete características con nombre.
 *
 * NORMALIZACIÓN POR PUNTUACIÓN z
 * Las medidas no se expresan como diferencia cruda respecto del reposo, sino
 * como puntuación z: cuántas desviaciones estándar se aparta la medida actual
 * de la distribución observada durante la línea base de esa sesión.
 *
 * La diferencia importa. Una variación de 0,05 en la curvatura de la boca puede
 * ser ruido en un rostro cuya boca fluctúa constantemente, y una señal clara en
 * otro que la mantiene estable. La diferencia cruda no distingue esos dos casos;
 * la puntuación z sí, porque incorpora la variabilidad propia del participante.
 *
 * Consecuencia práctica: los umbrales del clasificador dejan de ser números
 * elegidos a mano y pasan a expresarse en unidades de sigma, derivadas de la
 * distribución basal del propio participante.
 */

/** Promedio de un conjunto de blendshapes, tolerante a nombres ausentes. */
const avg = (bs, keys) => {
  const vals = keys.map((k) => bs[k] ?? 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

/** Extrae las siete características observables de un mapa de blendshapes. */
export function extract(blendshapes) {
  return {
    sonrisa: avg(blendshapes, ["mouthSmileLeft", "mouthSmileRight"]),
    comisurasAbajo: avg(blendshapes, ["mouthFrownLeft", "mouthFrownRight"]),
    cejasAbajo: avg(blendshapes, ["browDownLeft", "browDownRight"]),
    cejasInternasArriba: blendshapes.browInnerUp ?? 0,
    tensionOcular: avg(blendshapes, ["eyeSquintLeft", "eyeSquintRight"]),
    tensionLabial: avg(blendshapes, ["mouthPressLeft", "mouthPressRight"]),
    aperturaBucal: blendshapes.jawOpen ?? 0,
  };
}

export const CARACTERISTICAS = [
  "sonrisa",
  "comisurasAbajo",
  "cejasAbajo",
  "cejasInternasArriba",
  "tensionOcular",
  "tensionLabial",
  "aperturaBucal",
];

/**
 * Piso para la desviación estándar.
 *
 * Si una característica apenas varió durante la línea base —por ejemplo, la
 * apertura bucal en un participante que no abrió la boca—, su sigma tiende a
 * cero y la división amplifica el ruido hasta el absurdo. El piso acota esa
 * amplificación. Su valor está en la escala de los blendshapes, que van de 0 a 1.
 */
const SIGMA_MINIMA = 0.02;

/**
 * Acumulador de línea base (RF-10).
 *
 * Se alimenta durante los primeros segundos de la sesión con el rostro en
 * reposo y luego se congela, calculando media y desviación estándar de cada
 * característica.
 */
export class LineaBase {
  constructor() {
    this.muestras = [];
    this.media = null;
    this.sigma = null;
  }

  agregar(caracteristicas) {
    if (this.media) return;
    this.muestras.push(caracteristicas);
  }

  get cantidadMuestras() {
    return this.muestras.length;
  }

  get establecida() {
    return this.media !== null;
  }

  /**
   * Congela la línea base calculando media y desviación estándar muestral.
   *
   * Se usa el divisor n−1 (corrección de Bessel) porque la línea base es una
   * muestra del reposo del participante, no la población completa de sus
   * estados en reposo.
   */
  cerrar() {
    const n = this.muestras.length;
    if (n < 2) throw new Error("La línea base necesita al menos dos muestras");

    this.media = {};
    this.sigma = {};
    for (const c of CARACTERISTICAS) {
      const vals = this.muestras.map((m) => m[c]);
      const mu = vals.reduce((a, b) => a + b, 0) / n;
      const varianza = vals.reduce((a, v) => a + (v - mu) ** 2, 0) / (n - 1);
      this.media[c] = mu;
      this.sigma[c] = Math.max(Math.sqrt(varianza), SIGMA_MINIMA);
    }
    return { media: this.media, sigma: this.sigma, muestras: n };
  }

  /**
   * Devuelve las características como puntuación z respecto de la línea base.
   *
   * Antes de cerrarla, devuelve ceros: sin distribución de referencia no hay
   * nada contra qué normalizar, y devolver los valores crudos los haría pasar
   * por puntuaciones z, que es peor que no devolver nada.
   */
  normalizar(caracteristicas) {
    const out = {};
    if (!this.media) {
      for (const c of CARACTERISTICAS) out[c] = 0;
      return out;
    }
    for (const c of CARACTERISTICAS) {
      out[c] = (caracteristicas[c] - this.media[c]) / this.sigma[c];
    }
    return out;
  }

  /** Estado serializable, para guardarlo con la sesión y poder reanalizarla. */
  instantanea() {
    return this.media ? { media: this.media, sigma: this.sigma, muestras: this.muestras.length } : null;
  }
}

/**
 * Frontalidad del rostro, en [0, 1].
 *
 * Los blendshapes se degradan cuando la cabeza está girada: con el rostro de
 * perfil, la mitad oculta produce coeficientes poco confiables. Medir cuán de
 * frente está la cara permite descartar esos fotogramas en lugar de
 * clasificarlos mal.
 *
 * Se estima comparando la distancia horizontal de la punta de la nariz a cada
 * borde del rostro. Un valor cercano a 1 indica cara de frente; cercano a 0,
 * girada. Se usa la geometría en vez de la matriz de transformación para no
 * depender de la convención de ejes del modelo.
 */
const NARIZ = 1;
const BORDE_IZQ = 234;
const BORDE_DER = 454;

export function frontalidad(landmarks) {
  const n = landmarks[NARIZ];
  const i = landmarks[BORDE_IZQ];
  const d = landmarks[BORDE_DER];
  if (!n || !i || !d) return 1;

  const dIzq = Math.abs(n.x - i.x);
  const dDer = Math.abs(d.x - n.x);
  const mayor = Math.max(dIzq, dDer);
  if (mayor < 1e-6) return 0;
  return Math.min(dIzq, dDer) / mayor;
}
