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

/* ───────────────────── segmentación del registro ─────────────────────────── */

/**
 * UN EXPORT ES ACUMULATIVO Y ESO ROMPE CUALQUIER PROMEDIO.
 *
 * IndexedDB conserva todo lo grabado desde siempre, así que un export contiene
 * sesiones tomadas con versiones distintas del software. Promediarlas juntas da
 * un número que no describe a ninguna.
 *
 * Ocurrió: en el registro del 24-08-2026, agregar las sesiones anteriores al
 * piso SIGMA_D_MINIMA junto a las posteriores daba un 31 % de umbrales
 * derrumbados y un veredicto de «no sostiene conclusiones», cuando las sesiones
 * nuevas tenían CERO umbrales derrumbados y amplitudes veinte veces mayores. El
 * promedio escondía exactamente el hallazgo que había que ver.
 *
 * El criterio de corte es tener métricas de instrumento: solo las escribe la
 * versión que ya incorpora las correcciones, así que su presencia identifica sin
 * ambigüedad a las sesiones interpretables. Las anteriores se reportan aparte,
 * como histórico, y no entran en el veredicto.
 */
const instrumentadas = sesiones.filter((s) => s.metricas);
const idsInstrumentadas = new Set(instrumentadas.map((s) => s.id));
const legado = sesiones.filter((s) => !s.metricas);

const eventosInstr = eventos.filter((e) => idsInstrumentadas.has(e.sesionId));
const eventosLegado = eventos.filter((e) => !idsInstrumentadas.has(e.sesionId));

/* Todo se calcula sobre las sesiones interpretables. Si no hay ninguna, se cae
   al registro completo para no dejar al usuario sin análisis, avisando. */
const hayInstr = instrumentadas.length > 0;
const alcance = hayInstr ? eventosInstr : eventos;
const seleccionesAlcance = hayInstr
  ? selecciones.filter((s) => idsInstrumentadas.has(s.sesionId))
  : selecciones;

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
console.log(
  `\n  INTERPRETABLES (con métricas)  ${String(instrumentadas.length).padStart(3)} sesiones · ${eventosInstr.length} eventos`
);
console.log(
  `  HISTÓRICO (sin métricas)       ${String(legado.length).padStart(3)} sesiones · ${eventosLegado.length} eventos`
);
if (legado.length) {
  console.log(
    "  → El histórico NO entra en el veredicto: son sesiones de versiones\n" +
    "    anteriores del software y mezclarlas falsea todos los promedios."
  );
}
if (!hayInstr) {
  console.log(
    "  ⚠ Ninguna sesión tiene métricas de instrumento. El análisis que sigue\n" +
    "    corre sobre TODO el registro y sus conclusiones son provisionales."
  );
}

/* ───────────── contraste antes / después, si hay de los dos ──────────────── */

if (hayInstr && eventosLegado.length) {
  const colapso = (es) =>
    es.filter((e) => typeof e.umbral === "number" && e.umbral < 0.01).length / (es.length || 1);
  const amp = (es) => mediana(es.map((e) => e.amplitudSigma));
  seccion("1b. Contraste entre versiones");
  console.log(`  ${"".padEnd(22)}${"histórico".padStart(12)}${"actual".padStart(12)}`);
  console.log(
    `  ${"umbrales derrumbados".padEnd(22)}${pct(colapso(eventosLegado)).padStart(12)}${pct(colapso(eventosInstr)).padStart(12)}`
  );
  console.log(
    `  ${"amplitud mediana (σ)".padEnd(22)}${(amp(eventosLegado)?.toFixed(3) ?? "—").padStart(12)}${(amp(eventosInstr)?.toFixed(3) ?? "—").padStart(12)}`
  );
  const hLeg = entropiaNormalizada(cuenta(eventosLegado.map((e) => e.canal)));
  const hAct = entropiaNormalizada(cuenta(eventosInstr.map((e) => e.canal)));
  console.log(
    `  ${"entropía por canal".padEnd(22)}${(hLeg?.toFixed(3) ?? "—").padStart(12)}${(hAct?.toFixed(3) ?? "—").padStart(12)}`
  );
}

/* ──────────────────── resolución temporal conseguida ─────────────────────── */

seccion("2. Resolución temporal del dispositivo");

