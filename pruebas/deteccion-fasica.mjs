/**
 * Caracterización del detector fásico sobre señal sintética.
 *
 * POR QUÉ ESTA PRUEBA EXISTE
 * Un detector de microexpresiones no se puede validar mirando la pantalla: los
 * eventos que busca duran menos de lo que tarda un ojo en verlos, y con el
 * participante real no hay verdad de referencia contra la cual comprobar nada.
 * Sin una prueba como esta, decir «detecta microexpresiones» sería una
 * afirmación sin respaldo.
 *
 * Acá la verdad de referencia SÍ existe, porque la señal se construye: se sabe
 * exactamente cuántos transitorios hay, de qué duración y de qué amplitud. Eso
 * permite medir lo único que importa de un instrumento —qué detecta, qué se le
 * escapa, qué inventa y con cuánto error mide— antes de ponerlo delante de un
 * niño.
 *
 * Todas las cifras citadas en los comentarios de `js/microexpresiones.js` y de
 * `js/face.js` salen de acá y se reproducen con:
 *
 *     node pruebas/deteccion-fasica.mjs
 *
 * LO QUE ESTA PRUEBA NO ES
 * No es validación. El ruido sintético es gaussiano e independiente, y el ruido
 * real de MediaPipe no lo es: tiene deriva, correlación entre fotogramas y
 * dependencia de la pose y la iluminación. Los números de acá acotan el
 * comportamiento del algoritmo, no su desempeño con el participante. Esa es otra
 * medición y necesita datos reales.
 */

import { DetectorFasico } from "../js/microexpresiones.js";

/* Generador reproducible: la prueba tiene que dar lo mismo en cada corrida, o
   no sirve como evidencia de nada. */
function generador(semilla) {
  let s = semilla;
  const u = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

/**
 * Simula una sesión y devuelve el detector con sus eventos.
 *
 * Los transitorios tienen forma de arco de seno, no de escalón: un músculo tiene
 * inercia y no salta de reposo a contracción entre dos fotogramas. Un escalón
 * daría un detector artificialmente bueno.
 */
function simular({ fps, transitorios, segundos = 26, ruidoSd = 0.35, semilla = 42, kRuido = 3.0 }) {
  const gauss = generador(semilla);
  const dt = 1000 / fps;
  const det = new DetectorFasico({ canales: ["AU12", "AU43"], calentamientoMs: 5000, kRuido });

  for (let i = 0; i * dt < segundos * 1000; i++) {
    const t = i * dt;
    let au12 = gauss() * ruidoSd;
    for (const e of transitorios) {
      if (t >= e.t0 && t <= e.t0 + e.dur) {
        au12 += e.amp * Math.sin(Math.PI * ((t - e.t0) / e.dur));
      }
    }
    det.agregar({ AU12: au12, AU43: gauss() * ruidoSd }, t);
  }
  return det;
}

const limpios = (det, canal = "AU12") =>
  det.eventos.filter((e) => e.canal === canal && e.resoluble && !e.posibleParpadeo);

/* ─────────────────────────── andamiaje mínimo ─────────────────────────────── */

let pasadas = 0;
let fallidas = 0;

function comprobar(descripcion, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log(`  ✓ ${descripcion}${detalle ? "  — " + detalle : ""}`);
  } else {
    fallidas++;
    console.log(`  ✗ ${descripcion}${detalle ? "  — " + detalle : ""}`);
  }
}

const seccion = (t) => console.log("\n" + t + "\n" + "─".repeat(t.length));

/* ───────────────────── 1. Especificidad: no inventar ──────────────────────── */

seccion("1. Ruido puro, sin ningún transitorio");
{
  const det = simular({ fps: 60, transitorios: [] });
  const l = limpios(det);
  comprobar(
    "no reporta ningún evento resoluble sobre ruido",
    l.length === 0,
    `${l.length} eventos en 26 s`
  );
}

/* ─────────────── Caracterización sobre muchas realizaciones ───────────────── */

/**
 * Una sola corrida no caracteriza un detector, lo ilustra.
 *
 * Con ~4 muestras cubriendo un transitorio de 130 ms a 30 fps, que el filtro lo
 * vea o no depende de dónde caigan los fotogramas respecto del ápice, que es
 * azar. Corriendo una sola semilla se obtiene «lo detecta» o «no lo detecta»
 * según la semilla, y ninguna de las dos afirmaciones describe el instrumento.
 *
 * Lo que sí lo describe es la TASA sobre muchas realizaciones independientes del
 * ruido, que es lo que se mide acá.
 */
const REPETICIONES = 40;

