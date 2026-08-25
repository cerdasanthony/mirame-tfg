/**
 * Módulo A — Características faciales observables y línea base.
 *
 * De los 52 blendshapes que entrega MediaPipe se toma un subconjunto reducido y
 * se agrupa en siete características con nombre.
 *
 * NORMALIZACIÓN POR PUNTUACIÓN z
 * Las medidas no se expresan como diferencia cruda respecto del reposo, sino
 * como puntuación z: cuántas desviaciones estándar se aparta la medida actual
 * de la distribución observada durante la línea base de esa sesión.
 *
 * La diferencia importa. Una variación de 0,05 en la curvatura de la boca puede
 * ser ruido en un rostro cuya boca fluctúa constantemente, y una señal clara en
 * otro que la mantiene estable. La diferencia cruda no distingue esos dos casos;
 * la puntuación z sí, porque incorpora la variabilidad propia del participante.
 *
 * Consecuencia práctica: los umbrales del clasificador dejan de ser números
 * elegidos a mano y pasan a expresarse en unidades de sigma, derivadas de la
 * distribución basal del propio participante.
 */

/** Promedio de un conjunto de blendshapes, tolerante a nombres ausentes. */
const avg = (bs, keys) => {
  const vals = keys.map((k) => bs[k] ?? 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

/** Extrae las siete características observables de un mapa de blendshapes. */
export function extract(blendshapes) {
  return {
    sonrisa: avg(blendshapes, ["mouthSmileLeft", "mouthSmileRight"]),
    comisurasAbajo: avg(blendshapes, ["mouthFrownLeft", "mouthFrownRight"]),
    cejasAbajo: avg(blendshapes, ["browDownLeft", "browDownRight"]),
    cejasInternasArriba: blendshapes.browInnerUp ?? 0,
    /* AU2, Outer Brow Raiser. No entra al compuesto con peso propio: entra para
       poder separar AU1 sola de AU1 acompanada de AU2.

       En las combinaciones de FACS, AU1+AU4+AU15 corresponde a tristeza,
       mientras que AU1+AU2 acompanada de AU5, AU25 o AU26 corresponde a
       sorpresa. AU1 por si sola no distingue una de otra: aparece en ambas y
       significa cosas distintas segun que la acompane. Sin este canal, el
       compuesto leia cualquier alzada de cejas como negativa, que es lo que se
       observo al probar la aplicacion. */
    cejasExternasArriba: avg(blendshapes, ["browOuterUpLeft", "browOuterUpRight"]),
    tensionOcular: avg(blendshapes, ["eyeSquintLeft", "eyeSquintRight"]),
    tensionLabial: avg(blendshapes, ["mouthPressLeft", "mouthPressRight"]),
    /* AU17, Chin Raiser, mentalis. Es el musculo del puchero: empuja el labio
       inferior hacia arriba y hacia afuera, y es la accion central del gesto
       previo al llanto en la infancia.

       Faltaba, y se noto probando. Sobre una sesion en que se hicieron pucheros
       deliberados, AU17 alcanzo 0,384 mientras AU15 —el descenso de comisuras,
       que si estaba— no paso de 0,011. El gesto era AU17 practicamente puro, de
       modo que el compuesto no tenia por donde verlo. */
    menton: blendshapes.mouthShrugLower ?? 0,
    /* AU5, Upper Lid Raiser. Aparece en el miedo (AU1+2+4+5+20+26) y en la
       sorpresa (AU1+2+5+26). Como AU1, no distingue una de otra por si sola: lo
       que las separa es AU4, presente en el miedo y ausente en la sorpresa. Ver
       la modulacion en `evidencia`. Faltaba por completo del catalogo. */
    ojosAbiertos: avg(blendshapes, ["eyeWideLeft", "eyeWideRight"]),
    /* AU18, Lip Puckerer. Protrusion labial, que acompana al puchero junto al
       mentalis. */
    labiosFruncidos: blendshapes.mouthPucker ?? 0,
    /* AU9 y AU10, arrugador nasal y elevador del labio superior. Son el tercer
       termino del indice de Prkachin y Solomon —max(AU9, AU10)— y la region que
       FACS asocia al asco. El compuesto tonico no tenia NINGUN canal en esa
       zona, de modo que una expresion de asco no encontraba por donde entrar. */
    narizArrugada: avg(blendshapes, ["noseSneerLeft", "noseSneerRight"]),
    labioSuperiorArriba: avg(blendshapes, ["mouthUpperUpLeft", "mouthUpperUpRight"]),
    /* AU20, Lip Stretcher, risorius. Estiramiento lateral de los labios, que
       forma parte de la configuracion de miedo. */
    labiosEstirados: avg(blendshapes, ["mouthStretchLeft", "mouthStretchRight"]),
    aperturaBucal: blendshapes.jawOpen ?? 0,
  };
}

export const CARACTERISTICAS = [
  "sonrisa",
  "comisurasAbajo",
  "cejasAbajo",
  "cejasInternasArriba",
  "cejasExternasArriba",
  "tensionOcular",
  "tensionLabial",
  "menton",
  "ojosAbiertos",
  "labiosFruncidos",
  "narizArrugada",
  "labioSuperiorArriba",
  "labiosEstirados",
  "aperturaBucal",
];

/**
 * Piso para la desviación estándar, y ÚLTIMO recurso.
 *
 * Si una característica apenas varió durante la línea base, su dispersión tiende
 * a cero y la división amplifica el ruido hasta el absurdo. El piso acota esa
 * amplificación. Su valor está en la escala de los blendshapes, que van de 0 a 1.
 *
 * POR QUÉ NO PUEDE SER EL MECANISMO PRINCIPAL
 * Auditado sobre once sesiones reales: 60 de 77 canales de línea base —el 78 %—
 * terminaban exactamente en este valor, y la mediana de la dispersión medida ERA
 * el piso. En la línea base de unidades de acción la proporción llegaba al 88 %.
 * Con eso, la puntuación z de la mayoría de los canales no dividía por la
 * dispersión del participante sino por una constante elegida a mano, y la
 * propiedad que justifica todo el esquema de umbrales —que la escala se
 * recalcula sola para cada persona— dejaba de cumplirse justo donde más se
 * invoca.
 *
 * La corrección es la misma que ya se aplicó en la vía fásica: cuando un canal
 * no tiene dispersión medible se usa la mediana de los canales que sí la
 * tuvieron en esa sesión, que es una estimación tomada de los datos. La
 * constante queda solo para el caso en que ningún canal resulte medible.
 *
 * POR QUE 0,05 Y NO 0,02
 * El valor anterior daba por buena una dispersión del dos por ciento del rango
 * del blendshape, que va de cero a uno. Medido sobre una sesión real, los
 * recorridos efectivos de los canales entre sus percentiles 5 y 95 llegaban a
 * 0,32 en la tensión ocular y a 0,29 en la ceja externa. Dividir un recorrido de
 * 0,32 entre una dispersión de 0,02 produce puntuaciones de dieciséis
 * desviaciones típicas, y el compuesto llegó a valores de trescientos.
 *
 * Cinco por ciento del rango es el cambio más pequeño que tiene sentido llamar
 * cambio en un coeficiente estimado por un modelo de malla, y deja los
 * recorridos observados en torno a seis desviaciones típicas, que es un
 * intervalo interpretable.
 */
const SIGMA_MINIMA = 0.05;

/**
 * Por debajo de esto se considera que el canal no tuvo dispersión medible.
 *
 * No es lo mismo que el piso. El piso dice qué valor se usa; este umbral dice
 * cuándo el valor observado no merece crédito. Se sitúa en la mitad del piso
 * para que un canal que apenas lo roza siga contando como medido.
 */
const SIGMA_MEDIBLE = SIGMA_MINIMA / 2;

/**
 * Estimador de escala Qn (Rousseeuw y Croux, 1993).
 *
 * POR QUE SUSTITUYE A LA DESVIACION ABSOLUTA MEDIANA
 * La MAD resuelve el problema que motivo usarla: tolera hasta un 50 % de
 * muestras contaminadas antes de desplazarse, frente al 0 % de la desviacion
 * estandar. Pero tiene un defecto que aqui pesa mucho: su eficiencia gaussiana
 * es del 37 %, de modo que extrae poca informacion de cada muestra.
 *
 * Eso importa porque la linea base dura tres segundos y sus fotogramas estan
 * autocorrelacionados, con lo que el numero de observaciones utiles es reducido.
 * Auditado sobre once sesiones: la dispersion medida caia al piso constante en
 * el 78 % de los canales.
 *
 * Rousseeuw y Croux construyen estimadores con el MISMO punto de ruptura del
 * 50 % y mucha mas eficiencia. Qn alcanza el 82 %, frente al 37 % de la MAD, lo
 * que equivale a mas del doble de informacion sobre la dispersion a partir de
 * las mismas muestras. Con una ventana corta, esa diferencia es exactamente lo
 * que hacia falta.
 *
 * COMO SE CALCULA
 * Qn es el cuantil 0,25 de las distancias entre todos los pares de
 * observaciones, multiplicado por 2,2219 para hacerlo consistente con sigma en
 * datos normales. No necesita estimar antes la posicion, que es otra ventaja
 * sobre la MAD: no arrastra el error de la mediana.
 *
 * El coste es cuadratico en el numero de muestras. Con las decenas de
 * fotogramas de una linea base es despreciable, y solo se ejecuta al cerrarla o
 * al refinarla, nunca por fotograma.
 */
export function qn(xs) {
  const n = xs.length;
  if (n < 2) return 0;
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) d.push(Math.abs(xs[i] - xs[j]));
  }
  d.sort((a, b) => a - b);
  /* Indice del cuantil segun la formula original: k = C(h,2) con h = [n/2]+1. */
  const h = Math.floor(n / 2) + 1;
  const k = Math.max(1, (h * (h - 1)) / 2);
  return 2.2219 * d[Math.min(d.length - 1, k - 1)] * CORRECCION_QN(n);
}

