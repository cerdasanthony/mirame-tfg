/**
 * Módulo A′ — Unidades de Acción (FACS) e índices publicados.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * Las siete «características observables» de `features.js` son una construcción
 * propia: los nombres los elegí yo, los pesos del compuesto los elegí yo, y las
 * cuatro categorías de salida —positivo, neutro, negativo leve, negativo
 * intenso— también. Nada de eso es incorrecto, pero es indefendible ante un
 * comité: no hay forma de contrastar una escala inventada contra la literatura,
 * ni de que otra persona reproduzca la medición.
 *
 * El Facial Action Coding System (Ekman y Friesen, 1978; revisión 2002) resuelve
 * exactamente eso. Descompone cualquier configuración facial en Unidades de
 * Acción numeradas, cada una anclada a un músculo concreto, con criterios de
 * intensidad A–E. Es el sistema con el que se anotan los corpus de referencia
 * del área y el vocabulario en el que están escritos los trabajos que cito.
 *
 * Este módulo NO reemplaza a `features.js`: traduce. Cada medida pasa a llevar
 * su número de AU, su nombre anatómico y el músculo del que sale. Lo que antes
 * era «tensionOcular» ahora es AU7 (Lid Tightener, orbicularis oculi pars
 * palpebralis), y eso ya se puede discutir, citar y contradecir.
 *
 * ADVERTENCIA DE ALCANCE
 * Esto es una APROXIMACIÓN a FACS, no codificación FACS. Los blendshapes de
 * MediaPipe son coeficientes de un modelo de malla facial pensado para animar
 * avatares, no intensidades certificadas por una persona codificadora. La
 * correspondencia AU↔blendshape que sigue es la que se usa habitualmente en la
 * literatura aplicada, pero su validez para este participante es justamente una
 * de las cosas que el estudio tiene que medir, no algo que pueda darse por
 * supuesto. En el informe debe declararse como «AU estimadas por proxy».
 */

/**
 * Correspondencia AU ↔ blendshapes de MediaPipe.
 *
 * `bs` son los blendshapes que se promedian para estimar la AU. Cuando hay
 * versión izquierda y derecha se promedian: FACS codifica la acción, y la
 * asimetría se trata aparte (ver `asimetria`).
 *
 * `proxy` califica la confianza de la correspondencia:
 *   'directa' — el blendshape modela el mismo músculo que la AU
 *   'parcial' — se solapan, pero el blendshape recoge además otra acción
 */
export const AU = {
  AU1:  { nombre: "Inner Brow Raiser",    musculo: "frontalis, pars medialis",              bs: ["browInnerUp"],                            proxy: "directa" },
  AU2:  { nombre: "Outer Brow Raiser",    musculo: "frontalis, pars lateralis",             bs: ["browOuterUpLeft", "browOuterUpRight"],    proxy: "directa" },
  AU4:  { nombre: "Brow Lowerer",         musculo: "corrugator supercilii, depressor supercilii", bs: ["browDownLeft", "browDownRight"],    proxy: "directa" },
  AU6:  { nombre: "Cheek Raiser",         musculo: "orbicularis oculi, pars orbitalis",     bs: ["cheekSquintLeft", "cheekSquintRight"],    proxy: "directa" },
  AU7:  { nombre: "Lid Tightener",        musculo: "orbicularis oculi, pars palpebralis",   bs: ["eyeSquintLeft", "eyeSquintRight"],        proxy: "directa" },
  AU9:  { nombre: "Nose Wrinkler",        musculo: "levator labii superioris alaeque nasi", bs: ["noseSneerLeft", "noseSneerRight"],        proxy: "directa" },
  AU10: { nombre: "Upper Lip Raiser",     musculo: "levator labii superioris",              bs: ["mouthUpperUpLeft", "mouthUpperUpRight"],  proxy: "directa" },
  AU12: { nombre: "Lip Corner Puller",    musculo: "zygomaticus major",                     bs: ["mouthSmileLeft", "mouthSmileRight"],      proxy: "directa" },
  AU14: { nombre: "Dimpler",              musculo: "buccinator",                            bs: ["mouthDimpleLeft", "mouthDimpleRight"],    proxy: "directa" },
  AU15: { nombre: "Lip Corner Depressor", musculo: "depressor anguli oris",                 bs: ["mouthFrownLeft", "mouthFrownRight"],      proxy: "directa" },
  AU17: { nombre: "Chin Raiser",          musculo: "mentalis",                              bs: ["mouthShrugLower"],                        proxy: "parcial" },
  AU20: { nombre: "Lip Stretcher",        musculo: "risorius, platysma",                    bs: ["mouthStretchLeft", "mouthStretchRight"],  proxy: "directa" },
  AU24: { nombre: "Lip Pressor",          musculo: "orbicularis oris",                      bs: ["mouthPressLeft", "mouthPressRight"],      proxy: "directa" },
  AU26: { nombre: "Jaw Drop",             musculo: "masseter y pterigoideos, relajados",    bs: ["jawOpen"],                                proxy: "parcial" },
  AU28: { nombre: "Lip Suck",             musculo: "orbicularis oris",                      bs: ["mouthRollLower", "mouthRollUpper"],       proxy: "directa" },
  AU43: { nombre: "Eyes Closed",          musculo: "levator palpebrae superioris, relajado", bs: ["eyeBlinkLeft", "eyeBlinkRight"],         proxy: "parcial" },
};

