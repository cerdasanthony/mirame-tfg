/**
 * Módulo B — Clasificación descriptiva, estabilización temporal y ventana.
 *
 * El estado que se asigna describe la configuración del rostro. No es una
 * emoción ni una intención.
 *
 * DERIVACIÓN DE LOS UMBRALES
 * La entrada son puntuaciones z respecto de la línea base del participante, de
 * modo que los cortes se expresan en unidades de desviación estándar y no en
 * números arbitrarios. «Positivo» significa que el compuesto se aparta más de
 * una sigma por encima del reposo observado en esa misma persona. Ese criterio
 * es reproducible y se recalcula solo para cada participante y cada sesión.
 *
 * Los PESOS siguen siendo una decisión de diseño —qué características cuentan
 * y con qué signo— y deben justificarse en el informe. Lo que dejó de ser
 * arbitrario es la escala.
 */

export const ESTADOS = ["positivo", "neutro", "negativo leve", "negativo intenso"];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE DONDE SALEN LOS PESOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * De ningun sitio, y por eso son todos iguales.
 *
 * La version anterior usaba sonrisa +1,0, comisuras abajo −0,9, cejas abajo
 * −0,7, tension ocular −0,5, tension labial −0,5 y ceja interna −0,4. Esos
 * numeros los eligio una persona. La literatura establece QUE SIGNO lleva cada
 * unidad de accion, porque las combinaciones de FACS lo determinan, pero no
 * establece cuanto pesa una frente a otra. Sostener que la sonrisa vale 2,5
 * veces la ceja interna exigiria una fuente que no existe.
 *
 * POR QUE PESOS IGUALES NO ES RENDIRSE
 * Dawes (1979) mostro que los modelos lineales «impropios» —aquellos cuyos
 * pesos no se estimaron de forma optima— predicen tan bien o mejor que los
 * ajustados, y que la ponderacion unitaria es notablemente robusta. En
 * particular, los pesos asignados por intuicion no superan a los pesos iguales,
 * y con muestras pequenas la ventaja de cualquier ponderacion ajustada no
 * sobrevive a una muestra nueva. Sustituir pesos inventados por pesos iguales no
 * pierde capacidad predictiva: pierde una afirmacion que no se podia sostener.
 *
 * POR QUE NO SE IMPORTAN COEFICIENTES PUBLICADOS
 * Existen trabajos que ajustan coeficientes de unidades de accion sobre
 * valencia. Sus coeficientes se estimaron con personas adultas, ante estimulos
 * de video, con codificacion humana o con otro extractor. Trasladarlos a un
 * participante infantil sin habla, medido con blendshapes que son una
 * aproximacion, seria afirmar una validez que nadie ha comprobado. Un peso
 * prestado de otra poblacion no esta mejor fundado que un peso igual: esta peor,
 * porque aparenta precision.
 *
 * PRECEDENTE EN LA PROPIA FUENTE QUE YA SE CITA
 * El indice de Prkachin y Solomon (2008), que este trabajo ya emplea para la
 * evidencia negativa, suma sus componentes SIN PONDERAR: AU4 mas el maximo entre
 * AU6 y AU7 mas el maximo entre AU9 y AU10. La regla de maximo esta para no
 * contar dos veces el mismo musculo, no para pesar unos mas que otros. Ponderar
 * igual es lo coherente con la construccion que ya se cita.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE CADA LADO SE PROMEDIA EN LUGAR DE SUMARSE
 *
 * Hay una unidad de accion que aporta evidencia positiva y cinco que aportan
 * negativa. Sumando con pesos iguales, el lado negativo tendria cinco veces mas
 * capacidad de mover el resultado solo por ser mas numeroso, y eso es un sesgo
 * de construccion, no un hallazgo sobre el rostro.
 *
 * Promediando cada lado por separado, ambos quedan expresados en la misma
 * unidad —desviaciones tipicas de la linea base del participante— con
 * independencia de cuantos canales tenga cada uno. El compuesto es entonces la
 * diferencia entre dos cantidades comparables, y no hace falta ningun divisor
 * elegido: el resultado ya esta en unidades de sigma.
 */

