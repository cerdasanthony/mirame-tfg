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
 * QUÉ SE PUEDE Y QUÉ NO
 *
 * No hay voces infantiles: el sistema solo ofrece adultas. Comprobado en este
 * equipo, las cinco voces en español eran Helena, Laura, Pablo, Raúl y Sabina,
 * todas de adulto. Así que la voz de niño se APROXIMA, y conviene decirlo tal
 * cual en el informe en vez de afirmar que se usa una voz infantil.
 *
 * La aproximación tiene dos partes. Se elige una voz femenina, cuya frecuencia
 * fundamental está más cerca de la de un niño que la de una masculina. Y se sube
 * el tono, porque un niño en edad preescolar ronda los 250–300 Hz frente a los
 * ~200 Hz de una mujer adulta.
 *
 * El tono no se sube más porque a partir de cierto punto la voz deja de sonar
 * infantil y empieza a sonar procesada, y la inteligibilidad es lo primero: si
 * no se entiende, no comunica.
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

/* Ajustes, recordados entre sesiones. El tono por defecto sube respecto del
   normal sin llegar a sonar procesado; la velocidad queda algo por debajo de la
   normal, lo que ayuda a la inteligibilidad sin volverse lenta. */
const POR_DEFECTO = { voz: null, tono: 1.45, velocidad: 0.95 };

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

export const vozDisponible = disponible;