/**
 * Correccion de sesgo de Qn para muestra finita (Rousseeuw y Croux, 1993).
 *
 * NO ES OPCIONAL, Y ESO SE COMPROBO
 * La constante 2,2219 hace a Qn consistente con sigma solo de forma asintotica.
 * Con las decenas de muestras de una linea base, el estimador queda
 * sistematicamente alto y ese sesgo se come casi toda su ventaja. Medido sobre
 * 3000 realizaciones de ruido gaussiano, comparando el error cuadratico medio
 * al estimar una sigma conocida:
 *
 *     n = 60   MAD 0,0235   Qn sin corregir 0,0168   Qn corregido 0,0116
 *
 * Sin corregir, Qn resultaba apenas 1,4 veces mejor que la MAD; corregido llega
 * a 2,0, que es la ventaja que predice la razon de eficiencias, 82 % frente a
 * 37 %. La primera version de esta funcion omitia la correccion y por eso no
 * reproducia la mejora esperada.
 */
function CORRECCION_QN(n) {
  if (n <= 9) {
    return [1, 1, 0.399, 0.994, 0.512, 0.844, 0.611, 0.857, 0.669, 0.872][n] ?? 1;
  }
  return n % 2 ? n / (n + 1.4) : n / (n + 3.8);
}

/**
 * Autocorrelación de retardo 1 de una serie.
 *
 * POR QUÉ HACE FALTA
 * Los fotogramas de la línea base no son observaciones independientes: son el
 * mismo rostro observado muchas veces seguidas. Medido sobre sesiones reales, la
 * autocorrelación a 250 ms es 0,787, lo que extrapolado al intervalo entre
 * fotogramas da alrededor de 0,97 y un tiempo de decorrelación cercano a 1,1 s.
 * Una línea base de tres segundos abarca dos o tres de esos tiempos, de modo que
 * su tamaño efectivo de muestra es de unas pocas observaciones aunque el
 * contador muestre ochenta fotogramas.
 *
 * La consecuencia es conceptual antes que estadística: lo que la desviación
 * absoluta mediana mide en esa ventana es el temblor de corto plazo de la señal
 * y no la variabilidad de reposo de la persona a lo largo de la sesión.
 *
 * No se corrige, porque alargar la calibración lo suficiente exigiría más de
 * veinte segundos de rostro quieto y el participante es un niño en edad
 * preescolar. Se MIDE y se reporta, que es lo que permite interpretar después
 * cuánto crédito merece la escala de esa sesión.
 */