/** Unidades de accion que aportan evidencia de valencia positiva. */
const POSITIVAS = ["sonrisa"];

/**
 * Evidencia negativa, agrupada POR REGION MUSCULAR.
 *
 * POR QUE NO UNA LISTA PLANA
 * Promediando los canales negativos uno a uno, una expresion concentrada en una
 * sola region se diluye entre todos los demas, que estan en reposo. Un puchero
 * es practicamente AU17 sola: promediado entre seis canales aporta una sexta
 * parte de su intensidad y no llega a cruzar ningun corte. Se observo al probar
 * la aplicacion, y la queja era exacta: la expresion tenia que estar muy marcada
 * para que el sistema la registrara.
 *
 * Agrupando por region, cada zona del rostro aporta su evidencia mas fuerte y
 * las regiones se promedian entre si. Un puchero aporta entonces un tercio de su
 * intensidad en lugar de un sexto, y una expresion que compromete todo el rostro
 * sigue aportando el maximo.
 *
 * FUNDAMENTO
 * Es la construccion del indice de Prkachin y Solomon (2008), que este trabajo
 * ya emplea: dentro de cada grupo muscular toma el MAXIMO —max(AU6, AU7) y
 * max(AU9, AU10)— y despues combina los grupos. El maximo dentro del grupo evita
 * contar dos veces el mismo musculo o dos formas de la misma accion; la
 * combinacion entre grupos es la que suma evidencia de zonas distintas.
 *
 * Las regiones siguen la agrupacion anatomica de FACS:
 *   ceja  frontalis medialis y corrugator, que actuan sobre la misma zona
 *   ojo   orbicularis oculi en su porcion palpebral
 *   boca  depressor anguli oris, mentalis y orbicularis oris
 */
const REGIONES_NEGATIVAS = {
  ceja: ["cejasInternasArriba", "cejasAbajo"],
  ojo: ["tensionOcular", "ojosAbiertos"],
  /* Region nasolabial: el arrugador nasal y el elevador del labio superior son
     el tercer termino del indice de Prkachin y Solomon, y la zona que FACS
     asocia al asco. Faltaba por completo: una expresion de asco no tenia por
     donde entrar al compuesto tonico. */
  nariz: ["narizArrugada", "labioSuperiorArriba"],
  boca: ["comisurasAbajo", "menton", "tensionLabial", "labiosFruncidos", "labiosEstirados"],
};

const NEGATIVAS = Object.values(REGIONES_NEGATIVAS).flat();

/**
 * Canales que se registran pero no aportan a ninguna valencia.
 *
 * `cejasExternasArriba` es AU2 y modula a AU1, como se explica en `evidencia`.
 * `aperturaBucal` es AU26 y acompana por igual al habla, al bostezo y al llanto,
 * de modo que asignarle un signo seria inventar informacion.
 */
const SIN_VALENCIA = ["cejasExternasArriba", "aperturaBucal"];

