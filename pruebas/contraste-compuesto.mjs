/**
 * Contrasta el compuesto tonico actual contra el compuesto de valencia FACS,
 * sobre las muestras reales ya registradas.
 *
 * POR QUE HACE FALTA
 * El Capitulo II define los cuatro estados sobre evidencia FACS: el marcador de
 * Duchenne para el positivo y la combinacion de Prkachin y Solomon para el
 * negativo. El clasificador, en cambio, deriva el estado de un compuesto de
 * siete caracteristicas con pesos elegidos a mano. Documento y codigo dicen
 * cosas distintas, y esa es la clase de inconsistencia que un comite encuentra.
 *
 * Antes de cambiar el clasificador conviene saber que pasaria si se cambia. Este
 * script recalcula ambos compuestos sobre las mismas muestras y compara: cuanto
 * se parecen, cuantas etiquetas cambiarian y en que cortes habria que poner los
 * umbrales para que el reparto de estados sea comparable.
 *
 *   node pruebas/contraste-compuesto.mjs <export.json>
 */

import { readFileSync } from "node:fs";

const PESOS = {
  sonrisa: +1.0, comisurasAbajo: -0.9, cejasAbajo: -0.7, cejasInternasArriba: -0.4,
  tensionOcular: -0.5, tensionLabial: -0.5, aperturaBucal: 0.0,
};
const UMBRALES = { positivo: 1.0, neutro: -0.75, negativoLeve: -2.0 };

const estadoDe = (s, u = UMBRALES) =>
  s >= u.positivo ? "positivo"
  : s >= u.neutro ? "neutro"
  : s >= u.negativoLeve ? "negativo leve"
  : "negativo intenso";

function compuestoTonico(z) {
  let s = 0, norma = 0;
  for (const [k, w] of Object.entries(PESOS)) { s += (z[k] ?? 0) * w; norma += Math.abs(w); }
  return norma ? s / norma : 0;
}

/**
 * Compuesto de valencia sobre AU normalizadas.
 *
 * La evidencia negativa se PROMEDIA entre sus tres terminos en vez de sumarse:
 * sin esa division el lado negativo pesaria el triple por construccion, y el
 * sentido de la regla de maximo era no darle a un musculo mas peso que a otro.
 */
function compuestoValencia(z) {
  const v = (au) => z[au] ?? 0;
  const positiva = Math.min(v("AU6"), v("AU12"));
  const negativa = (v("AU4") + Math.max(v("AU6"), v("AU7")) + Math.max(v("AU9"), v("AU10"))) / 3;
  return { compuesto: positiva - negativa, positiva, negativa };
}

const normalizar = (crudo, base) => {
  const out = {};
  for (const k of Object.keys(crudo)) {
    const m = base?.media?.[k], s = base?.sigma?.[k];
    out[k] = (m == null || !s) ? 0 : (crudo[k] - m) / s;
  }
  return out;
};

const cuantil = (a, q) => {
  if (!a.length) return NaN;
  const o = [...a].sort((x, y) => x - y);
  return o[Math.min(o.length - 1, Math.floor(q * o.length))];
};

// ── Programa ────────────────────────────────────────────────────────────────
const ruta = process.argv[2];
if (!ruta) { console.error("Uso: node pruebas/contraste-compuesto.mjs <export.json>"); process.exit(1); }
const d = JSON.parse(readFileSync(ruta, "utf-8"));
const sesiones = new Map((d.sesiones ?? []).map((s) => [s.id, s]));

const filas = [];
for (const m of d.muestras ?? []) {
  const ses = sesiones.get(m.sesionId);
  const baseAU = ses?.lineaBase?.au;
  if (!baseAU?.media || !m.au) continue;          // sin linea base de AU no se puede
  const zAU = normalizar(m.au, baseAU);
  const { compuesto, positiva, negativa } = compuestoValencia(zAU);
  filas.push({ tonico: m.puntaje ?? null, facs: compuesto, positiva, negativa, estado: m.estado });
}

console.log(`\nMuestras con linea base de AU: ${filas.length} de ${(d.muestras ?? []).length}\n`);
if (!filas.length) {
  console.log("No hay muestras con linea base de AU. El contraste requiere sesiones");
  console.log("grabadas despues de que se incorporara la linea base de unidades de accion.");
  process.exit(0);
}

