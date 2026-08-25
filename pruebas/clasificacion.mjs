/**
 * Comprobaciones del clasificador tonico.
 *
 * POR QUE EXISTE
 * El clasificador se corrigio varias veces seguidas y cada correccion rompio
 * algo que la anterior habia arreglado: al rectificar la evidencia dejo de
 * leerse «positivo» al abrir los ojos, pero una sonrisa genuina paso a leerse
 * negativa; al ampliar la cobertura muscular con la region nasolabial, el
 * puchero que acababa de detectarse volvio a neutro. Cada vez se comprobo a
 * mano el caso recien tocado y no los demas.
 *
 * Esta prueba recoge las configuraciones de FACS que el sistema debe distinguir
 * y las verifica TODAS de una vez. Cualquier cambio en `classifier.js` o en los
 * canales de `features.js` se contrasta contra el conjunto completo.
 *
 * QUE NO COMPRUEBA
 * Que el rostro real produzca esas puntuaciones z. Eso depende de la linea base
 * y del dispositivo, y se mide sobre registros reales con
 * `analisis-sesion.mjs`. Aqui se comprueba la REGLA: dado un vector de
 * evidencia, que el estado asignado sea el correcto.
 *
 *   node pruebas/clasificacion.mjs
 */

import { puntaje, estadoDe, NORMA } from "../js/classifier.js";
import { CARACTERISTICAS } from "../js/features.js";

const cero = Object.fromEntries(CARACTERISTICAS.map((c) => [c, 0]));
NORMA.centro = 0;

let ok = 0;
let fallos = 0;

function comprobar(nombre, z, esperado, nota = "") {
  const p = puntaje({ ...cero, ...z });
  const est = estadoDe(p);
  const bien = est === esperado;
  if (bien) ok++;
  else fallos++;
  console.log(
    `  ${bien ? "✓" : "✗"} ${nombre.padEnd(46)}${p.toFixed(2).padStart(7)}  ${est}` +
      (bien ? "" : `   ESPERADO: ${esperado}`) +
      (nota && bien ? `  — ${nota}` : "")
  );
}

console.log("\n1. Configuraciones de FACS con valencia declarada");
console.log("═".repeat(78));
comprobar("Alegria · AU12", { sonrisa: 3 }, "positivo");
comprobar("Alegria con constriccion ocular · AU12+AU7", { sonrisa: 3, tensionOcular: 3 },
  "positivo", "AU12 descuenta AU7: es el marcador de Duchenne, no distres");
comprobar("Tristeza · AU1+AU4+AU15", { cejasInternasArriba: 2, cejasAbajo: 2, comisurasAbajo: 2 },
  "negativo leve");
comprobar("Tristeza marcada · AU1+AU4+AU15 a 3σ",
  { cejasInternasArriba: 3, cejasAbajo: 3, comisurasAbajo: 3 }, "negativo intenso");
comprobar("Puchero · AU17", { menton: 3 }, "negativo intenso",
  "el mentalis es el musculo del gesto previo al llanto");
comprobar("Puchero · AU17+AU18", { menton: 3, labiosFruncidos: 3 }, "negativo intenso");
comprobar("Asco · AU9+AU10", { narizArrugada: 3, labioSuperiorArriba: 3 }, "negativo intenso",
  "tercer termino del indice de Prkachin y Solomon");
comprobar("Miedo · AU1+AU2+AU4+AU5+AU20",
  { cejasInternasArriba: 3, cejasExternasArriba: 3, cejasAbajo: 3, ojosAbiertos: 3, labiosEstirados: 3 },
  "negativo intenso");

console.log("\n2. Configuraciones SIN valencia declarada");
console.log("═".repeat(78));
comprobar("Sorpresa · AU1+AU2+AU5", { cejasInternasArriba: 3, cejasExternasArriba: 3, ojosAbiertos: 3 },
  "neutro", "AU2 cancela a AU1 y sin AU4 la apertura ocular no es miedo");
comprobar("Apertura mandibular · AU26", { aperturaBucal: 4 }, "neutro",
  "acompana por igual al habla, al bostezo y al llanto");
comprobar("Reposo", {}, "neutro");

console.log("\n3. Errores observados al probar, que no deben reaparecer");
console.log("═".repeat(78));
comprobar("Ojos muy abiertos, sin AU4", { tensionOcular: -3 }, "neutro",
  "un blendshape por debajo del reposo es ausencia, no evidencia contraria");
comprobar("Ojos muy abiertos · AU5 sin AU4", { ojosAbiertos: 4 }, "neutro",
  "AU5 solo aporta acompanada de AU4; sin ella es sorpresa");
comprobar("Cejas alzadas completas · AU1+AU2", { cejasInternasArriba: 3, cejasExternasArriba: 3 },
  "neutro", "AU1 sola es distres; con AU2 es sorpresa");
comprobar("Sonrisa con entrecerrado intenso", { sonrisa: 2, tensionOcular: 6 }, "negativo leve",
  "solo el exceso de AU7 sobre AU12 cuenta como distres");
comprobar("Todos los canales negativos por debajo del reposo",
  Object.fromEntries(CARACTERISTICAS.filter((c) => c !== "sonrisa").map((c) => [c, -3])),
  "neutro", "la ausencia generalizada no es evidencia positiva");

console.log("\n4. Simetria y monotonia");
console.log("═".repeat(78));
{
  const creciente = [1, 2, 3, 4].map((k) => puntaje({ ...cero, menton: k }));
  const mono = creciente.every((v, i) => i === 0 || v < creciente[i - 1]);
  console.log(`  ${mono ? "✓" : "✗"} ${"A mas intensidad, mas negativo".padEnd(46)}` +
    `${creciente.map((v) => v.toFixed(1)).join(" ")}`);
  mono ? ok++ : fallos++;
}
{
  const p = puntaje({ ...cero, sonrisa: 3 });
  const n = puntaje({ ...cero, menton: 3 });
  const sim = Math.abs(p + n) < 1e-9;
  console.log(`  ${sim ? "✓" : "✗"} ${"Un lado y el otro pesan igual".padEnd(46)}` +
    `${p.toFixed(2)} frente a ${n.toFixed(2)}`);
  sim ? ok++ : fallos++;
}
{
  /* Una region no debe diluirse por que existan otras. Es el fallo que hizo que
     ampliar la cobertura muscular redujera la sensibilidad. */
  const sola = puntaje({ ...cero, narizArrugada: 3 });
  const acompanada = puntaje({ ...cero, narizArrugada: 3, cejasAbajo: 3 });
  const bien = Math.abs(sola - acompanada) < 1e-9;
  console.log(`  ${bien ? "✓" : "✗"} ${"Una region sola no se diluye entre las demas".padEnd(46)}` +
    `${sola.toFixed(2)} frente a ${acompanada.toFixed(2)}`);
  bien ? ok++ : fallos++;
}

console.log("\n" + "─".repeat(78));
console.log(`${ok} comprobaciones pasadas, ${fallos} fallidas.\n`);
if (fallos) process.exit(1);
