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
export const diagnostico = { delegado: null, ultimoError: null, detecciones: 0, llamadas: 0 };

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

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
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
