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
import { extract, LineaBase, frontalidad, frontalidadGeometrica } from "./features.js";
import {
  clasificar, Ventana, Suavizador, Estabilizador, UMBRALES, fijarUmbrales,
  calibrarNorma, centroNorma, NORMA,
} from "./classifier.js";
import * as store from "./storage.js";
import { Tablero, PICTOGRAMAS } from "./board.js";
import { hablar, voces, ajustes, fijarAjustes, vozActual, alHaberVoces } from "./speech.js";
import * as segunda from "./segunda-opinion.js";
import { Heuristica, guardarConfig } from "./heuristica.js";
import { extraerAU, CANALES_AU, PerfilExpresividad, evidenciaPositiva, evidenciaNegativa, asimetria, EVIDENCIA_NEGATIVA_MAXIMA, canalesSinRecorrido } from "./facs.js";
import { DetectorFasico } from "./microexpresiones.js";
import { imagen } from "./pictogramas.js";

/* Duracion minima de la linea base.
   Baja de 5 s a 3 s. El numero de muestras, no el tiempo, es lo que sostiene la
   mediana y la MAD, y ese minimo no se toca. Los segundos solo servian para que
   la referencia abarcara algo de deriva lenta, y estirarlos con un nino delante
   no consigue mas deriva: consigue que se mueva, que es justo lo que contamina
   la referencia. La quietud medida sigue avisando si eso pasa. */
const SEGUNDOS_LINEA_BASE = 3;
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

/* Mostrar u ocultar el aviso de calibracion.
   Marca tambien el cuerpo, para que el tablero reserve el alto de la tira y la
   ultima fila de pictogramas no quede por debajo de ella. La tira no captura
   toques, pero taparla visualmente es igual de malo si el nino no ve lo que
   quiere tocar. */
