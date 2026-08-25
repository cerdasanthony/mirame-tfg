/**
 * Cada expresión posible, de extremo a extremo.
 *
 * QUE COMPRUEBA Y POR QUE ASI
 * `clasificacion.mjs` verifica la REGLA: dado un vector de puntuaciones z, que
 * el estado sea el correcto. Esta batería comprueba el CAMINO COMPLETO, que es
 * donde estuvieron casi todos los fallos reales: coeficientes del modelo →
 * extracción de canales → normalización contra la línea base → compuesto →
 * estado.
 *
 * Los tres errores observados al probar la aplicación se colaron por ese camino
 * y no por la regla. El puchero no se detectaba porque el mentalis no era un
 * canal; el asco no tenía por dónde entrar porque faltaba la región nasolabial;
 * abrir los ojos daba positivo porque un coeficiente por debajo del reposo
 * cambiaba de signo. Ninguno de los tres lo habría visto una prueba escrita
 * sobre puntuaciones z.
 *
 *   node pruebas/expresiones.mjs
 */

import { LineaBase, extract, CARACTERISTICAS } from "../js/features.js";
import { puntaje, estadoDe, NORMA } from "../js/classifier.js";
import { crearMarcador, rostro, lineaBaseSintetica, AU_BLENDSHAPES } from "./ayuda.mjs";

const m = crearMarcador("Expresiones");
const base = await lineaBaseSintetica();
NORMA.centro = 0;

/** Estado que el sistema asigna a un rostro con esas unidades de acción. */
function estadoDe_(unidades) {
  const z = base.normalizar(extract(rostro(unidades)));
  return { p: puntaje(z), estado: estadoDe(puntaje(z)) };
}

function esperar(nombre, unidades, esperado, nota = "") {
  const { p, estado } = estadoDe_(unidades);
  m.afirmar(nombre, estado === esperado,
    `${p.toFixed(2)} ${estado === esperado ? estado : `${estado}≠${esperado}`}`, nota);
}

/* ═══════════════════════════════════════════════════════════════════════
   1. Las configuraciones emocionales de FACS
   Cada una es la combinación que el sistema de codificación asocia a esa
   expresión. Se prueban a intensidad alta, que es cuando deben distinguirse
   con claridad.
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("1. Configuraciones emocionales de FACS");
const I = 0.7;
esperar("Alegría · AU12", { AU12: I }, "positivo");
esperar("Alegría con constricción ocular · AU12+AU7", { AU12: I, AU7: I }, "positivo",
  "AU7 con AU12 es el marcador de Duchenne, no distrés");
esperar("Tristeza · AU1+AU4+AU15", { AU1: I, AU4: I, AU15: I }, "negativo intenso");
esperar("Puchero · AU17", { AU17: I }, "negativo intenso",
  "el mentalis es el músculo del gesto previo al llanto");
esperar("Puchero completo · AU17+AU18+AU15", { AU17: I, AU18: I, AU15: I }, "negativo intenso");
esperar("Asco · AU9+AU10", { AU9: I, AU10: I }, "negativo intenso");
esperar("Miedo · AU1+AU2+AU4+AU5+AU20", { AU1: I, AU2: I, AU4: I, AU5: I, AU20: I },
  "negativo intenso");
esperar("Ira · AU4+AU5+AU7+AU24", { AU4: I, AU5: I, AU7: I, AU24: I }, "negativo intenso");
esperar("Sorpresa · AU1+AU2+AU5+AU26", { AU1: I, AU2: I, AU5: I, AU26: I }, "neutro",
  "sin AU4 no es miedo, y la sorpresa no tiene valencia declarada");

/* ═══════════════════════════════════════════════════════════════════════
   2. Cada unidad de acción por separado
   Una unidad aislada rara vez es una emoción, pero su aporte al compuesto sí
   debe ser el que la literatura le atribuye. Si alguna cambia de signo sin que
   nadie lo pretenda, aquí se ve.
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("2. Cada unidad de acción por separado");
const SIGNO = {
  AU1: "negativo", AU2: "sin valencia", AU4: "negativo", AU5: "sin valencia",
  AU7: "negativo", AU9: "negativo", AU10: "negativo", AU12: "positivo",
  AU15: "negativo", AU17: "negativo", AU18: "negativo", AU20: "negativo",
  AU24: "negativo", AU26: "sin valencia",
};
for (const [au, signo] of Object.entries(SIGNO)) {
  const { p } = estadoDe_({ [au]: I });
  const observado = p > 0.3 ? "positivo" : p < -0.3 ? "negativo" : "sin valencia";
  m.afirmar(`${au} sola → ${signo}`, observado === signo,
    `${p.toFixed(2)} ${observado === signo ? "" : `(${observado})`}`);
}

/* ═══════════════════════════════════════════════════════════════════════
   3. Las tres modulaciones
   Son las reglas que distinguen configuraciones que comparten unidades. Cada
   una responde a una ambigüedad concreta de FACS.
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("3. Modulaciones entre unidades");
{
  const sola = estadoDe_({ AU1: I }).p;
  const conAU2 = estadoDe_({ AU1: I, AU2: I }).p;
  m.afirmar("AU2 cancela a AU1 · distrés frente a sorpresa", conAU2 > sola + 0.4,
    `${sola.toFixed(2)} → ${conAU2.toFixed(2)}`);
}
{
  const sola = estadoDe_({ AU7: I }).p;
  const conAU12 = estadoDe_({ AU7: I, AU12: I }).p;
  m.afirmar("AU12 descuenta a AU7 · Duchenne frente a distrés", conAU12 > sola + 0.4,
    `${sola.toFixed(2)} → ${conAU12.toFixed(2)}`);
}
{
  const sola = estadoDe_({ AU5: I }).p;
  const conAU4 = estadoDe_({ AU5: I, AU4: I }).p;
  m.afirmar("AU4 habilita a AU5 · sorpresa frente a miedo", conAU4 < sola - 0.4,
    `${sola.toFixed(2)} → ${conAU4.toFixed(2)}`);
}

/* ═══════════════════════════════════════════════════════════════════════
   4. Errores observados al probar la aplicación
   Cada uno se vio con la cara delante de la cámara. Quedan aquí para que no
   puedan reaparecer sin que la batería falle.
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("4. Errores observados, que no deben reaparecer");
esperar("Rostro en reposo", {}, "neutro",
  "un rostro sin expresión no puede leerse como negativo intenso");
{
  /* Abrir mucho los ojos REDUCE el entrecerrado: el coeficiente cae por debajo
     del reposo. Antes de rectificar, eso se contaba como evidencia positiva. */
  const bs = rostro({});
  for (const k of AU_BLENDSHAPES.AU7) bs[k] = 0;
  const p = puntaje(base.normalizar(extract(bs)));
  m.afirmar("Ojos muy abiertos no dan positivo", p < 0.5, p.toFixed(2),
    "la ausencia de una acción no es evidencia de la contraria");
}
esperar("Alzar las cejas no da negativo", { AU1: I, AU2: I }, "neutro");
esperar("Sonreír no da negativo", { AU12: I, AU7: I * 0.8 }, "positivo");

