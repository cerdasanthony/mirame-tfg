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

/** Inicializa el detector. Debe llamarse una sola vez, antes de `detect`. */
export async function init() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  return landmarker;
}

/**
 * Procesa un fotograma del elemento <video>.
 *
 * Devuelve `null` si el fotograma se repite o si no hay rostro. La ausencia de
 * rostro es un estado normal de operación, no un error: el llamador la registra
 * como dato faltante (RF-11) y continúa.
 */
export function detect(video, timestampMs) {
  if (!landmarker) throw new Error("face.init() no fue llamado");
  if (video.currentTime === lastVideoTime) return null;
  lastVideoTime = video.currentTime;

  const res = landmarker.detectForVideo(video, timestampMs);
  if (!res.faceLandmarks?.length) return null;

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

/** Solicita la cámara frontal y devuelve el stream. */
export async function openCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}
