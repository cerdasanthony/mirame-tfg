/**
 * Persistencia local en IndexedDB.
 *
 * No se guarda video ni imágenes: únicamente las medidas derivadas y los
 * registros de sesión. El video nunca sale del dispositivo ni queda almacenado.
 */

const DB_NOMBRE = "mirame";
const DB_VERSION = 2;
let db = null;

export async function abrir() {
  if (db) return db;
  db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("sesiones")) {
        d.createObjectStore("sesiones", { keyPath: "id", autoIncrement: true });
      }
      if (!d.objectStoreNames.contains("muestras")) {
        const m = d.createObjectStore("muestras", { keyPath: "id", autoIncrement: true });
        m.createIndex("porSesion", "sesionId");
      }
      if (!d.objectStoreNames.contains("selecciones")) {
        const s = d.createObjectStore("selecciones", { keyPath: "id", autoIncrement: true });
        s.createIndex("porSesion", "sesionId");
        s.createIndex("porPictograma", "pictograma");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

function tx(store, modo) {
  return db.transaction(store, modo).objectStore(store);
}

const promesa = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

export async function crearSesion(lineaBase) {
  await abrir();
  return promesa(
    tx("sesiones", "readwrite").add({ inicio: Date.now(), fin: null, lineaBase })
  );
}

export async function cerrarSesion(id, metricas) {
  await abrir();
  const store = tx("sesiones", "readwrite");
  const s = await promesa(store.get(id));
  if (!s) return;
  return promesa(store.put({ ...s, fin: Date.now(), metricas }));
}

/** Registra una selección con la distribución de estados que la precedió. */
export async function guardarSeleccion(registro) {
  await abrir();
  return promesa(tx("selecciones", "readwrite").add({ ts: Date.now(), ...registro }));
}

/**
 * Guarda el vector de características CRUDO de un fotograma (RF-31).
 *
 * Sin esto, ajustar un umbral obliga a volver a grabar sesiones con el
 * participante, lo que es inviable. Conservando las medidas previas a la
 * normalización se puede reclasificar una sesión ya registrada con otros
 * parámetros, cuantas veces haga falta, sin repetir nada.
 *
 * Metodológicamente separa la recolección del análisis, que es lo correcto: los
 * umbrales se calibran sobre datos reales sin contaminar la toma de datos.
 *
 * Se registra a frecuencia reducida a propósito; guardar treinta vectores por
 * segundo llenaría el almacenamiento sin aportar información adicional.
 */
export async function guardarMuestra(m) {
  await abrir();
  return promesa(tx("muestras", "readwrite").add(m));
}

export async function muestrasDeSesion(sesionId) {
  await abrir();
  const idx = tx("muestras", "readonly").index("porSesion");
  return promesa(idx.getAll(sesionId));
}

export async function todasLasMuestras() {
  await abrir();
  return promesa(tx("muestras", "readonly").getAll());
}

export async function todasLasSelecciones() {
  await abrir();
  return promesa(tx("selecciones", "readonly").getAll());
}

/**
 * Índice de asociación pictograma–estado facial (RF-26).
 *
 * Acumula, por pictograma, cuántas veces lo precedió cada estado observable.
 * Es un recuento descriptivo: no afirma relación causal ni significado.
 */
export async function indiceAsociacion() {
  const sel = await todasLasSelecciones();
  const idx = {};
  for (const s of sel) {
    if (!s.predominante) continue; // datos insuficientes
    idx[s.pictograma] ??= { total: 0, estados: {}, puntajeSuma: 0 };
    const e = idx[s.pictograma];
    e.total++;
    e.estados[s.predominante] = (e.estados[s.predominante] ?? 0) + 1;
    e.puntajeSuma += s.puntajePromedio ?? 0;
  }
  for (const k of Object.keys(idx)) {
    idx[k].puntajePromedio = idx[k].puntajeSuma / idx[k].total;
    idx[k].predominante = Object.entries(idx[k].estados).sort((a, b) => b[1] - a[1])[0][0];
  }
  return idx;
}

/** Exporta todo el registro como JSON descargable (RF-24). */
export async function exportarJSON() {
  await abrir();
  const sesiones = await promesa(tx("sesiones", "readonly").getAll());
  const selecciones = await todasLasSelecciones();
  const muestras = await todasLasMuestras();
  return JSON.stringify(
    { exportado: new Date().toISOString(), sesiones, selecciones, muestras },
    null,
    2
  );
}

/** Borra de forma definitiva todo lo almacenado (RF-25). */
export async function borrarTodo() {
  await abrir();
  await promesa(tx("sesiones", "readwrite").clear());
  await promesa(tx("selecciones", "readwrite").clear());
  await promesa(tx("muestras", "readwrite").clear());
}