function autocorrelacion(xs) {
  const n = xs.length - 1;
  if (n < 8) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
  if (v < 1e-12) return null;
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - m) * (xs[i + 1] - m);
  return s / (n * v);
}

/**
 * Acumulador de línea base (RF-10).
 *
 * Se alimenta durante los primeros segundos de la sesión con el rostro en
 * reposo y luego se congela, calculando media y desviación estándar de cada
 * característica.
 */
export class LineaBase {
  /**
   * @param {string[]} canales Claves sobre las que se calcula la referencia.
   *   Por defecto, las siete características observables. El módulo de FACS usa
   *   la misma clase sobre sus propios canales de Unidades de Acción: la
   *   estadística robusta es la misma y no tiene sentido duplicarla.
   */
  constructor(canales = CARACTERISTICAS) {
    this.canales = canales;
    this.muestras = [];
    this.media = null;
    this.sigma = null;
  }

  agregar(caracteristicas) {
    if (this.media) return;
    this.muestras.push(caracteristicas);
  }

  get cantidadMuestras() {
    return this.muestras.length;
  }

  get establecida() {
    return this.media !== null;
  }

  /**
   * Congela la línea base con estimadores ROBUSTOS: mediana y desviación
   * absoluta mediana (MAD).
   *
   * POR QUÉ NO MEDIA Y DESVIACIÓN ESTÁNDAR
   * La calibración se hace con una persona frente a la cámara, y basta con que
   * durante esos segundos sonría o hable unas cuantas veces para que la
   * desviación estándar se dispare. Medido sobre una sesión real: la sigma de
   * la sonrisa salió 0,1966 cuando el reposo verdadero daba 0,0200. Con esa
   * referencia inflada, una sonrisa franca puntuaba −0,21 σ y se clasificaba
   * como neutro; con la estimación robusta, la misma sonrisa da +5,52 σ.
   *
   * La MAD tolera hasta un 50 % de muestras contaminadas antes de desplazarse,
   * frente al 0 % de la desviación estándar: un solo fotograma extremo ya
   * arrastra la media y la sigma. Se multiplica por 1,4826, la constante que
   * la vuelve un estimador consistente de sigma para datos normales.
   *
   * Se conservan además media y desviación estándar clásicas, no para
   * clasificar sino para poder documentar en el informe cuánto se apartaron de
   * los estimadores robustos, que es una medida directa de cuán quieto estuvo
   * el rostro durante la calibración.
   */
  cerrar() {
    const n = this.muestras.length;
    if (n < 2) throw new Error("La línea base necesita al menos dos muestras");

    const mediana = (xs) => {
      const o = [...xs].sort((a, b) => a - b);
      const m = o.length >> 1;
      return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
    };

    this.media = {};
    this.sigma = {};
    this.mediaClasica = {};
    this.sigmaClasica = {};

    /* Primera pasada: dispersión cruda de cada canal, sin piso ni sustitución.
       Hace falta conocerlas todas antes de decidir cuál sustituir, porque el
       sustituto sale precisamente de las que resultaron medibles. */
    const crudas = {};
    const autocorr = [];
    for (const c of this.canales) {
      const vals = this.muestras.map((m) => m[c]);
      this.media[c] = mediana(vals);
      crudas[c] = qn(vals);

      const mu = vals.reduce((a, b) => a + b, 0) / n;
      const varianza = vals.reduce((a, v) => a + (v - mu) ** 2, 0) / (n - 1);
      this.mediaClasica[c] = mu;
      this.sigmaClasica[c] = Math.sqrt(varianza);

      const r = autocorrelacion(vals);
      if (r !== null) autocorr.push(r);
    }

    const medibles = this.canales.map((c) => crudas[c]).filter((x) => x > SIGMA_MEDIBLE);
    const sustituta = medibles.length
      ? Math.max(mediana(medibles), SIGMA_MINIMA)
      : SIGMA_MINIMA;

    this.canalesSupuestos = [];
    for (const c of this.canales) {
      if (crudas[c] > SIGMA_MEDIBLE) {
        this.sigma[c] = Math.max(crudas[c], SIGMA_MINIMA);
      } else {
        this.sigma[c] = sustituta;
        this.canalesSupuestos.push(c);
      }
    }

    /* Tamaño efectivo de muestra para un proceso autorregresivo de orden uno.
       Es la cifra que dice cuánta información sobre la dispersión hay realmente
       en la ventana, frente a los `n` fotogramas que el contador muestra. */
    const r = autocorr.length ? mediana(autocorr) : null;
    const nEfectivo = r !== null && r > -1 && r < 1
      ? Math.max(1, n * (1 - r) / (1 + r))
      : null;
    this.sigmaMedida = Object.fromEntries(this.canales.map((c) => [c, crudas[c]]));
    this.sigmaSustituta = this.canalesSupuestos.length ? sustituta : null;
    this.autocorrelacion = r;
    this.muestrasEfectivas = nEfectivo;

    return {
      media: this.media,
      sigma: this.sigma,
      mediaClasica: this.mediaClasica,
      sigmaClasica: this.sigmaClasica,
      muestras: n,
      quietud: this.quietud,
      /* Procedencia de la escala. Sin esto no se puede saber, al analizar una
         sesión, si un umbral de «una sigma» se apoyó en dispersión medida o en
         una estimación prestada de otros canales. */
      sigmaMedida: Object.fromEntries(this.canales.map((c) => [c, crudas[c]])),
      canalesSupuestos: this.canalesSupuestos,
      sigmaSustituta: this.canalesSupuestos.length ? sustituta : null,
      autocorrelacion: r,
      muestrasEfectivas: nEfectivo,
    };
  }

