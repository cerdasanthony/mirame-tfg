/**
 * Salida de voz mediante la Web Speech API.
 *
 * Si el navegador no la soporta, la aplicación continúa sin voz: la salida
 * visual del pictograma alcanza para comunicar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VOZ ES LA DEL NIÑO, NO LA DEL SISTEMA
 *
 * En comunicación aumentativa la voz sintética no narra lo que la aplicación
 * hace: dice lo que la persona usuaria está diciendo. Por eso la práctica es que
 * corresponda a su edad y a su sexo. Una voz adulta poniendo «quiero agua» en
 * boca de un niño de preescolar suena a máquina hablando por él, que es
 * exactamente lo contrario de lo que se busca.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SE PUEDE FABRICAR UNA VOZ INFANTIL SUBIENDO EL TONO
 *
 * Se intentó y sonaba mal. Conviene dejar escrito por qué, porque la conclusión
 * no es de ajuste sino de fondo.
 *
 * Lo que distingue la voz de un niño de la de un adulto no es solo la frecuencia
 * fundamental: es también la posición de los formantes, que dependen de un tracto
 * vocal más corto. El parámetro `pitch` de la Web Speech API mueve la frecuencia
 * fundamental y deja los formantes donde estaban, de modo que no se obtiene un
 * niño sino la misma voz adulta desplazada, que es justo lo que el oído reconoce
 * como procesado. Cuanto más se sube, más artificial, y en ningún punto suena
 * infantil.
 *
 * Con un tono de 1,45 el resultado era claramente sintético. La API no da acceso
 * a los formantes, así que por este camino no hay nada que ajustar: no es que
 * falte encontrar el valor bueno, es que no existe.
 *
 * LO QUE SÍ SE HACE
 *
 * Dejar de sonar genérica por donde sí se puede: eligiendo bien la voz. Una voz
 * femenina de acento americano, cercano al del participante, ya no es la voz por
 * defecto del navegador. El tono sube apenas, lo justo para aligerarla sin que
 * aparezca el artefacto, y la velocidad baja un poco, que ayuda a entenderla.
 *
 * Si en algún momento hace falta de veras una voz infantil, la salida no es este
 * parámetro sino un motor de síntesis con voces de niño, y eso implica archivos
 * de voz propios y quedaría fuera del alcance de una prueba de concepto que se
 * ejecuta entera en el dispositivo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ACENTO IMPORTA Y ANTES ESTABA MAL
 *
 * El código pedía `lang = "es-CR"` pero no elegía voz, de modo que el navegador
 * usaba la que tuviera por defecto: en este equipo, Helena, de España. Un niño
 * costarricense aprendiendo a comunicarse recibía su propia voz con acento
 * peninsular. Ahora se puntúan las voces por cercanía regional, y una mexicana
 * gana a una peninsular.
 */

const disponible = "speechSynthesis" in window;
const CLAVE = "mirame.voz";

/**
 * Nombres masculinos frecuentes entre las voces en español de los sistemas
 * habituales. La API no expone el sexo de la voz, así que no hay forma limpia de
 * saberlo: esto es una heurística. Por eso la persona cuidadora puede elegir la
 * voz a mano en el panel, que es la salida cuando la heurística falla.
 */
const MASCULINAS = /\b(pablo|raul|raúl|jorge|diego|miguel|carlos|juan|alvaro|álvaro|enrique)\b/i;

/** Cercanía del acento al del participante, que es costarricense. */
function puntosRegion(lang) {
  const l = lang.toLowerCase();
  if (l.startsWith("es-cr")) return 6;
  if (/^es-(mx|419|us|gt|hn|ni|pa|co|ve)/.test(l)) return 4;   // español americano
  if (/^es-(ar|cl|pe|bo|ec|py|uy)/.test(l)) return 3;
  if (l.startsWith("es-es")) return 1;                          // peninsular
  return l.startsWith("es") ? 2 : -100;
}

function puntuar(v) {
  let p = puntosRegion(v.lang);
  if (p < 0) return p;
  if (!MASCULINAS.test(v.name)) p += 3;   // se prefiere femenina
  if (v.localService) p += 1;             // funciona sin conexión (RNF-05)
  return p;
}

/** Voces en español, de la más adecuada a la menos. */
export function voces() {
  if (!disponible) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => /^es/i.test(v.lang))
    .sort((a, b) => puntuar(b) - puntuar(a));
}

/* Ajustes, recordados entre sesiones.
   El tono queda apenas por encima del normal: aligera la voz sin que aparezca el
   artefacto de desplazar la fundamental dejando los formantes quietos. La
   velocidad, algo por debajo de la normal, ayuda a entenderla sin volverse
   lenta. */
/* 1,10 y no 1,12: el deslizador del panel avanza de 0,05 en 0,05, y un valor
   fuera de esa rejilla hacia que el control mostrara una posicion y la cifra de
   al lado otra. */
const POR_DEFECTO = { voz: null, tono: 1.1, velocidad: 0.95 };

export function ajustes() {
  try {
    return { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE) ?? "{}") };
  } catch {
    return { ...POR_DEFECTO };
  }
}

export function fijarAjustes(nuevos) {
  const a = { ...ajustes(), ...nuevos };
  localStorage.setItem(CLAVE, JSON.stringify(a));
  return a;
}

/** La voz elegida a mano, o la mejor puntuada si no hay ninguna elegida. */
export function vozActual() {
  const lista = voces();
  if (!lista.length) return null;
  const { voz } = ajustes();
  return lista.find((v) => v.name === voz) ?? lista[0];
}

export function hablar(texto) {
  if (!disponible) return false;
  const sintesis = window.speechSynthesis;
  sintesis.cancel();

  const u = new SpeechSynthesisUtterance(texto);
  const a = ajustes();
  const v = vozActual();
  if (v) {
    u.voice = v;
    /* El idioma se toma de la voz y no se fuerza: pedir un `lang` que la voz no
       habla hace que algunos motores la descarten y vuelvan a la de por
       defecto, que es como se acababa usando una voz peninsular. */
    u.lang = v.lang;
  } else {
    u.lang = "es-CR";
  }
  u.pitch = a.tono;
  u.rate = a.velocidad;
  sintesis.speak(u);
  return true;
}

/**
 * Avisa cuando la lista de voces esté lista.
 *
 * En varios navegadores `getVoices()` devuelve una lista vacía en la primera
 * llamada y se puebla después, de forma asíncrona. Sin esperar a ese evento, un
 * desplegable de voces construido al arrancar sale vacío.
 */
export function alHaberVoces(fn) {
  if (!disponible) return;
  if (window.speechSynthesis.getVoices().length) {
    fn();
    return;
  }
  window.speechSynthesis.addEventListener("voiceschanged", fn, { once: true });
}

