/**
 * Dibujos de los pictogramas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NO EMOJI
 *
 * Los emoji que habia eran marcadores temporales y varios de ellos no
 * representan la palabra sino algo asociado a ella. Una gota no es agua, es
 * agua cayendo; una corchea no es musica, es notacion musical, que es un
 * simbolo de segundo orden. Un nino que esta APRENDIENDO a usar el tablero no
 * tiene por que hacer ese salto, y si lo tiene que hacer el pictograma esta
 * fallando en lo unico que se le pide.
 *
 * Estos dibujos representan el objeto o la accion de forma directa: un vaso con
 * pajilla, unos audifonos, un plato con cubiertos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLAS DE DIBUJO, Y POR QUE
 *
 * Silueta reconocible antes que detalle. A tamano de tecla y a la distancia de
 * una tablet, el detalle fino no se resuelve y solo ensucia el contorno.
 *
 * Trazo grueso y uniforme, de 3 unidades sobre un lienzo de 64. Un trazo fino
 * desaparece contra el disco tintado del fondo.
 *
 * El color principal es el de la CATEGORIA, heredado por `--tono`. Asi el dibujo
 * y el codigo de color dicen lo mismo y se refuerzan, en vez de que el nino
 * tenga que aprender dos sistemas distintos.
 *
 * Relleno blanco bajo el trazo, para que la figura se separe del disco de fondo,
 * que es un tinte de ese mismo color.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTO NO ES
 *
 * No es un conjunto de pictogramas validado. ARASAAC lo es, es el de uso
 * extendido en CAA hispanohablante y sigue siendo el destino previsto; estos
 * dibujos son un paso intermedio, mejor que el emoji y sin dependencia de red,
 * pero no sustituyen a un repertorio contrastado con la practica clinica.
 */

const svg = (contenido) =>
  '<svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" ' +
  'stroke="var(--tono)" stroke-width="3" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' + contenido + "</svg>";

/* Relleno claro comun: separa la figura del disco tintado del fondo. */
const P = "#fff";

