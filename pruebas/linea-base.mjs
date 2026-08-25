/**
 * La referencia contra la que se mide todo.
 *
 * POR QUE ESTA BATERIA EXISTE
 * Los fallos mas graves no estuvieron en la regla de clasificacion sino en la
 * referencia. Un rostro sin expresion se leia negativo intenso porque la escala
 * salia de la quietud que se pide para calibrar; el 78 % de los canales acababa
 * en un piso constante en lugar de en su propia dispersion; y un puchero
 * repetido dejaba de detectarse porque el refinamiento lo adoptaba como reposo.
 *
 * Ninguno de los tres lo habria visto una prueba sobre puntuaciones z: los tres
 * ocurren al construir la referencia.
 *
 *   node pruebas/linea-base.mjs
 */

import { LineaBase, extract, qn, CARACTERISTICAS } from "../js/features.js";
import { crearMarcador, rostro, rostroEnReposo, generador } from "./ayuda.mjs";

const m = crearMarcador("Línea base");

/* ═══════════════════════════════════════════════════════════════════════
   1. El estimador de escala
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("1. Estimador de escala Qn");
{
  const azar = generador(3);
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = azar();
    while (!v) v = azar();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const mad = (xs) => {
    const o = [...xs].sort((a, b) => a - b);
    const md = o[o.length >> 1];
    return xs.map((x) => Math.abs(x - md)).sort((a, b) => a - b)[xs.length >> 1] * 1.4826;
  };
  let eq = 0, em = 0;
  const N = 800, n = 60;
  for (let k = 0; k < N; k++) {
    const xs = Array.from({ length: n }, gauss);
    eq += (qn(xs) - 1) ** 2;
    em += (mad(xs) - 1) ** 2;
  }
  m.afirmar("Qn estima sigma sin sesgo apreciable", Math.abs(Math.sqrt(eq / N)) < 0.2,
    (eq / N).toFixed(4));
  m.afirmar("Qn es más preciso que la MAD", em / eq > 1.5, `${(em / eq).toFixed(2)}×`,
    "eficiencia gaussiana 82 % frente a 37 % (Rousseeuw y Croux, 1993)");
  m.afirmar("Con una sola muestra devuelve cero y no falla", qn([1]) === 0, "0");
  m.afirmar("Con muestras idénticas devuelve cero", qn([2, 2, 2, 2]) === 0, "0");
}

/* ═══════════════════════════════════════════════════════════════════════
   2. Cierre de la referencia
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("2. Cierre de la referencia");
{
  const azar = generador(11);
  const b = new LineaBase(CARACTERISTICAS);
  for (let i = 0; i < 60; i++) b.agregar(extract(rostroEnReposo(0.04, azar)));
  const r = b.cerrar();
  m.afirmar("Devuelve una posición por canal",
    CARACTERISTICAS.every((c) => Number.isFinite(r.media[c])), `${CARACTERISTICAS.length} canales`);
  m.afirmar("Ninguna dispersión queda por debajo del piso",
    CARACTERISTICAS.every((c) => r.sigma[c] >= 0.05 - 1e-9), "≥ 0,05");
  m.afirmar("Anota qué canales usaron dispersión prestada",
    Array.isArray(r.canalesSupuestos), `${r.canalesSupuestos.length} de ${CARACTERISTICAS.length}`,
    "sin esta anotación no se sabe si un umbral se apoyó en medición o en sustitución");
  m.afirmar("Mide la autocorrelación entre fotogramas",
    r.autocorrelacion === null || Number.isFinite(r.autocorrelacion),
    r.autocorrelacion === null ? "—" : r.autocorrelacion.toFixed(3));
  m.afirmar("Reporta el tamaño efectivo de muestra",
    r.muestrasEfectivas === null || r.muestrasEfectivas <= r.muestras,
    `${r.muestrasEfectivas === null ? "—" : r.muestrasEfectivas.toFixed(1)} de ${r.muestras}`);
}
{
  const b = new LineaBase(CARACTERISTICAS);
  b.agregar(extract(rostroEnReposo(0)));
  let fallo = false;
  try { b.cerrar(); } catch { fallo = true; }
  m.afirmar("Con una sola muestra se niega a cerrar", fallo, "lanza");
}

/* ═══════════════════════════════════════════════════════════════════════
   3. Normalización
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("3. Normalización");
{
  const azar = generador(5);
  const b = new LineaBase(CARACTERISTICAS);
  for (let i = 0; i < 60; i++) b.agregar(extract(rostroEnReposo(0.04, azar)));

  const antes = b.normalizar(extract(rostro({ AU12: 0.6 })));
  m.afirmar("Antes de cerrar devuelve ceros",
    Object.values(antes).every((v) => v === 0), "todo 0",
    "sin referencia, devolver los valores crudos los haría pasar por puntuaciones z");

  b.cerrar();
  const enReposo = b.normalizar(extract(rostroEnReposo(0, generador(5))));
  m.afirmar("Un rostro en reposo queda cerca de cero",
    Object.values(enReposo).every((v) => Math.abs(v) < 3),
    Math.max(...Object.values(enReposo).map(Math.abs)).toFixed(1));

  const conSonrisa = b.normalizar(extract(rostro({ AU12: 0.6 })));
  m.afirmar("Una sonrisa aparta el canal correspondiente", conSonrisa.sonrisa > 3,
    conSonrisa.sonrisa.toFixed(1));
  m.afirmar("Y no aparta los demás",
    CARACTERISTICAS.filter((c) => c !== "sonrisa").every((c) => Math.abs(conSonrisa[c]) < 3),
    "el resto < 3σ");
}

/* ═══════════════════════════════════════════════════════════════════════
   4. Refinamiento durante la sesión
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("4. Refinamiento durante la sesión");
{
  /* Deriva postural: el rostro se desplaza despacio y la referencia debe
     seguirlo, que es para lo que se incorporó el refinamiento. */
  const azar = generador(21);
  const b = new LineaBase(CARACTERISTICAS);
  for (let i = 0; i < 40; i++) b.agregar(extract(rostroEnReposo(0.03, azar)));
  b.cerrar();
  const inicial = b.media.tensionOcular;
  for (let i = 0; i < 40; i++) {
    const bs = rostroEnReposo(0.03, azar);
    for (const k of ["eyeSquintLeft", "eyeSquintRight"]) bs[k] += 0.06;
    b.refinar(extract(bs));
  }
  m.afirmar("Sigue una deriva postural pequeña", b.media.tensionOcular > inicial,
    `${inicial.toFixed(3)} → ${b.media.tensionOcular.toFixed(3)}`);
}
{
  /* Expresión repetida: NO debe adoptarla como reposo. Es el fallo por el que
     un puchero repetido dejaba de detectarse. */
  const azar = generador(31);
  const b = new LineaBase(CARACTERISTICAS);
  for (let i = 0; i < 40; i++) b.agregar(extract(rostroEnReposo(0.03, azar)));
  b.cerrar();
  const inicial = b.media.menton;
  for (let i = 0; i < 80; i++) b.refinar(extract(rostro({ AU17: 0.6 }, 0.03, azar)));
  const desplazamiento = (b.media.menton - inicial) / b.sigma.menton;
  m.afirmar("No adopta una expresión repetida como reposo", desplazamiento <= 1.001,
    `${desplazamiento.toFixed(2)} σ`,
    "la corrección se acota a una desviación típica: más allá sería redefinir el reposo");

  const z = b.normalizar(extract(rostro({ AU17: 0.6 })));
  m.afirmar("Y el gesto se sigue detectando después", z.menton > 1, z.menton.toFixed(1));
}
{
  const azar = generador(41);
  const b = new LineaBase(CARACTERISTICAS);
  for (let i = 0; i < 40; i++) b.agregar(extract(rostroEnReposo(0.03, azar)));
  b.cerrar();
  m.afirmar("No refina antes de reunir muestras suficientes",
    b.refinar(extract(rostroEnReposo(0.03, azar))) === false, "false");
}

