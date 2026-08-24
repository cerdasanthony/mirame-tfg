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
import { extract, LineaBase, frontalidad } from "./features.js";
import { clasificar, Ventana, Suavizador, Estabilizador, UMBRALES, fijarUmbrales } from "./classifier.js";
import * as store from "./storage.js";
import { Tablero, PAGINAS } from "./board.js";
import { hablar } from "./speech.js";
import * as segunda from "./segunda-opinion.js";
import { Heuristica, guardarConfig } from "./heuristica.js";
import { extraerAU, CANALES_AU, PerfilExpresividad, evidenciaPositiva, evidenciaNegativa } from "./facs.js";
import { DetectorFasico } from "./microexpresiones.js";

const SEGUNDOS_LINEA_BASE = 5;
const MUESTRAS_MINIMAS_BASE = 15;
const MS_SALIDA = 2600;

/* Por debajo de esta frontalidad el rostro esta demasiado girado y los
   blendshapes dejan de ser confiables. El fotograma se descarta en lugar de
   producir una clasificacion mala. Requiere calibracion. */
/* Frontalidad mínima para aceptar un fotograma en la clasificación.
   Medido: una nariz apenas descentrada da 0.52, y un perfil real 0.25. El
   valor anterior de 0.55 caía justo en medio y descartaba giros leves que son
   perfectamente utilizables. Es un parámetro de calibración y se ajusta desde
   el panel. */
const CLAVE_FRONTALIDAD = "mirame.frontalidad";
let FRONTALIDAD_MINIMA = Number(localStorage.getItem(CLAVE_FRONTALIDAD)) || 0.45;

/* Para la línea base se acepta un rostro bastante más ladeado que para
   clasificar. El motivo es que la línea base debe capturar el reposo TAL COMO
   ES: si la postura habitual del participante es algo girada, esa es su
   referencia. Exigir aquí el mismo rigor que en la clasificación deja la
   calibración sin muestras y el sistema no arranca nunca. */
const FRONTALIDAD_BASE = 0.30;

/* Tope de paciencia de la calibración. Pasado este tiempo se cierra con lo que
   haya, siempre que alcance para calcular una desviación estándar util, y se
   deja constancia de que la referencia es de calidad reducida. Una línea base
   imperfecta es mucho mejor que una aplicación colgada en "Calibrando". */
const MS_TOPE_CALIBRACION = 15000;
const MUESTRAS_ACEPTABLES_BASE = 6;

/* La segunda opinion corre a ritmo bajo: es una red convolucional sobre el
   recorte del rostro y no hace falta consultarla en cada fotograma para medir
   acuerdo. */
const MS_SEGUNDA_OPINION = 400;

/* Frecuencia de registro de vectores crudos para reanálisis posterior. Guardar
   treinta por segundo llenaría el almacenamiento sin aportar información. */
const MS_MUESTRA = 250;

/* Refresco de la instrumentación del panel.
   El bucle corre a la velocidad de la cámara, pero el panel es para lectura
   humana y no necesita treinta actualizaciones por segundo. Escribir el DOM en
   cada fotograma —y peor, con el panel cerrado— gasta presupuesto de cuadro que
   en una tablet modesta se le quita a la detección facial, que es lo unico que
   de verdad tiene que ir rapido. */
const MS_PANEL = 200;

const el = (id) => document.getElementById(id);
const video = el("video");

