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
  /**
   * @param {string[]} canales Claves sobre las que se calcula la referencia.
   *   Por defecto, las siete características observables. El módulo de FACS usa
   *   la misma clase sobre sus propios canales de Unidades de Acción: la
   *   estadística robusta es la misma y no tiene sentido duplicarla.
   */
  constructor(canales = CARACTERISTICAS) {
    this.canales = canales;
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
   * Congela la línea base con estimadores ROBUSTOS: mediana y desviación
   * absoluta mediana (MAD).
   *
   * POR QUÉ NO MEDIA Y DESVIACIÓN ESTÁNDAR
   * La calibración se hace con una persona frente a la cámara, y basta con que
   * durante esos segundos sonría o hable unas cuantas veces para que la
   * desviación estándar se dispare. Medido sobre una sesión real: la sigma de
   * la sonrisa salió 0,1966 cuando el reposo verdadero daba 0,0200. Con esa
   * referencia inflada, una sonrisa franca puntuaba −0,21 σ y se clasificaba
   * como neutro; con la estimación robusta, la misma sonrisa da +5,52 σ.
   *
   * La MAD tolera hasta un 50 % de muestras contaminadas antes de desplazarse,
   * frente al 0 % de la desviación estándar: un solo fotograma extremo ya
   * arrastra la media y la sigma. Se multiplica por 1,4826, la constante que
   * la vuelve un estimador consistente de sigma para datos normales.
   *
   * Se conservan además media y desviación estándar clásicas, no para
   * clasificar sino para poder documentar en el informe cuánto se apartaron de
   * los estimadores robustos, que es una medida directa de cuán quieto estuvo
   * el rostro durante la calibración.
   */
  cerrar() {
    const n = this.muestras.length;
    if (n < 2) throw new Error("La línea base necesita al menos dos muestras");

    const mediana = (xs) => {
      const o = [...xs].sort((a, b) => a - b);
      const m = o.length >> 1;
      return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
    };

    this.media = {};
    this.sigma = {};
    this.mediaClasica = {};
    this.sigmaClasica = {};

    for (const c of this.canales) {
      const vals = this.muestras.map((m) => m[c]);

      const med = mediana(vals);
      const mad = mediana(vals.map((v) => Math.abs(v - med)));
      this.media[c] = med;
      this.sigma[c] = Math.max(mad * 1.4826, SIGMA_MINIMA);

      const mu = vals.reduce((a, b) => a + b, 0) / n;
      const varianza = vals.reduce((a, v) => a + (v - mu) ** 2, 0) / (n - 1);
      this.mediaClasica[c] = mu;
      this.sigmaClasica[c] = Math.sqrt(varianza);
    }

    return {
      media: this.media,
      sigma: this.sigma,
      mediaClasica: this.mediaClasica,
      sigmaClasica: this.sigmaClasica,
      muestras: n,
      quietud: this.quietud,
    };
  }

  /**
   * Cuán quieto estuvo el rostro durante la calibración, en [0, 1].
   *
   * Es el cociente entre la dispersión robusta y la clásica, promediado. Cerca
   * de 1 indica que ambas coinciden y por tanto no hubo expresiones que
   * contaminaran el reposo. Muy por debajo, la persona se movió y conviene
   * repetir la calibración.
   */
  get quietud() {
    if (!this.sigma || !this.sigmaClasica) return null;
    const razones = this.canales.map((c) => {
      const clas = Math.max(this.sigmaClasica[c], 1e-6);
      return Math.min(1, this.sigma[c] / clas);
    });
    return razones.reduce((a, b) => a + b, 0) / razones.length;
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
      for (const c of this.canales) out[c] = 0;
      return out;
    }
    for (const c of this.canales) {
      out[c] = (caracteristicas[c] - this.media[c]) / this.sigma[c];
    }
    return out;
  }

  /** Estado serializable, para guardarlo con la sesión y poder reanalizarla. */
  instantanea() {
    return this.media
      ? {
          media: this.media,
          sigma: this.sigma,
          mediaClasica: this.mediaClasica,
          sigmaClasica: this.sigmaClasica,
          muestras: this.muestras.length,
          quietud: this.quietud,
        }
      : null;
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

/**
 * Frontalidad geometrica: comparacion de las dos mitades del rostro.
 *
 * SE CONSERVA COMO RESPALDO, PERO TIENE UN DEFECTO SERIO
 * Mide la asimetria de la nariz respecto de los bordes del rostro EN EL PLANO DE
 * LA IMAGEN, de modo que no distingue una cabeza girada de una cara colocada
 * fuera del centro del encuadre. La camara frontal de un telefono tiene un
 * angulo de vision amplio, y una cara descentrada muestra una perspectiva muy
 * asimetrica aunque este mirando de frente.
 *
 * Se vio en un telefono: rostro detectado, mirando a la pantalla, y esta medida
 * daba 21 %. Como el minimo para aceptar una muestra es 30 %, la calibracion
 * rechazaba casi todos los fotogramas y se quedaba clavada en una sola muestra.
 */
export function frontalidadGeometrica(landmarks) {
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

/**
 * Frontalidad a partir de la matriz de transformacion facial.
 *
 * MediaPipe ya entrega la orientacion de la cabeza en el espacio y el detector
 * ya la pedia; simplemente no se estaba usando. Es una medida de ORIENTACION, no
 * de posicion, asi que no la afecta que la cara este descentrada ni la
 * perspectiva de un objetivo angular.
 *
 * COMO SE EVITA EL PROBLEMA DE LAS CONVENCIONES DE EJES
 * La razon por la que antes se prefirio la geometria era no depender de como
 * ordene el modelo sus ejes. Eso se resuelve sin tener que saberlo: la tercera
 * columna de la submatriz de rotacion es el eje que sale de la cara, y su
 * componente en profundidad, normalizada, es el coseno del angulo entre ese eje
 * y el de la camara. Vale 1 mirando de frente y 0 de perfil, y no hace falta
 * decidir cual angulo es guinada y cual cabeceo.
 *
 * La matriz llega en orden por columnas, de 16 elementos.
 */
export function frontalidadPorMatriz(matrix) {
  if (!matrix || matrix.length < 11) return null;
  const x = matrix[8], y = matrix[9], z = matrix[10];
  const norma = Math.hypot(x, y, z);
  if (norma < 1e-6) return null;
  return Math.min(1, Math.abs(z) / norma);
}

/**
 * Frontalidad del rostro, en [0, 1].
 *
 * Usa la matriz cuando esta disponible y cae en la geometria si no lo esta.
 */
export function frontalidad(landmarks, matrix = null) {
  const porMatriz = frontalidadPorMatriz(matrix);
  return porMatriz !== null ? porMatriz : frontalidadGeometrica(landmarks);
}
