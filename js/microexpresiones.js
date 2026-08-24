/**
 * Módulo B′ — Detección fásica: eventos expresivos breves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA QUE RESUELVE
 *
 * La cadena de `classifier.js` está construida, deliberadamente, para BORRAR
 * todo lo que dure poco. Ese era el objetivo cuando se escribió: un estado que
 * parpadea es inútil para la persona cuidadora. Pero tiene una consecuencia que
 * no estaba a la vista:
 *
 *   · Suavizado exponencial, alfa 0,18 → constante de tiempo ≈ 170 ms a 30 fps.
 *     Un evento de 100 ms alcanza apenas el 45 % de su amplitud real antes de
 *     que el rostro vuelva al reposo. Una desviación genuina de 2,0 σ se mide
 *     como 0,9 σ y queda por debajo del umbral de 1,0 σ.
 *   · Histéresis de 0,25 σ → sube todavía más el listón para entrar a un estado.
 *   · Dwell de 500 ms → un cambio de estado exige 500 ms de evidencia sostenida.
 *
 * Ese último parámetro es el decisivo. Una microexpresión, en la definición de
 * Ekman, dura entre 1/25 y 1/5 de segundo: entre 40 y 200 ms. Con un dwell de
 * 500 ms NINGUNA microexpresión puede llegar a cambiar el estado comprometido.
 * No es un umbral mal calibrado: es una imposibilidad estructural. El
 * instrumento estaba diseñado para no verlas.
 *
 * A eso se suma el compuesto de `puntaje()`, que divide entre la suma de pesos
 * absolutos (4,0). Una sola AU disparándose a +4 σ mientras las otras seis están
 * en reposo produce un compuesto de +1,0 σ: justo en la frontera. Una señal
 * concentrada en un canal —que es exactamente la forma que tiene la expresión
 * sutil de una persona hipoexpresiva— se atenúa cuatro veces por construcción.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SOLUCIÓN: DOS VÍAS EN PARALELO, NO UNA VÍA RETOCADA
 *
 * Bajar el dwell rompería la vía tónica, que hace bien su trabajo. Lo correcto
 * es separar las dos escalas temporales, como se hace en psicofisiología:
 *
 *   TÓNICA (`classifier.js`, intacta)  — estado sostenido, segundos, suavizado.
 *   FÁSICA (este módulo)               — eventos transitorios, milisegundos.
 *
 * La vía fásica no suaviza, no aplica histéresis, no aplica dwell y NO usa el
 * compuesto: trabaja canal por canal sobre la puntuación z cruda de cada AU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO DETECTA: FILTRO ADAPTADO A UN TRANSITORIO
 *
 * Para cada canal y cada instante candidato t se calcula
 *
 *     d(t) = z(t) − [ z(t−Δ) + z(t+Δ) ] / 2
 *
 * es decir, cuánto sobresale el instante t respecto de lo que había Δ antes y Δ
 * después. Es el contraste por diferencia de rasgos que se usa como referencia
 * en la localización de microexpresiones (Moilanen et al., 2014, y sobre él las
 * líneas base de los retos MEGC sobre CASME II, SAMM y SMIC).
 *
 * La propiedad que importa: responde a lo que SUBE Y BAJA, y es ciego tanto a la
 * deriva lenta como a la expresión sostenida. Es el complemento exacto de la vía
 * tónica, no una versión más sensible de ella. Una sonrisa de cinco segundos da
 * d ≈ 0 en el centro; un gesto de 120 ms da un pico limpio.
 *
 * Se evalúa a varias escalas Δ porque un filtro adaptado solo es óptimo a la
 * duración para la que está adaptado. La escala que produce la respuesta máxima
 * es, además, la primera estimación de la duración del evento.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO DECIDE: UMBRAL DERIVADO DEL RUIDO MEDIDO, NO ELEGIDO
 *
 * El umbral no es una constante. Durante unos segundos de calentamiento el
 * detector observa la distribución de d(t) SIN emitir eventos, y fija
 *
 *     τ = mediana(d) + k · 1,4826 · MAD(d)
 *
 * o sea, k desviaciones robustas por encima del propio ruido de ese canal en
 * ese participante y en esa sesión. Esto es lo que hace que el módulo sirva
 * para un niño que apenas mueve la cara: si sus músculos recorren poco, su
 * ruido también es pequeño, y el umbral baja con él. Un umbral absoluto —1,0 σ
 * del compuesto— no puede hacer eso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LÍMITE FÍSICO QUE HAY QUE DECLARAR, NO DISIMULAR
 *
 * A 30 fps cada fotograma son 33 ms. Describir un evento con inicio, ápice y
 * final exige al menos tres muestras: ~100 ms. La banda 40–100 ms de la
 * definición de Ekman queda POR DEBAJO DE LA RESOLUCIÓN del instrumento y este
 * módulo no puede verla, por mucho umbral que se baje.
 *
 * Por eso cada evento sale marcado con `resoluble`, y las métricas reportan la
 * frecuencia de muestreo medida y la duración mínima resoluble que se deriva de
 * ella. Un TFG que dice «detecta microexpresiones» sin declarar su resolución
 * temporal está afirmando más de lo que puede sostener. Subir la cámara a 60 fps
 * baja el piso a ~50 ms y es la vía de mejora, siempre que el dispositivo
 * sostenga la inferencia a esa velocidad — cosa que hay que medir, no suponer.
 */

