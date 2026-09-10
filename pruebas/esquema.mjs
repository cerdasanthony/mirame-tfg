/** Pruebas del contrato versionado de las exportaciones. */
import { validarEsquema } from "./esquema-exportacion.mjs";

let pasadas = 0;
let fallidas = 0;
const comprobar = (descripcion, condicion) => {
  if (condicion) pasadas++;
  else {
    fallidas++;
    console.error("✗ " + descripcion);
  }
};

comprobar("acepta la versión vigente", validarEsquema({
  esquema: "mirame-export",
  versionEsquema: 1,
}) === null);
comprobar("reconoce exportaciones históricas", typeof validarEsquema({ sesiones: [] }) === "string");

let rechazo = false;
try {
  validarEsquema({ esquema: "mirame-export", versionEsquema: 99 });
} catch {
  rechazo = true;
}
comprobar("rechaza versiones desconocidas", rechazo);

console.log(`Esquema: ${pasadas} comprobaciones pasadas, ${fallidas} fallidas.`);
if (fallidas) process.exit(1);