const estado = {
  sesionId: null,
  lineaBase: new LineaBase(),
  /* Vía fásica. Línea base propia sobre canales de Unidades de Acción, porque
     el detector de transitorios trabaja canal por canal y no sobre el compuesto:
     una expresión sutil se concentra en una AU y el compuesto la promedia hasta
     hacerla desaparecer. */
  baseAU: new LineaBase(CANALES_AU),
  detector: new DetectorFasico({ canales: CANALES_AU }),
  perfil: new PerfilExpresividad(),
  ventana: new Ventana(5, 0.4, 1500),
  suavizador: new Suavizador(),
  estabilizador: new Estabilizador({ dwellMs: 500, factorRetroceso: 0.5 }),
  ultimoFotograma: 0,
  ultimaCaptura: 0,
  ultimaMuestra: 0,
  ultimoPanel: 0,
  panelAbierto: false,
  descartadosPorPose: 0,
  acuerdo: new segunda.Acuerdo(),
  ultimaSegunda: 0,
  segundaCategoria: null,
  heuristica: new Heuristica(),
  ultimaPromocion: null,
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
    el("aviso-base").hidden = false;
    chip(`Calibrando · ${cam.ancho}×${cam.alto}`, "chip-espera");
    face.programarFotograma(video, bucle);

    // Solo si el cuidador la encendió: compite con MediaPipe por la GPU.
    if (segunda.habilitada()) {
      el("estado-segunda").textContent = "cargando…";
      segunda.init().then((ok) => {
        el("estado-segunda").textContent = ok ? "activa" : "no disponible";
        if (!ok) el("estado-segunda").title = segunda.estado.motivo ?? "";
      });
    } else {
      el("estado-segunda").textContent = "desactivada";
    }
  } catch (e) {
    chip("Sin análisis facial", "chip-error");
    el("bloque-facial").style.opacity = ".45";
    el("estado-actual").textContent = "no disponible";
    el("diag").textContent = "Motivo: " + e.message;
  }
}

/* ══════════════════════ Bucle de video ══════════════════════ */

/**
 * Un fotograma del analisis.
 *
 * `tCaptura` es el instante en que la camara capturo ESTE fotograma, no aquel en
 * que el navegador llego a procesarlo (ver `face.programarFotograma`). Todo lo
 * que se selle con el tiempo —la ventana temporal, los eventos fasicos, la linea
 * base— usa esta marca, porque las duraciones que mide la via fasica son del
 * orden del jitter de planificacion de JavaScript.
 */