  /**
   * Cuán quieto estuvo el rostro durante la calibración, en [0, 1].
   *
   * Es el cociente entre la dispersión robusta y la clásica, promediado. Cerca
   * de 1 indica que ambas coinciden y por tanto no hubo expresiones que
   * contaminaran el reposo. Muy por debajo, la persona se movió y conviene
   * repetir la calibración.
   */
  get quietud() {
    if (!this.sigma || !this.sigmaClasica) return null;
    const razones = this.canales.map((c) => {
      const clas = Math.max(this.sigmaClasica[c], 1e-6);
      return Math.min(1, this.sigma[c] / clas);
    });
    return razones.reduce((a, b) => a + b, 0) / razones.length;
  }

  /**
   * Incorpora una muestra posterior al cierre para refinar la dispersión.
   *
   * QUE PROBLEMA RESUELVE
   * Estimar posición y dispersión en tres segundos es débil, porque los
   * fotogramas no son observaciones independientes. La autocorrelación medida
   * DIRECTAMENTE entre fotogramas consecutivos, sobre sesiones registradas de
   * este participante, va de 0,31 a 0,75, lo que deja tamaños efectivos de
   * entre cuatro y once observaciones frente a las quince a ochenta que
   * registra el contador.
   *
   * Una estimación anterior extrapolaba desde la autocorrelación a 250 ms y
   * daba 0,97, con tamaños efectivos de una o dos observaciones. La medición
   * directa la corrigió: extrapolar supone una sola escala de decaimiento,
   * mientras que la señal real superpone un ruido rápido del estimador de
   * puntos de referencia, que se decorrelaciona de un fotograma al siguiente,
   * sobre una deriva postural lenta.
   *
   * POR QUE ES LEGITIMO SEGUIR MIDIENDO DESPUES DEL REPOSO
   * Porque el estimador tolera la contaminación. Tanto la MAD como Qn tienen
   * punto de ruptura del 50 % (Rousseeuw y Croux, 1993): hace falta que más de
   * la mitad de las muestras sean atípicas para desplazarlos. Sobre los
   * registros de este participante, el 72,5 % de los fotogramas quedan
   * clasificados como neutros, de modo que las muestras expresivas están
   * holgadamente por debajo del punto de ruptura. La dispersión de la sesión
   * completa estima la variabilidad de reposo mejor que la de sus tres primeros
   * segundos, y sigue siendo la línea base de esa misma sesión.
   *
   * POR QUE ESPACIADAS Y NO EN CADA FOTOGRAMA
   * Acumular fotogramas consecutivos no agrega información sino copias
   * correlacionadas del mismo instante. Espaciando las muestras la
   * autocorrelación baja de 0,97 a 0,787 y el tamaño efectivo crece en
   * consecuencia.
   *
   * LA POSICION TAMBIEN SE REFINA, Y ESO CORRIGE UN ERROR ANTERIOR
   * La primera versión de este método refinaba solo la dispersión, con el
   * argumento de que la mediana sí se estima bien en tres segundos. El
   * argumento era inconsistente: si el punto de ruptura del 50 % justifica
   * seguir midiendo dispersión sobre la sesión completa, justifica igual seguir
   * midiendo posición, porque la mediana tiene el mismo punto de ruptura.
   *
   * Y los datos lo desmintieron. Sobre tres sesiones registradas, la puntuación
   * z de la tensión ocular tenía MEDIANA de +3,21 σ, cuando en reposo debería
   * rondar cero: la mitad de la sesión transcurría más de tres sigmas por
   * encima de la referencia. La causa es la misma autocorrelación. Tres
   * segundos de una señal correlacionada capturan esencialmente UNA
   * configuración facial, y si en ese instante los ojos estaban más abiertos que
   * de costumbre, todo el resto de la sesión se mide contra esa postura
   * accidental. El efecto observado era que un rostro sin expresión se
   * clasificaba como negativo.
   */
  /** Las muestras de la línea base, expresadas en puntuación z. */
  muestrasNormalizadas() {
    if (!this.media) return [];
    /* Incluye las muestras de refinamiento, no solo las de calibracion.
       La version anterior devolvia unicamente `this.muestras`, con lo que el
       centro del compuesto se seguia midiendo sobre la quietud de la
       calibracion aunque la dispersion ya se hubiera refinado con la sesion.
       Efecto observado: la mediana del puntaje se quedaba en -0,56 en lugar de
       cero, porque durante la sesion los cinco canales negativos fluctuan y su
       media rectificada es positiva, mientras el unico canal positivo, la
       sonrisa, permanecia inactivo. Ese desplazamiento es justo lo que el
       centro debe absorber, y para absorberlo tiene que verlo. */
    return [...this.muestras, ...(this.refinamiento ?? [])].map((m) => this.normalizar(m));
  }

