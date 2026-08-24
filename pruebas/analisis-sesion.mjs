/**
 * Caracterización del instrumento a partir de un registro real exportado.
 *
 *     node pruebas/analisis-sesion.mjs <export.json>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ RESPONDE, Y POR QUÉ ESA ES LA PREGUNTA
 *
 * `deteccion-fasica.mjs` mide el ALGORITMO sobre señal construida, donde existe
 * verdad de referencia. Esto mide el INSTRUMENTO sobre datos reales, donde no la
 * hay. Son dos preguntas distintas y hacen falta las dos: un algoritmo correcto
 * sobre un instrumento sin resolución no produce ninguna medición válida.
 *
 * Con el participante no se puede saber si un evento detectado ocurrió de veras.
 * Lo que sí se puede saber, y es lo que este análisis extrae, es si el registro
 * tiene la calidad necesaria para que la pregunta tenga sentido: qué cadencia dio
 * el dispositivo, qué duración mínima alcanza a describir, cuántos canales
 * llegaron a tener un umbral medido, y si la distribución de lo registrado se
 * parece más a un rostro o a ruido.
 *
 * Sin este paso, el informe estaría reportando recuentos de eventos sin saber si
 * son eventos.
 */

import { readFileSync } from "node:fs";

const archivo = process.argv[2];
if (!archivo) {
  console.error("Uso: node pruebas/analisis-sesion.mjs <export.json>");
  process.exit(2);
}

const d = JSON.parse(readFileSync(archivo, "utf8"));
const sesiones = d.sesiones ?? [];
const selecciones = d.selecciones ?? [];
const muestras = d.muestras ?? [];
const eventos = d.eventos ?? [];

/* ─────────────────────────────── utilidades ──────────────────────────────── */

const mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

const cuenta = (xs) => {
  const c = {};
  for (const x of xs) c[x] = (c[x] ?? 0) + 1;
  return c;
};

const pct = (x) => (x * 100).toFixed(1) + " %";
const seccion = (t) => console.log("\n" + t + "\n" + "═".repeat(t.length));

/**
 * Entropía normalizada de un reparto, en [0, 1].
 *
 * POR QUÉ SIRVE ACÁ
 * Una expresión facial real es económica: activa unos pocos músculos y deja el
 * resto quieto, así que sus eventos se concentran en pocos canales. El ruido no
 * tiene ninguna razón para preferir un canal sobre otro y se reparte parejo.
 *
 * La entropía mide exactamente eso. Cerca de 1 el reparto es indistinguible del
 * uniforme, que es la firma del ruido; bastante por debajo, hay estructura. No
 * demuestra que los eventos sean genuinos —un artefacto sistemático también
 * concentra— pero un valor cercano a 1 sí es evidencia fuerte de que no lo son.
 */