export const CANALES_AU = Object.keys(AU);

/**
 * AU cuya activación se confunde con el parpadeo.
 *
 * Un parpadeo dura entre 100 y 400 ms, exactamente la banda temporal de una
 * microexpresión, y arrastra consigo a los músculos periorbitales. Sin marcarlo,
 * el detector fásico contaría cada parpadeo como un evento expresivo, y como una
 * persona parpadea unas quince veces por minuto el registro quedaría dominado
 * por un artefacto fisiológico sin ningún contenido comunicativo.
 */
export const AU_PERIORBITALES = ["AU6", "AU7", "AU43"];

const media = (bs, claves) => {
  let s = 0;
  for (const k of claves) s += bs[k] ?? 0;
  return s / claves.length;
};

/** Extrae todas las AU de un mapa de blendshapes. Valores en [0, 1]. */
export function extraerAU(blendshapes) {
  const out = {};
  for (const [au, def] of Object.entries(AU)) out[au] = media(blendshapes, def.bs);
  return out;
}

/**
 * Asimetría izquierda–derecha de una AU, en [0, 1].
 *
 * FACS distingue las acciones unilaterales (sufijos L/R) de las bilaterales, y
 * la distinción no es cosmética: una activación marcadamente asimétrica se
 * asocia a expresión deliberada o social más que a expresión espontánea. Como
 * este trabajo intenta registrar señal espontánea en un participante que expresa
 * poco, poder separar ambas cosas importa.
 *
 * Devuelve null para las AU que MediaPipe no lateraliza.
 */