  refinar(caracteristicas) {
    if (!this.media) return false;
    this.refinamiento ??= [];
    this.refinamiento.push(caracteristicas);
    /* Doce muestras espaciadas son unos tres segundos de sesión. Antes se
       exigían cuarenta, que son diez segundos, y en sesiones cortas el
       refinamiento no llegaba a ejecutarse nunca: la escala se quedaba en la
       medida durante la quietud de la calibración, que es justo la que no
       sirve. Se recalcula además en cada muestra posterior, no una sola vez. */
    if (this.refinamiento.length < 12) return false;

    const mediana = (xs) => {
      const o = [...xs].sort((a, b) => a - b);
      const m = o.length >> 1;
      return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
    };
    const juntas = [...this.muestras, ...this.refinamiento];
    const crudas = {};
    this.mediaInicial ??= { ...this.media };
    for (const c of this.canales) {
      const vals = juntas.map((m) => m[c]);
      crudas[c] = qn(vals);

      /**
       * LA POSICION SE CORRIGE, PERO NO PERSIGUE A LA EXPRESION.
       *
       * Refinar la mediana sobre la sesion corrige la deriva postural, que es
       * para lo que se incorporo: si durante la calibracion los parpados
       * estaban mas abiertos que de costumbre, todo el resto de la sesion se
       * medira contra esa postura accidental.
       *
       * Pero tiene un efecto que no estaba a la vista. Al probar la aplicacion
       * repitiendo un mismo gesto —pucheros, uno tras otro— ese gesto se
       * convierte en el valor habitual del canal y deja de apartarse de la
       * referencia. El sistema se adapta justo a lo que se le pide detectar.
       * La mediana tolera hasta la mitad de muestras atipicas, de modo que en
       * una sesion real, donde la expresion es esporadica, el problema no
       * aparece; en una sesion de prueba, donde se repite a proposito, si.
       *
       * El limite distingue una cosa de otra. La deriva postural es lenta y
       * pequena; una expresion repetida desplaza la mediana mucho mas. Se
       * admite una correccion de hasta una desviacion tipica respecto de la
       * posicion inicial: mas alla de eso ya no es una correccion sino una
       * redefinicion de lo que se considera reposo.
       */
      const inicial = this.mediaInicial[c];
      const propuesta = mediana(vals);
      const tope = Math.max(crudas[c], SIGMA_MINIMA);
      this.media[c] = Math.abs(propuesta - inicial) <= tope
        ? propuesta
        : inicial + Math.sign(propuesta - inicial) * tope;
    }

    const medibles = this.canales.map((c) => crudas[c]).filter((x) => x > SIGMA_MEDIBLE);
    const sustituta = medibles.length ? Math.max(mediana(medibles), SIGMA_MINIMA) : SIGMA_MINIMA;

    this.canalesSupuestos = [];
    for (const c of this.canales) {
      if (crudas[c] > SIGMA_MEDIBLE) this.sigma[c] = Math.max(crudas[c], SIGMA_MINIMA);
      else { this.sigma[c] = sustituta; this.canalesSupuestos.push(c); }
    }
    this.sigmaMedida = crudas;
    this.muestrasRefinamiento = juntas.length;
    return true;
  }