export const DIBUJOS = {
  /* Vaso con pajilla y agua dentro. La gota anterior podia leerse como lluvia. */
  agua: svg(`
    <path d="M41 9 34 27" stroke-width="3.5"/>
    <path d="M20 16h24l-2.6 33a5 5 0 0 1-5 4.7H27.6a5 5 0 0 1-5-4.7z" fill="${P}"/>
    <path d="M22.6 32h18.8l-1.4 17a5 5 0 0 1-5 4.7h-6a5 5 0 0 1-5-4.7z"
          fill="var(--tono)" stroke="none" opacity=".45"/>
    <path d="M22.6 32h18.8"/>`),

  /* Plato con cubiertos: objeto de la accion, no la accion abstracta. */
  comer: svg(`
    <ellipse cx="32" cy="35" rx="14" ry="10.5" fill="${P}"/>
    <ellipse cx="32" cy="35" rx="7" ry="5" fill="var(--tono)" stroke="none" opacity=".4"/>
    <path d="M11 13v10M15 13v10M13 23v28"/>
    <path d="M53 13c2.6 0 4 3 4 6s-1.4 6-4 6-4-3-4-6 1.4-6 4-6z" fill="${P}"/>
    <path d="M53 25v26"/>`),

  /* Inodoro de perfil: tanque, taza y base. */
  bano: svg(`
    <rect x="15" y="10" width="12" height="16" rx="2.5" fill="${P}"/>
    <path d="M15 27h31a3 3 0 0 1 3 3.4l-1.2 7A9 9 0 0 1 38 45h-8l-2 9h-8l2-9a9 9 0 0 1-6-8.6z"
          fill="${P}"/>
    <path d="M18 54h16"/>`),

  /* Mano abierta en alto: el gesto de pedir, no un apreton. */
  ayuda: svg(`
    <path d="M24 34V15a3.5 3.5 0 0 1 7 0v15" fill="${P}"/>
    <path d="M31 30V12a3.5 3.5 0 0 1 7 0v18" fill="${P}"/>
    <path d="M38 30V17a3.5 3.5 0 0 1 7 0v17" fill="${P}"/>
    <path d="M45 34v-8a3.5 3.5 0 0 1 7 0v18c0 8-6 13-13 13h-6c-6 0-9-3-11-8l-5-11a3.6 3.6 0 0 1 6-3.6l3.6 5.2"
          fill="${P}"/>`),

  /* Pelota y bloque: dos objetos de juego, mejor que un solo peluche. */
  jugar: svg(`
    <circle cx="24" cy="34" r="15" fill="${P}"/>
    <path d="M24 19c5 4 5 26 0 30M9.6 30h28.8M11 41h26"/>
    <rect x="40" y="34" width="16" height="16" rx="2.5" fill="${P}"/>
    <path d="M48 34v16M40 42h16"/>`),

  /* Circulo cruzado: la senal de prohibicion es directa y universal. */
  no: svg(`
    <circle cx="32" cy="32" r="19" fill="${P}" stroke-width="4"/>
    <path d="M18.6 45.4 45.4 18.6" stroke-width="4"/>`),

  /* Cama con almohada y las zetas del sueno. */
  dormir: svg(`
    <path d="M8 44V28M8 34h40a8 8 0 0 1 8 8v2M8 44h48M12 50v-6M52 50v-6" />
    <rect x="12" y="26" width="14" height="9" rx="2.5" fill="${P}"/>
    <path d="M36 20h9l-9 9h9" stroke-width="2.6"/>
    <path d="M49 9h7l-7 7h7" stroke-width="2.4"/>`),

  /* Audifonos: objeto concreto. La corchea es notacion, un simbolo de segundo
     orden que hay que haber aprendido antes. */
  musica: svg(`
    <path d="M14 39V33a18 18 0 0 1 36 0v6"/>
    <rect x="8" y="37" width="11" height="17" rx="5" fill="${P}"/>
    <rect x="45" y="37" width="11" height="17" rx="5" fill="${P}"/>`),

  /* Sol, arbol y suelo: el exterior visto de una vez. */
  afuera: svg(`
    <circle cx="18" cy="18" r="7" fill="${P}"/>
    <path d="M18 6v-3M18 33v3M6 18H3M33 18h3M9.5 9.5 7.4 7.4M26.5 26.5l2.1 2.1M26.5 9.5l2.1-2.1M9.5 26.5l-2.1 2.1"
          stroke-width="2.6"/>
    <path d="M44 46V32"/>
    <path d="M44 34c-8 0-13-5-13-11s6-10 13-10 13 4 13 10-5 11-13 11z" fill="${P}"/>
    <path d="M6 52h52"/>`),

  /* Dos figuras que se rodean con los brazos. */
  abrazo: svg(`
    <circle cx="22" cy="17" r="7" fill="${P}"/>
    <circle cx="42" cy="17" r="7" fill="${P}"/>
    <path d="M22 26c-7 0-11 5-11 11v13h11" fill="${P}"/>
    <path d="M42 26c7 0 11 5 11 11v13H42" fill="${P}"/>
    <path d="M11 34c8 0 12 4 21 4s13-4 21-4" stroke-width="3.4"/>`),

  /* Mas: una pila que crece junto al signo. El signo solo es abstracto. */
  mas: svg(`
    <path d="M18 22v20M8 32h20" stroke-width="4.2"/>
    <rect x="38" y="42" width="18" height="10" rx="2.5" fill="${P}"/>
    <rect x="38" y="30" width="18" height="10" rx="2.5" fill="${P}"/>
    <rect x="38" y="18" width="18" height="10" rx="2.5" fill="${P}"/>`),

  /* Plato vacio y visto bueno: terminado. */
  termine: svg(`
    <ellipse cx="27" cy="34" rx="17" ry="12.5" fill="${P}"/>
    <ellipse cx="27" cy="34" rx="9" ry="6.5" opacity=".55"/>
    <circle cx="48" cy="46" r="12" fill="${P}" stroke-width="3.2"/>
    <path d="M42.5 46.5 46.6 51l7.4-9" stroke-width="3.4"/>`),
};

/** Devuelve el dibujo de una clave, o null si no hay uno definido. */
export const dibujo = (clave) => DIBUJOS[clave] ?? null;
