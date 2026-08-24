/**
 * Mírame — Orquestación.
 *
 * No hay pantalla de inicio: la aplicación abre directamente en el tablero,
 * porque quien la usa es un niño y cualquier paso previo es una barrera. La
 * cámara y el modelo se levantan en segundo plano y la línea base se captura
 * sola durante los primeros segundos con rostro visible.
 *
 * Si algo del análisis facial falla, el tablero sigue funcionando. Esa es la
 * condición de diseño, no un caso de error.
 */

import * as face from "./face.js";
import { extract, LineaBase } from "./features.js";
import { clasificar, Ventana } from "./classifier.js";
import * as store from "./storage.js";
import { Tablero, PAGINAS } from "./board.js";
import { hablar } from "./speech.js";

const SEGUNDOS_LINEA_BASE = 5;
const MUESTRAS_MINIMAS_BASE = 15;
const MS_SALIDA = 2600;

const el = (id) => document.getElementById(id);
const video = el("video");

const estado = {
  sesionId: null,
  lineaBase: new LineaBase(),
  ventana: new Ventana(8, 0.4),
  analisisActivo: false,
  baseIniciada: 0,
  ultimaSeleccion: performance.now(),
  fotogramas: 0,
  conRostro: 0,
  temporizadorSalida: null,
};

/* ══════════════════════ Estado de la cámara ══════════════════════ */

function chip(texto, clase) {
  el("chip-camara-texto").textContent = texto;
  el("chip-camara").className = "chip " + clase;
}

/* ══════════════════════ Arranque ══════════════════════ */

async function arrancar() {
  estado.sesionId = await store.crearSesion(null);
  tablero.render();
  pintarPuntos();
  refrescarAsociacion();

  el("entorno").textContent = [
    window.isSecureContext ? "conexión segura" : "CONEXIÓN NO SEGURA — la cámara no funcionará",
    navigator.mediaDevices?.getUserMedia ? "cámara expuesta" : "CÁMARA NO DISPONIBLE en este navegador",
  ].join(" · ");

  try {
    const cam = await face.openCamera(video);
    el("preview").hidden = false;
    chip("Cargando modelo…", "chip-espera");
    await face.init((t) => chip(t, "chip-espera"));

    estado.analisisActivo = true;
    estado.baseIniciada = performance.now();
    el("preview-base").hidden = false;
    chip(`Calibrando · ${cam.ancho}×${cam.alto}`, "chip-espera");
    requestAnimationFrame(bucle);
  } catch (e) {
    chip("Sin análisis facial", "chip-error");
    el("bloque-facial").style.opacity = ".45";
    el("estado-actual").textContent = "no disponible";
    el("diag").textContent = "Motivo: " + e.message;
  }
}

/* ══════════════════════ Bucle de video ══════════════════════ */

function bucle() {
  if (!estado.analisisActivo) return;
  const r = face.detect(video, performance.now());

  if (!estado.lineaBase.establecida) {
    if (r) estado.lineaBase.agregar(extract(r.blendshapes));
    const transcurrido = (performance.now() - estado.baseIniciada) / 1000;
    const n = estado.lineaBase.cantidadMuestras;
    el("barra-base").style.width =
      Math.min(100, (n / MUESTRAS_MINIMAS_BASE) * 100) + "%";
    el("estado-base").textContent = `${n}/${MUESTRAS_MINIMAS_BASE}`;

    // La línea base se cierra por muestras, no por reloj: un niño puede tardar
    // en quedar encuadrado y cerrar por tiempo daría una referencia inservible.
    if (n >= MUESTRAS_MINIMAS_BASE && transcurrido >= SEGUNDOS_LINEA_BASE) {
      const base = estado.lineaBase.cerrar();
      store.cerrarSesion(estado.sesionId, null);
      store.crearSesion(base).then((id) => (estado.sesionId = id));
      el("preview-base").hidden = true;
      el("estado-base").textContent = "establecida";
      chip("Análisis activo", "chip-activa");
    }
    return requestAnimationFrame(bucle);
  }

  estado.fotogramas++;
  if (r) {
    estado.conRostro++;
    const norm = estado.lineaBase.normalizar(extract(r.blendshapes));
    const { estado: e, puntaje } = clasificar(norm);
    estado.ventana.agregar(e, puntaje);
    pintarPanel(e, puntaje, r.blendshapes);
  } else {
    estado.ventana.agregarSinRostro();
    pintarPanel(null, null, null);
  }

  el("tasa-deteccion").textContent =
    Math.round((estado.conRostro / estado.fotogramas) * 100) + " %";
  el("diag").textContent = diagTexto();

  requestAnimationFrame(bucle);
}

function diagTexto() {
  const d = face.diagnostico;
  const partes = [
    `video ${video.videoWidth}×${video.videoHeight}`,
    `delegado ${d.delegado ?? "—"}`,
    `llamadas ${d.llamadas}`,
    `detecciones ${d.detecciones}`,
  ];
  if (d.ultimoError) partes.push(`error: ${d.ultimoError}`);
  return partes.join(" · ");
}

/* ══════════════════════ Panel en vivo ══════════════════════ */

const COLOR = {
  positivo: "#15803d",
  neutro: "#57534e",
  "negativo leve": "#b45309",
  "negativo intenso": "#be123c",
};

