/** Contrato mínimo entre la interfaz, la orquestación y los archivos estáticos. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(raiz, "index.html"), "utf8");
const app = readFileSync(resolve(raiz, "js/app.js"), "utf8");

const idsLista = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
const ids = new Set(idsLista);
const referencias = new Set([...app.matchAll(/\bel\(["']([^"']+)["']\)/g)].map((m) => m[1]));
const faltantes = [...referencias].filter((id) => !ids.has(id));
const duplicados = [...new Set(idsLista.filter((id, i) => idsLista.indexOf(id) !== i))];

const recursos = [...html.matchAll(/\b(?:src|href)=["'](\.\/[^"'#?]+)["']/g)]
  .map((m) => m[1].slice(2));
const recursosFaltantes = [...new Set(recursos.filter((ruta) => !existsSync(resolve(raiz, ruta))))];

const fallos = [];
if (faltantes.length) fallos.push(`IDs usados por app.js y ausentes del HTML: ${faltantes.join(", ")}`);
if (duplicados.length) fallos.push(`IDs HTML duplicados: ${duplicados.join(", ")}`);
if (recursosFaltantes.length) fallos.push(`Recursos locales ausentes: ${recursosFaltantes.join(", ")}`);

if (fallos.length) {
  for (const f of fallos) console.error("✗ " + f);
  process.exit(1);
}
console.log("Estructura: 3 comprobaciones pasadas, 0 fallidas.");
