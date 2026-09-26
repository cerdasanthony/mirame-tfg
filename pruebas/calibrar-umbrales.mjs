/**
 * Ajusta cortes ordinales usando sesiones completas de calibración y evalúa la
 * configuración elegida en sesiones reservadas.
 *
 * Uso:
 *   node pruebas/calibrar-umbrales.mjs export.json \
 *     --calibracion=12,13,14 --evaluacion=15,16 [--intervalo=1000]
 *
 * El programa nunca elige reglas con las etiquetas de evaluación. Compara el
 * compuesto operativo con el núcleo AU12/AU4 cuando el archivo contiene ambos.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { alinear, CATEGORIAS, metricasAcuerdo } from "./analisis-observaciones.mjs";
import { validarEsquema } from "./esquema-exportacion.mjs";

export const ORDEN = Object.fromEntries(CATEGORIAS.map((c, i) => [c, i]));

export function clasificarPuntaje(s, u) {
  if (s >= u.positivo) return "positivo";
  if (s >= u.neutro) return "neutro";
  if (s >= u.negativoLeve) return "negativo leve";
  return "negativo intenso";
}
const f1Clase = (matriz, categoria) => {
  const tp = matriz[categoria][categoria];
  const fp = CATEGORIAS.reduce((n, c) => n + (c === categoria ? 0 : matriz[c][categoria]), 0);
  const fn = CATEGORIAS.reduce((n, c) => n + (c === categoria ? 0 : matriz[categoria][c]), 0);
  const d = 2 * tp + fp + fn;
  return d ? (2 * tp) / d : null;
};

export function evaluarCortes(pares, umbrales, campo = "puntaje") {
  const clasificados = pares
    .filter((p) => Number.isFinite(p[campo]) && CATEGORIAS.includes(p.observadora))
    .map((p) => ({ ...p, sistema: clasificarPuntaje(p[campo], umbrales) }));
  const base = metricasAcuerdo(clasificados);
  const f1 = Object.fromEntries(CATEGORIAS.map((c) => [c, f1Clase(base.matriz, c)]));
  const presentes = CATEGORIAS.filter((c) =>
    clasificados.some((p) => p.observadora === c)
  );
  const macroF1 = presentes.length
    ? presentes.reduce((n, c) => n + (f1[c] ?? 0), 0) / presentes.length
    : null;
  const errorOrdinalMedio = clasificados.length
    ? clasificados.reduce((n, p) => n + Math.abs(ORDEN[p.observadora] - ORDEN[p.sistema]), 0)
      / clasificados.length
    : null;
  return { ...base, f1, macroF1, errorOrdinalMedio, categoriasPresentes: presentes };
}

function reducirCandidatos(xs, maximo = 61) {
  if (xs.length <= maximo) return xs;
  const elegidos = new Set();
  for (let i = 0; i < maximo; i++) {
    elegidos.add(xs[Math.round(i * (xs.length - 1) / (maximo - 1))]);
  }
  return [...elegidos].sort((a, b) => a - b);
}

/** Puntos medios observados: un corte dentro de un intervalo induce la misma partición. */
export function cortesCandidatos(pares, campo = "puntaje", maximo = 61) {
  const unicos = [...new Set(pares.map((p) => p[campo]).filter(Number.isFinite))]
    .sort((a, b) => a - b);
  const medios = [];
  for (let i = 1; i < unicos.length; i++) medios.push((unicos[i - 1] + unicos[i]) / 2);
  return reducirCandidatos(medios, maximo);
}

const mejorQue = (a, b) => {
  if (!b) return true;
  if (a.metricas.macroF1 !== b.metricas.macroF1) return a.metricas.macroF1 > b.metricas.macroF1;
  if (a.metricas.errorOrdinalMedio !== b.metricas.errorOrdinalMedio) {
    return a.metricas.errorOrdinalMedio < b.metricas.errorOrdinalMedio;
  }
  /* Desempate determinista: favorece una banda central más compacta. No cambia
     la métrica; evita que el resultado dependa del orden accidental del bucle. */
  return (a.umbrales.positivo - a.umbrales.negativoLeve)
    < (b.umbrales.positivo - b.umbrales.negativoLeve);
};

export function ajustarModelo(pares, campo = "puntaje", { maxCandidatos = 61 } = {}) {
  const validos = pares.filter((p) => Number.isFinite(p[campo]));
  const candidatos = cortesCandidatos(validos, campo, maxCandidatos);
  if (candidatos.length < 3) {
    throw new Error(`No hay suficientes puntajes distintos para estimar tres cortes en ${campo}.`);
  }
  let mejor = null;
  for (let i = 0; i < candidatos.length - 2; i++) {
    for (let j = i + 1; j < candidatos.length - 1; j++) {
      for (let k = j + 1; k < candidatos.length; k++) {
        const umbrales = {
          negativoLeve: candidatos[i],
          neutro: candidatos[j],
          positivo: candidatos[k],
        };
        const opcion = { umbrales, metricas: evaluarCortes(validos, umbrales, campo) };
        if (mejorQue(opcion, mejor)) mejor = opcion;
      }
    }
  }
  return { campo, candidatos: candidatos.length, pares: validos.length, ...mejor };
}