const resoluciones = [
  ...(hayInstr ? instrumentadas : sesiones).map((s) => s.metricas?.fasico?.resolucionMs),
  ...seleccionesAlcance.map((s) => s.resolucionTemporalMs),
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

if (!alcance.length) {
  console.log("  Sin eventos en el alcance analizado.");
} else {
  const umbrales = alcance.map((e) => e.umbral).filter((x) => typeof x === "number");
  const colapsados = alcance.filter((e) => typeof e.umbral === "number" && e.umbral < 0.01);

  console.log(`  total ${alcance.length}`);
  console.log(`  umbral: mediana ${mediana(umbrales)?.toFixed(4)}  min ${Math.min(...umbrales).toFixed(4)}`);
  console.log(`  resolubles ${alcance.filter((e) => e.resoluble).length}`);
  console.log(`  marcados como parpadeo ${alcance.filter((e) => e.posibleParpadeo).length}`);
  console.log(`  banda: ${JSON.stringify(cuenta(alcance.map((e) => e.banda)))}`);

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
    const sanos = alcance.filter((e) => typeof e.umbral === "number" && e.umbral >= 0.01);
    const ampCol = mediana(colapsados.map((e) => e.amplitudSigma));
    const ampSan = mediana(sanos.map((e) => e.amplitudSigma));
    console.log();
    console.log(`  ⚠ ${colapsados.length}/${alcance.length} (${pct(colapsados.length / alcance.length)}) con umbral < 0,01`);
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
  const porCanal = cuenta(alcance.map((e) => e.canal));
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

const conEstado = seleccionesAlcance.filter((s) => s.predominante);
console.log(`  selecciones con estado atribuido: ${conEstado.length}/${seleccionesAlcance.length}`);
if (conEstado.length) {
  console.log(`  estado predominante: ${JSON.stringify(cuenta(conEstado.map((s) => s.predominante)))}`);
  const tasas = seleccionesAlcance.map((s) => s.tasaValidez).filter((x) => typeof x === "number");
  if (tasas.length) console.log(`  tasa de validez de la ventana: mediana ${pct(mediana(tasas))}`);
}

const kappas = seleccionesAlcance
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

seccion("5. Plausibilidad fisiológica de la tasa de eventos");

/**
 * LA COMPROBACIÓN QUE MÁS RÁPIDO DELATA UN DETECTOR ROTO.
 *
 * No hace falta verdad de referencia para saber que algo va mal: basta contar.
 * Un rostro produce del orden de unos pocos eventos expresivos por minuto. Si el
 * detector reporta cientos, no está aislando expresiones, está siguiendo
 * movimiento facial de cualquier origen — habla, parpadeo, reacomodo postural.
 *
 * Es la comprobación que destapó que arreglar el derrumbe del umbral no bastaba:
 * las amplitudes pasaron a ser reales, pero la sesión 28 seguía dando 5,38
 * eventos por segundo, y ninguna cara sostiene eso.
 */
const RATE_PLAUSIBLE_MIN = 30; // eventos por minuto: cota generosa

const tasas = [];
for (const s of (hayInstr ? instrumentadas : sesiones)) {
  const ini = s.inicio;
  const fin = s.fin ?? s.metricasActualizadas;
  if (!ini || !fin || fin <= ini) continue;
  const seg = (fin - ini) / 1000;
  const n = eventos.filter((e) => e.sesionId === s.id).length;
  if (seg < 5) continue;
  tasas.push({ id: s.id, seg, n, porMin: (n / seg) * 60 });
}

if (!tasas.length) {
  console.log("  Sin duraciones utilizables para calcular la tasa.");
} else {
  for (const t of tasas) {
    const marca = t.porMin > RATE_PLAUSIBLE_MIN ? "✗" : "✓";
    console.log(
      `  ${marca} sesión ${String(t.id).padStart(3)}  ${t.seg.toFixed(0).padStart(4)} s  ` +
      `${String(t.n).padStart(4)} eventos  →  ${t.porMin.toFixed(0).padStart(4)} por minuto`
    );
  }
  const peor = Math.max(...tasas.map((t) => t.porMin));
  if (peor > RATE_PLAUSIBLE_MIN) {
    console.log();
    console.log(`  ✗ ${peor.toFixed(0)} eventos por minuto no es una tasa de expresión facial.`);
    console.log("    El detector está siguiendo movimiento facial de cualquier origen. Los");
    console.log("    canales que dominan lo confirman: mandíbula y parpadeo apuntan a habla");
    console.log("    y a fisiología, no a comunicación. Hasta poder excluir esos artefactos,");
    console.log("    los recuentos de eventos no son recuentos de expresiones.");
  }
}

/* ─────────── umbrales medidos frente a umbrales supuestos ────────────────── */

seccion("6. ¿Umbrales medidos o supuestos?");

const supuestos = (hayInstr ? instrumentadas : sesiones)
  .map((s) => s.metricas?.fasico)
  .filter(Boolean);

if (!supuestos.length) {
  console.log("  Sin métricas: no se puede saber.");
} else {
  for (const f of supuestos) {
    console.log(
      `  ${f.canalesConUmbralSupuesto ?? "?"} de ${f.canalesTotales ?? "?"} canales con umbral supuesto`
    );
  }
  const peor = Math.max(...supuestos.map((f) => (f.canalesConUmbralSupuesto ?? 0) / (f.canalesTotales || 1)));
  if (peor > 0.5) {
    console.log();
    console.log(`  ⚠ Más de la mitad de los umbrales (${pct(peor)}) no se midieron: se asumieron.`);
    console.log("    El detector no está caracterizando el ruido del participante en esos");
    console.log("    canales, lo está sustituyendo por una referencia. Los eventos que salgan");
    console.log("    de ahí dependen de esa sustitución y no de una medición.");
  }
}

seccion("7. Qué sostiene este registro");

const med = resoluciones.length ? mediana(resoluciones) : null;
const colapso = alcance.length
  ? alcance.filter((e) => typeof e.umbral === "number" && e.umbral < 0.01).length / alcance.length
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
if (!hayInstr) problemas.push("ninguna sesión registró métricas de instrumento");
if (kappas.length && mediana(kappas) < 0.21) problemas.push("el acuerdo entre clasificadores es insignificante");
if (tasas.length && Math.max(...tasas.map((t) => t.porMin)) > RATE_PLAUSIBLE_MIN)
  problemas.push(
    `${Math.max(...tasas.map((t) => t.porMin)).toFixed(0)} eventos por minuto: el detector sigue movimiento facial, no expresión`
  );
if (supuestos.length) {
  const p = Math.max(...supuestos.map((f) => (f.canalesConUmbralSupuesto ?? 0) / (f.canalesTotales || 1)));
  if (p > 0.5) problemas.push(`${pct(p)} de los umbrales son supuestos y no medidos`);
}
const hFinal = alcance.length ? entropiaNormalizada(cuenta(alcance.map((e) => e.canal))) : null;
if (hFinal !== null && hFinal > 0.85)
  problemas.push(`entropía ${hFinal.toFixed(3)}: el reparto por canal no muestra estructura`);

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
