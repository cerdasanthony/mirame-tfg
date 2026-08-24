/**
 * Pictogramas del tablero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ARASAAC Y NO DIBUJOS PROPIOS
 *
 * Antes hubo dos intentos y los dos se quedaron cortos. Los emoji no
 * representaban la palabra sino algo asociado a ella: una gota no es agua, una
 * corchea no es musica sino notacion musical, que es un simbolo de segundo orden.
 * Los dibujos propios en SVG mejoraban eso pero seguian siendo demasiado
 * esquematicos: la pelota con el bloque de «jugar» se leia como un globo
 * terraqueo junto a una cuadricula.
 *
 * ARASAAC es el repertorio del Gobierno de Aragon, dibujado por ilustradores y
 * de uso extendido en comunicacion aumentativa en espanol. Sus pictogramas son
 * concretos y a color: para «comer» hay una cara llevandose una cuchara a la
 * boca, para «jugar» dos ninos pasandose una pelota. Eso es lo que un nino que
 * esta aprendiendo el tablero puede reconocer sin que nadie se lo explique.
 *
 * Para el trabajo escrito importa ademas por otra razon: usar un repertorio
 * contrastado con la practica es defendible ante el comite, y unos dibujos
 * hechos para la ocasion no lo son.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS ELECCIONES QUE NO FUERON LA PRIMERA DE LA BUSQUEDA
 *
 * «musica»: el primer resultado era un violonchelista de frac, que representa la
 * musica como profesion o como concierto. Se cambio por una cara de nino con una
 * radio y notas, que es escuchar musica, que es lo que la tecla pide.
 *
 * «mas»: el primer resultado eran cuadrados rojos con una flecha, que es la
 * comparacion de cantidad en abstracto. Se cambio por el que significa
 * literalmente «quiero mas, dame mas», que es la funcion comunicativa de esa
 * tecla. La ilustracion es de estilo algo distinto al resto, y aun asi se
 * prefiere: en un tablero de comunicacion el significado manda sobre la
 * coherencia de estilo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LICENCIA
 *
 * Los pictogramas son propiedad del Gobierno de Aragon y se publican bajo
 * licencia Creative Commons BY-NC-SA. Su autor es Sergio Palao. La atribucion es
 * obligatoria y esta puesta en el panel del cuidador y en el README; si se
 * cambian los pictogramas hay que mantenerla.
 */

export const ATRIBUCION = {
  autor: "Sergio Palao",
  origen: "ARASAAC (https://arasaac.org)",
  propietario: "Gobierno de Aragón",
  licencia: "CC BY-NC-SA",
  texto:
    "Pictogramas: Sergio Palao. Origen: ARASAAC (arasaac.org). " +
    "Propiedad del Gobierno de Aragón. Licencia CC BY-NC-SA.",
};

/**
 * Identificador de cada pictograma en ARASAAC.
 *
 * Se conserva para poder rastrear de donde salio cada imagen, volver a
 * descargarla o sustituirla sin repetir la busqueda.
 */
export const ORIGEN = {
  agua: 2248,
  comer: 2349,
  bano: 6929,
  ayuda: 12252,
  jugar: 2439,
  no: 5526,
  dormir: 2369,
  musica: 2746,
  afuera: 2806,
  abrazo: 4550,
  mas: 32753,
  termine: 28429,
};

/** Ruta de la imagen de una clave, o null si no hay pictograma para ella. */
export const imagen = (clave) =>
  clave in ORIGEN ? `./assets/pictogramas/${clave}.png` : null;