/* ═══════════════════════════════════════════════════════════════════════
   5. Intensidad y proporcionalidad
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("5. Intensidad");
{
  const serie = [0.2, 0.4, 0.6, 0.8].map((v) => estadoDe_({ AU17: v }).p);
  const mono = serie.every((v, i) => i === 0 || v <= serie[i - 1] + 1e-9);
  m.afirmar("Un puchero más marcado da un valor más negativo", mono,
    serie.map((v) => v.toFixed(1)).join(" "));
}
{
  const serie = [0.2, 0.4, 0.6, 0.8].map((v) => estadoDe_({ AU12: v }).p);
  const mono = serie.every((v, i) => i === 0 || v >= serie[i - 1] - 1e-9);
  m.afirmar("Una sonrisa más marcada da un valor más positivo", mono,
    serie.map((v) => v.toFixed(1)).join(" "));
}
/* ═══════════════════════════════════════════════════════════════════════
   ANCHURA UTIL DE LA BANDA INTERMEDIA

   Los cortes son +1,00, -0,75 y -2,00 desviaciones tipicas, de modo que
   «negativo leve» ocupa el tramo entre 0,75 y 2,00. Con la dispersion de la
   linea base en su piso de 0,05, una intensidad de 0,20 en un coeficiente ya
   produce 3,6 sigmas: por encima del corte de intenso.

   La consecuencia es que la banda intermedia solo se alcanza en un intervalo de
   intensidad muy estrecho, y en la practica los cuatro estados tienden a
   colapsar en tres. El protocolo lo contempla como riesgo —«si los perfiles
   negativo leve y negativo intenso no se separan, los resultados se reportan
   colapsados a tres categorias»— y esta comprobacion lo MIDE en lugar de
   suponerlo, para que se sepa cuanto margen queda.

   No se marca como fallo: es el comportamiento actual, descrito. Los cortes son
   parametros de calibracion y su valor definitivo debe salir del reanalisis de
   sesiones etiquetadas, no de una eleccion a priori. */
{
  const paso = 0.01;
  let minLeve = null, maxLeve = null;
  for (let i = paso; i <= 1; i += paso) {
    if (estadoDe_({ AU17: i }).estado === "negativo leve") {
      minLeve ??= i;
      maxLeve = i;
    }
  }
  const ancho = minLeve === null ? 0 : maxLeve - minLeve;
  m.afirmar("La banda «negativo leve» es alcanzable", minLeve !== null,
    minLeve === null ? "nunca" : `${minLeve.toFixed(2)}–${maxLeve.toFixed(2)}`);
  m.afirmar("Se conoce su anchura en intensidad", true, `${(ancho * 100).toFixed(0)} %`,
    ancho < 0.15 ? "estrecha: los cuatro estados tienden a colapsar en tres" : "");
}

/* ═══════════════════════════════════════════════════════════════════════
   6. Robustez del camino completo
   ═══════════════════════════════════════════════════════════════════════ */
m.seccion("6. Robustez");
{
  const faltante = { ...rostro({ AU12: I }) };
  delete faltante.mouthSmileRight;
  const p = puntaje(base.normalizar(extract(faltante)));
  m.afirmar("Un coeficiente ausente no rompe el cálculo", Number.isFinite(p), p.toFixed(2),
    "el modelo puede no entregar todas las claves");
}
{
  const p = puntaje(base.normalizar(extract({})));
  m.afirmar("Un mapa vacío devuelve un número", Number.isFinite(p), p.toFixed(2));
}
{
  const extremo = puntaje(base.normalizar(extract(rostro({ AU17: 1 }))));
  m.afirmar("La intensidad máxima no desborda", Number.isFinite(extremo) && Math.abs(extremo) < 100,
    extremo.toFixed(2));
}
{
  const canales = Object.keys(extract(rostro({})));
  m.afirmar("Los canales extraídos son los declarados",
    canales.length === CARACTERISTICAS.length &&
      canales.every((c) => CARACTERISTICAS.includes(c)),
    `${canales.length} canales`);
}

m.cerrar();