function avisoCalibracion(visible) {
  el("aviso-base").hidden = !visible;
  document.body.classList.toggle("calibrando", visible);
}
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
  ventanaSoloMedidos: new Ventana(5, 0.4, 1500),
  suavizador: new Suavizador(),
  estabilizador: new Estabilizador({ dwellMs: 500, factorRetroceso: 0.5 }),
  /* Clasificador paralelo que ignora los canales cuyo ruido basal no se pudo
     medir. No controla la interfaz: cuantifica la sensibilidad del resultado a
     la sustitución de dispersión y se guarda como procedencia científica. */
  suavizadorSoloMedidos: new Suavizador(),
  estabilizadorSoloMedidos: new Estabilizador({ dwellMs: 500, factorRetroceso: 0.5 }),
  centroSoloMedidos: 0,
  estadoSoloMedidos: null,
  comparacionesCalibracion: 0,
  discrepanciasCalibracion: 0,
  ultimoFotograma: 0,
  ultimaCaptura: 0,
  frontalidadDetalle: null,
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
  refrescarAsociacion();

  el("entorno").textContent = [
    window.isSecureContext ? "conexión segura" : "CONEXIÓN NO SEGURA — la cámara no funcionará",
    navigator.mediaDevices?.getUserMedia ? "cámara expuesta" : "CÁMARA NO DISPONIBLE en este navegador",
  ].join(" · ");

  try {
    const cam = await face.openCamera(video);
    /* La proporcion del recuadro se toma de lo que el dispositivo entrego, no
       de lo que se le pidio: el telefono suele negociar otra distinta y forzar
       la solicitada recorta la imagen de forma desigual. */
    if (cam.ancho && cam.alto) {
      document.documentElement.style.setProperty("--proporcion-camara", `${cam.ancho} / ${cam.alto}`);
    }
    el("preview").hidden = false;
    chip("Cargando modelo…", "chip-espera");
    await face.init((t) => chip(t, "chip-espera"));

    estado.analisisActivo = true;
    estado.baseIniciada = 0;   // lo fija la primera marca de captura
    el("preview-base").hidden = false;
    avisoCalibracion(true);
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
    const fr = r ? frontalidad(r.landmarks, r.matrix) : null;
    if (r) {
      /* Se guardan las dos medidas: si difieren mucho, la geometrica esta
         siendo enganada por la posicion de la cara en el encuadre, que es
         justo lo que dejaba la calibracion clavada en un telefono. */
      const g = frontalidadGeometrica(r.landmarks);
      estado.frontalidadDetalle =
        `matriz ${Math.round(fr * 100)} % · geométrica ${Math.round(g * 100)} %` +
        `${r.matrix ? "" : " (sin matriz)"}`;
    }
    if (fr !== null) el("frontalidad").textContent = Math.round(fr * 100) + " %";
    if (r && fr >= FRONTALIDAD_BASE) {
      estado.lineaBase.agregar(extract(r.blendshapes));
      estado.baseAU.agregar(extraerAU(r.blendshapes));
    }
    /* El origen se fija con la PRIMERA marca de captura, no con
       performance.now().

       La especificacion dice que `captureTime` comparte origen con
       performance.now(), pero en la practica no siempre es asi: en un telefono
       puede venir de otro reloj. Al restar dos relojes distintos el tiempo
       transcurrido sale negativo o disparatado, con lo que la condicion de
       cierre no se cumple NUNCA y la calibracion se queda acumulando muestras
       para siempre. Se vio en un telefono: 56 muestras sobre un minimo de 15 y
       la barra sin avanzar, y el tope de quince segundos tampoco saltaba porque
       se compara contra el mismo numero.

       Tomando el origen de la primera marca recibida, ambos extremos de la resta
       vienen del mismo reloj y da igual cual sea. */
    if (!estado.baseIniciada) estado.baseIniciada = tCaptura;
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
    el("aviso-unidad").textContent = n === 1 ? " muestra" : " muestras";

    const porMuestras = n >= MUESTRAS_MINIMAS_BASE && transcurrido >= SEGUNDOS_LINEA_BASE;
    const porTope = transcurridoMs >= MS_TOPE_CALIBRACION && n >= MUESTRAS_ACEPTABLES_BASE;

    if (transcurridoMs >= MS_TOPE_CALIBRACION && n < MUESTRAS_ACEPTABLES_BASE) {
      // Ni siquiera lo mínimo: se explica el motivo y se sigue solo con tablero.
      estado.analisisActivo = false;
      chip("Sin línea base", "chip-error");
      avisoCalibracion(false);
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
      /* La escala del compuesto se mide sobre las mismas muestras de reposo, en
         lugar de suponerla a partir de los pesos. Ver `calibrarNorma`. */
      calibrarNorma(estado.lineaBase.muestrasNormalizadas());
      estado.centroSoloMedidos = centroNorma(
        estado.lineaBase.muestrasNormalizadas({ excluirSupuestos: true })
      );
      estado.detector.reiniciar();
      estado.estabilizador.reiniciar();
      estado.estabilizadorSoloMedidos.reiniciar();
      estado.suavizadorSoloMedidos.reiniciar();
      store.cerrarSesion(estado.sesionId, null);
      /* VERSION DE REGLAS. La versión 10 añade el clasificador paralelo que
         excluye canales con dispersión supuesta. La vía operativa conserva la
         versión 9; la marca impide analizar registros nuevos como si carecieran
         de esa comprobación de sensibilidad. */
      store.crearSesion({ ...base, au: baseAU }, {
        versionReglas: 10,
        /* Solo el centro: con cada lado promediado no queda escala que elegir. */
        norma: { centro: NORMA.centro, centroSoloMedidos: estado.centroSoloMedidos },
      }).then((id) => (estado.sesionId = id));
      el("sigma-base").textContent = base.muestras + " muestras";
      el("preview-base").hidden = true;
      avisoCalibracion(false);

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
      estado.suavizadorSoloMedidos.reiniciar();
      estado.comparacionesCalibracion = 0;
      estado.discrepanciasCalibracion = 0;
    }
    return face.programarFotograma(video, bucle);
  }

  estado.fotogramas++;
  if (!r) {
    estado.ventana.agregarSinRostro();
    estado.ventanaSoloMedidos.agregarSinRostro();
    estado.suavizador.reiniciar();
    estado.suavizadorSoloMedidos.reiniciar();
    estado.ultimoFotograma = 0;
    aplicarHeuristica(null);
    if (tocaPintar(tCaptura)) pintarPanel(null, null, null, null);
  } else {
    const frente = frontalidad(r.landmarks, r.matrix);
    if (frente < FRONTALIDAD_MINIMA) {
      // Rostro presente pero girado: se descarta antes de clasificar.
      estado.descartadosPorPose++;
      estado.ventana.agregarDescartado();
      estado.ventanaSoloMedidos.agregarDescartado();
      estado.suavizador.reiniciar();
      estado.suavizadorSoloMedidos.reiniciar();
      estado.ultimoFotograma = 0;
      aplicarHeuristica(null);
      if (tocaPintar(tCaptura)) pintarPanel(null, null, r.blendshapes, frente);
    } else {
      estado.conRostro++;
      const ahora = tCaptura;
      const dtMs = estado.ultimoFotograma ? Math.min(200, ahora - estado.ultimoFotograma) : 33;
      estado.ultimoFotograma = ahora;

      const crudas = extract(r.blendshapes);
      const norm = estado.lineaBase.normalizar(crudas);
      const normSoloMedidos = estado.lineaBase.normalizar(crudas, { excluirSupuestos: true });

      /* VÍA FÁSICA — corre en paralelo y NO comparte nada con la tónica salvo
         el fotograma. Se le entrega la puntuación z SIN suavizar: el suavizado
         es precisamente lo que borra los transitorios que este camino busca. */
      const au = extraerAU(r.blendshapes);
      estado.perfil.agregar(au);
      /* Maximo alcanzado por cada unidad de accion en la sesion. Es lo unico que
         hace falta para saber si un canal esta muerto, y cuesta una comparacion
         por fotograma en lugar de guardar la serie entera. */
      estado.topeAU ??= {};
      for (const c of CANALES_AU) {
        if ((au[c] ?? 0) > (estado.topeAU[c] ?? 0)) estado.topeAU[c] = au[c];
      }
      /* Recorrido de LOS 52 blendshapes, no solo de los que hoy se usan.
         Averiguar que unidades de accion faltaban exigio comparar a mano el
         catalogo del modelo contra el codigo. Registrando el maximo de cada
         coeficiente, la propia sesion dice cuales tienen recorrido en este
         equipo y con este rostro, y cual de ellos valdria la pena incorporar.
         Cuesta una comparacion por coeficiente y por fotograma. */
      estado.topeBS ??= {};
      for (const k in r.blendshapes) {
        if (r.blendshapes[k] > (estado.topeBS[k] ?? 0)) estado.topeBS[k] = r.blendshapes[k];
      }
      const zAU = estado.baseAU.normalizar(au);
      for (const ev of estado.detector.agregar(zAU, ahora)) {
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
      const cSoloMedidos = clasificar(normSoloMedidos, {
        suavizador: estado.suavizadorSoloMedidos,
        estabilizador: estado.estabilizadorSoloMedidos,
        dtMs,
      });
      estado.estadoSoloMedidos = cSoloMedidos.estado;
      estado.comparacionesCalibracion++;
      if (cSoloMedidos.estado !== c.estado) estado.discrepanciasCalibracion++;
      estado.ventana.agregar(c.estado, c.puntaje, ahora);
      estado.ventanaSoloMedidos.agregar(cSoloMedidos.estado, cSoloMedidos.puntaje, ahora);

      // Vector crudo para reanálisis posterior (RF-31).
      if (ahora - estado.ultimaMuestra >= MS_MUESTRA) {
        estado.ultimaMuestra = ahora;
        /* Se refina la dispersion con esta misma cadencia espaciada, y no con
           cada fotograma, porque fotogramas consecutivos aportan copias
           correlacionadas del mismo instante en lugar de informacion nueva.
           Si la estimacion cambia, la escala del compuesto se recalibra con
           ella para que ambas sigan describiendo la misma distribucion. */
        if (estado.lineaBase.refinar(crudas)) {
          /* Estas muestras SI recorren la sesion, de modo que la escala medida
             sobre ellas es aceptable. La de la calibracion no lo era. */
          calibrarNorma(estado.lineaBase.muestrasNormalizadas());
          estado.centroSoloMedidos = centroNorma(
            estado.lineaBase.muestrasNormalizadas({ excluirSupuestos: true })
          );
        }
        estado.baseAU.refinar(au);
        store.guardarMuestra({
          sesionId: estado.sesionId,
          ts: Date.now(),
          caracteristicas: crudas,
          /* Sin el vector de AU no se puede reanalizar la via fasica de una
             sesion ya grabada, que es exactamente lo que pide RF-31. Guardar
             solo las siete caracteristicas tonicas dejaba fuera los dieciseis
             canales sobre los que trabaja el detector de transitorios. */
          au,
          /* EVIDENCIA FACS PUBLICADA, EN PARALELO Y NO COMO CLASIFICADOR.
             El estado operativo sale del compuesto ponderado de las siete AU
             tonicas. Estas dos combinaciones son las que la literatura define
             —Duchenne para el positivo, Prkachin y Solomon para el negativo— y
             se registran para poder contrastarlas despues contra el compuesto.

             No sustituyen al clasificador, y la razon esta medida: sobre las
             muestras ya registradas, la correlacion de rangos entre ambos
             compuestos es 0,047. Ordenan los fotogramas de forma distinta, de
             modo que cambiar de uno a otro no seria un ajuste sino otro
             sistema. Cual describe mejor a este participante es una pregunta
             empirica, y para responderla hay que haber guardado los dos.

             Se guardan sobre las AU crudas, que es como las definen sus
             fuentes, y sobre la puntuacion z, que es lo unico comparable con
             el compuesto. Sin las dos versiones el contraste no se puede hacer. */
          evidencia: {
            crudaPositiva: Number(evidenciaPositiva(au).duchenne.toFixed(4)),
            /* Normalizada a [0,1] por su cota superior: los tres terminos van
               en [0,1] por ser blendshapes, asi que la suma llega a tres. Sin
               dividir, el valor no es comparable con la evidencia positiva,
               que si esta acotada a la unidad. */
            crudaNegativa: Number((evidenciaNegativa(au).total / EVIDENCIA_NEGATIVA_MAXIMA).toFixed(4)),
            zPositiva: Number(evidenciaPositiva(zAU).duchenne.toFixed(4)),
            /* Lo que segun Girard et al. (2021) si predice: la intensidad.
               `zPositiva` queda como descripcion de la configuracion, y vale
               cero en dispositivos sin AU6. */
            zIntensidadSonrisa: Number(evidenciaPositiva(zAU).intensidad.toFixed(4)),
            zNegativa: Number(evidenciaNegativa(zAU).total.toFixed(4)),
          },
          /* ASIMETRIA IZQUIERDA-DERECHA DE LAS AU QUE MEDIAPIPE LATERALIZA.
             FACS distingue las acciones unilaterales de las bilaterales, y la
             distincion no es cosmetica: una activacion marcadamente asimetrica
             se asocia a expresion deliberada o social mas que a espontanea.
             Como este trabajo intenta registrar senal espontanea en un
             participante que expresa poco, poder separar ambas cosas importa.
             `asimetria()` estaba escrita y documentada desde el principio pero
             no la invocaba nadie, de modo que la distincion no existia en el
             registro. Se guardan solo las AU con valencia declarada; las que
             MediaPipe no lateraliza devuelven nulo y se omiten. */
          asimetria: Object.fromEntries(
            CANALES_AU.map((c) => [c, asimetria(r.blendshapes, c)])
              .filter(([, v]) => v !== null)
              .map(([c, v]) => [c, Number(v.toFixed(3))])
          ),
          frontalidad: Number(frente.toFixed(3)),
          puntaje: Number(c.puntaje.toFixed(4)),
          estado: c.estado,
          sensibilidadCalibracion: {
            estadoSoloMedidos: cSoloMedidos.estado,
            puntajeSoloMedidos: Number(cSoloMedidos.puntaje.toFixed(4)),
            discrepa: cSoloMedidos.estado !== c.estado,
            calidad: estado.lineaBase.calidadCalibracion,
          },
        });
      }

      aplicarHeuristica(c.estado);
      consultarSegundaOpinion(r.landmarks, c.estado);
      persistirMetricas(ahora);

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

/* Version del service worker que esta sirviendo, para el panel. */
let versionSW = "?";
navigator.serviceWorker?.addEventListener?.("message", (e) => {
  if (e.data?.version) { versionSW = e.data.version; }
});
navigator.serviceWorker?.ready?.then((r) => r.active?.postMessage("version")).catch(() => {});

function diagTexto() {
  const d = face.diagnostico;
  /* La diferencia entre el reloj de captura y performance.now(). Si no es
     cercana a cero, los dos relojes no comparten origen y cualquier resta que
     los mezcle esta mal. Fue la causa de que la calibracion no terminara. */
  if (estado.ultimaCaptura) {
    d.desfaseReloj = Math.round(estado.ultimaCaptura - performance.now());
  }
  const partes = [
    /* La version que sirve el service worker, a la vista. Durante la depuracion
       hubo que exportar los datos y deducir que codigo corria en el telefono
       por los campos presentes en el JSON, porque no habia forma de verlo. */
    `versión ${versionSW}`,
    `video ${video.videoWidth}×${video.videoHeight}`,
    `delegado ${d.delegado ?? "—"}`,
    `llamadas ${d.llamadas}`,
    `detecciones ${d.detecciones}`,
    `descartados por pose ${estado.descartadosPorPose}`,
    `dwell ${Math.round(estado.estabilizador.progresoCambio * 100)} %`,
    `segunda opinión ${segunda.estado.disponible ? segunda.estado.evaluaciones : 'no disponible'}`,
    `reloj ${d.reloj ?? "—"}${d.desfaseReloj !== undefined ? ` (desfase ${d.desfaseReloj} ms)` : ""}`,
    `frontalidad ${estado.frontalidadDetalle ?? "—"}`,
    (() => {
      const t = face.tiempos();
      return t.inferenciaMs
        ? `inferencia ${t.inferenciaMs} ms · entrega ${t.entregaMs} ms · ocupación ${t.ocupacion}`
        : "inferencia —";
    })(),
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
  const calidad = estado.lineaBase.calidadCalibracion;
  if (calidad) {
    el("canales-medidos").textContent =
      `${calidad.canalesMedidos}/${calidad.canalesTotales}`;
    el("canales-medidos").title = calidad.listaSupuestos.length
      ? `Dispersión sustituida: ${calidad.listaSupuestos.join(", ")}`
      : "Todos los canales tienen dispersión medida.";
  }
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

/**
 * Estado del INSTRUMENTO al cierre de la sesion.
 *
 * Reune en un solo objeto lo que el objetivo especifico 5 pide evaluar —tasa de
 * deteccion facial, acuerdo entre clasificadores, latencia— junto a la
 * caracterizacion temporal de la via fasica, que condiciona que se puede
 * afirmar a partir de los eventos registrados.
 *
 * POR QUE SE GUARDA ESTO Y NO SOLO LOS DATOS
 * Un registro de eventos sin las condiciones en que se tomo no es interpretable
 * despues. Si en una sesion la camara dio 15 fps, los eventos de esa sesion no
 * son comparables con los de otra que dio 60, y sin este bloque no habria forma
 * de saberlo al analizar. Es la diferencia entre datos y datos con procedencia.
 */
function metricasSesion() {
  const m = estado.detector.metricas;
  const base = estado.baseAU.instantanea();
  return {
    /* Objetivo especifico 5 */
    fotogramas: estado.fotogramas,
    conRostro: estado.conRostro,
    tasaDeteccion: estado.fotogramas ? estado.conRostro / estado.fotogramas : null,
    descartadosPorPose: estado.descartadosPorPose,
    acuerdo: estado.acuerdo.instantanea(),
    segundaOpinionActiva: segunda.habilitada(),

    /* Procedencia tecnica: condiciona todo lo demas */
    delegado: face.diagnostico.delegado,
    versionAplicacion: versionSW,
    relojFotograma: face.diagnostico.reloj,
    resolucionCaptura: face.diagnostico.resolucion,
    /* RF-05 y objetivo 5: latencia de procesamiento, separada de la cadencia
       con que la camara entrega. Ver `face.tiempos`. */
    tiempos: face.tiempos(),
    /* Con que juego de restricciones se consiguio abrir la camara. Si hubo que
       bajar escalones, la cadencia obtenida es menor y con ella la resolucion
       temporal de esta sesion: es procedencia tecnica, igual que el delegado. */
    restriccionCamara: face.diagnostico.restriccion,
    contextos: store.contextosActuales(),
    /* Fraccion de recortes que el segundo clasificador pudo alinear. */
    alineacion: segunda.alineacionSesion(),
    /* Linea base REFINADA. La que guarda `crearSesion` es una instantanea del
       momento del cierre, anterior a cualquier refinamiento, de modo que al
       analizar una sesion no se veia con que escala habia trabajado de verdad. */
    lineaBaseFinal: estado.lineaBase.instantanea(),
    norma: { centro: NORMA.centro, centroSoloMedidos: estado.centroSoloMedidos },
    sensibilidadCalibracion: {
      comparaciones: estado.comparacionesCalibracion,
      discrepancias: estado.discrepanciasCalibracion,
      proporcionDiscrepancia: estado.comparacionesCalibracion
        ? estado.discrepanciasCalibracion / estado.comparacionesCalibracion
        : null,
      estadoSoloMedidos: estado.estadoSoloMedidos,
      calidad: estado.lineaBase.calidadCalibracion,
    },
    /* Unidades de accion que este dispositivo no llego a producir. Sin esto, un
       blendshape que devuelve cero se lee sin error y contamina en silencio toda
       formula que lo use: el indice de Duchenne quedo identicamente nulo durante
       sesiones enteras sin que nada lo advirtiera. */
    auSinRecorrido: canalesSinRecorrido(estado.topeAU ? [estado.topeAU] : []),
    topeAU: estado.topeAU ?? null,
    /* Maximo de cada uno de los 52 coeficientes: dice que musculos tiene a su
       alcance este equipo, mas alla de los que el compuesto usa hoy. */
    topeBlendshapes: estado.topeBS ?? null,

    /* Caracterizacion temporal de la via fasica */
    fasico: {
      calibrado: m.calibrado,
      fps: m.fps,
      resolucionMs: m.resolucionMs,
      cegueraEkmanPct: m.cegueraEkmanPct,
      canalesUtiles: m.canalesUtiles,
      canalesTotales: m.canalesTotales,
      canalesConUmbralSupuesto: m.canalesConUmbralSupuesto,
      eventosTotales: m.eventosTotales,
      eventosLimpios: m.eventosLimpios,
      porBanda: m.porBanda,
      descartadosPorResolucion: m.descartadosPorResolucion,
      marcadosComoParpadeo: m.marcadosComoParpadeo,
    },

    /* Cuanto se movio de hecho cada musculo, contra el ruido de su canal. Es lo
       que permite distinguir «no expreso» de «no se pudo medir». */
    expresividad: base ? estado.perfil.resumen(base.sigma) : null,
    canalesResueltos: base ? estado.perfil.canalesResueltos(base.sigma) : null,
  };
}

/**
 * Persiste las metricas sin esperar a que la sesion termine.
 *
 * Las sesiones no siempre se cierran: en el registro exportado el 24-08-2026,
 * varias de las 22 quedaron sin `fin` y por tanto sin metricas. En una tablet lo
 * normal es que la pestana se cierre o el sistema descarte la pagina, y ahi no
 * hay garantia de que una escritura a IndexedDB llegue a completarse. Escribir
 * cada tanto durante la sesion convierte esa perdida total en, como mucho, la
 * perdida de los ultimos segundos.
 */
const MS_METRICAS = 10000;
let ultimaEscrituraMetricas = 0;

function persistirMetricas(ahora) {
  if (!estado.sesionId) return;
  if (ahora - ultimaEscrituraMetricas < MS_METRICAS) return;
  ultimaEscrituraMetricas = ahora;
  store.actualizarMetricas(estado.sesionId, metricasSesion());
}

/* Ultimo intento al salir. `pagehide` es el evento que si se dispara en iOS y
   Android cuando la pagina se descarta; `beforeunload` no es fiable ahi. */
addEventListener("pagehide", () => {
  if (estado.sesionId) store.actualizarMetricas(estado.sesionId, metricasSesion());
});

/* ══════════════════════ Selección ══════════════════════ */

const tablero = new Tablero(el("tablero"), async (picto, _cat, eraSugerido) => {
  const d = estado.ventana.distribucion();
  const dSoloMedidos = estado.ventanaSoloMedidos.distribucion();
  const latencia = performance.now() - estado.ultimaSeleccion;
  estado.ultimaSeleccion = performance.now();

  /* LA CONFIRMACION MUESTRA EL MISMO DIBUJO QUE LA TECLA.
     Antes ponia el emoji de respaldo, de modo que el nino tocaba un pictograma
     de ARASAAC y la ampliacion le devolvia otra imagen distinta. Para quien
     esta aprendiendo el tablero eso no es una inconsistencia de estilo: la
     ampliacion existe para confirmar que se selecciono, y confirmar con un
     dibujo que no es el que se toco no confirma nada. Se sigue la misma regla
     que el tablero, con el emoji solo cuando no hay imagen. */
  const dibujo = imagen(picto.clave);
  el("salida-icono").innerHTML = dibujo
    ? `<img src="${dibujo}" alt="" draggable="false" decoding="async">`
    : picto.icono;
  el("salida-frase").textContent = picto.frase;
  el("salida-estado").textContent = !estado.analisisActivo
    ? ""
    : d.suficiente
      ? resumenVentana(d)
      : "No se reunieron datos faciales suficientes en los segundos previos.";
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
    /* Sensibilidad a la única sustitución estadística de la vía tónica. La
       categoría paralela no se muestra al participante ni reordena el tablero. */
    sensibilidadCalibracion: {
      estadoSoloMedidos: estado.estadoSoloMedidos,
      predominanteSoloMedidos: dSoloMedidos.suficiente ? dSoloMedidos.predominante : null,
      puntajePromedioSoloMedidos: dSoloMedidos.suficiente ? dSoloMedidos.puntajePromedio : null,
      discrepaPredominante: d.suficiente && dSoloMedidos.suficiente
        ? d.predominante !== dSoloMedidos.predominante
        : null,
      comparaciones: estado.comparacionesCalibracion,
      discrepancias: estado.discrepanciasCalibracion,
      proporcionDiscrepancia: estado.comparacionesCalibracion
        ? estado.discrepanciasCalibracion / estado.comparacionesCalibracion
        : null,
      calidad: estado.lineaBase.calidadCalibracion,
    },
    contextos: store.contextosActuales(),
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
/**
 * Resumen de la ventana previa a una selección.
 *
 * POR QUE ACOMPANA LA TENDENCIA ESCALAR
 * Las proporciones cuentan ETIQUETAS, y una etiqueta descarta la posición del
 * compuesto dentro de su banda. Una ventana sostenida en −0,70, al borde mismo
 * del corte, y otra en 0,00, en el centro exacto del reposo, se reportaban las
 * dos como «neutro 100 %». La información estaba —`puntajePromedio` se calcula
 * y se devuelve— pero no llegaba a la pantalla.
 *
 * Ese resumen escalar es lo que pide RF-17, y es también lo que permite a la
 * persona cuidadora distinguir un neutro franco de uno que se inclina. Se
 * presenta con signo y con el nombre del lado al que tiende, porque un número
 * suelto no dice nada a quien no conoce la escala.
 */
function resumenVentana(d) {
  const pct = Math.round(d.proporciones[d.predominante] * 100);
  const p = d.puntajePromedio ?? 0;

  /* La inclinacion se dice con palabras y el numero va detras, entre parentesis.
     Quien cuida al participante necesita entender la frase sin conocer la
     escala; quien analiza despues necesita el valor. Caben las dos cosas. */
  const inclinacion =
    Math.abs(p) < 0.15
      ? "sin inclinarse hacia ningún lado"
      : `con una inclinación hacia el lado ${p < 0 ? "negativo" : "positivo"} (${p.toFixed(2)})`;

  /* Cuando hubo expresion sostenida se nombra primero, porque es lo que la
     persona cuidadora esta buscando saber. */
  if (d.expresivo && d.proporcionExpresiva >= 0.25) {
    const pe = Math.round(d.proporcionExpresiva * 100);
    return `En los segundos previos predominó el estado ${d.expresivo}, ` +
           `durante el ${pe} % del tiempo, ${inclinacion}.`;
  }

  if (d.predominante === "neutro") {
    return pct >= 95
      ? `El rostro se mantuvo en reposo durante los segundos previos, ${inclinacion}.`
      : `El rostro estuvo en reposo el ${pct} % de los segundos previos, ${inclinacion}.`;
  }

  return `En los segundos previos predominó el estado ${d.predominante}, ` +
         `durante el ${pct} % del tiempo, ${inclinacion}.`;
}

el("mensaje-salida").addEventListener("click", () => {
  clearTimeout(estado.temporizadorSalida);
  el("mensaje-salida").hidden = true;
});

/* ══════════════════════ Panel del cuidador ══════════════════════ */

/**
 * El panel tiene dos modos y el modo va en la RUTA.
 *
 *   #panel            acoplado  — fijo al costado, el lienzo se estrecha
 *   #panel-flotante   flotante  — superpuesto con velo, como antes
 *   (sin hash)        cerrado
 *
 * Ponerlo en la ruta y no en una variable tiene dos ventajas concretas.
 * Sobrevive a una recarga, que durante el desarrollo se hace constantemente, y
 * permite abrir la aplicacion directamente en el estado que se necesita sin
 * tener que tocar nada en la pantalla.
 *
 * Acoplado no lleva velo: el tablero sigue siendo utilizable mientras se mira
 * la instrumentacion, que es justamente para lo que sirve.
 */
let observaciones = 0;
const condicionesObservacion = new Set();
const RUTAS = { "#panel": "acoplado", "#panel-flotante": "flotante" };
const HASH_DE = { acoplado: "#panel", flotante: "#panel-flotante" };

const modoPanel = () => RUTAS[location.hash] ?? null;

/* Preferencia de la persona cuidadora: si al abrir el panel debe quedar fijo al
   costado o superpuesto. Se recuerda entre sesiones porque es una preferencia de
   trabajo, no algo que se decida cada vez. */
const CLAVE_FIJO = "mirame.panelFijo";
const prefiereFijo = () => localStorage.getItem(CLAVE_FIJO) !== "0";
const guardarPreferencia = (fijo) => localStorage.setItem(CLAVE_FIJO, fijo ? "1" : "0");

function abrirPanel(abierto, modo = null) {
  const acoplado = abierto && (modo ?? modoPanel()) === "acoplado";
  estado.panelAbierto = abierto;
  estado.ultimoPanel = 0;
  el("panel").hidden = !abierto;
  el("velo").hidden = !abierto || acoplado;
  document.body.classList.toggle("panel-acoplado", acoplado);
  el("btn-panel").setAttribute("aria-expanded", String(abierto));
}

/* La ruta manda: al cargar y en cada cambio de hash. */
function aplicarRuta() {
  const m = modoPanel();
  abrirPanel(Boolean(m), m);
  mostrarObservacion(location.hash === "#observacion");
  /* El interruptor refleja el estado real, venga de donde venga: del propio
     interruptor, de la URL escrita a mano o de una recarga. */
  const casilla = el("panel-fijo");
  if (casilla) casilla.checked = m ? m === "acoplado" : prefiereFijo();
}
addEventListener("hashchange", aplicarRuta);

/* El boton escribe la ruta y deja que `hashchange` haga el resto, para que el
   estado del panel y la URL no se puedan desincronizar. */
el("btn-panel").addEventListener("click", () => {
  if (!el("panel").hidden) return cerrarPanel();
  const destino = HASH_DE[prefiereFijo() ? "acoplado" : "flotante"];
  /* SI EL HASH YA ES EL DESTINO, ASIGNARLO NO DISPARA `hashchange`.
     Esa era la causa de que el boton no abriera «a veces». Bastaba con que algo
     hubiera ocultado el panel sin limpiar la ruta —lo hacia `reiniciarCalibracion`—
     para que el hash quedara en «#panel» con el panel cerrado. A partir de ahi,
     pulsar el boton reescribia el mismo valor, el navegador no emitia el evento
     y no ocurria nada. Se aplica la ruta a mano en ese caso, igual que hace el
     interruptor de fijado. */
  if (location.hash === destino) aplicarRuta();
  else location.hash = destino;
});

/* Fijar o soltar el panel sin cerrarlo: se reescribe la ruta y `hashchange`
   hace el resto, igual que el boton. */
el("panel-fijo").addEventListener("change", (e) => {
  const fijo = e.target.checked;
  guardarPreferencia(fijo);
  const destino = HASH_DE[fijo ? "acoplado" : "flotante"];
  if (location.hash === destino) aplicarRuta();
  else location.hash = destino;
});

function cerrarPanel() {
  if (location.hash) location.hash = "";
  else aplicarRuta();
}
el("btn-cerrar-panel").addEventListener("click", cerrarPanel);
el("velo").addEventListener("click", cerrarPanel);
document.addEventListener("keydown", (e) => e.key === "Escape" && cerrarPanel());

aplicarRuta();

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
/* ══════════════════════ Observación independiente (RF-29) ══════════════════════
   La vista cubre por completo la salida del sistema. Las transiciones de perfil
   y los eventos observables se guardan con reloj civil y monotónico para poder
   alinearlos después sin enseñar a la observadora qué clasificó la máquina. */
function mostrarObservacion(activa) {
  const vista = el("observacion");
  if (!vista) return;
  vista.hidden = !activa;
  if (activa) {
    observaciones = 0;
    el("obs-cuenta").textContent = "Sin marcas todavía.";
  }
}

for (const b of document.querySelectorAll("#observacion [data-obs]")) {
  b.addEventListener("click", async () => {
    if (!estado.sesionId) {
      el("obs-cuenta").textContent = "La sesión todavía no está disponible.";
      return;
    }
    const tipo = b.dataset.obsTipo;
    const activo = tipo === "condicion"
      ? !condicionesObservacion.has(b.dataset.obs)
      : null;
    if (tipo === "condicion") {
      if (activo) condicionesObservacion.add(b.dataset.obs);
      else condicionesObservacion.delete(b.dataset.obs);
    }
    await store.guardarObservacion({
      sesionId: estado.sesionId,
      tMonotonicMs: Number(performance.now().toFixed(1)),
      tipo,
      valor: b.dataset.obs,
      ...(tipo === "condicion" ? { activo } : {}),
      contextos: store.contextosActuales(),
    });
    observaciones++;
    el("obs-cuenta").textContent =
      observaciones === 1 ? "1 marca registrada." : `${observaciones} marcas registradas.`;

    if (tipo === "perfil") {
      for (const o of document.querySelectorAll("#obs-perfiles [data-obs]")) {
        o.classList.toggle("obs-activo", o === b);
      }
    } else {
      b.classList.toggle("obs-activo", activo);
    }
  });
}

el("obs-salir").addEventListener("click", async () => {
  /* Cierra los intervalos que hayan quedado activos para que el análisis no
     tenga que adivinar si la condición continuó hasta el final de la sesión. */
  for (const valor of condicionesObservacion) {
    await store.guardarObservacion({
      sesionId: estado.sesionId,
      tMonotonicMs: Number(performance.now().toFixed(1)),
      tipo: "condicion",
      valor,
      activo: false,
      cierreAutomatico: true,
      contextos: store.contextosActuales(),
    });
  }
  condicionesObservacion.clear();
  for (const b of document.querySelectorAll("#observacion [data-obs-tipo='condicion']")) {
    b.classList.remove("obs-activo");
  }
  location.hash = "";
  mostrarObservacion(false);
});

/* Marcado de segmentos (RF-28). Lo que la persona observadora ve, junto a lo
   que el sistema mide, para poder contrastarlos despues. */
for (const b of document.querySelectorAll("#segmentos button")) {
  b.addEventListener("click", () => {
    const etq = store.marcarSegmento(b.dataset.seg);
    for (const o of document.querySelectorAll("#segmentos button")) {
      o.classList.toggle("seg-activo", o.dataset.seg === (etq ?? ""));
    }
    el("segmento-activo").textContent = etq ? `Marcando: ${etq}` : "Sin marcar";
  });
}

/* Condiciones contextuales concurrentes (RF-28). Se adjuntan a las muestras y
   selecciones, pero nunca alteran el clasificador. */
for (const b of document.querySelectorAll("#contextos button")) {
  b.addEventListener("click", () => {
    const activos = store.marcarContexto(b.dataset.ctx);
    for (const o of document.querySelectorAll("#contextos button")) {
      o.classList.toggle("seg-activo", activos.includes(o.dataset.ctx));
    }
    el("contextos-activos").textContent = activos.length
      ? `Contexto: ${activos.join(", ")}.`
      : "Sin condiciones marcadas.";
  });
}

/**
 * Acusa recibo de una accion del panel.
 *
 * POR QUE HACE FALTA
 * Al pasar los botones a icono se quedaron sin ninguna respuesta visible.
 * Exportar descarga un archivo que el navegador puede guardar sin avisar, y
 * borrar solo cambia cifras que estaban en cero. Un boton que funciona pero no
 * acusa recibo se siente averiado, y asi se reporto: «los toco y no hacen
 * nada». Hacian su trabajo; lo que faltaba era decirlo.
 */
let temporizadorAccion = null;
function avisarAccion(texto) {
  const p = el("acciones-estado");
  if (!p) return;
  p.textContent = texto;
  clearTimeout(temporizadorAccion);
  temporizadorAccion = setTimeout(() => (p.textContent = ""), 3200);
}

el("btn-recalibrar").addEventListener("click", () => {
  /* Sin camara no hay nada que recalibrar, y callarse deja al boton pareciendo
     roto justo cuando el motivo es otro. */
  if (!video.srcObject) return avisarAccion("No hay cámara activa: no hay línea base que recalibrar.");
  reiniciarCalibracion();
  avisarAccion("Tomando otra vez la línea base.");
});

/**
 * Vuelve a tomar la linea base desde cero y reanuda el bucle de fotogramas.
 */
function reiniciarCalibracion() {
  estado.lineaBase = new LineaBase();
  estado.suavizador.reiniciar();
  estado.estabilizador.reiniciar();
  estado.suavizadorSoloMedidos.reiniciar();
  estado.estabilizadorSoloMedidos.reiniciar();
  estado.centroSoloMedidos = 0;
  estado.estadoSoloMedidos = null;
  estado.comparacionesCalibracion = 0;
  estado.discrepanciasCalibracion = 0;
  estado.ventana = new Ventana(5, 0.4, 1500);
  estado.ventanaSoloMedidos = new Ventana(5, 0.4, 1500);
  estado.baseAU = new LineaBase(CANALES_AU);
  estado.detector.reiniciar();
  estado.perfil = new PerfilExpresividad();
  estado.baseIniciada = 0;   // lo fija la primera marca de captura
  estado.analisisActivo = true;
  estado.fotogramas = 0;
  estado.conRostro = 0;
  estado.descartadosPorPose = 0;
  el("quietud").textContent = "—";
  el("canales-medidos").textContent = "—";
  el("estado-base").textContent = "0/" + MUESTRAS_MINIMAS_BASE;
  el("preview-base").hidden = false;
  avisoCalibracion(true);
  /* Se cierra por la ruta y no ocultando el panel a mano: dejar el hash apuntando
     a un panel cerrado desincroniza el estado y el boton deja de responder. */
  cerrarPanel();
  face.programarFotograma(video, bucle);
}

/**
 * Recupera la camara al volver de segundo plano.
 *
 * EL FALLO QUE CORRIGE
 * Android le quita la camara a la aplicacion cuando pasa a segundo plano. Al
 * volver, `video.srcObject` sigue apuntando al mismo objeto, pero sus pistas
 * quedaron en `ended`: no llegan mas fotogramas, `requestVideoFrameCallback` no
 * se vuelve a disparar y el bucle muere en silencio. La pantalla se queda
 * congelada en la cuenta de calibracion que llevaba —«Calibrando 6/15»— sin
 * ningun error visible, y la unica salida era cerrar y volver a abrir.
 *
 * POR QUE SE REINICIA LA LINEA BASE Y NO SE CONTINUA
 * No es solo prudencia. Entre la interrupcion y el regreso la persona pudo
 * moverse, cambiar de postura o de distancia a la camara, de modo que su reposo
 * ya no es el mismo. Mezclar en una sola linea base fotogramas de antes y de
 * despues produciria una referencia que no describe ninguno de los dos
 * momentos, y todas las puntuaciones z de la sesion se calcularian contra ella.
 * Reiniciar cuesta tres segundos; arrastrar una referencia contaminada
 * invalidaria la sesion entera sin avisar.
 */
async function reconectarCamara() {
  if (!estado.analisisActivo || face.camaraViva(video)) return;
  chip("Recuperando la cámara…", "chip-espera");
  try {
    face.cerrarCamara(video);
    const cam = await face.openCamera(video);
    if (cam.ancho && cam.alto) {
      document.documentElement.style.setProperty("--proporcion-camara", `${cam.ancho} / ${cam.alto}`);
    }
    chip(`Calibrando · ${cam.ancho}×${cam.alto}`, "chip-espera");
    reiniciarCalibracion();
  } catch (e) {
    chip(e.message, "chip-error");
  }
}

addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") reconectarCamara();
});

/**
 * Descarta el service worker y sus caches, y recarga.
 *
 * Una aplicacion instalada no ofrece recarga forzada como la del navegador, de
 * modo que si queda con archivos de dos versiones distintas no hay forma de
 * salir de ahi desde la propia pantalla. Este boton es esa salida.
 *
 * No toca IndexedDB: los registros de sesion son datos del participante y no
 * tienen nada que ver con la version del codigo.
 */
el("btn-actualizar").addEventListener("click", async (ev) => {
  const boton = ev.currentTarget;
  boton.disabled = true;
  /* Se avisa aparte y NO con `textContent`: el boton es ahora un icono, y
     escribirle texto encima borraria el SVG que lo identifica. */
  avisarAccion("Descartando la copia guardada y recargando…");
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const claves = await caches.keys();
    await Promise.all(claves.map((k) => caches.delete(k)));
  } catch (e) {
    /* Si algo de esto falla la recarga sigue valiendo la pena. */
  }
  location.reload();
});

/* ── Ajustes de voz ──────────────────────────────────────────────────────── */

function pintarControlesVoz() {
  const a = ajustes();
  const lista = voces();
  const actual = vozActual();
  el("voz-lista").innerHTML = lista.length
    ? lista
        .map((v) => `<option value="${v.name}"${v === actual ? " selected" : ""}>` +
                    `${v.name.replace(/^Microsoft /, "")} · ${v.lang}</option>`)
        .join("")
    : '<option value="">sin voces en español</option>';
  el("voz-tono").value = a.tono;
  el("voz-velocidad").value = a.velocidad;
  el("voz-tono-valor").textContent = Number(a.tono).toFixed(2);
  el("voz-velocidad-valor").textContent = Number(a.velocidad).toFixed(2);
}

/* La lista de voces suele llegar despues de cargar la pagina. */
alHaberVoces(pintarControlesVoz);
pintarControlesVoz();

el("voz-lista").addEventListener("change", (e) => {
  fijarAjustes({ voz: e.target.value || null });
  hablar("Hola, soy yo");
});
for (const [id, clave] of [["voz-tono", "tono"], ["voz-velocidad", "velocidad"]]) {
  el(id).addEventListener("input", (e) => {
    const v = Number(e.target.value);
    fijarAjustes({ [clave]: v });
    el(id + "-valor").textContent = v.toFixed(2);
  });
  /* Se prueba al soltar y no en cada paso del deslizador: hablar en cada
     movimiento encadena decenas de locuciones y no deja oir ninguna. */
  el(id).addEventListener("change", () => hablar("Quiero jugar"));
}
el("btn-probar-voz").addEventListener("click", () => hablar("Hola, quiero jugar"));

/* Los ajustes quedan guardados, asi que un valor probado en su momento sigue
   vigente aunque el valor por defecto del programa cambie. Esto lo devuelve. */
el("btn-voz-defecto").addEventListener("click", () => {
  localStorage.removeItem("mirame.voz");
  pintarControlesVoz();
  hablar("Hola, quiero jugar");
});

el("btn-exportar").addEventListener("click", async () => {
  const json = await store.exportarJSON();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = `mirame-sesiones-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  avisarAccion(`Registros exportados a ${a.download}`);
});

el("btn-borrar").addEventListener("click", async () => {
  if (!confirm("¿Borrar de forma definitiva todos los registros del dispositivo?")) return;
  await store.borrarTodo();
  for (const b of document.querySelectorAll("#segmentos button, #contextos button")) {
    b.classList.remove("seg-activo");
  }
  el("segmento-activo").textContent = "Sin marcar";
  el("contextos-activos").textContent = "Sin condiciones marcadas.";
  refrescarAsociacion();
  avisarAccion("Todos los registros fueron borrados.");
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

  // Cualquier pictograma del tablero es destino posible.
  const opciones = PICTOGRAMAS;
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