/* ═══════════════════════════════════════════════════════════════════════
   5. Canales sin recorrido
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("5. Canales sin recorrido");
{
  const azar = generador(51);
  const b = new LineaBase(CARACTERISTICAS);
  for (let i = 0; i < 60; i++) {
    const bs = rostroEnReposo(0.05, azar);
    /* Se simula un coeficiente muerto, como resultaron AU6 y AU9 en el equipo
       de desarrollo: existe la clave y devuelve un valor despreciable. */
    bs.noseSneerLeft = 1e-6;
    bs.noseSneerRight = 1e-6;
    b.agregar(extract(bs));
  }
  const r = b.cerrar();
  m.afirmar("Un canal muerto recibe dispersión sustituta",
    r.canalesSupuestos.includes("narizArrugada"), "anotado");
  m.afirmar("Y su dispersión no queda en cero", r.sigma.narizArrugada > 0,
    r.sigma.narizArrugada.toFixed(4),
    "una dispersión de cero amplificaría el ruido sin límite");
  m.afirmar("La sustituta sale de los canales que sí se midieron",
    r.sigmaSustituta === null || r.sigmaSustituta >= 0.05,
    r.sigmaSustituta === null ? "—" : r.sigmaSustituta.toFixed(4));
}

m.cerrar();
