/**
 * Módulo A — Captura y detección facial.
 *
 * Envuelve MediaPipe Face Landmarker. Entrega, por fotograma, los puntos de
 * referencia 3D y los blendshapes, o `null` cuando no se detecta rostro.
 *
 * El modelo y el runtime de WebAssembly se descargan la primera vez y quedan
 * en la caché del navegador.
 */

import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarker = null;
let lastVideoTime = -1;

/** Diagnóstico del último intento de detección, para mostrarlo en la interfaz. */
export const diagnostico = {
  delegado: null,
  ultimoError: null,
  detecciones: 0,
  llamadas: 0,
  /* Qué fuente de marca de tiempo se consiguió. Condiciona la exactitud de toda
     medida de duración, así que se reporta en el panel y en el informe. */
  reloj: null,
  /* Con que juego de restricciones se consiguio abrir la camara. Si hubo que
     bajar escalones, la cadencia obtenida sera menor y eso condiciona la
     resolucion temporal de toda la sesion. */
  restriccion: null,
};

/**
 * Restricciones de camara, de la mas exigente a la mas permisiva.
 *
 * POR QUE UNA CADENA Y NO UNA SOLA PETICION
 * `min` es una restriccion DURA, tan estricta como `exact`: si el dispositivo no
 * puede garantizarla, `getUserMedia` rechaza con OverconstrainedError y la
 * aplicacion se queda sin camara. La version anterior pedia
 * `frameRate: { ideal: 60, min: 24 }` con la intencion de negociar, pero el
 * `min` convertia la peticion en un requisito. Observado en dispositivos
 * reales: un Galaxy S23 lo aceptaba y un S25 no, con lo que en el segundo la
 * camara no abria nunca.
 *
 * Aqui no queda ninguna restriccion dura. Se pide lo deseable y, si el
 * dispositivo no lo entrega, se baja un escalon. La cadencia se mide despues
 * sobre los fotogramas que realmente llegan, que es como debe determinarse.
 */
const RESTRICCIONES = [
  { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } },
  { facingMode: "user", frameRate: { ideal: 60 } },
  { facingMode: "user" },
  true,
];

/* Aflojar restricciones no arregla un permiso denegado ni una camara ausente. */
const SIN_REINTENTO = new Set(["NotAllowedError", "SecurityError", "NotFoundError"]);

const MENSAJE = {
  NotAllowedError: "Se denegó el permiso de cámara. Habilitarlo en los ajustes del sitio y recargar.",
  NotFoundError: "El dispositivo no reporta ninguna cámara frontal.",
  NotReadableError: "Otra aplicación está usando la cámara. Cerrarla y volver a intentar.",
  OverconstrainedError: "Ninguna configuración de cámara resultó admisible en este dispositivo.",
  SecurityError: "La cámara exige una conexión segura (HTTPS o localhost).",
};

async function pedirCamara() {
  let ultimo = null;
  for (const video of RESTRICCIONES) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      diagnostico.restriccion = video === true ? "sin restricciones" : JSON.stringify(video);
      return s;
    } catch (e) {
      ultimo = e;
      diagnostico.ultimoError = e.name;
      if (SIN_REINTENTO.has(e.name)) break;
    }
  }
  const e = new Error(
    MENSAJE[ultimo?.name] ?? `No se pudo abrir la cámara (${ultimo?.name ?? "error desconocido"}).`
  );
  e.cause = ultimo;
  throw e;
}

/** Hay al menos una pista de video viva. */
export function camaraViva(video) {
  const s = video.srcObject;
  return !!s && s.getVideoTracks().some((t) => t.readyState === "live");
}

/**
 * Suelta la camara.
 *
 * Android la reclama cuando la aplicacion pasa a segundo plano, y las pistas
 * quedan en `ended` sin que nadie lo anuncie. Antes de volver a pedirla hay que
 * devolver la anterior o el sistema puede negarla por estar todavia tomada.
 */
export function cerrarCamara(video) {
  const s = video.srcObject;
  if (!s) return;
  for (const t of s.getTracks()) t.stop();
  video.srcObject = null;
}