/* Se conserva para que el resto del modulo pueda recorrer todos los canales. */
const PESOS = Object.fromEntries([
  ...POSITIVAS.map((c) => [c, +1]),
  ...NEGATIVAS.map((c) => [c, -1]),
  ...SIN_VALENCIA.map((c) => [c, 0]),
]);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVIDENCIA RECTIFICADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EL ERROR QUE CORRIGE
 * Al probar la aplicación se observó que abrir mucho los ojos producía una
 * clasificación POSITIVA. La causa no era el umbral: era el signo.
 *
 * Los blendshapes son unipolares. Van de 0, la acción ausente, a 1, la acción
 * en su máximo. Codifican PRESENCIA, no polaridad. Lo mismo ocurre en FACS, que
 * puntúa la intensidad de cada unidad de acción en cinco niveles de A, traza, a
 * E, máximo: no existe una intensidad negativa de una unidad de acción
 * (Ekman y Friesen, 1978).
 *
 * El compuesto, en cambio, multiplicaba la puntuación z por un peso con signo.
 * Cuando un canal caía POR DEBAJO de su reposo, su z era negativa y, al
 * multiplicarla por un peso negativo, el producto salía positivo. Abrir los
 * ojos reduce el entrecerrado, la tensión ocular baja del reposo, y el sistema
 * lo contaba como evidencia de valencia positiva.
 *
 * La ausencia de una acción no es evidencia de la acción contraria. Se rectifica
 * a cero: solo la presencia suma.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DOS MODULACIONES, AMBAS CON LA MISMA FORMA
 *
 * AU2 descuenta a AU1. AU1 sola forma parte de la combinación de tristeza
 * AU1+AU4+AU15; AU1 junto a AU2 es sorpresa, cuya valencia este trabajo no
 * declara. AU1 por sí sola no distingue una de otra.
 *
 * AU12 descuenta a AU7. El tensado del orbicularis oculi acompaña a la sonrisa:
 * es la constricción ocular del marcador de Duchenne (Ekman, Davidson y Friesen,
 * 1990). Contarla como evidencia negativa mientras las comisuras suben invierte
 * el signo de una sonrisa. En los registros, con la sonrisa por encima de dos
 * sigmas la tensión ocular alcanzaba +7,27 σ en su percentil 90.
 *
 * En ambos casos solo el EXCESO cuenta, que es la forma de decir «esta unidad
 * aporta evidencia únicamente en la medida en que no la explica la otra».
 */
function evidencia(z) {
  const out = {};
  for (const c of Object.keys(PESOS)) out[c] = Math.max(0, z[c] ?? 0);
  out.cejasInternasArriba = Math.max(0, out.cejasInternasArriba - out.cejasExternasArriba);
  out.tensionOcular = Math.max(0, out.tensionOcular - out.sonrisa);
  /* AU4 habilita a AU5, con la forma inversa a las dos modulaciones anteriores.
     La apertura palpebral aparece en el miedo, AU1+2+4+5+20+26, y en la
     sorpresa, AU1+2+5+26. Lo que las separa es la presencia de AU4: el miedo la
     tiene, la sorpresa no. AU5 aporta evidencia negativa solo hasta donde la
     acompana el descenso de cejas; sin AU4 la configuracion es sorpresa, cuya
     valencia este trabajo no declara, y no aporta nada.

     Antes de rectificar, abrir mucho los ojos se clasificaba como positivo por
     un error de signo. Rectificado, pasaba a neutro sin distinguir miedo de
     sorpresa. Esta modulacion es la que permite separarlos. */
  out.ojosAbiertos = Math.min(out.ojosAbiertos, out.cejasAbajo);
  return out;
}

/** Media de un conjunto de canales sobre la evidencia rectificada. */
const promedio = (e, canales) =>
  canales.length ? canales.reduce((s, c) => s + (e[c] ?? 0), 0) / canales.length : 0;

/**
 * Evidencia negativa: la mas fuerte de las regiones.
 *
 * POR QUE EL MAXIMO Y NO LA MEDIA
 * Promediar entre regiones castiga a las configuraciones que FACS localiza en
 * una sola zona. El asco es AU9+AU10, region nasolabial y nada mas; el puchero
 * es AU17+AU18, region bucal y nada mas. Promediados entre cuatro regiones
 * aportan una cuarta parte de su intensidad y no cruzan ningun corte. Cada
 * region que se anade al catalogo empeora el problema, de modo que ampliar la
 * cobertura muscular reducia la sensibilidad, que es lo contrario de lo buscado.
 *
 * Medido sobre una sesion con pucheros deliberados, 272 muestras:
 *    media entre regiones   0 % de muestras no neutras
 *    maximo entre regiones  24 %
 * La mediana del compuesto queda en cero con ambas, de modo que el maximo no
 * introduce sesgo: cambia la sensibilidad, no el centro.
 *
 * ADEMAS ES LO SIMETRICO
 * El lado positivo es la evidencia mas fuerte de que dispone, AU12. Tomar del
 * lado negativo su region mas fuerte deja ambos lados expresando lo mismo —la
 * mejor evidencia disponible en su signo— y por tanto comparables por
 * construccion, sin depender de cuantos canales tenga cada uno.
 *
 * El maximo DENTRO de cada region sigue evitando contar dos veces el mismo
 * musculo, que es el sentido de la regla de Prkachin y Solomon (2008).
 */