function caracterizar({ fps, dur, amp, kRuido = 3.0 }) {
  let detectados = 0;
  let bandaCorrecta = 0;
  const errores = [];
  const amplitudes = [];
  for (let r = 0; r < REPETICIONES; r++) {
    const det = simular({
      fps,
      transitorios: [{ t0: 12000, dur, amp }],
      semilla: 1000 + r * 7919,
      kRuido,
    });
    const l = limpios(det);
    /* Se cuenta como acierto un único evento en la ventana del transitorio: dos
       eventos para un solo gesto también sería un error, y no debe premiarse. */
    const enVentana = l.filter((e) => e.tApice > 11500 && e.tApice < 12000 + dur + 500);
    if (enVentana.length === 1) {
      detectados++;
      errores.push(Math.abs(enVentana[0].duracionMs - dur));
      amplitudes.push(enVentana[0].amplitudSigma);
      if (enVentana[0].banda === "microexpresion") bandaCorrecta++;
    }
  }
  const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  return {
    tasa: detectados / REPETICIONES,
    tasaBanda: detectados ? bandaCorrecta / detectados : 0,
    errorMedioMs: prom(errores),
    amplitudMedia: prom(amplitudes),
  };
}

seccion("2. Transitorio de 130 ms y 3,0 σ, a 60 fps");
{
  const c = caracterizar({ fps: 60, dur: 130, amp: 3.0 });
  console.log(
    `    tasa de detección ${(c.tasa * 100).toFixed(0)} % · ` +
    `error medio de duración ${c.errorMedioMs.toFixed(0)} ms · ` +
    `amplitud media ${c.amplitudMedia.toFixed(2)} σ de 3,0 σ reales`
  );
  comprobar("detecta el transitorio en más del 90 % de las realizaciones", c.tasa > 0.9);
  comprobar(
    "lo clasifica en la banda correcta casi siempre",
    c.tasaBanda > 0.9,
    `${(c.tasaBanda * 100).toFixed(0)} %`
  );
  /* La tolerancia no es un número elegido: es la incertidumbre que el propio
     instrumento declara para esta cadencia, un intervalo de muestreo por lado. */
  const incertidumbre = simular({ fps: 60, transitorios: [] }).metricas.resolucionMs;
  comprobar(
    "el error de duración cabe dentro de la incertidumbre que el instrumento declara",
    c.errorMedioMs < incertidumbre,
    `${c.errorMedioMs.toFixed(0)} ms frente a ±${incertidumbre} ms declarados`
  );
}

/* ──────── 3. El caso que motiva todo: participante hipoexpresivo ──────────── */

seccion("3. Sensibilidad ante el gesto débil, y de dónde sale kRuido");
{
  /**
   * kRuido fija el compromiso entre ver el gesto débil e inventar eventos. No
   * puede elegirse «porque 3 σ suena bien»: hay que medir las dos curvas y
   * escoger con un criterio declarado.
   *
   * EL CRITERIO SE EXPRESA EN LA UNIDAD OPERATIVA, NO EN UNA GENÉRICA
   * Contar falsos positivos por minuto no dice nada por sí solo, porque nada en
   * este sistema se decide por minuto. Lo que existe es la VENTANA de cinco
   * segundos que se adjunta a cada selección de pictograma: esa es la unidad que
   * después se lee e interpreta. Un evento espurio ahí no es ruido de fondo, es
   * una lectura falsa sobre una selección concreta, y la persona cuidadora no
   * tiene forma de saber que lo es.
   *
   * De modo que el criterio es: la mayor sensibilidad que mantenga por debajo
   * del 5 % la proporción de ventanas contaminadas por un evento espurio. El 5 %
   * es el nivel convencional, y significa que diecinueve de cada veinte ventanas
   * están limpias.
   *
   * (Antes había puesto el criterio en falsos positivos por minuto y el barrido
   * seleccionaba k = 4,0, con un 10 % de sensibilidad: un detector que casi
   * nunca se equivoca porque casi nunca detecta. El criterio estaba mal
   * planteado, no el detector.)
   */
  const VENTANA_S = 5;
  const ventanasPorCorrida = 26 / VENTANA_S;
  console.log("    k     detección del gesto de 1,2 σ    ventanas de 5 s contaminadas");
  const filas = [];
  for (const k of [2.0, 2.5, 3.0, 3.5, 4.0]) {
    const c = caracterizar({ fps: 60, dur: 130, amp: 1.2, kRuido: k });
    let espurios = 0;
    for (let r = 0; r < REPETICIONES; r++) {
      espurios += limpios(
        simular({ fps: 60, transitorios: [], semilla: 5000 + r * 7919, kRuido: k })
      ).length;
    }
    const contaminadas = espurios / (REPETICIONES * ventanasPorCorrida);
    filas.push({ k, tasa: c.tasa, contaminadas });
    console.log(
      `    ${k.toFixed(1)}            ${(c.tasa * 100).toFixed(0).padStart(3)} %` +
      `                        ${(contaminadas * 100).toFixed(1)} %`
    );
  }

  const admisibles = filas.filter((f) => f.contaminadas <= 0.05);
  const elegido = admisibles.sort((a, b) => b.tasa - a.tasa)[0];
  comprobar(
    "algún k cumple el criterio de contaminación de ventanas",
    Boolean(elegido),
    elegido ? `k = ${elegido.k.toFixed(1)}` : "ninguno"
  );
  if (elegido) {
    comprobar(
      "el k por defecto del detector es el que sale del criterio",
      elegido.k === 3.0,
      `criterio → ${elegido.k.toFixed(1)} · por defecto → 3.0`
    );
    /* Se deja constancia del precio. Con k = 3,0 el detector pierde cerca de la
       mitad de los gestos de 1,2 σ, y eso es una limitación del trabajo, no un
       detalle de implementación: hay que declararla en el informe junto al
       número, porque condiciona lo que se puede concluir de una sesión donde no
       aparecieron eventos. Ausencia de evidencia no es evidencia de ausencia, y
       acá se puede cuantificar cuánto de una cosa no es la otra. */
    console.log(
      `    → con k = ${elegido.k.toFixed(1)}: sensibilidad ${(elegido.tasa * 100).toFixed(0)} % ` +
      `ante el gesto débil, ${(elegido.contaminadas * 100).toFixed(1)} % de ventanas contaminadas`
    );
  }
}

