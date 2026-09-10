/** Verificación de sintaxis para todos los módulos versionados del proyecto. */
import { readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directorios = [join(raiz, "js"), join(raiz, "pruebas")];
const archivos = directorios.flatMap((dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && [".js", ".mjs"].includes(extname(e.name)))
    .map((e) => join(dir, e.name))
);
archivos.push(join(raiz, "sw.js"));

let fallos = 0;
for (const archivo of archivos) {
  const r = spawnSync(process.execPath, ["--check", archivo], { encoding: "utf8" });
  if (r.status !== 0) {
    fallos++;
    console.error(`✗ ${archivo}\n${r.stderr}`);
  }
}

if (fallos) process.exit(1);
console.log(`Sintaxis: ${archivos.length} comprobaciones pasadas, 0 fallidas.`);
