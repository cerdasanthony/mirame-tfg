/**
 * Persistencia local en IndexedDB.
 *
 * No se guarda video ni imágenes: únicamente las medidas derivadas y los
 * registros de sesión. El video nunca sale del dispositivo ni queda almacenado.
 */

import { ATRIBUCION } from "./pictogramas.js";

const DB_NOMBRE = "mirame";
const DB_VERSION = 3;
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
        /* El indice por sesion se conserva aunque ninguna funcion de este modulo
           lo consulte hoy. El reanalisis de una sesion concreta se hace fuera del
           navegador, sobre el JSON exportado, con los scripts de `pruebas/`. Un
           indice cuesta poco y quitarlo obligaria a migrar el esquema. */
        m.createIndex("porSesion", "sesionId");
      }
      // Eventos fásicos: transitorios breves detectados canal por canal.
      // Van en su propio almacén y no dentro de `muestras` porque no son un
      // muestreo periódico sino sucesos con inicio, ápice y final propios.
      if (!d.objectStoreNames.contains("eventos")) {
        const e = d.createObjectStore("eventos", { keyPath: "id", autoIncrement: true });
        e.createIndex("porSesion", "sesionId");
        e.createIndex("porCanal", "canal");
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

/**
 * Identificacion del equipo en que corre la sesion.
 *
 * POR QUE HACE FALTA
 * Las metricas de instrumento —cadencia, resolucion temporal, tasa de deteccion,
 * que unidades de accion tienen recorrido— describen a un EQUIPO concreto, no al
 * sistema en abstracto. Sin registrar cual, las sesiones de la maquina de
 * desarrollo y las de la tablet del estudio quedan indistinguibles en el mismo
 * archivo y cualquier promedio las mezcla.
 *
 * Ocurrio: se analizaron treinta y cuatro sesiones como si caracterizaran el
 * dispositivo objetivo cuando procedian de una computadora de escritorio, y las
 * conclusiones sobre cadencia y sobre canales sin recorrido se atribuyeron al
 * equipo equivocado.
 *
 * QUE SE GUARDA Y QUE NO
 * Cadena de agente de usuario, tamano de pantalla y puntos tactiles: bastan para
 * separar equipos y para reconocer de que familia es cada uno. No se guarda nada
 * que identifique a una persona, y todo permanece en el dispositivo, sujeto al
 * borrado definitivo que ya contempla RF-25.
 */
export function equipo() {
  try {
    return {
      agente: navigator.userAgent,
      pantalla: `${screen.width}x${screen.height}@${window.devicePixelRatio ?? 1}`,
      tactil: navigator.maxTouchPoints ?? 0,
      idioma: navigator.language,
    };
  } catch {
    return null;
  }
}

export async function crearSesion(lineaBase, extra = {}) {
  await abrir();
  return promesa(
    tx("sesiones", "readwrite").add({
      inicio: Date.now(),
      fin: null,
      lineaBase,
      equipo: equipo(),
      /* Al nivel de la SESION y no dentro de la linea base. La version anterior
         los pasaba en el mismo objeto que la linea base, con lo que
         `versionReglas` y `norma` acababan anidados dentro de ella y no se
         encontraban donde cualquier analisis los busca. */
      ...extra,
    })
  );
}

export async function cerrarSesion(id, metricas) {
  await abrir();
  const store = tx("sesiones", "readwrite");
  const s = await promesa(store.get(id));
  if (!s) return;
  return promesa(store.put({ ...s, fin: Date.now(), metricas }));
}

/**
 * Escribe las métricas de instrumento sin cerrar la sesión.
 *
 * `cerrarSesion` marca el fin y por tanto solo sirve una vez. Esto se llama
 * periódicamente durante la sesión, para que un cierre abrupto —lo habitual en
 * una tablet— no se lleve consigo la procedencia de los datos ya registrados.
 */
export async function actualizarMetricas(id, metricas) {
  await abrir();
  const store = tx("sesiones", "readwrite");
  const s = await promesa(store.get(id));
  if (!s) return;
  return promesa(store.put({ ...s, metricas, metricasActualizadas: Date.now() }));
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
/**
 * Etiqueta que la persona observadora asigna al tramo en curso (RF-28).
 *
 * POR QUE HACE FALTA
 * Ajustar el clasificador sin saber que estaba haciendo el rostro es ajustar a
 * ciegas: no hay forma de distinguir un falso positivo de un acierto. Ocurrio al
 * comparar dos sesiones para decidir entre dos reglas de combinacion, y la
 * comparacion no significaba nada porque ninguna de las dos venia etiquetada.
 *
 * No es una anotacion clinica ni un juicio sobre el estado del participante. Es
 * la descripcion de lo que la persona que acompana observo: «en reposo»,
 * «sonriendo», «puchero». Con eso, cada regla puede contrastarse contra algo.
 *
 * Vive en memoria y viaja con cada muestra. Al terminar la sesion, el registro
 * dice a que tramo pertenece cada fotograma.
 */
let etiquetaActiva = null;

export function marcarSegmento(etiqueta) {
  etiquetaActiva = etiqueta || null;
  return etiquetaActiva;
}

export function segmentoActual() {
  return etiquetaActiva;
}

export async function guardarMuestra(m) {
  await abrir();
  if (etiquetaActiva) m = { ...m, segmento: etiquetaActiva };
  return promesa(tx("muestras", "readwrite").add(m));
}

/**
 * Guarda un evento expresivo breve.
 *
 * A diferencia de las muestras, estos NO se submuestrean: un transitorio de
 * 150 ms es justamente lo que el sistema intenta captar, y descartarlo por
 * frecuencia sería descartar el dato. Son pocos por sesión y ocupan poco.
 */
export async function guardarEvento(ev) {
  await abrir();
  return promesa(tx("eventos", "readwrite").add({ ts: Date.now(), ...ev }));
}

export async function todosLosEventos() {
  await abrir();
  return promesa(tx("eventos", "readonly").getAll());
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
  const eventos = await todosLosEventos();
  /* LA ATRIBUCION VIAJA CON LOS DATOS.
     Los pictogramas de ARASAAC estan bajo licencia CC BY-NC-SA, que obliga a
     citar autor, origen y licencia en cualquier obra derivada. Un archivo de
     registro que nombra pictogramas es una de ellas, y hasta ahora salia sin
     ninguna referencia. La copia visible para las personas sigue estando en
     index.html y en el README, escrita a mano y sin depender de JavaScript,
     porque una obligacion legal no puede quedar sujeta a que un script cargue. */
  return JSON.stringify(
    {
      exportado: new Date().toISOString(),
      atribucionPictogramas: ATRIBUCION,
      sesiones,
      selecciones,
      muestras,
      eventos,
    },
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
  await promesa(tx("eventos", "readwrite").clear());
}