function evidenciaNegativaRegional(e) {
  return Math.max(
    ...Object.values(REGIONES_NEGATIVAS).map((cs) => Math.max(...cs.map((c) => e[c] ?? 0)))
  );
}

/**
 * Centro y escala del compuesto, medidos sobre la línea base.
 *
 * POR QUE NO SE DIVIDE ENTRE LA SUMA DE PESOS ABSOLUTOS
 * Esa era la versión anterior, y comprimía la señal. Una suma ponderada de
 * variables tipificadas no tiene desviación típica igual a la suma de los pesos
 * absolutos: bajo independencia tiene la norma euclídea del vector de pesos.
 * Con estos pesos, 1,72 frente a 4,0. Dividir por 4,0 dejaba al compuesto con
 * una sigma real de 0,43, de modo que un corte nominal «de una sigma» se estaba
 * aplicando a algo comprimido 2,32 veces. Una expresión que activa dos o tres
 * canales quedaba diluida entre los siete.
 *
 * POR QUE SE MIDE EN VEZ DE CALCULARSE
 * La norma euclídea sería correcta solo si los canales fuesen independientes, y
 * no lo son: los músculos faciales covarían. Medir el centro y la escala del
 * compuesto sobre las propias muestras de la línea base no necesita ese
 * supuesto, y de paso absorbe el sesgo que introduce la rectificación, ya que
 * al rectificar cinco de los seis pesos con signo son negativos y el compuesto
 * en reposo queda desplazado hacia abajo.
 */
export const NORMA = { centro: 0 };

/** Centro robusto del compuesto para una colección concreta de muestras. */
export function centroNorma(muestrasZ) {
  /**
   * Solo queda por medir el CENTRO, y ya no hay escala que elegir.
   *
   * La version anterior media tambien la dispersion del compuesto sobre la linea
   * base y la usaba como divisor. Eso encerraba una contradiccion: a la persona
   * se le pide quietud para calibrar, de modo que lo medido era el temblor de un
   * rostro inmovil, y cuanto mejor colaboraba mas se amplificaba todo. En una
   * sesion real esa escala resulto 0,127 y el puntaje llego a -337.
   *
   * Con cada lado promediado, el compuesto ya viene en unidades de sigma y no
   * necesita divisor. Queda el desplazamiento que introduce la rectificacion:
   * al truncar en cero, la media de la parte positiva del ruido no es cero. Ese
   * desplazamiento SI se mide, porque es una constante aditiva y no un factor
   * que amplifique.
   */
  if (!muestrasZ?.length) return 0;
  const brutos = muestrasZ.map((z) => {
    const e = evidencia(z);
    return promedio(e, POSITIVAS) - evidenciaNegativaRegional(e);
  });
  const orden = [...brutos].sort((a, b) => a - b);
  return orden[orden.length >> 1];
}

export function calibrarNorma(muestrasZ) {
  NORMA.centro = centroNorma(muestrasZ);
  return NORMA;
}

/**
 * Cortes del compuesto, en unidades de sigma de la línea base.
 *
 * Son ajustables en caliente desde el panel del cuidador porque la anchura de
 * la banda neutra es justamente el parámetro que hay que calibrar con cada
 * participante: demasiado ancha y todo se clasifica como neutro, demasiado
 * estrecha y el estado oscila con el ruido. El valor definitivo debe salir del
 * reanálisis de sesiones grabadas, no de una elección a priori.
 */
