/**
 * Segunda opinión — clasificador preentrenado independiente.
 *
 * POR QUÉ EXISTE
 * El clasificador principal deriva el estado de la geometría facial: blendshapes
 * de MediaPipe, normalizados contra la línea base y separados por umbrales. Ese
 * camino es interpretable, pero sus umbrales los fijó una persona y no hay forma
 * de saber, desde dentro, cuándo se equivoca.
 *
 * Este módulo agrega un segundo modelo preentrenado que llega al mismo juicio
 * por un camino completamente distinto: una red convolucional que opera sobre
 * los píxeles del rostro recortado, entrenada por terceros sobre un conjunto de
 * expresiones faciales. No se entrena nada acá: se descargan pesos ya ajustados.
 *
 * Cuando ambos coinciden, la clasificación es más creíble. Cuando discrepan, se
 * marca el fotograma como incierto en lugar de elegir uno de los dos. El
 * porcentaje de acuerdo entre modelos es, además, una medida de fiabilidad
 * reportable en la evaluación.
 *
 * ADVERTENCIA
 * El modelo devuelve etiquetas emocionales, porque así fue entrenado. Aquí se
 * colapsan a las categorías observables del proyecto. Esa etiqueta NO se toma
 * como verdad sobre lo que la persona siente: se usa únicamente como voto
 * independiente sobre la configuración del rostro. Además fue entrenado con
 * rostros adultos, por lo que su desempeño con un participante infantil es
 * desconocido — razón de más para usarlo como contraste y no como autoridad.
 */

const CDN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api";
const MODELOS = CDN + "/model";
const LADO = 112; // lado del recorte que se entrega al clasificador

let faceapi = null;
let listo = false;

export const estado = { disponible: false, motivo: null, evaluaciones: 0 };

/* Lienzo reutilizado para el recorte, para no crear uno por fotograma. */
const lienzo = document.createElement("canvas");
lienzo.width = LADO;
lienzo.height = LADO;
const ctx = lienzo.getContext("2d", { willReadFrequently: true });

/** Carga la biblioteca y los pesos. El fallo no es fatal: se sigue sin ella. */
export async function init() {
  try {
    faceapi = await import(CDN + "/dist/face-api.esm.js");
    await faceapi.nets.faceExpressionNet.loadFromUri(MODELOS);
    listo = true;

    // Calentamiento. La primera inferencia dispara la compilacion de kernels de
    // TensorFlow.js y tarda varios segundos; medido, ~10 s contra ~19 ms en
    // estado estable. Se gasta ese costo ahora, en segundo plano, y no en la
    // primera seleccion de la sesion.
    await faceapi.nets.faceExpressionNet.predictExpressions(lienzo);
    estado.evaluaciones = 0;

    estado.disponible = true;
  } catch (e) {
    estado.motivo = e.message;
    estado.disponible = false;
  }
  return estado.disponible;
}

/** Recorta el rostro del video usando la caja que encierra los landmarks. */
function recortar(video, landmarks) {
  let xMin = 1, yMin = 1, xMax = 0, yMax = 0;
  for (const p of landmarks) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const w = video.videoWidth;
  const h = video.videoHeight;

  // Margen: los clasificadores de expresión esperan algo de contexto alrededor.
  const margen = 0.12;
  const sx = Math.max(0, (xMin - margen * (xMax - xMin)) * w);
  const sy = Math.max(0, (yMin - margen * (yMax - yMin)) * h);
  const sw = Math.min(w - sx, (xMax - xMin) * (1 + 2 * margen) * w);
  const sh = Math.min(h - sy, (yMax - yMin) * (1 + 2 * margen) * h);
  if (sw < 8 || sh < 8) return null;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, LADO, LADO);
  return lienzo;
}

/* Las siete etiquetas del modelo se colapsan a las tres categorías del
   proyecto. «surprised» queda fuera a propósito: la sorpresa no tiene signo
   estable y forzarla a positivo o negativo introduciria un sesgo arbitrario. */
const MAPA = {
  happy: "positivo",
  neutral: "neutro",
  sad: "negativo",
  angry: "negativo",
  fearful: "negativo",
  disgusted: "negativo",
};

/**
 * Devuelve la opinión del segundo modelo, o `null` si no está disponible, el
 * recorte falla o la etiqueta ganadora no tiene mapeo.
 */
