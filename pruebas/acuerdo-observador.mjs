/** Pruebas del contraste contra observación independiente. */

import {
  alinear, metricasAcuerdo, intervalosCondiciones, eventosPorCondicion,
} from "./analisis-observaciones.mjs";
import { crearMarcador } from "./ayuda.mjs";

const m = crearMarcador("Acuerdo con observación independiente");

m.seccion("1. Alineación temporal");
{
  const datos = {
    observaciones: [
      { sesionId: 1, ts: 0, tipo: "perfil", valor: "positivo" },
      { sesionId: 1, ts: 3000, tipo: "perfil", valor: "neutro" },
      { sesionId: 1, ts: 3500, tipo: "condicion", valor: "vocalizacion" },
      { sesionId: 1, ts: 5000, tipo: "perfil", valor: "sin dato" },
    ],
    muestras: [
      { sesionId: 1, ts: 1000, estado: "positivo" },
      { sesionId: 1, ts: 2000, estado: "positivo" },
      { sesionId: 1, ts: 4000, estado: "neutro" },
      { sesionId: 1, ts: 6000, estado: "neutro" },
    ],
  };
  const pares = alinear(datos, 0);
  m.afirmar("Usa la última transición de perfil vigente", pares.length === 3, `${pares.length} pares`);
  m.afirmar("No confunde condiciones puntuales con perfiles",
    pares.every((p) => ["positivo", "neutro"].includes(p.observadora)), "solo perfiles");
  m.afirmar("Excluye los tramos marcados sin dato",
    !pares.some((p) => p.ts === 6000), "excluido");
}

m.seccion("2. Métricas");
{
  const pares = [
    { observadora: "positivo", sistema: "positivo" },
    { observadora: "positivo", sistema: "positivo" },
    { observadora: "neutro", sistema: "neutro" },
    { observadora: "negativo leve", sistema: "negativo leve" },
  ];
  const r = metricasAcuerdo(pares);
  m.afirmar("El acuerdo perfecto produce acuerdo observado 1", r.acuerdoObservado === 1, "1,00");
  m.afirmar("El acuerdo perfecto produce kappa 1", r.kappa === 1, "1,00");
  m.afirmar("El acuerdo perfecto produce AC1 1", r.ac1 === 1, "1,00");
}
{
  const pares = [
    { observadora: "positivo", sistema: "neutro" },
    { observadora: "neutro", sistema: "positivo" },
  ];
  const r = metricasAcuerdo(pares);
  m.afirmar("La matriz conserva la dirección observadora → sistema",
    r.matriz.positivo.neutro === 1 && r.matriz.neutro.positivo === 1, "2 desacuerdos");
  m.afirmar("Sin aciertos el acuerdo observado es cero", r.acuerdoObservado === 0, "0,00");
}

m.seccion("3. Condiciones y eventos");
{
  const observaciones = [
    { sesionId: 2, tMonotonicMs: 1000, tipo: "condicion", valor: "vocalizacion", activo: true },
    { sesionId: 2, tMonotonicMs: 4000, tipo: "condicion", valor: "vocalizacion", activo: false },
  ];
  const intervalos = intervalosCondiciones(observaciones);
  const resumen = eventosPorCondicion([
    { sesionId: 2, tApice: 2000, canal: "AU26" },
    { sesionId: 2, tApice: 5000, canal: "AU26" },
  ], intervalos);
  m.afirmar("Reconstruye intervalos desde transiciones inicio/fin",
    intervalos.length === 1 && intervalos[0].duracionMs === 3000, "3 s");
  m.afirmar("Solo cuenta eventos ocurridos dentro del intervalo observado",
    resumen.vocalizacion.eventos === 1, "1 de 2");
  m.afirmar("Conserva el canal para identificar artefactos dominantes",
    resumen.vocalizacion.porCanal.AU26 === 1, "AU26: 1");
}
m.cerrar();