const CLAVE_UMBRALES = "mirame.umbrales";

export const UMBRALES = {
  positivo: 1.0,
  neutro: -0.75,
  negativoLeve: -2.0,
};

try {
  Object.assign(UMBRALES, JSON.parse(localStorage.getItem(CLAVE_UMBRALES) ?? "{}"));
} catch { /* configuración corrupta: se conservan los valores por defecto */ }

export function fijarUmbrales(nuevos) {
  Object.assign(UMBRALES, nuevos);
  localStorage.setItem(CLAVE_UMBRALES, JSON.stringify(UMBRALES));
  return UMBRALES;
}

/**
 * Ancho de la histéresis, en sigmas.
 *
 * Un puntaje que oscila alrededor de un corte produce un estado que parpadea.
 * La histéresis exige superar el corte por este margen para ENTRAR a un estado,
 * y caer por debajo del corte menos el margen para SALIR de él. La franja
 * intermedia conserva el estado vigente en lugar de alternar.
 */
const HISTERESIS = 0.25;

/**
 * Compuesto en unidades de sigma.
 *
 * Se divide entre la suma de pesos absolutos para que el resultado siga
 * expresándose en sigmas y no dependa de cuántas características se sumen.
 */
export function puntaje(z, centro = NORMA.centro) {
  const e = evidencia(z);
  /* Diferencia entre dos cantidades ya comparables: cada lado es una media de
     puntuaciones z, de modo que el resultado esta en unidades de sigma sin
     necesidad de ningun divisor. El centro se resta porque la rectificacion
     desplaza el reposo: al truncar en cero, la media de cada lado en reposo no
     vale cero sino el valor esperado de la parte positiva del ruido. */
  return promedio(e, POSITIVAS) - evidenciaNegativaRegional(e) - centro;
}

/** Estado que corresponde a un puntaje, sin considerar el estado previo. */
export function estadoDe(s) {
  if (s >= UMBRALES.positivo) return "positivo";
  if (s >= UMBRALES.neutro) return "neutro";
  if (s >= UMBRALES.negativoLeve) return "negativo leve";
  return "negativo intenso";
}

/**
 * Estado con histéresis: sólo se abandona el estado vigente si el puntaje se
 * aleja del corte lo suficiente como para descartar que sea oscilación.
 */
function estadoConHisteresis(s, vigente) {
  if (!vigente) return estadoDe(s);
  const candidato = estadoDe(s);
  if (candidato === vigente) return vigente;

  const iV = ESTADOS.indexOf(vigente);
  const iC = ESTADOS.indexOf(candidato);
  // Los cortes están ordenados de mayor a menor puntaje, igual que ESTADOS.
  const corte = iC > iV ? [UMBRALES.positivo, UMBRALES.neutro, UMBRALES.negativoLeve][iV]
                        : [UMBRALES.positivo, UMBRALES.neutro, UMBRALES.negativoLeve][iC];
  return iC > iV
    ? (s < corte - HISTERESIS ? candidato : vigente)   // baja de estado
    : (s > corte + HISTERESIS ? candidato : vigente);  // sube de estado
}

/** Distancia del puntaje al corte más cercano: margen de decisión. */
export function margen(s) {
  const cortes = [UMBRALES.positivo, UMBRALES.neutro, UMBRALES.negativoLeve];
  return Math.min(...cortes.map((c) => Math.abs(s - c)));
}

/**
 * Suavizado exponencial del puntaje.
 *
 * Reduce la variación de alta frecuencia que produce un rostro en movimiento y
 * que no corresponde a ningún cambio real. Actúa sobre la señal continua; la
 * histéresis y el dwell actúan sobre la decisión discreta. Son complementarios.
 */
const ALFA = 0.18;