function bucle(tCaptura = performance.now()) {
  if (!estado.analisisActivo) return;
  estado.ultimaCaptura = tCaptura;
  const r = face.detect(video, tCaptura);

  // Fotograma repetido: no hay nada nuevo que medir. No cuenta ni como válido
  // ni como faltante, porque no describe nada del participante.
  if (r === undefined) return face.programarFotograma(video, bucle);

  if (!estado.lineaBase.establecida) {
    const fr = r ? frontalidad(r.landmarks) : null;
    if (fr !== null) el("frontalidad").textContent = Math.round(fr * 100) + " %";
    if (r && fr >= FRONTALIDAD_BASE) {
      estado.lineaBase.agregar(extract(r.blendshapes));
      estado.baseAU.agregar(extraerAU(r.blendshapes));
    }
    const transcurridoMs = tCaptura - estado.baseIniciada;
    const transcurrido = transcurridoMs / 1000;
    const n = estado.lineaBase.cantidadMuestras;
    el("barra-base").style.width =
      Math.min(100, (n / MUESTRAS_MINIMAS_BASE) * 100) + "%";
    el("estado-base").textContent = `${n}/${MUESTRAS_MINIMAS_BASE}`;
    el("diag").textContent = diagTexto();

    // El progreso se muestra en la barra superior. Sin esto, una calibración
    // que no avanza es indistinguible de una que va bien.
    chip(`Calibrando · ${n}/${MUESTRAS_MINIMAS_BASE}`, "chip-espera");
    el("aviso-progreso").style.width = Math.min(100, (n / MUESTRAS_MINIMAS_BASE) * 100) + "%";
    el("aviso-n").textContent = n;

    const porMuestras = n >= MUESTRAS_MINIMAS_BASE && transcurrido >= SEGUNDOS_LINEA_BASE;
    const porTope = transcurridoMs >= MS_TOPE_CALIBRACION && n >= MUESTRAS_ACEPTABLES_BASE;

    if (transcurridoMs >= MS_TOPE_CALIBRACION && n < MUESTRAS_ACEPTABLES_BASE) {
      // Ni siquiera lo mínimo: se explica el motivo y se sigue solo con tablero.
      estado.analisisActivo = false;
      chip("Sin línea base", "chip-error");
      el("aviso-base").hidden = true;
      el("estado-base").textContent = "no obtenida";
      el("diag").textContent =
        `No se reunieron muestras suficientes en ${MS_TOPE_CALIBRACION / 1000} s ` +
        `(${n} de ${MUESTRAS_ACEPTABLES_BASE}). ` + diagTexto();
      return;
    }

    if (porMuestras || porTope) {
      if (porTope && !porMuestras) {
        el("estado-base").textContent = `establecida (${n}, calidad reducida)`;
      }
      const base = estado.lineaBase.cerrar();
      const baseAU = estado.baseAU.cerrar();
      estado.detector.reiniciar();
      estado.estabilizador.reiniciar();
      store.cerrarSesion(estado.sesionId, null);
      store.crearSesion({ ...base, au: baseAU }).then((id) => (estado.sesionId = id));
      el("sigma-base").textContent = base.muestras + " muestras";
      el("preview-base").hidden = true;
      el("aviso-base").hidden = true;

      // La quietud avisa si el rostro se movió durante la calibración. Con un
      // valor bajo, la referencia describe expresiones y no reposo, y ninguna
      // expresión posterior alcanzará el umbral.
      if (base.quietud !== null) {
        const q = Math.round(base.quietud * 100);
        el("quietud").textContent = q + " %";
        if (q < 55) {
          chip(`Línea base inestable · ${q} %`, "chip-error");
          el("quietud").title = "Conviene recalibrar con el rostro relajado.";
        }
      }
      if (el("estado-base").textContent.startsWith("0")
          || /^\d+\/\d+$/.test(el("estado-base").textContent)) {
        el("estado-base").textContent = "establecida";
      }
      chip("Análisis activo", "chip-activa");
      estado.fotogramas = 0;
      estado.conRostro = 0;
      estado.descartadosPorPose = 0;
      estado.suavizador.reiniciar();
    }
    return face.programarFotograma(video, bucle);
  }

  estado.fotogramas++;
  if (!r) {
    estado.ventana.agregarSinRostro();
    estado.suavizador.reiniciar();
    estado.ultimoFotograma = 0;
    aplicarHeuristica(null);
    if (tocaPintar()) pintarPanel(null, null, null, null);
  } else {
    const frente = frontalidad(r.landmarks);
    if (frente < FRONTALIDAD_MINIMA) {
      // Rostro presente pero girado: se descarta antes de clasificar.
      estado.descartadosPorPose++;
      estado.ventana.agregarDescartado();
      aplicarHeuristica(null);
      if (tocaPintar()) pintarPanel(null, null, r.blendshapes, frente);
    } else {
      estado.conRostro++;
      const ahora = tCaptura;
      const dtMs = estado.ultimoFotograma ? Math.min(200, ahora - estado.ultimoFotograma) : 33;
      estado.ultimoFotograma = ahora;

      const crudas = extract(r.blendshapes);
      const norm = estado.lineaBase.normalizar(crudas);

      /* VÍA FÁSICA — corre en paralelo y NO comparte nada con la tónica salvo
         el fotograma. Se le entrega la puntuación z SIN suavizar: el suavizado
         es precisamente lo que borra los transitorios que este camino busca. */
      const au = extraerAU(r.blendshapes);
      estado.perfil.agregar(au);
      for (const ev of estado.detector.agregar(estado.baseAU.normalizar(au), ahora)) {
        /* Los no resolubles se guardan igual, marcados. La tasa de eventos que
           el muestreo no alcanza a describir es una medida de calidad del
           instrumento y desaparecería si se filtraran en silencio. */
        store.guardarEvento({ sesionId: estado.sesionId, ...ev });
      }

      const c = clasificar(norm, {
        suavizador: estado.suavizador,
        estabilizador: estado.estabilizador,
        dtMs,
      });
      estado.ventana.agregar(c.estado, c.puntaje, ahora);

      // Vector crudo para reanálisis posterior (RF-31).
      if (ahora - estado.ultimaMuestra >= MS_MUESTRA) {
        estado.ultimaMuestra = ahora;
        store.guardarMuestra({
          sesionId: estado.sesionId,
          ts: Date.now(),
          caracteristicas: crudas,
          frontalidad: Number(frente.toFixed(3)),
          puntaje: Number(c.puntaje.toFixed(4)),
          estado: c.estado,
        });
      }

      aplicarHeuristica(c.estado);
      consultarSegundaOpinion(r.landmarks, c.estado);

      if (tocaPintar(ahora)) {
        const discrepa =
          estado.segundaCategoria !== null &&
          segunda.colapsar(c.estado) !== estado.segundaCategoria;
        pintarPanel(c.estado, c.puntaje, r.blendshapes, frente, c.incierto || discrepa);
        pintarSenal(norm, c);
        pintarFasico();
      }
    }
  }

  // La barra superior sí se actualiza siempre, pero a ritmo bajo: es el único
  // indicador visible cuando el panel está cerrado, que es el uso normal.
  if (estado.fotogramas % 30 === 0) {
    const tasa = Math.round((estado.conRostro / estado.fotogramas) * 100);
    chip(`Rostro ${tasa} %`, tasa < 40 ? "chip-espera" : "chip-activa");
    if (estado.panelAbierto) {
      el("tasa-deteccion").textContent = tasa + " %";
      el("diag").textContent = diagTexto();
    }
  }

  face.programarFotograma(video, bucle);
}