/**
 * Inicializa el detector.
 *
 * Intenta primero con aceleración por GPU y, si el dispositivo no la soporta,
 * reintenta en CPU. En tablets de gama media el delegado de GPU falla con
 * cierta frecuencia y sin reintento la aplicación quedaría inutilizable.
 */
export async function init(onEstado = () => {}) {
  onEstado("Descargando el runtime de visión…");
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

  const opciones = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  onEstado("Cargando el modelo facial…");
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, opciones("GPU"));
    diagnostico.delegado = "GPU";
  } catch (e) {
    onEstado("La GPU no está disponible, reintentando en CPU…");
    landmarker = await FaceLandmarker.createFromOptions(fileset, opciones("CPU"));
    diagnostico.delegado = "CPU";
  }
  return landmarker;
}

/**
 * Programa el siguiente fotograma y entrega su MARCA DE TIEMPO DE CAPTURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ALCANZA CON requestAnimationFrame
 *
 * `requestAnimationFrame` avisa cuando el navegador va a pintar, no cuando la
 * cámara capturó. Sellar los datos con `performance.now()` dentro de ese callback
 * mide el instante en que JavaScript llegó a atender el fotograma, que incluye
 * todo lo que se haya interpuesto: recolección de basura, la inferencia del
 * fotograma anterior, el repintado del panel.
 *
 * Para la vía tónica da igual, porque promedia sobre segundos. Para la fásica no:
 * ahí se están midiendo duraciones de entre 40 y 200 ms, y un jitter de 15 ms en
 * el sellado es un error del 10 % sobre lo que se quiere medir. La banda de
 * Ekman se decide con esas cifras.
 *
 * `requestVideoFrameCallback` entrega, en sus metadatos, `captureTime`: el
 * instante en que la cámara capturó el fotograma, disponible justamente para
 * fuentes locales como getUserMedia, que es este caso.
 *
 * MISMA LÍNEA DE TIEMPO, A PROPÓSITO
 * `captureTime` y `presentationTime` son DOMHighResTimeStamp, el mismo reloj de
 * `performance.now()`. Por eso se pueden mezclar con el resto del código sin
 * convertir nada. NO se usa `mediaTime`, que sería la elección intuitiva, porque
 * corre en la línea de tiempo del medio: mezclarla con los sellos de la ventana
 * temporal o del acumulador de la línea base daría diferencias sin sentido.
 *
 * Se degrada en tres escalones, del mejor dato al peor, y se deja constancia de
 * cuál se consiguió: la exactitud de la medición depende de eso y el informe
 * tiene que poder declararla.
 */
export function programarFotograma(video, fn) {
  if (typeof video.requestVideoFrameCallback === "function") {
    video.requestVideoFrameCallback((ahora, meta) => {
      if (meta?.captureTime != null) {
        diagnostico.reloj = "captureTime";
        fn(meta.captureTime);
      } else if (meta?.presentationTime != null) {
        diagnostico.reloj = "presentationTime";
        fn(meta.presentationTime);
      } else {
        diagnostico.reloj = "rVFC sin metadatos";
        fn(ahora);
      }
    });
    return;
  }
  /* Safari antiguo y algunos WebView no lo implementan. El sistema sigue
     funcionando con menos exactitud temporal, y el diagnóstico lo dice. */
  diagnostico.reloj = "requestAnimationFrame";
  requestAnimationFrame(() => fn(performance.now()));
}

/**
 * Procesa un fotograma del elemento <video>.
 *
 * DISTINGUE DOS AUSENCIAS QUE NO SON LO MISMO:
 *
 *   `undefined` — no hay fotograma nuevo que procesar. Ocurre porque
 *                 requestAnimationFrame corre a ~60 Hz y la cámara entrega
 *                 ~30 fps: la mitad de las llamadas reciben el mismo fotograma.
 *                 NO es un fallo de detección y el llamador debe ignorarlo.
 *
 *   `null`      — había fotograma nuevo y no se detectó rostro. Eso sí es un
 *                 dato faltante y se registra como tal (RF-11).
 *
 * Confundirlas hunde la tasa de detección a la mitad de su valor real y hace
 * que selecciones perfectamente válidas se descarten por falta de datos.
 */
