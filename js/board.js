/**
 * Comunicador por pictogramas.
 *
 * Es la capa base del sistema y funciona por sí sola: si la cámara falla o la
 * detección facial no está disponible, el tablero sigue operando como
 * comunicador táctil (RNF-09). El análisis facial es una capa añadida, nunca un
 * requisito para comunicarse.
 *
 * Las categorías siguen la práctica habitual de los tableros de CAA: agrupar
 * por función comunicativa y sostener el color como pista visual estable, para
 * que la posición y el tono se aprendan juntos.
 *
 * Los emoji son marcadores temporales; se sustituyen por ARASAAC en el Sprint 2.
 */

export const CATEGORIAS = {
  necesidad: { etiqueta: "Necesidad", tono: "#1D7A8C", cara: "#E4F4F7", canto: "#10505D", disco: "#C6E9EF" },
  accion: { etiqueta: "Acción", tono: "#3F8F3A", cara: "#EBF7E8", canto: "#2A6127", disco: "#D2EDCC" },
  social: { etiqueta: "Social", tono: "#C2701A", cara: "#FDF1E2", canto: "#8A4E0F", disco: "#F8DEBE" },
  respuesta: { etiqueta: "Respuesta", tono: "#B03A55", cara: "#FCEBEF", canto: "#7C2439", disco: "#F7D2DA" },
};

/**
 * Vocabulario del tablero.
 *
 * Se conserva agrupado por bloques porque el orden importa —lo mas pedido
 * arriba— pero ya no son paginas: el tablero se recorre con el dedo hacia
 * abajo. Pasar de pagina obligaba a recordar en cual estaba cada pictograma, y
 * eso es carga cognitiva que no aporta nada a quien se esta comunicando.
 */
const BLOQUES = [
  [
    { clave: "agua", etiqueta: "Agua", icono: "💧", frase: "Quiero agua", categoria: "necesidad" },
    { clave: "comer", etiqueta: "Comer", icono: "🍎", frase: "Quiero comer", categoria: "necesidad" },
    { clave: "bano", etiqueta: "Baño", icono: "🚽", frase: "Necesito ir al baño", categoria: "necesidad" },
    { clave: "ayuda", etiqueta: "Ayuda", icono: "🤝", frase: "Necesito ayuda", categoria: "social" },
    { clave: "jugar", etiqueta: "Jugar", icono: "🧸", frase: "Quiero jugar", categoria: "accion" },
    { clave: "no", etiqueta: "No", icono: "🚫", frase: "No quiero", categoria: "respuesta" },
  ],
  [
    { clave: "dormir", etiqueta: "Dormir", icono: "😴", frase: "Quiero dormir", categoria: "necesidad" },
    { clave: "musica", etiqueta: "Música", icono: "🎵", frase: "Quiero música", categoria: "accion" },
    { clave: "afuera", etiqueta: "Afuera", icono: "🌳", frase: "Quiero ir afuera", categoria: "accion" },
    { clave: "abrazo", etiqueta: "Abrazo", icono: "🫂", frase: "Quiero un abrazo", categoria: "social" },
    { clave: "mas", etiqueta: "Más", icono: "➕", frase: "Quiero más", categoria: "respuesta" },
    { clave: "termine", etiqueta: "Terminé", icono: "✅", frase: "Ya terminé", categoria: "respuesta" },
  ],
];

/** Lista plana, en el orden en que se muestran. */
export const PICTOGRAMAS = BLOQUES.flat();

export class Tablero {
  constructor(contenedor, alSeleccionar) {
    this.contenedor = contenedor;
    this.alSeleccionar = alSeleccionar;
    this.bloqueado = false;
    this.promovido = null;
  }

  /**
   * Dibuja el tablero completo.
   *
   * `promovido` es la clave del pictograma que el Modulo C situa al frente. Con
   * el tablero paginado el reordenamiento tenia que limitarse a la pagina
   * visible, porque traer un pictograma de otra pagina obligaba a sacar uno de
   * la vista. Al recorrerse con scroll ya no se saca nada: el sugerido sube al
   * principio y los demas siguen ahi, un poco mas abajo.
   */
  render(promovido = null) {
    this.contenedor.innerHTML = "";
    this.promovido = promovido;

    let items = [...PICTOGRAMAS];
    const i = promovido ? items.findIndex((p) => p.clave === promovido) : -1;
    if (i > 0) {
      items.unshift(items.splice(i, 1)[0]);
      // Si el sugerido estaba fuera de la vista, subirlo al principio no sirve
      // de nada si el tablero quedo desplazado. Se vuelve arriba.
      this.contenedor.scrollTop = 0;
    }

    for (const p of items) {
      const cat = CATEGORIAS[p.categoria];
      const b = document.createElement("button");
      b.className = "picto";
      b.type = "button";
      b.style.setProperty("--tono", cat.tono);
      b.style.setProperty("--cara", cat.cara);
      b.style.setProperty("--canto-color", cat.canto);
      b.style.setProperty("--disco", cat.disco);
      b.setAttribute("aria-label", p.frase);

      // La sugerencia se marca de forma visible: quien acompaña debe poder
      // distinguir una selección espontánea de una hecha sobre un pictograma
      // que el sistema acababa de destacar.
      const sugerido = p.clave === promovido;
      if (sugerido) {
        b.classList.add("picto-sugerido");
        b.setAttribute("aria-label", p.frase + " (sugerido por el sistema)");
      }
      b.innerHTML =
        (sugerido ? '<span class="picto-marca" aria-hidden="true"></span>' : "") +
        `<span class="picto-icono" aria-hidden="true">${p.icono}</span>` +
        `<span class="picto-etiqueta">${p.etiqueta}</span>`;
      b.addEventListener("click", () => {
        if (this.bloqueado) return;
        this.bloqueado = true;
        setTimeout(() => (this.bloqueado = false), 900);
        this.alSeleccionar(p, cat, p.clave === this.promovido);
      });
      this.contenedor.appendChild(b);
    }
  }
}
