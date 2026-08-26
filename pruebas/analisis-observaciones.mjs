/**
 * Contrasta la clasificación del sistema con la codificación independiente.
 *
 * Uso:
 *   node pruebas/analisis-observaciones.mjs export.json [intervalo-ms]
 *
 * Las marcas de perfil se interpretan como transiciones: cada una permanece
 * vigente hasta la siguiente marca de la misma sesión. Las condiciones
 * puntuales (vocalización, cierre ocular, etc.) no se convierten en perfiles y
 * se analizan por separado.
 *
 * Por defecto se toma como máximo una muestra por segundo. Los vectores se
 * almacenan cada 250 ms y son autocorrelacionados; tratarlos como cuatro
 * observaciones independientes por segundo inflaría artificialmente el tamaño
 * de muestra y el acuerdo aparente.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const CATEGORIAS = ["positivo", "neutro", "negativo leve", "negativo intenso"];

const observacionPerfil = (o) => {
  const tipo = o.tipo ?? (o.estado ? "perfil" : null); // compatibilidad con v4
  const valor = o.valor ?? o.estado ?? null;
  return tipo === "perfil" && valor ? { ...o, valor } : null;
};

/** Empareja muestras con el último perfil independiente vigente. */
export function alinear(datos, intervaloMs = 1000) {
  const porSesion = new Map();
  for (const original of datos.observaciones ?? []) {
    const o = observacionPerfil(original);
    if (!o || !Number.isFinite(o.ts)) continue;
    const xs = porSesion.get(o.sesionId) ?? [];
    xs.push(o);
    porSesion.set(o.sesionId, xs);
  }
  for (const xs of porSesion.values()) xs.sort((a, b) => a.ts - b.ts);

  const ultimas = new Map();
  const pares = [];
  const muestras = [...(datos.muestras ?? [])]
    .filter((m) => Number.isFinite(m.ts) && CATEGORIAS.includes(m.estado))
    .sort((a, b) => a.ts - b.ts);

  for (const m of muestras) {
    const obs = porSesion.get(m.sesionId) ?? [];
    let vigente = null;
    for (const o of obs) {
      if (o.ts > m.ts) break;
      vigente = o;
    }
    if (!vigente || vigente.valor === "sin dato" || !CATEGORIAS.includes(vigente.valor)) continue;

    const ultima = ultimas.get(m.sesionId) ?? -Infinity;
    if (intervaloMs > 0 && m.ts - ultima < intervaloMs) continue;
    ultimas.set(m.sesionId, m.ts);
    pares.push({
      sesionId: m.sesionId,
      ts: m.ts,
      sistema: m.estado,
      observadora: vigente.valor,
    });
  }
  return pares;
}

const seguro = (n, d) => d ? n / d : null;

/** Métricas descriptivas de acuerdo para categorías nominales. */
export function metricasAcuerdo(pares, categorias = CATEGORIAS) {
  const matriz = Object.fromEntries(categorias.map((a) => [
    a,
    Object.fromEntries(categorias.map((b) => [b, 0])),
  ]));
  for (const p of pares) {
    if (matriz[p.observadora]?.[p.sistema] === undefined) continue;
    matriz[p.observadora][p.sistema]++;
  }

  const n = categorias.reduce((s, a) =>
    s + categorias.reduce((t, b) => t + matriz[a][b], 0), 0);
  const aciertos = categorias.reduce((s, c) => s + matriz[c][c], 0);
  const po = seguro(aciertos, n);

  const fila = Object.fromEntries(categorias.map((a) => [
    a, categorias.reduce((s, b) => s + matriz[a][b], 0),
  ]));
  const columna = Object.fromEntries(categorias.map((b) => [
    b, categorias.reduce((s, a) => s + matriz[a][b], 0),
  ]));

  const peKappa = n
    ? categorias.reduce((s, c) => s + (fila[c] / n) * (columna[c] / n), 0)
    : null;
  const kappa = po === null || peKappa === 1 ? null : (po - peKappa) / (1 - peKappa);

  /* Gwet AC1 para dos evaluadores y q categorías nominales. La probabilidad
     marginal de cada categoría es el promedio de ambos evaluadores; el acuerdo
     esperado usa sum p_k(1-p_k)/(q-1). Se reporta junto a kappa, no en su lugar. */
  const q = categorias.length;
  const peAC1 = n && q > 1
    ? categorias.reduce((s, c) => {
        const p = (fila[c] + columna[c]) / (2 * n);
        return s + p * (1 - p);
      }, 0) / (q - 1)
    : null;
  const ac1 = po === null || peAC1 === 1 ? null : (po - peAC1) / (1 - peAC1);

  const porCategoria = {};
  for (const c of categorias) {
    const vp = matriz[c][c];
    const fp = columna[c] - vp;
    const fn = fila[c] - vp;
    const precision = seguro(vp, vp + fp);
    const exhaustividad = seguro(vp, vp + fn);
    porCategoria[c] = {
      soporteObservadora: fila[c],
      soporteSistema: columna[c],
      precision,
      exhaustividad,
      f1: precision === null || exhaustividad === null || precision + exhaustividad === 0
        ? null
        : 2 * precision * exhaustividad / (precision + exhaustividad),
    };
  }

  return { n, matriz, acuerdoObservado: po, kappa, ac1, porCategoria };
}