export class Suavizador {
  constructor(alfa = ALFA) {
    this.alfa = alfa;
    this.valor = null;
  }
  agregar(s) {
    this.valor = this.valor === null ? s : this.alfa * s + (1 - this.alfa) * this.valor;
    return this.valor;
  }
  reiniciar() {
    this.valor = null;
  }
}

/**
 * Estabilizador temporal: dwell time progresivo con retroceso gradual.
 *
 * Un cambio de estado no se aplica en cuanto el puntaje cruza un corte. Se
 * acumula evidencia mientras el candidato se sostiene, y esa evidencia se
 * DESCUENTA gradualmente —no se reinicia— si el candidato desaparece. El
 * retroceso gradual es lo que distingue una señal genuina que titila de una
 * fluctuación pasajera: la primera vuelve y retoma lo acumulado, la segunda se
 * disipa.
 *
 * `factorRetroceso` gobierna esa asimetría. Con 0,5 la evidencia se pierde a la
 * mitad de la velocidad con que se gana, de modo que un parpadeo aislado no
 * borra el progreso pero una desaparición sostenida sí.
 */
export class Estabilizador {
  constructor({ dwellMs = 500, factorRetroceso = 0.5 } = {}) {
    this.dwellMs = dwellMs;
    this.factorRetroceso = factorRetroceso;
    this.estado = null;
    this.candidato = null;
    this.evidenciaMs = 0;
  }

  reiniciar() {
    this.estado = null;
    this.candidato = null;
    this.evidenciaMs = 0;
  }

  /**
   * Alimenta el estabilizador con un puntaje y el tiempo transcurrido.
   * Devuelve el estado comprometido, que puede no ser el del puntaje actual.
   */
  actualizar(s, dtMs) {
    const propuesto = estadoConHisteresis(s, this.estado);

    if (this.estado === null) {
      this.estado = propuesto;
      this.candidato = null;
      this.evidenciaMs = 0;
      return this.estado;
    }

    if (propuesto === this.estado) {
      // El estado vigente se confirma: la evidencia de cambio retrocede.
      this.evidenciaMs = Math.max(0, this.evidenciaMs - dtMs * this.factorRetroceso);
      if (this.evidenciaMs === 0) this.candidato = null;
      return this.estado;
    }

    if (propuesto !== this.candidato) {
      // Cambió el candidato: la evidencia acumulada no le sirve.
      this.candidato = propuesto;
      this.evidenciaMs = 0;
    }
    this.evidenciaMs += dtMs;

    if (this.evidenciaMs >= this.dwellMs) {
      this.estado = this.candidato;
      this.candidato = null;
      this.evidenciaMs = 0;
    }
    return this.estado;
  }

  get progresoCambio() {
    return this.candidato ? Math.min(1, this.evidenciaMs / this.dwellMs) : 0;
  }
}

/**
 * Clasifica un fotograma aplicando, en orden: suavizado de la señal, histéresis
 * sobre el corte y dwell time sobre la decisión.
 */
export function clasificar(z, { suavizador = null, estabilizador = null, dtMs = 33 } = {}) {
  const crudo = puntaje(z);
  const s = suavizador ? suavizador.agregar(crudo) : crudo;
  const estado = estabilizador ? estabilizador.actualizar(s, dtMs) : estadoDe(s);

  return {
    estado,
    puntaje: s,
    puntajeCrudo: crudo,
    margen: margen(s),
    // Margen pequeño: el puntaje quedó sobre la frontera entre dos estados y la
    // etiqueta es arbitraria. Debe reportarse como tal.
    incierto: margen(s) < HISTERESIS,
    cambiando: estabilizador ? estabilizador.progresoCambio : 0,
  };
}