export async function opinar(video, landmarks) {
  if (!listo) return null;
  const recorte = recortar(video, landmarks);
  if (!recorte) return null;

  try {
    const p = await faceapi.nets.faceExpressionNet.predictExpressions(recorte);
    estado.evaluaciones++;

    const entradas = Object.entries(p).filter(([k]) => k in MAPA);
    if (!entradas.length) return null;
    const [etiqueta, prob] = entradas.sort((a, b) => b[1] - a[1])[0];

    return { categoria: MAPA[etiqueta], etiquetaModelo: etiqueta, probabilidad: prob };
  } catch (e) {
    estado.motivo = e.message;
    return null;
  }
}

/** Colapsa los cuatro estados del clasificador principal a tres categorías. */
export function colapsar(estadoPrincipal) {
  if (estadoPrincipal === "positivo") return "positivo";
  if (estadoPrincipal === "neutro") return "neutro";
  return "negativo";
}

/**
 * Acuerdo entre clasificadores, con kappa de Cohen.
 *
 * POR QUÉ NO ALCANZA EL PORCENTAJE CRUDO
 * Si ambos clasificadores dicen «neutro» el 80 % del tiempo, coincidirán en un
 * 64 % de los fotogramas por puro azar, sin que eso indique concordancia real.
 * Reportar ese 64 % como fiabilidad sería engañoso.
 *
 * El kappa de Cohen descuenta el acuerdo esperado por azar a partir de las
 * distribuciones marginales de cada clasificador:
 *
 *     kappa = (Po − Pe) / (1 − Pe)
 *
 * donde Po es la proporción observada de coincidencias y Pe la esperada si
 * ambos etiquetaran de forma independiente conservando sus frecuencias. Vale 1
 * con acuerdo perfecto, 0 cuando el acuerdo es el que daría el azar, y negativo
 * cuando es peor que el azar.
 *
 * Se acumula la matriz de confusión completa porque, además del escalar,
 * permite ver DÓNDE discrepan: un desacuerdo concentrado entre «neutro» y
 * «negativo» dice algo muy distinto que uno repartido al azar.
 */
export const CATEGORIAS_ACUERDO = ["positivo", "neutro", "negativo"];

export class Acuerdo {
  constructor() {
    this.matriz = Object.fromEntries(
      CATEGORIAS_ACUERDO.map((a) => [a, Object.fromEntries(CATEGORIAS_ACUERDO.map((b) => [b, 0]))])
    );
    this.comparaciones = 0;
    this.coincidencias = 0;
  }

  registrar(principal, segunda) {
    if (!principal || !segunda) return null;
    const a = colapsar(principal);
    if (!CATEGORIAS_ACUERDO.includes(a) || !CATEGORIAS_ACUERDO.includes(segunda)) return null;

    this.matriz[a][segunda]++;
    this.comparaciones++;
    const coincide = a === segunda;
    if (coincide) this.coincidencias++;
    return coincide;
  }

  /** Proporción observada de coincidencias (Po). */
  get proporcion() {
    return this.comparaciones ? this.coincidencias / this.comparaciones : null;
  }

  /** Kappa de Cohen. Devuelve null si aún no hay comparaciones. */
  get kappa() {
    const n = this.comparaciones;
    if (!n) return null;

    const po = this.coincidencias / n;

    let pe = 0;
    for (const c of CATEGORIAS_ACUERDO) {
      const filaA = CATEGORIAS_ACUERDO.reduce((s, b) => s + this.matriz[c][b], 0);
      const colB = CATEGORIAS_ACUERDO.reduce((s, a) => s + this.matriz[a][c], 0);
      pe += (filaA / n) * (colB / n);
    }

    // Acuerdo esperado perfecto: kappa queda indefinido. Ocurre cuando ambos
    // clasificadores usaron una sola categoría durante toda la sesión.
    if (pe >= 1) return null;
    return (po - pe) / (1 - pe);
  }

  /** Lectura convencional del kappa, para el panel del cuidador. */
  get interpretacion() {
    const k = this.kappa;
    if (k === null) return "sin datos";
    if (k < 0) return "peor que el azar";
    if (k < 0.2) return "muy bajo";
    if (k < 0.4) return "bajo";
    if (k < 0.6) return "moderado";
    if (k < 0.8) return "sustancial";
    return "casi perfecto";
  }

  instantanea() {
    return {
      comparaciones: this.comparaciones,
      proporcion: this.proporcion,
      kappa: this.kappa,
      matriz: this.matriz,
    };
  }
}