/** Convierte transiciones de condición en intervalos observados. */
export function intervalosCondiciones(observaciones = []) {
  const transiciones = observaciones
    .filter((o) => o.tipo === "condicion" && o.valor && Number.isFinite(o.tMonotonicMs))
    .sort((a, b) => a.tMonotonicMs - b.tMonotonicMs);
  const abiertos = new Map();
  const intervalos = [];
  for (const o of transiciones) {
    const clave = `${o.sesionId}::${o.valor}`;
    if (o.activo !== false) {
      abiertos.set(clave, o);
      continue;
    }
    const inicio = abiertos.get(clave);
    if (!inicio) continue;
    intervalos.push({
      sesionId: o.sesionId,
      condicion: o.valor,
      inicioMs: inicio.tMonotonicMs,
      finMs: o.tMonotonicMs,
      duracionMs: Math.max(0, o.tMonotonicMs - inicio.tMonotonicMs),
    });
    abiertos.delete(clave);
  }
  return intervalos;
}

/** Cuenta eventos fásicos que caen dentro de cada condición codificada. */
export function eventosPorCondicion(eventos = [], intervalos = []) {
  const out = {};
  for (const i of intervalos) {
    const xs = eventos.filter((e) =>
      e.sesionId === i.sesionId && Number.isFinite(e.tApice)
      && e.tApice >= i.inicioMs && e.tApice <= i.finMs
    );
    const r = out[i.condicion] ??= { intervalos: 0, duracionMs: 0, eventos: 0, porCanal: {} };
    r.intervalos++;
    r.duracionMs += i.duracionMs;
    r.eventos += xs.length;
    for (const e of xs) r.porCanal[e.canal] = (r.porCanal[e.canal] ?? 0) + 1;
  }
  for (const r of Object.values(out)) {
    r.eventosPorMinutoObservado = r.duracionMs
      ? Number((r.eventos / (r.duracionMs / 60000)).toFixed(3))
      : null;
  }
  return out;
}

export function analizar(datos, intervaloMs = 1000) {
  const pares = alinear(datos, intervaloMs);
  const condiciones = (datos.observaciones ?? [])
    .filter((o) => o.tipo === "condicion" && o.activo !== false);
  const intervalos = intervalosCondiciones(datos.observaciones ?? []);
  return {
    intervaloMuestreoMs: intervaloMs,
    sesionesConPares: new Set(pares.map((p) => p.sesionId)).size,
    condicionesObservadas: condiciones.reduce((a, o) => {
      const k = o.valor ?? "sin etiqueta";
      a[k] = (a[k] ?? 0) + 1;
      return a;
    }, {}),
    eventosPorCondicion: eventosPorCondicion(datos.eventos ?? [], intervalos),
    ...metricasAcuerdo(pares),
  };
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esPrincipal) {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error("Uso: node pruebas/analisis-observaciones.mjs export.json [intervalo-ms]");
    process.exit(2);
  }
  const intervalo = Number(process.argv[3] ?? 1000);
  const datos = JSON.parse(await readFile(archivo, "utf8"));
  console.log(JSON.stringify(analizar(datos, intervalo), null, 2));
}
