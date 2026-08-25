/**
 * Utilidades comunes a las pruebas.
 *
 * Reúne lo que las tres baterías necesitan: un marcador de resultados, la
 * construcción de rostros sintéticos a partir de unidades de acción, y el
 * montaje de una línea base creíble. Sin esto, cada prueba repetía el mismo
 * andamiaje y las tres podían divergir sin que nadie lo notara.
 */

/* ── Marcador ──────────────────────────────────────────────────────────── */

export function crearMarcador(titulo) {
  let ok = 0;
  let fallos = 0;
  const pendientes = [];
  return {
    seccion(t) {
      console.log(`\n${t}`);
      console.log("═".repeat(78));
    },
    /** Comprueba una condición y anota el resultado. */
    afirmar(nombre, condicion, detalle = "", nota = "") {
      condicion ? ok++ : fallos++;
      if (!condicion) pendientes.push(nombre);
      console.log(
        `  ${condicion ? "✓" : "✗"} ${nombre.padEnd(48)}${String(detalle).padStart(10)}` +
          (nota && condicion ? `  — ${nota}` : "")
      );
    },
    cerrar() {
      console.log("\n" + "─".repeat(78));
      console.log(`${titulo}: ${ok} comprobaciones pasadas, ${fallos} fallidas.`);
      if (fallos) {
        console.log("Fallaron: " + pendientes.join(" · "));
        process.exitCode = 1;
      }
      return fallos === 0;
    },
  };
}

/* ── Rostros sintéticos ────────────────────────────────────────────────── */

/**
 * Correspondencia entre unidad de acción y los coeficientes que la sostienen.
 *
 * Se escribe aquí, y no se importa de `facs.js`, a propósito. Una prueba que
 * toma el mapeo del mismo módulo que verifica no puede detectar que el mapeo
 * esté mal: comprobaría que el código coincide consigo mismo. Al declararlo por
 * separado, si alguien cambia un coeficiente en `features.js` sin querer, la
 * prueba lo señala.
 */
export const AU_BLENDSHAPES = {
  AU1: ["browInnerUp"],
  AU2: ["browOuterUpLeft", "browOuterUpRight"],
  AU4: ["browDownLeft", "browDownRight"],
  AU5: ["eyeWideLeft", "eyeWideRight"],
  AU7: ["eyeSquintLeft", "eyeSquintRight"],
  AU9: ["noseSneerLeft", "noseSneerRight"],
  AU10: ["mouthUpperUpLeft", "mouthUpperUpRight"],
  AU12: ["mouthSmileLeft", "mouthSmileRight"],
  AU15: ["mouthFrownLeft", "mouthFrownRight"],
  AU17: ["mouthShrugLower"],
  AU18: ["mouthPucker"],
  AU20: ["mouthStretchLeft", "mouthStretchRight"],
  AU24: ["mouthPressLeft", "mouthPressRight"],
  AU26: ["jawOpen"],
};

const TODOS_LOS_COEFICIENTES = [
  ...new Set(Object.values(AU_BLENDSHAPES).flat()),
];

/** Un rostro en reposo: todos los coeficientes cerca de cero. */
export function rostroEnReposo(ruido = 0, azar = Math.random) {
  const bs = {};
  for (const k of TODOS_LOS_COEFICIENTES) {
    bs[k] = Math.max(0, 0.02 + ruido * (azar() - 0.5));
  }
  return bs;
}

/**
 * Un rostro con las unidades de acción indicadas, cada una a su intensidad.
 *
 *     rostro({ AU12: 0.6 })            sonrisa marcada
 *     rostro({ AU1: 0.5, AU4: 0.5 })   ceja interna arriba y cejas juntas
 */
export function rostro(unidades, ruido = 0, azar = Math.random) {
  const bs = rostroEnReposo(ruido, azar);
  for (const [au, valor] of Object.entries(unidades)) {
    for (const k of AU_BLENDSHAPES[au] ?? []) bs[k] = valor;
  }
  return bs;
}

/* ── Generador reproducible ────────────────────────────────────────────── */

/**
 * Números pseudoaleatorios con semilla.
 *
 * Una prueba que use `Math.random` falla de forma intermitente y no se puede
 * depurar: el caso que fallo no se vuelve a producir. Con semilla, un fallo es
 * siempre el mismo fallo.
 */
export function generador(semilla = 12345) {
  let s = semilla >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ── Línea base sintética ──────────────────────────────────────────────── */

/**
 * Monta una línea base a partir de un rostro en reposo con ruido.
 *
 * Reproduce lo que ocurre en una sesión: unos segundos de rostro quieto, con la
 * fluctuación propia del estimador de puntos, y el cierre de la referencia.
 */
export async function lineaBaseSintetica({ muestras = 60, ruido = 0.03, semilla = 7 } = {}) {
  const { LineaBase, extract, CARACTERISTICAS } = await import("../js/features.js");
  const azar = generador(semilla);
  const base = new LineaBase(CARACTERISTICAS);
  for (let i = 0; i < muestras; i++) base.agregar(extract(rostroEnReposo(ruido, azar)));
  base.cerrar();
  return base;
}