/**
 * Consulta al segundo modelo con throttling y actualiza el acuerdo.
 *
 * No se espera el resultado: la respuesta llega asincrónica y se usa en los
 * fotogramas siguientes. Bloquear el bucle por esto tiraria la tasa de captura.
 */
function consultarSegundaOpinion(landmarks, estadoPrincipal) {
  const ahora = performance.now();
  if (!segunda.estado.disponible) return;
  if (ahora - estado.ultimaSegunda < MS_SEGUNDA_OPINION) return;
  estado.ultimaSegunda = ahora;

  segunda.opinar(video, landmarks).then((op) => {
    if (!op) return;
    estado.segundaCategoria = op.categoria;
    estado.acuerdo.registrar(estadoPrincipal, op.categoria);

    if (!estado.panelAbierto) return;
    const prop = estado.acuerdo.proporcion;
    const k = estado.acuerdo.kappa;
    el("acuerdo").textContent = prop === null ? "—" : Math.round(prop * 100) + " %";
    el("kappa").textContent = k === null ? "—" : k.toFixed(2);
    el("kappa-lectura").textContent = estado.acuerdo.interpretacion;
    el("segunda-categoria").textContent = op.categoria;
    el("segunda-categoria").style.color = COLOR[op.categoria] ?? "var(--tinta-2)";
  });
}

/**
 * Módulo C: alimenta el detector de estado sostenido y reordena el tablero.
 *
 * Solo se vuelve a dibujar cuando la sugerencia cambia. Redibujar en cada
 * fotograma destruiría los nodos del tablero mientras el niño intenta tocarlos.
 */
function aplicarHeuristica(estadoObservable) {
  const r = estado.heuristica.actualizar(estadoObservable);

  if (estado.panelAbierto) {
    el("barra-heuristica").style.width = Math.round(r.progreso * 100) + "%";
    el("estado-sostenido").textContent = r.estado ?? "—";
  }

  // El reordenamiento del tablero sí se aplica siempre: es la funcionalidad,
  // no instrumentación.
  if (r.promovido !== estado.ultimaPromocion) {
    estado.ultimaPromocion = r.promovido;
    tablero.render(r.promovido);
    el("sugerencia-actual").textContent = r.promovido ?? "ninguna";
  }
}

/**
 * ¿Toca refrescar la instrumentación?
 *
 * Con el panel cerrado —el uso normal— no se escribe nada: los nodos no están
 * a la vista y cada escritura cuesta presupuesto de cuadro.
 */
function tocaPintar(ahora = performance.now()) {
  if (!estado.panelAbierto) return false;
  if (ahora - estado.ultimoPanel < MS_PANEL) return false;
  estado.ultimoPanel = ahora;
  return true;
}

function diagTexto() {
  const d = face.diagnostico;
  const partes = [
    `video ${video.videoWidth}×${video.videoHeight}`,
    `delegado ${d.delegado ?? "—"}`,
    `llamadas ${d.llamadas}`,
    `detecciones ${d.detecciones}`,
    `descartados por pose ${estado.descartadosPorPose}`,
    `dwell ${Math.round(estado.estabilizador.progresoCambio * 100)} %`,
    `segunda opinión ${segunda.estado.disponible ? segunda.estado.evaluaciones : 'no disponible'}`,
  ];
  if (d.ultimoError) partes.push(`error: ${d.ultimoError}`);
  return partes.join(" · ");
}

/* ══════════════════════ Panel en vivo ══════════════════════ */

const COLOR = {
  negativo: "#be123c",
  positivo: "#15803d",
  neutro: "#57534e",
  "negativo leve": "#b45309",
  "negativo intenso": "#be123c",
};