function entropiaNormalizada(conteos) {
  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  const k = Object.keys(conteos).length;
  if (!total || k < 2) return null;
  let h = 0;
  for (const n of Object.values(conteos)) {
    if (!n) continue;
    const p = n / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(k);
}

/* ─────────────────────────────── inventario ──────────────────────────────── */

seccion("1. Inventario del registro");
console.log(`  exportado    ${d.exportado ?? "sin fecha"}`);
console.log(`  sesiones     ${sesiones.length}`);
console.log(`  selecciones  ${selecciones.length}`);
console.log(`  muestras     ${muestras.length}`);
console.log(`  eventos      ${eventos.length}`);

const cerradas = sesiones.filter((s) => s.fin).length;
const conBase = sesiones.filter((s) => s.lineaBase).length;
const conAU = sesiones.filter((s) => s.lineaBase?.au).length;
const conMetricas = sesiones.filter((s) => s.metricas).length;
console.log(
  `\n  cerradas ${cerradas}/${sesiones.length}` +
  ` · con línea base ${conBase}/${sesiones.length}` +
  ` · con línea base de AU ${conAU}/${sesiones.length}` +
  ` · con métricas ${conMetricas}/${sesiones.length}`
);
if (conMetricas < cerradas) {
  console.log(
    "  ⚠ hay sesiones cerradas sin métricas de instrumento: sus datos no son\n" +
    "    interpretables después, porque falta la procedencia."
  );
}

/* ──────────────────── resolución temporal conseguida ─────────────────────── */

seccion("2. Resolución temporal del dispositivo");

const resoluciones = [
  ...sesiones.map((s) => s.metricas?.fasico?.resolucionMs),
  ...selecciones.map((s) => s.resolucionTemporalMs),
].filter((x) => typeof x === "number");

if (!resoluciones.length) {
  console.log("  Sin datos: ninguna sesión registró resolución temporal.");
} else {
  const med = mediana(resoluciones);
  /* La relacion inversa a como la calcula el detector:
     resolucion = 2·dt / FACTOR_FORMA  ⇒  dt = resolucion·0,66/2 */
  const dt = (med * 0.66) / 2;
  const fps = 1000 / dt;
  const ceguera = Math.min(100, Math.max(0, ((med - 40) / (200 - 40)) * 100));
  console.log(`  n=${resoluciones.length}  mediana ${med} ms  (min ${Math.min(...resoluciones)}, max ${Math.max(...resoluciones)})`);
  console.log(`  cadencia implicada  ${fps.toFixed(1)} fps`);
  console.log(`  banda de Ekman (40–200 ms) fuera de alcance:  ${ceguera.toFixed(0)} %`);
  console.log();
  /* El veredicto se deriva de la ceguera ya calculada y no de un corte aparte,
     para que no puedan contradecirse: decir «se resuelve la mitad superior de la
     banda» dos lineas despues de «96 % fuera de alcance» seria un error de
     reporte, y en un informe ese error vale mas caro que el dato malo. */
  if (ceguera >= 90) {
    console.log("  ✗ VEREDICTO: la banda estricta de Ekman queda practicamente entera fuera");
    console.log("    de alcance. Los eventos de banda «microexpresion» que aparezcan en este");
    console.log("    registro no son sostenibles: caen en el margen residual que el muestreo");
    console.log("    alcanza a rozar. El informe NO puede afirmar deteccion de");
    console.log("    microexpresiones con este dispositivo y esta cadencia.");
  } else if (ceguera >= 50) {
    console.log("  ⚠ VEREDICTO: mas de la mitad de la banda de Ekman queda fuera de alcance.");
    console.log("    Solo son sostenibles los eventos mas largos de la banda.");
  } else if (ceguera >= 20) {
    console.log("  ⚠ VEREDICTO: parte baja de la banda de Ekman fuera de alcance.");
  } else {
    console.log("  ✓ VEREDICTO: la mayor parte de la banda de Ekman queda dentro de alcance.");
  }
}

/* ──────────────── auditoría de calidad de los eventos ────────────────────── */

seccion("3. Auditoría de los eventos registrados");

if (!eventos.length) {
  console.log("  Sin eventos en el registro.");
} else {
  const umbrales = eventos.map((e) => e.umbral).filter((x) => typeof x === "number");
  const colapsados = eventos.filter((e) => typeof e.umbral === "number" && e.umbral < 0.01);

  console.log(`  total ${eventos.length}`);
  console.log(`  umbral: mediana ${mediana(umbrales)?.toFixed(4)}  min ${Math.min(...umbrales).toFixed(4)}`);
  console.log(`  resolubles ${eventos.filter((e) => e.resoluble).length}`);
  console.log(`  marcados como parpadeo ${eventos.filter((e) => e.posibleParpadeo).length}`);
  console.log(`  banda: ${JSON.stringify(cuenta(eventos.map((e) => e.banda)))}`);

  /**
   * FIRMA DEL UMBRAL DERRUMBADO
   *
   * Un canal cuyo blendshape fue constante durante el calentamiento da MAD cero
   * y por tanto umbral cero, con lo que dispara ante cualquier fluctuacion
   * numerica. Se detecta comparando la amplitud de los eventos de umbral casi
   * nulo contra la de los demas: si difieren en ordenes de magnitud, los
   * primeros no son expresion.
   */
  if (colapsados.length) {
    const sanos = eventos.filter((e) => typeof e.umbral === "number" && e.umbral >= 0.01);
    const ampCol = mediana(colapsados.map((e) => e.amplitudSigma));
    const ampSan = mediana(sanos.map((e) => e.amplitudSigma));
    console.log();
    console.log(`  ⚠ ${colapsados.length}/${eventos.length} (${pct(colapsados.length / eventos.length)}) con umbral < 0,01`);
    console.log(`    amplitud mediana con umbral derrumbado: ${ampCol?.toFixed(4)} σ`);
    console.log(`    amplitud mediana en canales sanos:      ${ampSan?.toFixed(4)} σ`);
    if (ampSan && ampCol && ampSan / ampCol > 10) {
      console.log(`    → factor ${(ampSan / ampCol).toFixed(0)}×. Son ruido numérico, no expresión.`);
      console.log("    → Registro tomado ANTES del piso SIGMA_D_MINIMA. Estos eventos deben");
      console.log("      excluirse del análisis y la sesión repetirse.");
    }
  } else {
    console.log("\n  ✓ ningún evento con umbral derrumbado");
  }

  /* ── estructura del reparto por canal ── */
  const porCanal = cuenta(eventos.map((e) => e.canal));
  const h = entropiaNormalizada(porCanal);
  console.log();
  console.log("  Reparto por canal (entropía normalizada, 1 = uniforme = ruido):");
  const orden = Object.entries(porCanal).sort((a, b) => b[1] - a[1]);
  console.log("   ", orden.map(([c, n]) => `${c}:${n}`).join("  "));
  console.log(`    entropía ${h?.toFixed(3)}`);
  if (h !== null && h > 0.95) {
    console.log("    ✗ prácticamente uniforme: indistinguible de ruido repartido al azar.");
    console.log("      Una expresión real es económica y concentra en pocos músculos.");
  } else if (h !== null && h > 0.85) {
    console.log("    ⚠ poco estructurado. Compatible con ruido dominante.");
  } else {
    console.log("    ✓ hay concentración en canales concretos, como cabría esperar de");
    console.log("      actividad muscular real.");
  }
}

/* ────────────────────── vía tónica y acuerdo (OE5) ───────────────────────── */

seccion("4. Vía tónica y acuerdo entre clasificadores (OE 5)");

const conEstado = selecciones.filter((s) => s.predominante);
console.log(`  selecciones con estado atribuido: ${conEstado.length}/${selecciones.length}`);
if (conEstado.length) {
  console.log(`  estado predominante: ${JSON.stringify(cuenta(conEstado.map((s) => s.predominante)))}`);
  const tasas = selecciones.map((s) => s.tasaValidez).filter((x) => typeof x === "number");
  if (tasas.length) console.log(`  tasa de validez de la ventana: mediana ${pct(mediana(tasas))}`);
}

const kappas = selecciones
  .map((s) => s.acuerdo?.kappa)
  .filter((x) => typeof x === "number" && Number.isFinite(x));
if (kappas.length) {
  const km = mediana(kappas);
  console.log(`\n  kappa de Cohen: n=${kappas.length}  mediana ${km.toFixed(3)}  ` +
              `min ${Math.min(...kappas).toFixed(3)}  max ${Math.max(...kappas).toFixed(3)}`);
  /* Lectura convencional (Landis y Koch, 1977). */
  const lectura =
    km < 0 ? "peor que el azar" :
    km < 0.21 ? "insignificante" :
    km < 0.41 ? "aceptable" :
    km < 0.61 ? "moderada" :
    km < 0.81 ? "considerable" : "casi perfecta";
  console.log(`  concordancia: ${lectura}`);
  if (km < 0.21) {
    console.log("  ✗ Los dos clasificadores no coinciden más de lo que coincidirían por azar.");
    console.log("    Es un resultado del OE 5 y debe reportarse como tal, no omitirse. Recordar");
    console.log("    ademas que el modelo preentrenado fue entrenado con rostros adultos.");
  }
} else {
  console.log("\n  Sin datos de acuerdo: la segunda opinión estuvo desactivada.");
}

/* ────────────────────────────── conclusión ───────────────────────────────── */

seccion("5. Qué sostiene este registro");

const med = resoluciones.length ? mediana(resoluciones) : null;
const colapso = eventos.length
  ? eventos.filter((e) => typeof e.umbral === "number" && e.umbral < 0.01).length / eventos.length
  : 0;

const problemas = [];
const cegueraFinal = med === null
  ? null
  : Math.min(100, Math.max(0, ((med - 40) / (200 - 40)) * 100));
if (med === null) problemas.push("no se registró la resolución temporal");
else if (cegueraFinal >= 50)
  problemas.push(
    `resolución de ${med} ms: el ${cegueraFinal.toFixed(0)} % de la banda de Ekman queda fuera de alcance`
  );
if (colapso > 0.05) problemas.push(`${pct(colapso)} de los eventos vienen de umbrales derrumbados`);
if (conMetricas < sesiones.length) problemas.push("faltan métricas de instrumento en parte de las sesiones");
if (kappas.length && mediana(kappas) < 0.21) problemas.push("el acuerdo entre clasificadores es insignificante");

if (!problemas.length) {
  console.log("  El registro es interpretable. Se puede analizar la asociación entre");
  console.log("  pictograma y actividad facial con las salvedades de sensibilidad ya");
  console.log("  documentadas.");
} else {
  console.log("  Este registro NO sostiene conclusiones sobre expresión facial del");
  console.log("  participante. Motivos:");
  for (const p of problemas) console.log(`    · ${p}`);
  console.log();
  console.log("  Sirve, y no es poco, como evidencia de que el sistema corre de extremo a");
  console.log("  extremo y como caracterización del instrumento. Esa distinción tiene que");
  console.log("  quedar explícita en el informe.");
}
console.log();
