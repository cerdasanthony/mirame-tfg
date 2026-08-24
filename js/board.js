/**
 * Comunicador por pictogramas.
 *
 * Es la capa base del sistema y funciona por sí sola: si la cámara falla o la
 * detección facial no está disponible, el tablero sigue operando como
 * comunicador táctil (RNF-09). El análisis facial es una capa añadida, nunca un
 * requisito para comunicarse.
 *
 * Los pictogramas de ejemplo usan emoji como marcador temporal. Se sustituyen
 * por el conjunto de ARASAAC en el Sprint 2.
 */

export const PAGINAS = [
  [
    { clave: "agua", etiqueta: "Agua", icono: "💧", frase: "Quiero agua" },
    { clave: "comer", etiqueta: "Comer", icono: "🍎", frase: "Quiero comer" },
    { clave: "bano", etiqueta: "Baño", icono: "🚽", frase: "Necesito ir al baño" },
    { clave: "ayuda", etiqueta: "Ayuda", icono: "🤝", frase: "Necesito ayuda" },
  ],
  [
    { clave: "jugar", etiqueta: "Jugar", icono: "🎮", frase: "Quiero jugar" },
    { clave: "dormir", etiqueta: "Dormir", icono: "😴", frase: "Quiero dormir" },
    { clave: "musica", etiqueta: "Música", icono: "🎵", frase: "Quiero música" },
    { clave: "no", etiqueta: "No", icono: "🚫", frase: "No quiero" },
  ],
];

export class Tablero {
  constructor(contenedor, alSeleccionar) {
    this.contenedor = contenedor;
    this.alSeleccionar = alSeleccionar;
    this.pagina = 0;
    this.bloqueado = false;
  }

  render() {
    this.contenedor.innerHTML = "";
    for (const p of PAGINAS[this.pagina]) {
      const b = document.createElement("button");
      b.className = "picto";
      b.type = "button";
      b.innerHTML = `<span class="picto-icono">${p.icono}</span><span class="picto-etiqueta">${p.etiqueta}</span>`;
      b.addEventListener("click", () => {
        if (this.bloqueado) return;
        this.bloqueado = true;
        setTimeout(() => (this.bloqueado = false), 800);
        this.alSeleccionar(p);
      });
      this.contenedor.appendChild(b);
    }
  }

  cambiarPagina() {
    this.pagina = (this.pagina + 1) % PAGINAS.length;
    this.render();
    return this.pagina;
  }
}
