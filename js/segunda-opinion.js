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

/* Ultimo recorte: si se pudo alinear y cuantos grados se corrigieron. La
   proporcion de fotogramas alineados es un dato de calidad y se reporta. */
let ultimaAlineacion = { alineado: false, gradosCorregidos: null, interocular: null };
export const alineacion = () => ultimaAlineacion;

/**
 * DESACTIVADA POR DEFECTO.
 *
 * El segundo clasificador corre sobre TensorFlow.js, que compite con MediaPipe
 * por el contexto WebGL, y cada consulta exige copiar el fotograma del video a
 * un lienzo. En dispositivos de gama media eso degrada la detección facial del
 * clasificador principal —observado en pruebas: el telefono dejaba de detectar
 * rostro con la segunda opinion activa y volvia a funcionar sin ella—.
 *
 * Es instrumentación de investigación, no funcion esencial: sirve para medir el
 * acuerdo entre clasificadores durante sesiones de calibración, no para el uso
 * cotidiano del comunicador. Se enciende desde el panel cuando hace falta.
 */
const CLAVE_HABILITADA = "mirame.segundaOpinion";
export const habilitada = () => localStorage.getItem(CLAVE_HABILITADA) === "1";
export const habilitar = (v) => localStorage.setItem(CLAVE_HABILITADA, v ? "1" : "0");

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
/* Comisuras externa e interna de cada ojo en la malla de MediaPipe. El centro
   del ojo se toma como el punto medio entre ambas: es mas estable que un solo
   punto y no exige activar los puntos de iris, que encarecen la deteccion. */
const OJO_IZQ = [33, 133];
const OJO_DER = [362, 263];

const centroOjo = (landmarks, idx) => {
  const a = landmarks[idx[0]], b = landmarks[idx[1]];
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

/**
 * Recorta el rostro y lo ALINEA por el eje de los ojos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ALINEAR
 *
 * Los clasificadores de expresion se entrenan sobre corpus de rostros alineados:
 * la linea que une los ojos queda horizontal y el rostro ocupa una porcion
 * estable del recorte. Entregarles la cara tal como sale de la camara, inclinada
 * unos grados porque la persona ladea la cabeza, es presentarle al modelo una
 * configuracion que no vio durante el entrenamiento, y la clasificacion se
 * degrada sin que nada avise.
 *
 * Con un participante infantil el problema es mayor, no menor: la cabeza rara
 * vez esta recta frente a una tablet.
 *
 * Esto es tambien la unica forma en que las dos vias se ayudan de verdad en
 * lugar de competir. MediaPipe ya calculo donde estan los ojos, asi que la
 * correccion sale gratis: se usa la salida de un modelo para mejorar la entrada
 * del otro. Hasta ahora el recorte solo usaba la caja envolvente y desperdiciaba
 * esa informacion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO
 *
 * Se calcula el angulo del segmento que une los centros de ambos ojos y se
 * dibuja el fotograma rotado ese angulo en sentido contrario, con el centro del
 * rostro en el centro del lienzo. El tamano del recorte se deriva de la
 * DISTANCIA INTEROCULAR y no de la caja envolvente: la caja crece y encoge segun
 * el participante abra la boca o levante las cejas, mientras que la separacion
 * entre los ojos es rigida y da una escala estable entre fotogramas.
 *
 * Si por la pose no se pueden ubicar ambos ojos, se vuelve al recorte por caja
 * envolvente sin alinear, que es peor pero sigue siendo utilizable.
 *
 * Se exporta para poder comprobar la geometria sin cargar el modelo: la
 * transformacion es la parte con riesgo y conviene tener como verificarla.
 */
export function recortar(video, landmarks) {
  const w = video.videoWidth;
  const h = video.videoHeight;

  const izq = centroOjo(landmarks, OJO_IZQ);
  const der = centroOjo(landmarks, OJO_DER);

  if (izq && der) {
    const ix = izq.x * w, iy = izq.y * h;
    const dx = der.x * w, dy = der.y * h;
    const interocular = Math.hypot(dx - ix, dy - iy);

    if (interocular >= 8) {
      const angulo = Math.atan2(dy - iy, dx - ix);
      /* 2,9 veces la distancia interocular encuadra frente, ojos, nariz y boca
         con algo de margen, que es el encuadre habitual de los corpus de
         expresion facial. El centro se baja un poco respecto del eje de los
         ojos para que la boca no quede pegada al borde inferior. */
      const lado = interocular * 2.9;
      const cx = (ix + dx) / 2;
      const cy = (iy + dy) / 2 + interocular * 0.35;

      ctx.save();
      ctx.translate(LADO / 2, LADO / 2);
      ctx.rotate(-angulo);
      ctx.scale(LADO / lado, LADO / lado);
      ctx.translate(-cx, -cy);
      /* Fuera del fotograma no hay imagen; el negro de fondo es preferible a
         que el borde arrastre el ultimo pixel repetido. */
      ctx.fillStyle = "#000";
      ctx.fillRect(cx - lado, cy - lado, lado * 2, lado * 2);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      ultimaAlineacion = { alineado: true, gradosCorregidos: (angulo * 180) / Math.PI, interocular };
      return lienzo;
    }
  }

  /* Respaldo: caja envolvente, sin alinear. */
  let xMin = 1, yMin = 1, xMax = 0, yMax = 0;
  for (const p of landmarks) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const margen = 0.12;
  const sx = Math.max(0, (xMin - margen * (xMax - xMin)) * w);
  const sy = Math.max(0, (yMin - margen * (yMax - yMin)) * h);
  const sw = Math.min(w - sx, (xMax - xMin) * (1 + 2 * margen) * w);
  const sh = Math.min(h - sy, (yMax - yMin) * (1 + 2 * margen) * h);
  if (sw < 8 || sh < 8) return null;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, LADO, LADO);
  ultimaAlineacion = { alineado: false, gradosCorregidos: null, interocular: null };
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