const ids = (xs) => new Set(xs.map(String));
const soporte = (pares) => Object.fromEntries(CATEGORIAS.map((c) => [
  c, pares.filter((p) => p.observadora === c).length,
]));

export function analizarAjuste(datos, {
  calibracion, evaluacion, intervaloMs = 1000, maxCandidatos = 61,
}) {
  if (!calibracion?.length || !evaluacion?.length) {
    throw new Error("Se requieren sesiones de calibración y de evaluación.");
  }
  const calIds = ids(calibracion);
  const evaIds = ids(evaluacion);
  const repetidas = [...calIds].filter((id) => evaIds.has(id));
  if (repetidas.length) throw new Error(`Sesiones presentes en ambos conjuntos: ${repetidas.join(", ")}`);

  const todos = alinear(datos, intervaloMs);
  const cal = todos.filter((p) => calIds.has(String(p.sesionId)));
  const eva = todos.filter((p) => evaIds.has(String(p.sesionId)));
  if (!cal.length) throw new Error("No hay pares alineados en las sesiones de calibración.");
  if (!eva.length) throw new Error("No hay pares alineados en las sesiones de evaluación.");

  const modelos = [
    { nombre: "compuesto-operativo", campo: "puntaje", complejidad: 14 },
    { nombre: "nucleo-au12-au4", campo: "puntajeNucleo", complejidad: 2 },
  ];
  const ajustes = [];
  const advertencias = [];
  for (const modelo of modelos) {
    if (!cal.some((p) => Number.isFinite(p[modelo.campo]))) {
      advertencias.push(`${modelo.nombre}: el archivo no contiene ${modelo.campo}.`);
      continue;
    }
    ajustes.push({ ...modelo, ...ajustarModelo(cal, modelo.campo, { maxCandidatos }) });
  }
  if (!ajustes.length) throw new Error("Ningún modelo tiene puntajes calibrables.");
  ajustes.sort((a, b) =>
    (b.metricas.macroF1 - a.metricas.macroF1)
    || (a.metricas.errorOrdinalMedio - b.metricas.errorOrdinalMedio)
    || (a.complejidad - b.complejidad)
  );
  const elegido = ajustes[0];
  const metricasEvaluacion = evaluarCortes(eva, elegido.umbrales, elegido.campo);

  for (const [nombre, pares] of [["calibración", cal], ["evaluación", eva]]) {
    const faltantes = Object.entries(soporte(pares)).filter(([, n]) => n === 0).map(([c]) => c);
    if (faltantes.length) advertencias.push(`${nombre}: sin soporte para ${faltantes.join(", ")}.`);
  }

  return {
    metodo: "cortes ordinales por puntos medios; selección solo en calibración",
    intervaloMuestreoMs: intervaloMs,
    sesiones: { calibracion: [...calIds], evaluacion: [...evaIds] },
    soporte: { calibracion: soporte(cal), evaluacion: soporte(eva) },
    modelosCalibracion: ajustes,
    elegido: {
      nombre: elegido.nombre,
      campo: elegido.campo,
      umbrales: elegido.umbrales,
      metricasCalibracion: elegido.metricas,
      metricasEvaluacion,
    },
    advertencias,
  };
}

function opcion(nombre) {
  const prefijo = `--${nombre}=`;
  return process.argv.find((x) => x.startsWith(prefijo))?.slice(prefijo.length);
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esPrincipal) {
  const archivo = process.argv[2];
  const calibracion = opcion("calibracion")?.split(",").filter(Boolean);
  const evaluacion = opcion("evaluacion")?.split(",").filter(Boolean);
  if (!archivo || !calibracion?.length || !evaluacion?.length) {
    console.error("Uso: node pruebas/calibrar-umbrales.mjs export.json --calibracion=1,2 --evaluacion=3,4 [--intervalo=1000]");
    process.exit(2);
  }
  const datos = JSON.parse(await readFile(archivo, "utf8"));
  const aviso = validarEsquema(datos);
  if (aviso) console.warn("⚠ " + aviso);
  const intervaloMs = Number(opcion("intervalo") ?? 1000);
  console.log(JSON.stringify(analizarAjuste(datos, { calibracion, evaluacion, intervaloMs }), null, 2));
}