import { AU_PERIORBITALES, VALENCIA_AU } from "./facs.js";

/** Bandas de duración TOTAL. Los cortes son los de la literatura, no invenciones. */
export const BANDAS = {
  /* Ekman y Friesen: la microexpresión dura entre 1/25 y 1/5 de segundo. */
  MICRO_ESTRICTA: [40, 200],
  /* Definición amplia usada en los corpus CASME II / SAMM: hasta medio segundo. */
  BREVE: [200, 500],
  /* Por encima de medio segundo ya es expresión ordinaria: la ve la vía tónica. */
  MACRO: [500, Infinity],
};

/**
 * Factor de forma: cociente entre anchura a media altura y duración total.
 *
 * POR QUÉ NO SE MIDE LA DURACIÓN TOTAL DIRECTAMENTE
 * Sería lo natural: caminar desde el ápice hasta que la señal vuelva al reposo.
 * Se probó y no funciona. Cerca del reposo la señal es indistinguible del ruido,
 * así que el punto donde «vuelve» lo decide el ruido y no el gesto. Medido en
 * simulación con razón señal/ruido ≈ 4: un transitorio real de 130 ms se medía
 * como 400 ms, porque el recorrido se metía en la zona de fondo y no paraba.
 *
 * La anchura a media altura sí es estable —ahí la señal está lejos del ruido— y
 * es la medida que se usa convencionalmente para acotar transitorios. De modo
 * que se mide la FWHM, que es robusta, y los cortes de la literatura, que están
 * en duración total, se convierten a FWHM con este factor.
 *
 * EL SUPUESTO, EXPLÍCITO
 * 0,66 corresponde a un pulso de subida y bajada suaves. Una expresión facial
 * real tiene inicio más rápido que final, así que el factor verdadero es algo
 * menor y las duraciones quedan levemente subestimadas. Es un supuesto declarado
 * y en un solo lugar, que es la forma correcta de tener uno. Se comprueba
 * contrastando `fwhmMs` contra `escalaMs`, que estima la duración por un camino
 * independiente: si divergen de forma sistemática, este factor está mal.
 */
export const FACTOR_FORMA = 0.66;

const cortesFwhm = () => ({
  microMin: BANDAS.MICRO_ESTRICTA[0] * FACTOR_FORMA,
  microMax: BANDAS.MICRO_ESTRICTA[1] * FACTOR_FORMA,
  breveMax: BANDAS.BREVE[1] * FACTOR_FORMA,
});

/** Banda a la que pertenece un evento, decidida sobre su FWHM. */
export function banda(fwhmMs) {
  const c = cortesFwhm();
  if (fwhmMs < c.microMin) return "subumbral";
  if (fwhmMs < c.microMax) return "microexpresion";
  if (fwhmMs < c.breveMax) return "expresion breve";
  return "macroexpresion";
}