function pintarPanel(e, puntaje, blendshapes, frente, incierto = false) {
  const badge = el("estado-actual");
  if (frente !== null && frente !== undefined) {
    el("frontalidad").textContent = Math.round(frente * 100) + " %";
  }
  if (!e) {
    badge.textContent = frente === null || frente === undefined ? "sin rostro" : "rostro girado";
    badge.style.color = "var(--tinta-3)";
    el("barra-puntaje").style.width = "0%";
    if (blendshapes) pintarBlendshapes(blendshapes);
    return;
  }
  badge.textContent = e + (incierto ? " ·  incierto" : "");
  badge.style.color = COLOR[e];
  el("valor-puntaje").textContent = (puntaje > 0 ? "+" : "") + puntaje.toFixed(2);

  const barra = el("barra-puntaje");
  barra.style.width = Math.abs(puntaje) * 50 + "%";
  barra.style.left = puntaje < 0 ? 50 - Math.abs(puntaje) * 50 + "%" : "50%";
  barra.style.background = puntaje < 0 ? "#e11d48" : "#16a34a";

  if (blendshapes) pintarBlendshapes(blendshapes);
}

/**
 * Muestra las puntuaciones z de cada característica y el compuesto.
 *
 * Sin esto es imposible distinguir "el rostro no cambia" de "el rostro cambia
 * pero la señal se cancela o se atenúa antes de llegar al umbral".
 */
function pintarSenal(z, c) {
  const filas = Object.entries(z)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 7)
    .map(([k, v]) => {
      const ancho = Math.min(100, Math.abs(v) * 12);
      const color = v >= 0 ? "#3f8f3a" : "#b03a55";
      return `<div class="bs"><span>${k}</span>` +
        `<div class="bs-barra"><i style="width:${ancho}%;background:${color}"></i></div>` +
        `<span>${v >= 0 ? "+" : ""}${v.toFixed(1)}</span></div>`;
    })
    .join("");
  el("senal").innerHTML = filas;
  el("compuesto").textContent =
    `${c.puntaje >= 0 ? "+" : ""}${c.puntaje.toFixed(2)} σ  ·  crudo ${c.puntajeCrudo.toFixed(2)}`;
}

/**
 * Instrumentacion de la via fasica.
 *
 * No se muestra solo el recuento de eventos, sino tambien lo que el instrumento
 * NO puede ver: la resolucion temporal que consiguio, cuanto de la banda de
 * Ekman queda por debajo de ella y cuantos eventos se descartaron por caer ahi.
 *
 * Sin eso, un contador en cero se lee como «el participante no expreso nada»,
 * cuando puede significar «la camara no dio la cadencia necesaria para verlo».
 * Son conclusiones opuestas y el panel tiene que dejar distinguirlas.
 */
function pintarFasico() {
  const m = estado.detector.metricas;

  el("fasico-fps").textContent = m.fps ? m.fps.toFixed(0) + " fps" : "—";
  el("fasico-resolucion").textContent = m.resolucionMs + " ms";
  el("fasico-reloj").textContent = face.diagnostico.reloj ?? "—";
  el("fasico-canales").textContent = `${m.canalesUtiles} / ${m.canalesTotales}`;
  el("fasico-ceguera").textContent = m.cegueraEkmanPct + " %";
  el("fasico-micro").textContent = m.porBanda["microexpresion"] ?? 0;
  el("fasico-breve").textContent = m.porBanda["expresion breve"] ?? 0;
  el("fasico-irresoluble").textContent = m.descartadosPorResolucion;
  el("fasico-parpadeo").textContent = m.marcadosComoParpadeo;
  el("fasico-eventos").textContent = `${m.eventosLimpios} / ${m.eventosTotales}`;

  const badge = el("fasico-estado");
  if (!m.calibrado) {
    badge.textContent = "midiendo el ruido";
    badge.style.color = "var(--tinta-3)";
    el("barra-calentamiento").style.width =
      Math.round(m.progresoCalentamiento * 100) + "%";
    return;
  }
  el("barra-calentamiento").style.width = "100%";

  /* Sin canales con umbral el detector no puede emitir nada. Un cero de eventos
     ahi no dice nada del participante y hay que decirlo con todas las letras. */
  if (m.canalesUtiles === 0) {
    badge.textContent = "sin referencia de ruido";
    badge.style.color = "#b03a55";
    return;
  }

  /* Con esta cadencia la banda estricta de Ekman no es medible. Decirlo es mas
     util que mostrar un cero, que se leeria como ausencia de expresion. */
  if (m.resolucionMs > 200) {
    badge.textContent = "sin resolución para microexpresiones";
    badge.style.color = "#b03a55";
    return;
  }
  badge.textContent = m.degradado ? "activa · cobertura parcial" : "activa";
  badge.style.color = m.degradado ? "#b8860b" : "var(--tinta-1)";
}