  /**
   * Devuelve las características como puntuación z respecto de la línea base.
   *
   * Antes de cerrarla, devuelve ceros: sin distribución de referencia no hay
   * nada contra qué normalizar, y devolver los valores crudos los haría pasar
   * por puntuaciones z, que es peor que no devolver nada.
   */
  normalizar(caracteristicas) {
    const out = {};
    if (!this.media) {
      for (const c of this.canales) out[c] = 0;
      return out;
    }
    for (const c of this.canales) {
      out[c] = (caracteristicas[c] - this.media[c]) / this.sigma[c];
    }
    return out;
  }

  /** Estado serializable, para guardarlo con la sesión y poder reanalizarla. */
  instantanea() {
    return this.media
      ? {
          media: this.media,
          sigma: this.sigma,
          mediaClasica: this.mediaClasica,
          sigmaClasica: this.sigmaClasica,
          muestras: this.muestras.length,
          quietud: this.quietud,
          sigmaMedida: this.sigmaMedida ?? null,
          canalesSupuestos: this.canalesSupuestos ?? null,
          sigmaSustituta: this.sigmaSustituta ?? null,
          autocorrelacion: this.autocorrelacion ?? null,
          muestrasEfectivas: this.muestrasEfectivas ?? null,
          muestrasRefinamiento: this.muestrasRefinamiento ?? null,
          /* Cuanto se desplazo la referencia respecto de la calibracion, en
             desviaciones tipicas. Un valor cercano al tope indica que la sesion
             estuvo dominada por una configuracion sostenida, y eso cambia como
             se interpreta el resto. */
          derivaReferencia: this.mediaInicial
            ? Object.fromEntries(this.canales.map((c) => [
                c,
                Number(((this.media[c] - this.mediaInicial[c]) /
                  Math.max(this.sigma[c], SIGMA_MINIMA)).toFixed(3)),
              ]))
            : null,
          estimadorEscala: "Qn (Rousseeuw y Croux, 1993)",
        }
      : null;
  }
}

