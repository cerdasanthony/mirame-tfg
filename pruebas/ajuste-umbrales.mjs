/** Pruebas del ajuste de cortes sin contaminación del conjunto reservado. */

import {
  ajustarModelo, analizarAjuste, clasificarPuntaje, evaluarCortes,
} from "./calibrar-umbrales.mjs";
import { crearMarcador } from "./ayuda.mjs";

const m = crearMarcador("Ajuste reproducible de umbrales");

const sinteticos = [];
for (const [observadora, centro] of [
  ["negativo intenso", -3], ["negativo leve", -1], ["neutro", 0.3], ["positivo", 2],
]) {
  for (const d of [-0.1, 0, 0.1]) sinteticos.push({ observadora, puntaje: centro + d });
}

m.seccion("1. Orden y recuperación");
{
  const r = ajustarModelo(sinteticos);
  m.afirmar("Los cortes conservan el orden requerido",
    r.umbrales.positivo > r.umbrales.neutro && r.umbrales.neutro > r.umbrales.negativoLeve,
    JSON.stringify(r.umbrales));
  m.afirmar("Separa perfectamente cuatro bandas no solapadas", r.metricas.macroF1 === 1, "F1 = 1");
  m.afirmar("El error ordinal perfecto es cero", r.metricas.errorOrdinalMedio === 0, "0");
  m.afirmar("El clasificador respeta los extremos",
    clasificarPuntaje(99, r.umbrales) === "positivo"
      && clasificarPuntaje(-99, r.umbrales) === "negativo intenso", "ordenado");
}

m.seccion("2. Métricas ordinales");
{
  const u = { positivo: 1, neutro: 0, negativoLeve: -1 };
  const adyacente = evaluarCortes([{ observadora: "positivo", puntaje: 0.5 }], u);
  const extremo = evaluarCortes([{ observadora: "positivo", puntaje: -2 }], u);
  m.afirmar("Un error extremo cuesta más que uno adyacente",
    extremo.errorOrdinalMedio > adyacente.errorOrdinalMedio,
    `${adyacente.errorOrdinalMedio} < ${extremo.errorOrdinalMedio}`);
}

m.seccion("3. Integridad de la partición");
{
  const datos = {
    observaciones: [
      { sesionId: 1, ts: 0, tipo: "perfil", valor: "neutro" },
      { sesionId: 2, ts: 0, tipo: "perfil", valor: "neutro" },
    ],
    muestras: [
      { sesionId: 1, ts: 1, estado: "neutro", puntaje: 0, puntajeNucleo: 0 },
      { sesionId: 2, ts: 1, estado: "neutro", puntaje: 0, puntajeNucleo: 0 },
    ],
  };
  let rechazo = false;
  try {
    analizarAjuste(datos, { calibracion: [1], evaluacion: [1] });
  } catch { rechazo = true; }
  m.afirmar("Rechaza una sesión presente en ajuste y evaluación", rechazo, "rechazada");
}

m.seccion("4. La evaluación no elige los cortes");
{
  const a = ajustarModelo(sinteticos);
  const evaluacionAlterada = sinteticos.map((p) => ({
    ...p,
    observadora: p.observadora === "positivo" ? "negativo intenso" : "positivo",
  }));
  evaluarCortes(evaluacionAlterada, a.umbrales);
  const b = ajustarModelo(sinteticos);
  m.afirmar("Consultar otras etiquetas no modifica el ajuste",
    JSON.stringify(a.umbrales) === JSON.stringify(b.umbrales), JSON.stringify(b.umbrales));
}

m.cerrar();