export function detect(video, timestampMs) {
  if (!landmarker) throw new Error("face.init() no fue llamado");

  // Sin dimensiones el detector lanza excepción; se espera a que haya metadata.
  if (!video.videoWidth || !video.videoHeight) return undefined;
  if (video.readyState < 2) return undefined;
  if (video.currentTime === lastVideoTime) return undefined; // fotograma repetido
  lastVideoTime = video.currentTime;

  diagnostico.llamadas++;
  let res;
  try {
    res = landmarker.detectForVideo(video, timestampMs);
  } catch (e) {
    diagnostico.ultimoError = e.message;
    return null;
  }

  if (!res.faceLandmarks?.length) return null;
  diagnostico.detecciones++;

  // Los blendshapes llegan como lista de categorías; se pasan a mapa por nombre.
  const blendshapes = {};
  for (const c of res.faceBlendshapes?.[0]?.categories ?? []) {
    blendshapes[c.categoryName] = c.score;
  }

  return {
    landmarks: res.faceLandmarks[0],
    blendshapes,
    matrix: res.facialTransformationMatrixes?.[0]?.data ?? null,
  };
}

/**
 * Solicita la cámara frontal y espera a que el video tenga dimensiones reales.
 *
 * No basta con que `play()` resuelva: hasta que no llega `loadedmetadata` el
 * elemento reporta 0×0 y el detector no puede procesarlo.
 */
export async function openCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Este navegador no expone la cámara. Requiere una conexión segura (HTTPS o localhost)."
    );
  }

  /**
   * SE PIDEN 60 fps, NO 30.
   *
   * La frecuencia de muestreo es el unico parametro que fija cual es el evento
   * mas breve que el sistema puede describir, y no se compensa despues con
   * ningun umbral: lo que no se muestreo no esta en los datos.
   *
   * A 30 fps cada fotograma son 33 ms y hacen falta tres para tener subida,
   * apice y bajada: el piso queda en ~100 ms. Como la microexpresion, segun
   * Ekman, va de 40 a 200 ms, a 30 fps queda ciego el 38 % de esa banda. A
   * 60 fps el piso baja a ~50 ms y la ceguera cae al 7 %.
   *
   * Medido sobre 40 realizaciones independientes de ruido en
   * `pruebas/deteccion-fasica.mjs`, con un transitorio de 130 ms y 3 sigma:
   *
   *     60 fps → detectado en el 100 % de las corridas, error de duracion 23 ms
   *     30 fps → detectado en el   0 % de las corridas
   *
   * El resultado a 30 fps no es «se mide peor». Es que la anchura medida no
   * alcanza el minimo resoluble y el evento se rechaza entero, sin dejar rastro
   * en el registro. Para la banda estricta de Ekman, 60 fps no es una mejora
   * deseable: es la condicion para que la medicion exista.
   *
   * Se pide como `ideal` y no como `exact` a proposito. Si la tablet no da 60,
   * negocia la que pueda y la aplicacion sigue funcionando; el detector mide la
   * cadencia real y reporta la resolucion que efectivamente consiguio, en lugar
   * de suponer la que se pidio. La resolucion no se declara: se mide.
   */
  const stream = await pedirCamara();
  video.srcObject = stream;

  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      const listo = () => { limpiar(); resolve(); };
      const fallo = () => { limpiar(); reject(new Error("El video de la cámara no cargó.")); };
      const limpiar = () => {
        video.removeEventListener("loadedmetadata", listo);
        video.removeEventListener("error", fallo);
        clearTimeout(temporizador);
      };
      const temporizador = setTimeout(fallo, 10000);
      video.addEventListener("loadedmetadata", listo);
      video.addEventListener("error", fallo);
    });
  }

  await video.play();

  // Algunos dispositivos reportan 0×0 durante los primeros fotogramas.
  for (let i = 0; i < 40 && !video.videoWidth; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!video.videoWidth) throw new Error("La cámara no entregó imagen.");

  return { stream, ancho: video.videoWidth, alto: video.videoHeight };
}