/** Duración total estimada a partir de la FWHM medida. */
export const totalDesdeFwhm = (fwhmMs) => fwhmMs / FACTOR_FORMA;

const mediana = (xs) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

const mad = (xs) => {
  const med = mediana(xs);
  return mediana(xs.map((v) => Math.abs(v - med)));
};

/**
 * Detector fásico multicanal.
 *
 * Se alimenta fotograma a fotograma con el vector de puntuaciones z de las AU y
 * devuelve los eventos que se hayan CERRADO en ese fotograma. Un evento se
 * cierra cuando la respuesta del filtro vuelve a caer por debajo del umbral, de
 * modo que siempre llega completo: inicio, ápice, final y amplitud.
 */
export class DetectorFasico {
  /**
   * @param {string[]} canales        Canales AU a vigilar.
   * @param {number[]} escalasMs      Duraciones a las que se adapta el filtro.
   * @param {number}   kRuido         Umbral en desviaciones robustas del ruido.
   * @param {number}   calentamientoMs Tiempo de estimación del ruido sin emitir.
   * @param {number}   refractarioMs  Silencio mínimo entre eventos de un canal.
   */
  constructor({
    canales,
    escalasMs = [100, 180, 300, 450],
    kRuido = 3.0,
    minEscalas = 2,
    calentamientoMs = 4000,
    refractarioMs = 120,
  }) {
    this.canales = canales;
    this.escalasMs = [...escalasMs].sort((a, b) => a - b);
    this.deltaMaxMs = this.escalasMs[this.escalasMs.length - 1] / 2;
    this.kRuido = kRuido;
    this.minEscalas = minEscalas;
    this.calentamientoMs = calentamientoMs;
    this.refractarioMs = refractarioMs;

    /* El buffer debe cubrir el filtro más ancho a ambos lados del centro, más
       margen para reconstruir inicio y final del evento caminando hacia atrás. */
    this.ventanaMs = this.deltaMaxMs * 2 + 900;

    this.reiniciar();
  }

  reiniciar() {
    this.buffer = Object.fromEntries(this.canales.map((c) => [c, []]));
    this.ruido = Object.fromEntries(
      this.canales.map((c) => [c, Object.fromEntries(this.escalasMs.map((e) => [e, []]))])
    );
    this.umbral = null;
    this.degradado = false;
    this.enCurso = Object.fromEntries(this.canales.map((c) => [c, null]));
    this.finUltimo = Object.fromEntries(this.canales.map((c) => [c, 0]));
    this.inicioMs = null;
    this.intervalos = [];
    this.ultimoT = null;
    this.eventos = [];
    this.descartadosPorParpadeo = 0;
    this.descartadosPorResolucion = 0;
  }

  get calibrado() {
    return this.umbral !== null;
  }

  get progresoCalentamiento() {
    if (this.calibrado) return 1;
    if (this.inicioMs === null) return 0;
    return Math.min(1, (this.ultimoT - this.inicioMs) / this.calentamientoMs);
  }

  /** Intervalo típico entre fotogramas, en ms. Base de la resolución temporal. */
  get dtMedianoMs() {
    return this.intervalos.length ? mediana(this.intervalos) : 33.3;
  }

  get fps() {
    return 1000 / this.dtMedianoMs;
  }

  /**
   * Duración total mínima que el instrumento puede describir.
   *
   * Un evento se acepta si su anchura a media altura abarca al menos dos
   * intervalos de muestreo —tres muestras: subida, ápice, bajada—. Por debajo de
   * eso no se observó un evento con forma, se observó un fotograma alto.
   *
   * Llevado a duración total con FACTOR_FORMA, ese mínimo equivale a poco más de
   * tres intervalos, y eso es lo que se reporta: a 30 fps, unos 100 ms.
   */
  get resolucionMs() {
    return (2 * this.dtMedianoMs) / FACTOR_FORMA;
  }

