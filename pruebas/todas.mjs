/**
 * Corre todas las baterías y devuelve un solo veredicto.
 *
 * POR QUE HACE FALTA
 * Con las pruebas repartidas en varios archivos, es fácil correr la del módulo
 * que se acaba de tocar y dar por buena la sesión. Fue exactamente lo que pasó:
 * cada corrección del clasificador se comprobó a mano contra el caso recién
 * arreglado y no contra los demás, de modo que arreglar una cosa rompía otra
 * sin que nada avisara.
 *
 *   node pruebas/todas.mjs
 *
 * Devuelve código de salida distinto de cero si alguna falla, para que sirva
 * también desde un gancho de git o desde integración continua.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));

const BATERIAS = [
  ["clasificacion.mjs", "Regla de clasificación sobre puntuaciones z"],
  ["expresiones.mjs", "Cada expresión, del coeficiente al estado"],
  ["linea-base.mjs", "La referencia contra la que se mide todo"],
  ["deteccion-fasica.mjs", "Detección de eventos breves"],
  ["acuerdo-observador.mjs", "Contraste con observación independiente"],
];

let fallidas = 0;
const resumen = [];

for (const [archivo, descripcion] of BATERIAS) {
  const r = spawnSync(process.execPath, [join(aqui, archivo)], { encoding: "utf-8" });
  const salida = (r.stdout ?? "") + (r.stderr ?? "");
  const linea = salida.split("\n").reverse()
    .find((l) => /comprobaciones pasadas/.test(l)) ?? "sin resumen";
  const bien = r.status === 0;
  if (!bien) fallidas++;
  resumen.push({ archivo, descripcion, bien, linea: linea.trim(), salida });
}

console.log("\n" + "═".repeat(78));
console.log("  MÍRAME · BATERÍA COMPLETA");
console.log("═".repeat(78));
for (const r of resumen) {
  console.log(`\n  ${r.bien ? "✓" : "✗"} ${r.archivo.padEnd(24)} ${r.descripcion}`);
  console.log(`    ${r.linea}`);
  if (!r.bien) {
    console.log("\n" + r.salida.split("\n").filter((l) => l.includes("✗")).map((l) => "    " + l).join("\n"));
  }
}
console.log("\n" + "═".repeat(78));
if (fallidas) {
  console.log(`  ${fallidas} de ${BATERIAS.length} baterías con fallos.\n`);
  process.exit(1);
}
console.log(`  Las ${BATERIAS.length} baterías pasan.\n`);