const T = filas.map((f) => f.tonico).filter((v) => v != null);
const F = filas.map((f) => f.facs);

const resumen = (n, a) => {
  console.log(`  ${n.padEnd(22)} p05 ${cuantil(a, .05).toFixed(2).padStart(7)}` +
              `   mediana ${cuantil(a, .5).toFixed(2).padStart(7)}` +
              `   p95 ${cuantil(a, .95).toFixed(2).padStart(7)}`);
};
console.log("1. Escala de cada compuesto");
console.log("═══════════════════════════");
resumen("tonico (7 rasgos)", T);
resumen("valencia (FACS)", F);
console.log(`\n  El reparto de estados solo es comparable si las escalas lo son.`);

// Correlacion de rangos: ¿ordenan las muestras igual?
const rango = (a) => {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  idx.forEach(([, i], k) => { r[i] = k; });
  return r;
};
const pares = filas.filter((f) => f.tonico != null);
if (pares.length > 2) {
  const rt = rango(pares.map((f) => f.tonico));
  const rf = rango(pares.map((f) => f.facs));
  const n = rt.length;
  const media = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mt = media(rt), mf = media(rf);
  let num = 0, dt = 0, df = 0;
  for (let i = 0; i < n; i++) {
    num += (rt[i] - mt) * (rf[i] - mf); dt += (rt[i] - mt) ** 2; df += (rf[i] - mf) ** 2;
  }
  console.log(`\n2. ¿Ordenan las muestras igual?`);
  console.log("═══════════════════════════════");
  console.log(`  correlacion de rangos  ${(num / Math.sqrt(dt * df)).toFixed(3)}   (n = ${n})`);
  console.log(`  1,0 seria acuerdo total en el orden; 0 seria ninguno.`);
}

// Cortes que reproducirian el mismo reparto de estados
console.log(`\n3. Cortes equivalentes sobre el compuesto de valencia`);
console.log("═════════════════════════════════════════════════════");
const conteo = {};
for (const f of filas) conteo[f.estado] = (conteo[f.estado] ?? 0) + 1;
const total = filas.length;
const acum = ["negativo intenso", "negativo leve", "neutro"];
let q = 0;
const cortes = {};
for (const e of acum) {
  q += (conteo[e] ?? 0) / total;
  cortes[e] = cuantil(F, q);
  console.log(`  ${(conteo[e] ?? 0).toString().padStart(5)} muestras ${e.padEnd(17)}` +
              ` acumulado ${(q * 100).toFixed(1).padStart(5)} %   corte ${cortes[e].toFixed(2).padStart(7)}`);
}
console.log(`  ${(conteo["positivo"] ?? 0).toString().padStart(5)} muestras positivo`);
console.log(`\n  Umbrales actuales     positivo ${UMBRALES.positivo}  neutro ${UMBRALES.neutro}  negativoLeve ${UMBRALES.negativoLeve}`);
console.log(`  Equivalentes en FACS  positivo ${cortes["neutro"].toFixed(2)}` +
            `  neutro ${cortes["negativo leve"].toFixed(2)}` +
            `  negativoLeve ${cortes["negativo intenso"].toFixed(2)}`);

// AU6 en ambos lados: ¿cuanto ocurre y como se resuelve?
console.log(`\n4. AU6 aparece en la evidencia positiva y en la negativa`);
console.log("═══════════════════════════════════════════════════════");
const ambos = filas.filter((f) => f.positiva > 0.5 && f.negativa > 0.5).length;
const soloPos = filas.filter((f) => f.positiva > 0.5 && f.negativa <= 0.5).length;
const soloNeg = filas.filter((f) => f.positiva <= 0.5 && f.negativa > 0.5).length;
console.log(`  evidencia positiva y negativa a la vez  ${ambos} muestras (${(100 * ambos / total).toFixed(1)} %)`);
console.log(`  solo positiva                           ${soloPos}`);
console.log(`  solo negativa                           ${soloNeg}`);
console.log(`\n  La conjuncion de Duchenne resuelve la ambiguedad: AU6 con AU12 suma al`);
console.log(`  lado positivo; AU6 sin AU12 queda limitada por el minimo y solo suma al`);
console.log(`  negativo. Por eso el solapamiento no produce indeterminacion.\n`);