function pintarPanel(e, puntaje, blendshapes) {
  const badge = el("estado-actual");
  if (!e) {
    badge.textContent = "sin rostro";
    badge.style.color = "var(--tinta-3)";
    el("barra-puntaje").style.width = "0%";
    return;
  }
  badge.textContent = e;
  badge.style.color = COLOR[e];
  el("valor-puntaje").textContent = (puntaje > 0 ? "+" : "") + puntaje.toFixed(2);

  const barra = el("barra-puntaje");
  barra.style.width = Math.abs(puntaje) * 50 + "%";
  barra.style.left = puntaje < 0 ? 50 - Math.abs(puntaje) * 50 + "%" : "50%";
  barra.style.background = puntaje < 0 ? "#e11d48" : "#16a34a";

  if (blendshapes) {
    const top = Object.entries(blendshapes)
      .filter(([k]) => k !== "_neutral")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    el("blendshapes").innerHTML = top
      .map(
        ([k, v]) =>
          `<div class="bs"><span>${k}</span><div class="bs-barra"><i style="width:${(v * 100).toFixed(0)}%"></i></div><span>${v.toFixed(2)}</span></div>`
      )
      .join("");
  }
}

/* ══════════════════════ Selección ══════════════════════ */

const tablero = new Tablero(el("tablero"), async (picto) => {
  const d = estado.ventana.distribucion();
  const latencia = performance.now() - estado.ultimaSeleccion;
  estado.ultimaSeleccion = performance.now();

  el("salida-icono").textContent = picto.icono;
  el("salida-frase").textContent = picto.frase;
  el("salida-estado").textContent = !estado.analisisActivo
    ? ""
    : d.suficiente
      ? `estado facial previo · ${d.predominante}`
      : "datos faciales insuficientes en la ventana previa";
  el("mensaje-salida").hidden = false;
  hablar(picto.frase);

  clearTimeout(estado.temporizadorSalida);
  estado.temporizadorSalida = setTimeout(() => (el("mensaje-salida").hidden = true), MS_SALIDA);

  await store.guardarSeleccion({
    sesionId: estado.sesionId,
    pictograma: picto.clave,
    etiqueta: picto.etiqueta,
    categoria: picto.categoria,
    latenciaMs: Math.round(latencia),
    // Sin datos suficientes NO se atribuye estado (RF-27).
    predominante: d.suficiente ? d.predominante : null,
    proporciones: d.suficiente ? d.proporciones : null,
    puntajePromedio: d.suficiente ? d.puntajePromedio : null,
    tasaValidez: d.tasaValidez,
    fotogramasValidos: d.fotogramasValidos,
    fotogramasTotales: d.fotogramasTotales,
  });

  refrescarAsociacion();
});

el("mensaje-salida").addEventListener("click", () => {
  clearTimeout(estado.temporizadorSalida);
  el("mensaje-salida").hidden = true;
});

/* ══════════════════════ Paginación ══════════════════════ */

function pintarPuntos() {
  el("puntos").innerHTML = PAGINAS.map(
    (_, i) =>
      `<button class="punto" type="button" data-i="${i}" aria-current="${i === tablero.pagina}" aria-label="Página ${i + 1}"></button>`
  ).join("");
}

el("puntos").addEventListener("click", (ev) => {
  const b = ev.target.closest(".punto");
  if (!b) return;
  tablero.irA(Number(b.dataset.i));
  pintarPuntos();
});

el("btn-pagina").addEventListener("click", () => {
  tablero.siguiente();
  pintarPuntos();
});

/* ══════════════════════ Panel del cuidador ══════════════════════ */

function abrirPanel(abierto) {
  el("panel").hidden = !abierto;
  el("velo").hidden = !abierto;
  el("btn-panel").setAttribute("aria-expanded", String(abierto));
}
el("btn-panel").addEventListener("click", () => abrirPanel(el("panel").hidden));
el("btn-cerrar-panel").addEventListener("click", () => abrirPanel(false));
el("velo").addEventListener("click", () => abrirPanel(false));
document.addEventListener("keydown", (e) => e.key === "Escape" && abrirPanel(false));

/* ══════════════════════ Índice de asociación ══════════════════════ */

async function refrescarAsociacion() {
  const idx = await store.indiceAsociacion();
  const filas = Object.entries(idx).sort((a, b) => b[1].total - a[1].total);
  if (!filas.length) {
    el("asociacion").innerHTML =
      '<p class="vacio">Aún no hay selecciones con datos faciales suficientes.</p>';
    return;
  }
  el("asociacion").innerHTML = filas
    .map(
      ([clave, d]) =>
        `<div class="asoc"><span class="asoc-pic">${clave}</span>` +
        `<span class="asoc-estado" style="color:${COLOR[d.predominante]}">${d.predominante}</span>` +
        `<span class="asoc-n">${d.total} ${d.total === 1 ? "selección" : "selecciones"}</span></div>`
    )
    .join("");
}

/* ══════════════════════ Registros ══════════════════════ */

el("btn-exportar").addEventListener("click", async () => {
  const json = await store.exportarJSON();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = `mirame-sesiones-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

el("btn-borrar").addEventListener("click", async () => {
  if (!confirm("¿Borrar de forma definitiva todos los registros del dispositivo?")) return;
  await store.borrarTodo();
  refrescarAsociacion();
});

/* ══════════════════════ Arranque ══════════════════════ */

/* La invocacion va al final a proposito: `tablero` es una constante declarada
   mas abajo en el modulo, y llamar a arrancar() antes la encontraria en la
   zona muerta temporal. */
arrancar();