function pintarBlendshapes(blendshapes) {
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

/* ══════════════════════ Selección ══════════════════════ */

const tablero = new Tablero(el("tablero"), async (picto, _cat, eraSugerido) => {
  const d = estado.ventana.distribucion();
  const latencia = performance.now() - estado.ultimaSeleccion;
  estado.ultimaSeleccion = performance.now();

  el("salida-icono").textContent = picto.icono;
  el("salida-frase").textContent = picto.frase;
  el("salida-estado").textContent = !estado.analisisActivo
    ? ""
    : d.suficiente
      ? resumenVentana(d)
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
    // El estado no neutro dominante y cuánto ocupó de la ventana ponderada.
    expresivo: d.suficiente ? d.expresivo : null,
    proporcionExpresiva: d.suficiente ? d.proporcionExpresiva : null,
    proporciones: d.suficiente ? d.proporciones : null,
    puntajePromedio: d.suficiente ? d.puntajePromedio : null,
    tasaValidez: d.tasaValidez,
    fotogramasValidos: d.fotogramasValidos,
    fotogramasTotales: d.fotogramasTotales,
    // Acuerdo entre el clasificador geométrico y el modelo preentrenado, como
    // medida de fiabilidad sin verdad de referencia disponible.
    // El porcentaje crudo sobreestima la concordancia; kappa la corrige por azar.
    acuerdo: estado.acuerdo.instantanea(),
    // Vía fásica: transitorios breves ocurridos en la misma ventana. Se guardan
    // aparte del estado tónico porque responden a otra pregunta: no «cómo estaba
    // el rostro» sino «qué pasó por él».
    /* Se ancla al ultimo fotograma capturado y no al instante del clic: entre
       uno y otro pueden pasar decenas de milisegundos, y correr la ventana por
       esa diferencia dejaria fuera justo los eventos mas cercanos a la
       seleccion, que son los que mas pesan en la ponderacion por cercania. */
    fasico: estado.detector.calibrado
      ? estado.detector.enVentana(
          estado.ultimaCaptura - estado.ventana.segundos * 1000,
          estado.ultimaCaptura,
          d.suficiente ? d.predominante : null
        )
      : null,
    resolucionTemporalMs: estado.detector.metricas.resolucionMs,
    // Módulo C (RF-20). El registro de «se sugirió X, se eligió Y» es el dato
    // más informativo del sistema: una selección que ignora la sugerencia dice
    // más que una que la acepta.
    ...estado.heuristica.instantanea(),
    aceptoSugerencia: eraSugerido === true,
  });

  refrescarAsociacion();
});

/**
 * Resume la ventana previa para mostrarla junto al pictograma.
 *
 * Decir solamente la moda oculta lo importante: sobre un rostro que la mayor
 * parte del tiempo está en reposo, «neutro» gana por pluralidad aunque una
 * parte sustancial de la ventana haya sido expresiva. Cuando lo expresivo pesa
 * lo suficiente, se nombra explícitamente con su proporción.
 */
function resumenVentana(d) {
  const pct = (v) => Math.round(v * 100);
  if (d.expresivo && d.proporcionExpresiva >= 0.25) {
    return `${d.expresivo} ${pct(d.proporcionExpresiva)} % · neutro ${pct(d.proporciones.neutro)} %`;
  }
  return `estado facial previo · ${d.predominante} ${pct(d.proporciones[d.predominante])} %`;
}

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
  estado.panelAbierto = abierto;
  estado.ultimoPanel = 0;
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

/**
 * Rehace la línea base sin recargar.
 *
 * Es la salida cuando la referencia salió contaminada: la persona se movió o
 * gesticuló durante la calibración y a partir de ahí todo se clasifica como
 * neutro. Sin este botón la única opción era recargar la página.
 */