/**
 * Ventana temporal deslizante (RF-13, RF-15, RF-27).
 *
 * PONDERACIÓN POR CERCANÍA
 * Los fotogramas no pesan igual. Lo que ocurre en el instante previo a que la
 * mano toque el pictograma es la información relevante; lo que ocurrió seis
 * segundos antes, mucho menos. El peso decae exponencialmente hacia atrás con
 * una semivida configurable.
 *
 * Sin esta ponderación, un gesto de dos segundos justo antes de la selección
 * queda diluido entre seis segundos de reposo y el resumen dice «neutro»
 * aunque el momento comunicativo no lo fuera. Observado sobre datos reales del
 * participante: ventanas con 57 % de fotogramas expresivos se reportaban como
 * neutras porque «neutro» seguía siendo la categoría más frecuente.
 *
 * SE REPORTA MÁS QUE LA MODA
 * La moda de cuatro categorías sobre un rostro que la mayor parte del tiempo
 * está en reposo devuelve «neutro» casi siempre, y esconde que una parte
 * sustancial de la ventana no lo era. Junto al estado predominante se devuelve
 * el estado expresivo —el más fuerte de los no neutros— con su proporción, que
 * es lo que la persona cuidadora necesita para interpretar.
 */
export class Ventana {
  constructor(segundos = 5, minValidos = 0.4, semividaMs = 1500) {
    this.segundos = segundos;
    this.minValidos = minValidos;
    this.semividaMs = semividaMs;
    this.muestras = [];
  }

  agregar(estado, puntajeValor, t = performance.now()) {
    this.muestras.push({ estado, puntaje: puntajeValor, t });
    this.podar(t);
  }

  agregarSinRostro(t = performance.now()) {
    this.agregar(null, null, t);
  }

  /** Rostro presente pero demasiado girado para confiar en los blendshapes. */
  agregarDescartado(t = performance.now()) {
    this.agregar(null, null, t);
  }

  podar(t) {
    const corte = t - this.segundos * 1000;
    while (this.muestras.length && this.muestras[0].t < corte) this.muestras.shift();
  }

  /**
   * Distribución ponderada de estados en la ventana.
   *
   * Si la proporción de fotogramas con rostro cae por debajo del mínimo, se
   * devuelve `suficiente: false` y el llamador registra «datos insuficientes»
   * en lugar de atribuir un estado (RF-27).
   */
  distribucion(ahora = performance.now()) {
    const total = this.muestras.length;
    const validas = this.muestras.filter((m) => m.estado !== null);
    const tasaValidez = total ? validas.length / total : 0;

    // Peso exponencial: 1 en el instante actual, 0,5 una semivida atrás.
    const peso = (m) => Math.pow(0.5, (ahora - m.t) / this.semividaMs);

    const acum = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    let sumaPesos = 0;
    let puntajePonderado = 0;
    for (const m of validas) {
      const w = peso(m);
      acum[m.estado] += w;
      puntajePonderado += m.puntaje * w;
      sumaPesos += w;
    }

    const proporciones = {};
    for (const e of ESTADOS) proporciones[e] = sumaPesos ? acum[e] / sumaPesos : 0;

    const predominante = sumaPesos
      ? ESTADOS.reduce((a, b) => (acum[a] >= acum[b] ? a : b))
      : null;

    // Estado expresivo: el no neutro con más peso, y cuánto ocupó de la ventana.
    const noNeutros = ESTADOS.filter((e) => e !== "neutro");
    const expresivo = sumaPesos
      ? noNeutros.reduce((a, b) => (acum[a] >= acum[b] ? a : b))
      : null;
    const proporcionExpresiva = sumaPesos
      ? noNeutros.reduce((s, e) => s + proporciones[e], 0)
      : 0;

    return {
      suficiente: tasaValidez >= this.minValidos && validas.length > 0,
      tasaValidez,
      fotogramasTotales: total,
      fotogramasValidos: validas.length,
      proporciones,
      predominante,
      // El más fuerte de los estados no neutros y el peso total de lo expresivo.
      expresivo,
      proporcionExpresiva,
      puntajePromedio: sumaPesos ? puntajePonderado / sumaPesos : 0,
    };
  }
}