  /** Muestra del buffer más cercana a un instante dado. */
  #cercana(serie, t) {
    let mejor = null;
    let dist = Infinity;
    for (let i = serie.length - 1; i >= 0; i--) {
      const dd = Math.abs(serie[i].t - t);
      if (dd < dist) {
        dist = dd;
        mejor = serie[i];
      } else if (serie[i].t < t - dist) {
        break; // la serie está ordenada: más atrás solo se aleja
      }
    }
    return mejor;
  }

  /**
   * Respuesta del filtro adaptado en el instante `tc`, sobre todas las escalas.
   * Devuelve la máxima y la escala que la produjo.
   */
  #respuesta(serie, tc) {
    const centro = this.#cercana(serie, tc);
    if (!centro) return null;
    let mejor = { d: -Infinity, escalaMs: null, z: centro.z, t: centro.t };
    const porEscala = {};
    for (const esc of this.escalasMs) {
      const dl = esc / 2;
      const antes = this.#cercana(serie, tc - dl);
      const despues = this.#cercana(serie, tc + dl);
      if (!antes || !despues) continue;
      /* Sin apoyo real a ambos lados el contraste es contra sí mismo y da 0
         artificialmente; se exige que las muestras estén donde deberían. */
      if (Math.abs(antes.t - (tc - dl)) > dl * 0.5) continue;
      if (Math.abs(despues.t - (tc + dl)) > dl * 0.5) continue;
      const d = centro.z - (antes.z + despues.z) / 2;
      porEscala[esc] = d;
      if (d > mejor.d) mejor = { d, escalaMs: esc, z: centro.z, t: centro.t };
    }
    return mejor.escalaMs === null ? null : { ...mejor, porEscala };
  }

  /**
   * Acota el evento caminando desde el ápice hacia ambos lados hasta que la
   * señal cruda cae por debajo de una fracción de la altura del pico.
   *
   * Se llama con `fraccion` 0,5, es decir a media altura, y el motivo de que sea
   * esa y no otra está en el comentario de FACTOR_FORMA: a media altura la señal
   * todavía domina al ruido, y más abajo ya no. El parámetro queda expuesto
   * porque la elección es una decisión de medición y debe poder revisarse.
   */
  #extremos(serie, apice, amplitud, fraccion) {
    const corte = apice.z - amplitud * (1 - fraccion);

    /* Se toma el último fotograma que todavía está por encima del corte, a cada
       lado. El cruce real cae entre ese fotograma y el siguiente, así que la
       anchura queda determinada con una incertidumbre de hasta un intervalo de
       muestreo por lado.

       Se probó interpolar linealmente el cruce para afinarlo y SALIÓ PEOR: con
       la señal cerca del ruido, el fotograma de fuera queda apenas por debajo
       del corte y la interpolación estira el evento hacia afuera. Medido en
       simulación a 60 fps, un transitorio de 130 ms pasó de estimarse en 126 ms
       a 152 ms. La convención simple resultó ser la más exacta de las dos y es
       la que se conserva. La incertidumbre no se disimula: se reporta en
       `incertidumbreMs` y se propaga a `bandaIncierta`. */
    let inicio = apice;
    for (let i = serie.length - 1; i >= 0; i--) {
      if (serie[i].t > apice.t) continue;
      if (serie[i].z < corte) break;
      inicio = serie[i];
    }

    let fin = apice;
    for (let i = 0; i < serie.length; i++) {
      if (serie[i].t < apice.t) continue;
      if (serie[i].z < corte) break;
      fin = serie[i];
    }

    return { tInicio: inicio.t, tFin: fin.t };
  }

  /**
   * Alimenta el detector con las puntuaciones z de un fotograma.
   *
   * `z` debe ser el vector SIN suavizar. Pasarle la señal suavizada anula el
   * módulo entero: el suavizado es precisamente lo que borra los transitorios.
   *
   * Devuelve los eventos cerrados en este fotograma (normalmente ninguno).
   */
  agregar(z, t = performance.now()) {
    if (this.inicioMs === null) this.inicioMs = t;
    if (this.ultimoT !== null) {
      const dt = t - this.ultimoT;
      /* Huecos largos son cámara detenida o rostro perdido, no cadencia. */
      if (dt > 0 && dt < 200) {
        this.intervalos.push(dt);
        if (this.intervalos.length > 300) this.intervalos.shift();
      }
    }
    this.ultimoT = t;

    for (const c of this.canales) {
      const serie = this.buffer[c];
      serie.push({ t, z: z[c] ?? 0 });
      const corte = t - this.ventanaMs;
      while (serie.length && serie[0].t < corte) serie.shift();
    }

    /* El centro evaluable es el que ya tiene apoyo a ambos lados del filtro. */
    const tc = t - this.deltaMaxMs;
    const cerrados = [];

    for (const c of this.canales) {
      const r = this.#respuesta(this.buffer[c], tc);
      if (!r) continue;

      if (!this.calibrado) {
        for (const [esc, d] of Object.entries(r.porEscala)) this.ruido[c][esc].push(d);
        continue;
      }

      /* PERSISTENCIA EN ESCALA
         Se cuenta en cuántas escalas del filtro la respuesta supera el umbral
         propio de esa escala. Un transitorio real tiene una anchura, así que
         responde en varias escalas contiguas; una coincidencia de ruido responde
         en una sola y se apaga en las demás. Exigir concurrencia de al menos dos
         escalas separa una cosa de la otra SIN tocar el umbral, que es lo que
         permite ganar especificidad sin pagarla en sensibilidad. */
      let concurrentes = 0;
      for (const [esc, d] of Object.entries(r.porEscala)) {
        if (d >= this.umbral[c][esc]) concurrentes++;
      }

      const tau = this.umbral[c][r.escalaMs];
      const abierto = this.enCurso[c];

      if (concurrentes >= this.minEscalas) {
        if (!abierto) {
          if (tc - this.finUltimo[c] < this.refractarioMs) continue;
          this.enCurso[c] = { apice: r, dMax: r.d, escalasMax: concurrentes };
        } else {
          if (concurrentes > abierto.escalasMax) abierto.escalasMax = concurrentes;
          if (r.d > abierto.dMax) {
            abierto.dMax = r.d;
            abierto.apice = r;
          }
        }
      } else if (abierto) {
        const ev = this.#cerrar(c, abierto, tau);
        this.enCurso[c] = null;
        this.finUltimo[c] = tc;
        if (ev) cerrados.push(ev);
      }
    }

    /* Fin del calentamiento: se congela el umbral de cada canal a partir de la
       distribución de ruido observada, y recién entonces se empieza a emitir.
       Si no se reunió lo suficiente, `#fijarUmbrales` lo rechaza y se sigue
       acumulando hasta el tope, donde ya se cierra con lo que haya. */
    if (!this.calibrado && t - this.inicioMs >= this.calentamientoMs) {
      this.#fijarUmbrales(t - this.inicioMs >= this.calentamientoMs * 3);
    }

    if (cerrados.length) this.#anotarParpadeos(cerrados);
    for (const ev of cerrados) this.eventos.push(ev);
    return cerrados;
  }

  /**
   * Congela los umbrales a partir del ruido observado.
   *
   * NO SE DA POR CALIBRADO SI NO HAY CON QUÉ
   * Si durante el calentamiento no se reunieron muestras suficientes —porque se
   * perdió el rostro, porque quedó demasiado girado, o porque la cadencia fue
   * muy baja para llenar las escalas anchas— los umbrales quedarían en infinito
   * y el detector no podría emitir un solo evento en toda la sesión. Declararse
   * «calibrado» en ese estado es el peor resultado posible: el panel diría
   * «activa», el registro saldría vacío, y ese vacío se leería como que el
   * participante no expresó nada.
   *
   * Así que si ningún canal quedó utilizable, no se congela nada y el
   * calentamiento continúa. Pasado el triple del tiempo previsto se cierra con
   * lo que haya y se marca `degradado`, porque un detector con referencia
   * imperfecta que lo declara es mejor que uno que nunca arranca — el mismo
   * criterio que ya usa la línea base tónica en `app.js`.
   */
  #fijarUmbrales(forzar = false) {
    this.umbral = {};
    this.ruidoResumen = {};
    for (const c of this.canales) {
      this.umbral[c] = {};
      const porEscala = {};
      let suficiente = true;

      /* Cada escala tiene su propio ruido: el filtro ancho promedia más muestras
         y por tanto fluctúa menos. Un umbral común las trataría como iguales y
         dejaría la escala corta hipersensible y la larga sorda. */
      for (const esc of this.escalasMs) {
        const ds = this.ruido[c][esc] ?? [];
        if (ds.length < 20) {
          /* Sin muestras suficientes no se inventa un umbral: se deja la escala
             apagada en lugar de emitir eventos sin fundamento. */
          this.umbral[c][esc] = Infinity;
          porEscala[esc] = { n: ds.length, suficiente: false };
          suficiente = false;
          continue;
        }
        const med = mediana(ds);
        const sigma = mad(ds) * 1.4826;
        this.umbral[c][esc] = med + this.kRuido * sigma;
        porEscala[esc] = {
          n: ds.length,
          mediana: Number(med.toFixed(4)),
          sigma: Number(sigma.toFixed(4)),
          umbral: Number(this.umbral[c][esc].toFixed(4)),
          suficiente: true,
        };
      }

      /* Sigma de referencia del canal: la de la escala más corta, que es la que
         mejor representa el ruido fotograma a fotograma. */
      this.ruidoResumen[c] = {
        suficiente,
        /* Un canal sirve si al menos `minEscalas` escalas tienen umbral, porque
           por debajo de eso la persistencia en escala no se puede evaluar y el
           canal jamás dispararía. */
        utilizable:
          this.escalasMs.filter((e) => porEscala[e]?.suficiente).length >= this.minEscalas,
        sigma: porEscala[this.escalasMs[0]]?.sigma ?? null,
        porEscala,
      };
    }

    const utiles = this.canales.filter((c) => this.ruidoResumen[c].utilizable).length;
    if (utiles === 0 && !forzar) {
      /* Se deshace: sin un solo canal utilizable no hay calibración que valga, y
         seguir acumulando es mejor que congelar un detector sordo. */
      this.umbral = null;
      this.ruidoResumen = null;
      return false;
    }
    this.degradado = utiles < this.canales.length;
    return true;
  }

  #cerrar(canal, abierto, tau) {
    const serie = this.buffer[canal];
    const apice = abierto.apice;
    const amplitud = abierto.dMax;

    const { tInicio, tFin } = this.#extremos(serie, apice, amplitud, 0.5);
    const fwhm = tFin - tInicio;

    /* Resoluble exige que el pico abarque al menos dos intervalos de muestreo:
       con menos que eso no hay una anchura medida, hay un fotograma alto. */
    const resoluble = fwhm >= 2 * this.dtMedianoMs;
    if (!resoluble) this.descartadosPorResolucion++;

    const sigma = this.ruidoResumen?.[canal]?.sigma ?? null;

    return {
      canal,
      /* Los instantes acotan la FWHM, no el gesto completo: el inicio real es
         algo anterior y el final algo posterior. Se nombran como lo que son. */
      tInicioMediaAltura: tInicio,
      tApice: apice.t,
      tFinMediaAltura: tFin,
      /* Anchura a media altura: la medida robusta y la que decide la banda. */
      fwhmMs: Number(fwhm.toFixed(1)),
      /* Duración total estimada, bajo el supuesto de FACTOR_FORMA. */
      duracionMs: Number(totalDesdeFwhm(fwhm).toFixed(1)),
      /* Incertidumbre de la duración: un intervalo de muestreo por cada lado. A
         30 fps son ±66 ms sobre la anchura, que en duración total son ±100 ms.
         Sobre una banda que va de 40 a 200 ms, eso es enorme, y por eso importa
         reportarlo junto al número y no solo el número. */
      incertidumbreMs: Number(totalDesdeFwhm(2 * this.dtMedianoMs).toFixed(0)),
      /* La duración estimada está tan cerca de un corte que la banda podría ser
         la de al lado. La etiqueta se da igual, pero marcada. */
      bandaIncierta: banda(Math.max(0, fwhm - 2 * this.dtMedianoMs)) !== banda(fwhm)
        || banda(fwhm + 2 * this.dtMedianoMs) !== banda(fwhm),
      /* Amplitud del contraste y altura absoluta del ápice: la primera es lo
         que disparó la detección, la segunda es cuán lejos del reposo llegó. */
      amplitudSigma: Number(amplitud.toFixed(3)),
      zApice: Number(apice.z.toFixed(3)),
      /* Escala del filtro que dio la respuesta máxima: estimación independiente
         de la duración, útil para contrastar con la medida por altura. */
      escalaMs: apice.escalaMs,
      /* Cuántas escalas del filtro concurrieron en el ápice. Es una medida de
         cuán bien formado estaba el transitorio y se reporta con el evento. */
      escalasConcurrentes: abierto.escalasMax,
      umbral: Number(tau.toFixed(3)),
      /* Cuántas veces el ruido propio de ESE canal quedó por debajo. Es lo que
         hay que reportar, y no solo «se detectó». */
      razonSenalRuido: sigma ? Number((amplitud / sigma).toFixed(2)) : null,
      banda: banda(fwhm),
      resoluble,
      posibleParpadeo: false,
    };
  }

  /**
   * Marca los eventos periorbitales que coinciden en el tiempo con un evento de
   * AU43 (cierre de ojos).
   *
   * No se descartan: se marcan. Descartar en silencio esconde la tasa de
   * artefacto, que es un dato de calidad del instrumento y debe poder
   * reportarse. Quien analice decide si los excluye.
   */
  #anotarParpadeos(cerrados) {
    const parpadeos = [...this.eventos, ...cerrados].filter((e) => e.canal === "AU43");
    for (const ev of cerrados) {
      if (ev.canal === "AU43" || !AU_PERIORBITALES.includes(ev.canal)) continue;
      const solapa = parpadeos.some(
        (p) => p.tInicioMediaAltura <= ev.tFinMediaAltura && p.tFinMediaAltura >= ev.tInicioMediaAltura
      );
      if (solapa) {
        ev.posibleParpadeo = true;
        this.descartadosPorParpadeo++;
      }
    }
  }

  /**
   * Eventos ocurridos dentro de una ventana temporal, para adjuntarlos a una
   * selección de pictograma.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * QUÉ APORTA ESTO AL OBJETIVO GENERAL, Y DÓNDE SE DETIENE
   *
   * El objetivo general es que el participante pueda expresar cuatro estados:
   * positivo, neutro, negativo leve y negativo intenso. La vía fásica NO asigna
   * esos cuatro estados, y no hacerlo es una decisión, no una carencia.
   *
   * Lo que aporta es la valencia: si en la ventana hubo transitorios, y hacia
   * qué lado empujaban. Eso basta para lo que de verdad hacía falta, que es
   * detectar el «neutro» FALSO. Si la vía tónica reportó neutro porque suavizó y
   * exigió 500 ms de permanencia, pero la fásica encontró tres transitorios
   * negativos resolubles en esos mismos segundos, el neutro es un artefacto del
   * filtro y no una descripción del participante. En un niño hipoexpresivo esa
   * confusión no es un caso raro: es el caso normal, y es la razón de que un
   * registro entero pueda salir neutro y no querer decir nada.
   *
   * DÓNDE SE DETIENE, Y POR QUÉ
   * La distinción entre negativo LEVE e INTENSO es de intensidad, y la amplitud
   * que mide esta vía depende de la cadencia de la cámara: el mismo transitorio
   * de 3 σ se mide en 3,30 σ a 60 fps, y a 30 fps ni siquiera llega a
   * registrarse. Repartir leve/intenso sobre una amplitud que cambia con los fps
   * que negocie el dispositivo sería fabricar precisión. Esa distinción se queda
   * donde la medida es estable, que es la vía tónica.
   *
   * Tampoco se afirma que la ausencia de eventos signifique ausencia de gesto.
   * Con el umbral calibrado al criterio del proyecto, la sensibilidad ante un
   * gesto débil de 1,2 σ es del 48 %: cerca de la mitad se pierden. Una ventana
   * sin eventos es compatible con que no hubiera nada y con que lo hubiera y no
   * se viera, y el informe tiene que decirlo con ese número al lado.
   *
   * `limpios` aplica el criterio conservador —resolubles y sin sospecha de
   * parpadeo— y se reporta junto al total, nunca en su lugar.
   */
  enVentana(desde, hasta, estadoTonico = null) {
    const dentro = this.eventos.filter((e) => e.tApice >= desde && e.tApice <= hasta);
    const limpios = dentro.filter((e) => e.resoluble && !e.posibleParpadeo);

    const porBanda = {};
    const porCanal = {};
    const porValencia = { positivo: 0, negativo: 0, "sin signo": 0 };
    for (const e of limpios) {
      porBanda[e.banda] = (porBanda[e.banda] ?? 0) + 1;
      porCanal[e.canal] = (porCanal[e.canal] ?? 0) + 1;
      porValencia[VALENCIA_AU[e.canal] ?? "sin signo"]++;
    }

    const conSigno = porValencia.positivo + porValencia.negativo;
    const valenciaDominante = conSigno === 0
      ? null
      : porValencia.positivo === porValencia.negativo
        ? "mixta"
        : porValencia.positivo > porValencia.negativo ? "positivo" : "negativo";

    return {
      total: dentro.length,
      limpios: limpios.length,
      porBanda,
      porCanal,
      porValencia,
      valenciaDominante,
      /* El hallazgo que justifica toda esta vía: la tónica dijo neutro y aquí
         hubo actividad con signo. No se corrige el estado —eso exigiría una
         regla de fusión que este trabajo no ha validado— se MARCA, para que
         quien analice sepa que ese neutro no es de fiar. */
      contradiceNeutro: estadoTonico === "neutro" && conSigno > 0,
      eventos: limpios.map((e) => ({
        canal: e.canal,
        valencia: VALENCIA_AU[e.canal] ?? "sin signo",
        banda: e.banda,
        bandaIncierta: e.bandaIncierta,
        duracionMs: e.duracionMs,
        amplitudSigma: e.amplitudSigma,
        razonSenalRuido: e.razonSenalRuido,
        msAntes: Number((hasta - e.tApice).toFixed(0)),
      })),
    };
  }

  /**
   * Estado del instrumento, para el panel y para el informe.
   *
   * Se reporta la resolución temporal medida y qué parte de la definición de
   * Ekman queda por debajo de ella. Es la cifra que honestamente acota lo que
   * este trabajo puede afirmar.
   */
  get metricas() {
    const res = this.resolucionMs;
    const limpios = this.eventos.filter((e) => e.resoluble && !e.posibleParpadeo);
    const porBanda = {};
    for (const e of limpios) porBanda[e.banda] = (porBanda[e.banda] ?? 0) + 1;
    /* Cuántos canales pueden realmente disparar. Es la cifra que distingue «no
       hubo eventos» de «no había con qué detectarlos», y por eso va al panel. */
    const utiles = this.ruidoResumen
      ? this.canales.filter((c) => this.ruidoResumen[c]?.utilizable).length
      : 0;

    return {
      calibrado: this.calibrado,
      canalesUtiles: utiles,
      canalesTotales: this.canales.length,
      degradado: Boolean(this.degradado),
      progresoCalentamiento: this.progresoCalentamiento,
      fps: Number(this.fps.toFixed(1)),
      dtMedianoMs: Number(this.dtMedianoMs.toFixed(1)),
      resolucionMs: Number(res.toFixed(0)),
      /* Porción de la banda de Ekman (40–200 ms) que el muestreo no alcanza. */
      cegueraEkmanPct: Number(
        (Math.min(100, Math.max(0, ((res - 40) / (200 - 40)) * 100))).toFixed(0)
      ),
      eventosTotales: this.eventos.length,
      eventosLimpios: limpios.length,
      porBanda,
      descartadosPorResolucion: this.descartadosPorResolucion,
      marcadosComoParpadeo: this.descartadosPorParpadeo,
      ruido: this.ruidoResumen ?? null,
    };
  }
}