/**
 * Frontalidad del rostro, en [0, 1].
 *
 * Los blendshapes se degradan cuando la cabeza está girada: con el rostro de
 * perfil, la mitad oculta produce coeficientes poco confiables. Medir cuán de
 * frente está la cara permite descartar esos fotogramas en lugar de
 * clasificarlos mal.
 *
 * Se estima comparando la distancia horizontal de la punta de la nariz a cada
 * borde del rostro. Un valor cercano a 1 indica cara de frente; cercano a 0,
 * girada. Se usa la geometría en vez de la matriz de transformación para no
 * depender de la convención de ejes del modelo.
 */
const NARIZ = 1;
const BORDE_IZQ = 234;
const BORDE_DER = 454;

/**
 * Frontalidad geometrica: comparacion de las dos mitades del rostro.
 *
 * SE CONSERVA COMO RESPALDO, PERO TIENE UN DEFECTO SERIO
 * Mide la asimetria de la nariz respecto de los bordes del rostro EN EL PLANO DE
 * LA IMAGEN, de modo que no distingue una cabeza girada de una cara colocada
 * fuera del centro del encuadre. La camara frontal de un telefono tiene un
 * angulo de vision amplio, y una cara descentrada muestra una perspectiva muy
 * asimetrica aunque este mirando de frente.
 *
 * Se vio en un telefono: rostro detectado, mirando a la pantalla, y esta medida
 * daba 21 %. Como el minimo para aceptar una muestra es 30 %, la calibracion
 * rechazaba casi todos los fotogramas y se quedaba clavada en una sola muestra.
 */
