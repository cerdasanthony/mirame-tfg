/**
 * Módulo A — Características faciales observables y línea base.
 *
 * De los 52 blendshapes que entrega MediaPipe se toma un subconjunto reducido y
 * se agrupa en siete características con nombre. Todas se expresan como
 * DESVIACIÓN respecto de la línea base de la sesión: la geometría facial varía
 * entre personas, así que el rostro se mide contra sí mismo y no contra un
 * promedio poblacional.
 *
 * Nada de esto afirma nada sobre lo que la persona siente. Son medidas de la
 * configuración del rostro.
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
 * Acumulador de línea base (RF-10).
 *
 * Se alimenta durante los primeros segundos de la sesión con el rostro en
 * reposo y luego se congela. A partir de ahí, `normalizar` devuelve la
 * desviación de cada característica respecto de ese reposo.
 */
export class LineaBase {
  constructor() {
    this.muestras = [];
    this.valores = null;
  }

  agregar(caracteristicas) {
    if (this.valores) return;
    this.muestras.push(caracteristicas);
  }

  get cantidadMuestras() {
    return this.muestras.length;
  }

  get establecida() {
    return this.valores !== null;
  }

  /** Congela la línea base con el promedio de lo acumulado. */
  cerrar() {
    if (!this.muestras.length) {
      throw new Error("No hay muestras para establecer la línea base");
    }
    this.valores = {};
    for (const c of CARACTERISTICAS) {
      const suma = this.muestras.reduce((a, m) => a + m[c], 0);
      this.valores[c] = suma / this.muestras.length;
    }
    return this.valores;
  }

  /** Devuelve las características como desviación respecto de la línea base. */
  normalizar(caracteristicas) {
    if (!this.valores) return { ...caracteristicas };
    const out = {};
    for (const c of CARACTERISTICAS) {
      out[c] = caracteristicas[c] - this.valores[c];
    }
    return out;
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