el("btn-recalibrar").addEventListener("click", () => {
  if (!video.srcObject) return;
  estado.lineaBase = new LineaBase();
  estado.suavizador.reiniciar();
  estado.estabilizador.reiniciar();
  estado.ventana = new Ventana(5, 0.4, 1500);
  estado.baseAU = new LineaBase(CANALES_AU);
  estado.detector.reiniciar();
  estado.perfil = new PerfilExpresividad();
  estado.baseIniciada = performance.now();
  estado.analisisActivo = true;
  estado.fotogramas = 0;
  estado.conRostro = 0;
  estado.descartadosPorPose = 0;
  el("quietud").textContent = "—";
  el("estado-base").textContent = "0/" + MUESTRAS_MINIMAS_BASE;
  el("preview-base").hidden = false;
  el("aviso-base").hidden = false;
  abrirPanel(false);
  face.programarFotograma(video, bucle);
});

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
/* ══════════════════════ Controles del Módulo C ══════════════════════ */

const ESTADOS_HEURISTICA = ["positivo", "neutro", "negativo leve", "negativo intenso"];

function montarControlesHeuristica() {
  const cfg = estado.heuristica.config;

  el("heuristica-activa").checked = cfg.activa;
  el("heuristica-activa").addEventListener("change", (e) => {
    estado.heuristica.activa = e.target.checked;
    if (!e.target.checked) {
      estado.ultimaPromocion = null;
      tablero.render(null);
      el("sugerencia-actual").textContent = "ninguna";
    }
  });

  el("umbral-heuristica").value = cfg.umbralMs;
  el("umbral-heuristica").addEventListener("change", (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 1000) {
      cfg.umbralMs = v;
      guardarConfig(cfg);
    }
    e.target.value = cfg.umbralMs;
  });

  // Todos los pictogramas de todas las páginas son destino posible.
  const opciones = PAGINAS.flat();
  el("mapa-heuristica").innerHTML = ESTADOS_HEURISTICA.map(
    (est) =>
      `<div class="mapa-fila"><span class="mapa-estado" style="color:${COLOR[est]}">${est}</span>` +
      `<select data-estado="${est}"><option value="">— ninguno —</option>` +
      opciones
        .map(
          (o) =>
            `<option value="${o.clave}"${cfg.mapa[est] === o.clave ? " selected" : ""}>${o.etiqueta}</option>`
        )
        .join("") +
      `</select></div>`
  ).join("");

  el("mapa-heuristica").addEventListener("change", (e) => {
    const sel = e.target.closest("select");
    if (!sel) return;
    cfg.mapa[sel.dataset.estado] = sel.value || null;
    guardarConfig(cfg);
    estado.heuristica.reiniciar();
    estado.ultimaPromocion = null;
    tablero.render(null);
  });
}

function montarSegundaOpinion() {
  const c = el("segunda-habilitada");
  c.checked = segunda.habilitada();
  c.addEventListener("change", (e) => {
    segunda.habilitar(e.target.checked);
    el("estado-segunda").textContent = e.target.checked
      ? "se activará al recargar"
      : "desactivada al recargar";
  });
}

function montarControlesUmbrales() {
  el("u-frontalidad").value = FRONTALIDAD_MINIMA;
  el("u-frontalidad").addEventListener("change", (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0 && v <= 1) {
      FRONTALIDAD_MINIMA = v;
      localStorage.setItem(CLAVE_FRONTALIDAD, String(v));
    }
    e.target.value = FRONTALIDAD_MINIMA;
  });

  const campos = { "u-positivo": "positivo", "u-neutro": "neutro", "u-neglev": "negativoLeve" };
  const pintar = () => {
    for (const [id, k] of Object.entries(campos)) el(id).value = UMBRALES[k];
    el("ancho-neutro").textContent = (UMBRALES.positivo - UMBRALES.neutro).toFixed(2) + " σ";
  };
  for (const [id, k] of Object.entries(campos)) {
    el(id).addEventListener("change", (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) fijarUmbrales({ [k]: v });
      estado.estabilizador.reiniciar();
      pintar();
    });
  }
  pintar();
}

montarSegundaOpinion();
montarControlesUmbrales();
montarControlesHeuristica();
arrancar();