export function frontalidadGeometrica(landmarks) {
  const n = landmarks[NARIZ];
  const i = landmarks[BORDE_IZQ];
  const d = landmarks[BORDE_DER];
  if (!n || !i || !d) return 1;

  const dIzq = Math.abs(n.x - i.x);
  const dDer = Math.abs(d.x - n.x);
  const mayor = Math.max(dIzq, dDer);
  if (mayor < 1e-6) return 0;
  return Math.min(dIzq, dDer) / mayor;
}

/**
 * Frontalidad a partir de la matriz de transformacion facial.
 *
 * MediaPipe ya entrega la orientacion de la cabeza en el espacio y el detector
 * ya la pedia; simplemente no se estaba usando. Es una medida de ORIENTACION, no
 * de posicion, asi que no la afecta que la cara este descentrada ni la
 * perspectiva de un objetivo angular.
 *
 * COMO SE EVITA EL PROBLEMA DE LAS CONVENCIONES DE EJES
 * La razon por la que antes se prefirio la geometria era no depender de como
 * ordene el modelo sus ejes. Eso se resuelve sin tener que saberlo: la tercera
 * columna de la submatriz de rotacion es el eje que sale de la cara, y su
 * componente en profundidad, normalizada, es el coseno del angulo entre ese eje
 * y el de la camara. Vale 1 mirando de frente y 0 de perfil, y no hace falta
 * decidir cual angulo es guinada y cual cabeceo.
 *
 * La matriz llega en orden por columnas, de 16 elementos.
 */
export function frontalidadPorMatriz(matrix) {
  if (!matrix || matrix.length < 11) return null;
  const x = matrix[8], y = matrix[9], z = matrix[10];
  const norma = Math.hypot(x, y, z);
  if (norma < 1e-6) return null;
  return Math.min(1, Math.abs(z) / norma);
}

/**
 * Frontalidad del rostro, en [0, 1].
 *
 * Usa la matriz cuando esta disponible y cae en la geometria si no lo esta.
 */
export function frontalidad(landmarks, matrix = null) {
  const porMatriz = frontalidadPorMatriz(matrix);
  return porMatriz !== null ? porMatriz : frontalidadGeometrica(landmarks);
}