/* ───────── 4. Complementariedad: lo sostenido es de la vía tónica ─────────── */

seccion("4. Expresión sostenida de 3 s y 3,0 σ");
{
  const det = simular({ fps: 60, transitorios: [{ t0: 12000, dur: 3000, amp: 3.0 }] });
  const l = limpios(det);
  comprobar(
    "la vía fásica la ignora: es competencia de la tónica",
    l.length === 0,
    `${l.length} eventos`
  );
}

/* ────────────── 5. Degradación honesta a 30 fps, no silenciosa ────────────── */

seccion("5. El mismo transitorio de 130 ms, a 30 fps");
{
  const c30 = caracterizar({ fps: 30, dur: 130, amp: 3.0 });
  const c60 = caracterizar({ fps: 60, dur: 130, amp: 3.0 });
  const cifra = (x, u) => (Number.isNaN(x) ? "sin datos" : x.toFixed(u === "σ" ? 2 : 0) + " " + u);
  console.log(
    `    30 fps → detección ${(c30.tasa * 100).toFixed(0)} % · ` +
    `error de duración ${cifra(c30.errorMedioMs, "ms")} · ` +
    `amplitud ${cifra(c30.amplitudMedia, "σ")}`
  );
  console.log(
    `    60 fps → detección ${(c60.tasa * 100).toFixed(0)} % · ` +
    `error de duración ${c60.errorMedioMs.toFixed(0)} ms · ` +
    `amplitud ${c60.amplitudMedia.toFixed(2)} σ`
  );
  /* Este es el hallazgo que justifica pedir 60 fps en `js/face.js`. No es que a
     30 fps se mida algo peor: es que el gesto se pierde entero, y una pérdida no
     deja rastro en el registro. */
  comprobar(
    "a 30 fps se pierde una parte apreciable de los transitorios",
    c30.tasa < c60.tasa,
    `${(c30.tasa * 100).toFixed(0)} % frente a ${(c60.tasa * 100).toFixed(0)} %`
  );
  /* El resultado es más duro de lo que parecía: no es que a 30 fps se mida con
     más error, es que la anchura medida no llega al mínimo resoluble y el evento
     se rechaza entero. Para la banda estricta de Ekman, 60 fps no es una mejora
     deseable sino la condición para que exista la medición. */
  comprobar(
    "a 30 fps la banda estricta de Ekman se pierde por completo",
    c30.tasa < 0.05,
    `${(c30.tasa * 100).toFixed(0)} % de detección`
  );
}

/* ──────────── 6. Resolución temporal declarada: 30 fps contra 60 ─────────── */

seccion("6. Resolución temporal según la cadencia de la cámara");
{
  const a30 = simular({ fps: 30, transitorios: [] }).metricas;
  const a60 = simular({ fps: 60, transitorios: [] }).metricas;
  console.log(`    30 fps → resolución ${a30.resolucionMs} ms · ceguera en la banda de Ekman ${a30.cegueraEkmanPct} %`);
  console.log(`    60 fps → resolución ${a60.resolucionMs} ms · ceguera en la banda de Ekman ${a60.cegueraEkmanPct} %`);
  comprobar(
    "duplicar la cadencia reduce a menos de la mitad la parte ciega de la banda",
    a60.cegueraEkmanPct < a30.cegueraEkmanPct / 2,
    `${a30.cegueraEkmanPct} % → ${a60.cegueraEkmanPct} %`
  );
}

/* ─────────────────────────────── resultado ───────────────────────────────── */

console.log(`\n${pasadas} comprobaciones pasadas, ${fallidas} fallidas.`);
process.exit(fallidas ? 1 : 0);