export function asimetria(blendshapes, au) {
  const claves = AU[au]?.bs;
  if (!claves || claves.length !== 2) return null;
  const [i, d] = claves.map((k) => blendshapes[k] ?? 0);
  const suma = i + d;
  return suma < 1e-6 ? 0 : Math.abs(i - d) / suma;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BASE EN AU DE LOS CUATRO ESTADOS DEL OBJETIVO GENERAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * El objetivo general aprobado fija cuatro estados —positivo, neutro, negativo
 * leve y negativo intenso— y ese es el resultado que la aplicación debe
 * entregar. Este módulo NO los sustituye: les da un sustrato trazable.
 *
 * El problema que resuelve es concreto. Hoy los cuatro estados salen de un
 * compuesto con pesos que elegí yo (sonrisa +1,0, comisuras −0,9, cejas −0,7…).
 * Ante un comité, «elegí estos números» no es defendible y no lo vuelve
 * defendible ninguna cantidad de calibración: el problema no es el valor, es que
 * no hay de dónde derivarlo. Lo que sigue reemplaza esa elección por
 * combinaciones de AU que ya están descritas en la literatura, y deja la
 * decisión propia reducida a un solo punto declarado: dónde se pone el corte
 * entre leve e intenso.
 *
 * Esto se inscribe en el objetivo específico 4 —desarrollar el módulo de
 * detección y clasificación mediante análisis de los puntos de referencia y los
 * blendshapes de MediaPipe—: es exactamente ese análisis, expresado en el
 * vocabulario con el que el área lo describe.
 */

/**
 * Evidencia de estado POSITIVO: marcador de Duchenne.
 *
 *     positivo = min(AU6, AU12)
 *
 * AU12 sola —zygomaticus major, comisuras hacia arriba— aparece tanto en la
 * sonrisa espontánea como en la deliberada. Lo que distingue a la primera es la
 * participación de AU6, el orbicularis oculi, que es difícil de activar
 * voluntariamente. La distinción es de Ekman, Davidson y Friesen (1990) y es uno
 * de los resultados mejor establecidos del área.
 *
 * Se usa el MÍNIMO y no la suma porque la afirmación es conjuntiva: hace falta
 * que ambas estén presentes. Con una suma, una AU12 grande sola alcanzaría el
 * umbral y volvería a confundir los dos tipos de sonrisa, que es justo lo que se
 * quiere evitar.
 *
 * `au12` se devuelve aparte para no perder información: en un participante
 * hipoexpresivo puede haber AU12 sin AU6 alcanzable por el instrumento, y eso es
 * un dato, no un cero.
 */
export function evidenciaPositiva(auValores) {
  const au6 = auValores.AU6 ?? 0;
  const au12 = auValores.AU12 ?? 0;
  return { duchenne: Math.min(au6, au12), au12, au6 };
}

/**
 * Evidencia de estado NEGATIVO: combinación de AU y regla de máximo.
 *
 *     negativo = AU4 + max(AU6, AU7) + max(AU9, AU10)
 *
 * El conjunto de AU y —lo que de verdad importa— la REGLA DE COMBINACIÓN vienen
 * de Prkachin y Solomon (2008), que identificaron este grupo como el que
 * concentra la señal facial de malestar. El `max` no es cosmético: AU6 y AU7 son
 * dos formas de la misma acción periorbital, y AU9 y AU10 dos formas de la misma
 * acción del labio superior. Sumarlas contaría dos veces el mismo músculo y le
 * daría al ojo y a la boca el doble de peso que a la ceja, sin ninguna razón.
 *
 * LO QUE DELIBERADAMENTE NO SE IMPORTA
 * Prkachin y Solomon construyeron con estas AU un índice de intensidad de DOLOR,
 * en escala 0–16, y añaden AU43 al conjunto. Aquí no se calcula ese índice, no
 * se usa esa escala y se omite AU43.
 *
 * El motivo es de alcance, no de comodidad. El anteproyecto excluye de forma
 * expresa la validación clínica y el expediente médico, y el propio sistema ya
 * decidió que ante un estado negativo sostenido el pictograma por defecto sea
 * «ayuda» y no «dolor», porque afirmar dolor es un diagnóstico que este trabajo
 * no está en condiciones de sostener. Traer un índice de dolor por la puerta de
 * atrás contradiría esa decisión, aunque viniera con cita.
 *
 * Se toma la parte que sí corresponde —qué músculos mirar y cómo combinarlos sin
 * contarlos doble— y se deja fuera la interpretación clínica. AU43 se omite
 * porque es cierre de ojos: en el índice original aporta al dolor, pero acá el
 * cierre de ojos es sobre todo parpadeo, un artefacto fisiológico que este
 * trabajo trata aparte.
 */
export function evidenciaNegativa(auValores) {
  const v = (au) => auValores[au] ?? 0;
  const periorbital = Math.max(v("AU6"), v("AU7"));
  const labial = Math.max(v("AU9"), v("AU10"));
  return {
    total: v("AU4") + periorbital + labial,
    au4: v("AU4"),
    periorbital,
    labial,
  };
}

/**
 * Cota superior de `evidenciaNegativa.total`.
 *
 * Tres términos, cada uno acotado en [0,1] por ser blendshapes. Sirve para
 * normalizar a [0,1] cuando haga falta comparar entre sesiones.
 */
export const EVIDENCIA_NEGATIVA_MAXIMA = 3;

/**
 * Valencia de cada AU, para poder llevar un evento aislado a los estados del
 * objetivo general.
 *
 * POR QUÉ COINCIDE CON LOS PESOS DE `classifier.js`, Y POR QUÉ ESO IMPORTA
 * Los signos son los mismos que ya usaba el compuesto tónico: AU12 positiva,
 * AU4 / AU15 / AU24 negativas, apertura mandibular sin signo. No es casualidad
 * ni copia: si las dos vías asignaran valencias distintas a la misma AU, no
 * estarían midiendo el mismo constructo y compararlas no significaría nada.
 * Que coincidan es lo que permite decir que la vía fásica y la tónica observan
 * lo mismo a dos escalas de tiempo, que es toda la razón de que existan las dos.
 *
 * Lo que sí cambia es que aquí la valencia es una etiqueta y no un peso. La vía
 * fásica no promedia canales —promediar es precisamente lo que borra la señal
 * concentrada en un músculo— así que no necesita cuánto pesa cada uno, solo
 * hacia qué lado empuja.
 *
 * SIN SIGNO NO ES LO MISMO QUE NEUTRO
 * AU26 (apertura mandibular) acompaña por igual al habla, al bostezo y al
 * llanto; AU43 es sobre todo parpadeo; AU14 y AU28 aparecen en configuraciones
 * de valencia inconsistente en la literatura. Marcarlas «sin signo» significa
 * que se registran como eventos —ocurrieron, y el registro debe decirlo— pero no
 * se cuentan como evidencia hacia ningún estado. Asignarles un signo sería
 * inventar información; omitirlas sería esconderla.
 */
export const VALENCIA_AU = {
  AU1:  "negativo",   // ceja interna arriba: distrés; ya pesaba −0,4 en el compuesto
  AU2:  "sin signo",  // ceja externa arriba: sorpresa, de valencia ambigua
  AU4:  "negativo",
  AU6:  "positivo",   // solo junto a AU12 es Duchenne, pero su valencia es positiva
  AU7:  "negativo",
  AU9:  "negativo",
  AU10: "negativo",
  AU12: "positivo",
  AU14: "sin signo",
  AU15: "negativo",
  AU17: "negativo",
  AU20: "negativo",
  AU24: "negativo",
  AU26: "sin signo",
  AU28: "sin signo",
  AU43: "sin signo",  // parpadeo: artefacto fisiológico, se trata aparte
};

/**
 * Perfil de expresividad del participante.
 *
 * QUÉ PROBLEMA RESUELVE
 * Un niño puede expresar con la cara mucho menos de lo que el sistema espera. Si
 * eso ocurre, el registro se llena de «neutro» y la conclusión que se saca —«no
 * hubo expresión»— es indistinguible de «el instrumento no alcanzó a medirla».
 * Son dos afirmaciones muy distintas y el sistema, tal como estaba, no permitía
 * separarlas.
 *
 * Este acumulador mide el RANGO DINÁMICO real de cada AU a lo largo de la
 * sesión: cuánto se movió, de hecho, cada músculo. Con eso la hipoexpresividad
 * deja de ser una explicación a posteriori y pasa a ser un dato: «la AU12 de este
 * participante recorrió 0,04 unidades en toda la sesión», junto al ruido de
 * medición de ese mismo canal. Si el rango es del orden del ruido, lo honesto es
 * reportar que el instrumento no resuelve la expresión de esta persona, no que
 * la persona no expresó.
 */
export class PerfilExpresividad {
  constructor(canales = CANALES_AU) {
    this.canales = canales;
    this.min = {};
    this.max = {};
    this.suma = {};
    this.n = 0;
    for (const c of canales) {
      this.min[c] = Infinity;
      this.max[c] = -Infinity;
      this.suma[c] = 0;
    }
  }

  agregar(auValores) {
    this.n++;
    for (const c of this.canales) {
      const v = auValores[c] ?? 0;
      if (v < this.min[c]) this.min[c] = v;
      if (v > this.max[c]) this.max[c] = v;
      this.suma[c] += v;
    }
  }

  /**
   * Resumen por canal.
   *
   * `ruido` es la dispersión robusta de la línea base de ese canal, si se le
   * pasa: el suelo por debajo del cual el rango observado no se distingue de la
   * fluctuación del propio sensor.
   *
   * `resuelto` responde la pregunta que importa: ¿el músculo se movió más de lo
   * que se mueve el ruido? Se exige un rango de al menos tres veces la
   * dispersión basal, el criterio convencional de detectabilidad.
   */
  resumen(sigmaBase = null) {
    const out = {};
    for (const c of this.canales) {
      const rango = this.n ? this.max[c] - this.min[c] : 0;
      const ruido = sigmaBase?.[c] ?? null;
      out[c] = {
        min: this.n ? Number(this.min[c].toFixed(4)) : null,
        max: this.n ? Number(this.max[c].toFixed(4)) : null,
        media: this.n ? Number((this.suma[c] / this.n).toFixed(4)) : null,
        rango: Number(rango.toFixed(4)),
        ruido: ruido === null ? null : Number(ruido.toFixed(4)),
        razonSenalRuido: ruido ? Number((rango / ruido).toFixed(2)) : null,
        resuelto: ruido ? rango >= 3 * ruido : null,
      };
    }
    return { muestras: this.n, canales: out };
  }

  /**
   * Cuántos canales llegaron a moverse por encima del ruido.
   *
   * Es la cifra que resume si este participante es medible con este instrumento.
   * Cero canales resueltos en una sesión completa no es un resultado nulo: es un
   * resultado, y hay que reportarlo.
   */
  canalesResueltos(sigmaBase) {
    const r = this.resumen(sigmaBase);
    return Object.values(r.canales).filter((c) => c.resuelto).length;
  }
}
