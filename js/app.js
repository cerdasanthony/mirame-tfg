/**
 * Mírame — Orquestación de la sesión.
 *
 * Flujo: permiso de cámara → línea base de 5 s en reposo → sesión activa.
 * En cada fotograma se extraen las características, se normalizan contra la
 * línea base, se clasifica el estado y se acumula en la ventana temporal.
 * Al tocar un pictograma se guarda la distribución de los segundos previos.
 */

import * as face from "./face.js";
import { extract, LineaBase } from "./features.js";
import { clasificar, Ventana } from "./classifier.js";
import * as store from "./storage.js";
import { Tablero } from "./board.js";
import { hablar } from "./speech.js";

const SEGUNDOS_LINEA_BASE = 5;

const el = (id) => document.getElementById(id);
const video = el("video");

const estado = {
  sesionId: null,
  lineaBase: new LineaBase(),
  ventana: new Ventana(8, 0.4),
  fase: "inicio", // inicio | calibrando | activa
  inicioCalibracion: 0,
  ultimaSeleccion: performance.now(),
  fotogramas: 0,
  conRostro: 0,
  latenciasMs: [],
};

/* ─────────────────────────── Inicio de sesión ─────────────────────────── */

el("btn-iniciar").addEventListener("click", async () => {
  const btn = el("btn-iniciar");
  btn.disabled = true;
  btn.textContent = "Cargando modelo…";
  try {
    await face.openCamera(video);
    await face.init();
  } catch (e) {
    el("mensaje").textContent =
      "No se pudo iniciar la cámara o el modelo: " + e.message +
      ". El tablero funciona igual sin análisis facial.";
    iniciarSesion(false);
    return;
  }
  estado.fase = "calibrando";
  estado.inicioCalibracion = performance.now();
  el("pantalla-inicio").hidden = true;
  el("pantalla-calibracion").hidden = false;
  requestAnimationFrame(bucle);
});

el("btn-omitir").addEventListener("click", () => iniciarSesion(false));

async function iniciarSesion(conAnalisis) {
  const base = conAnalisis ? estado.lineaBase.cerrar() : null;
  estado.sesionId = await store.crearSesion(base);
  estado.fase = conAnalisis ? "activa" : "sin-analisis";
  el("pantalla-inicio").hidden = true;
  el("pantalla-calibracion").hidden = true;
  el("pantalla-sesion").hidden = false;
  el("panel-facial").hidden = !conAnalisis;
  tablero.render();
}

/* ──────────────────────────── Bucle de video ──────────────────────────── */

function bucle() {
  if (estado.fase === "inicio") return;

  const t0 = performance.now();
  let r = null;
  try {
    r = face.detect(video, t0);
  } catch (_) {
    /* fotograma no listo */
  }
  const latencia = performance.now() - t0;
  if (latencia > 0) estado.latenciasMs.push(latencia);

  if (estado.fase === "calibrando") {
    if (r) estado.lineaBase.agregar(extract(r.blendshapes));
    const transcurrido = (performance.now() - estado.inicioCalibracion) / 1000;
    const pct = Math.min(100, (transcurrido / SEGUNDOS_LINEA_BASE) * 100);
    el("barra-calibracion").style.width = pct + "%";
    el("muestras-calibracion").textContent = estado.lineaBase.cantidadMuestras;
    if (transcurrido >= SEGUNDOS_LINEA_BASE) {
      if (estado.lineaBase.cantidadMuestras > 0) iniciarSesion(true);
      else {
        el("mensaje").textContent =
          "No se detectó rostro durante la calibración. La sesión continúa sin análisis facial.";
        iniciarSesion(false);
      }
      return requestAnimationFrame(bucle);
    }
  }

  if (estado.fase === "activa") {
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
      estado.fotogramas ? Math.round((estado.conRostro / estado.fotogramas) * 100) + " %" : "—";
  }

  requestAnimationFrame(bucle);
}

/* ─────────────────────────── Panel en vivo ─────────────────────────── */

const COLOR = {
  positivo: "#15803d",
  neutro: "#52525b",
  "negativo leve": "#b45309",
  "negativo intenso": "#b91c1c",
};

function pintarPanel(e, puntaje, blendshapes) {
  const badge = el("estado-actual");
  if (!e) {
    badge.textContent = "sin rostro";
    badge.style.color = "#a1a1aa";
    el("barra-puntaje").style.width = "0%";
    return;
  }
  badge.textContent = e;
  badge.style.color = COLOR[e];
  el("valor-puntaje").textContent = (puntaje > 0 ? "+" : "") + puntaje.toFixed(2);

  const barra = el("barra-puntaje");
  barra.style.width = Math.abs(puntaje) * 50 + "%";
  barra.style.left = puntaje < 0 ? 50 - Math.abs(puntaje) * 50 + "%" : "50%";
  barra.style.background = puntaje < 0 ? "#ef4444" : "#22c55e";

  if (blendshapes) {
    const top = Object.entries(blendshapes)
      .filter(([k]) => k !== "_neutral")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    el("blendshapes").innerHTML = top
      .map(
        ([k, v]) =>
          `<div class="bs"><span>${k}</span><div class="bs-barra"><i style="width:${(v * 100).toFixed(0)}%"></i></div><span>${v.toFixed(2)}</span></div>`
      )
      .join("");
  }
}

/* ───────────────────────────── Selección ───────────────────────────── */

const tablero = new Tablero(el("tablero"), async (picto) => {
  const d = estado.ventana.distribucion();
  const latencia = performance.now() - estado.ultimaSeleccion;
  estado.ultimaSeleccion = performance.now();

  el("resultado-icono").textContent = picto.icono;
  el("resultado-frase").textContent = picto.frase;
  el("resultado-estado").textContent = d.suficiente
    ? `estado facial previo: ${d.predominante}`
    : "datos insuficientes en la ventana previa";
  el("resultado").hidden = false;
  hablar(picto.frase);

  await store.guardarSeleccion({
    sesionId: estado.sesionId,
    pictograma: picto.clave,
    etiqueta: picto.etiqueta,
    latenciaMs: Math.round(latencia),
    // Cuando no hay datos suficientes NO se atribuye estado (RF-27).
    predominante: d.suficiente ? d.predominante : null,
    proporciones: d.suficiente ? d.proporciones : null,
    puntajePromedio: d.suficiente ? d.puntajePromedio : null,
    tasaValidez: d.tasaValidez,
    fotogramasValidos: d.fotogramasValidos,
    fotogramasTotales: d.fotogramasTotales,
  });

  refrescarAsociacion();
});

el("btn-pagina").addEventListener("click", () => {
  const p = tablero.cambiarPagina();
  el("btn-pagina").textContent = `Página ${p + 1} →`;
});

/* ─────────────────────── Índice de asociación ─────────────────────── */

async function refrescarAsociacion() {
  const idx = await store.indiceAsociacion();
  const filas = Object.entries(idx);
  if (!filas.length) {
    el("asociacion").innerHTML = '<p class="vacio">Aún no hay selecciones registradas.</p>';
    return;
  }
  el("asociacion").innerHTML = filas
    .map(
      ([clave, d]) =>
        `<div class="asoc"><span class="asoc-pic">${clave}</span>
         <span class="asoc-estado" style="color:${COLOR[d.predominante]}">${d.predominante}</span>
         <span class="asoc-n">${d.total} ${d.total === 1 ? "selección" : "selecciones"}</span></div>`
    )
    .join("");
}

/* ──────────────────────────── Administración ──────────────────────────── */

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

refrescarAsociacion();
