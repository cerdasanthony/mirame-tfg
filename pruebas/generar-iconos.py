# -*- coding: utf-8 -*-
"""
Genera el juego de iconos de la PWA a partir de la imagen de origen.

    python pruebas/generar-iconos.py <origen.jpg|png>

Existe como script y no como un recorte manual porque el origen es un JPEG con
la forma de squircle YA INCRUSTADA sobre fondo negro, y convertirlo a un icono
utilizable tiene tres pasos que conviene poder repetir y auditar:

  1. Quitar el negro de las esquinas SIN tocar la camiseta del nino, que tambien
     es negra. Un filtro por color se llevaria las dos; lo que las distingue es
     que el negro de las esquinas esta conectado al borde de la imagen y el de
     la camiseta no. Por eso se usa relleno por inundacion desde las esquinas.

  2. Erosionar unos pixeles el recorte. La inundacion se detiene en el fleco de
     antialias que el JPEG dejo entre el negro y el azul, de modo que sin
     erosion ese fleco oscuro queda pegado al contorno del icono.

  3. Construir aparte la version `maskable`. El sistema operativo recorta ese
     icono con la forma que quiera, asi que no puede tener transparencia y todo
     lo relevante debe caber en el circulo interior del 80 % de la superficie.
"""

import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SALIDA = "assets"
TAMANOS = (192, 512)
MASK = 512
SEGURO = 0.82        # lado del contenido dentro del lienzo maskable
EROSION = 5          # pixeles de contorno que se descartan (fleco de antialias)
UMBRAL_FLOOD = 45    # tolerancia de la inundacion sobre el negro
ADENTRO = 18         # desplazamiento al muestrear el borde del squircle
MIN_LUZ = 300        # suma RGB minima para aceptar una muestra como azul
CORTE_INFERIOR = 0.78  # bajo esta fraccion el borde ya roza la camiseta
CIMA_CABEZA = 40       # y de la cima de la cabeza en el origen, en pixeles


def recortar_squircle(im):
    """Devuelve la imagen RGBA con las esquinas negras convertidas en alfa 0."""
    w, h = im.size
    sent = (255, 0, 255)
    tr = im.copy()
    for esquina in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(tr, esquina, sent, thresh=UMBRAL_FLOOD)
    dentro = ~np.all(np.array(tr) == np.array(sent), axis=-1)

    alfa = Image.fromarray((dentro * 255).astype(np.uint8), "L")
    # MinFilter erosiona: cada pixel toma el minimo de su entorno, de modo que
    # el contorno retrocede y el fleco oscuro del antialias queda fuera.
    alfa = alfa.filter(ImageFilter.MinFilter(EROSION))

    sq = im.copy()
    sq.putalpha(alfa)
    return sq, np.array(alfa) > 127


def fondo_degradado(im, dentro):
    """Reconstruye el degradado vertical del squircle para usarlo a sangre."""
    w, h = im.size
    arr = np.array(im, dtype=np.float32)
    filas = np.full((h, 3), np.nan, np.float32)
    for y in range(h):
        xs = np.flatnonzero(dentro[y])
        if len(xs) > 2 * ADENTRO:
            c = arr[y, xs[0] + ADENTRO]
            if c.sum() >= MIN_LUZ:      # descarta el fleco oscuro del borde
                filas[y] = c
    filas[int(h * CORTE_INFERIOR):] = np.nan   # abajo el borde ya es camiseta

    # se propaga hacia adelante y hacia atras para cubrir las filas sin muestra
    for rango in (range(h), range(h - 1, -1, -1)):
        val = None
        for y in rango:
            if not np.isnan(filas[y, 0]):
                val = filas[y].copy()
            elif val is not None:
                filas[y] = val
    if np.isnan(filas).any():
        raise SystemExit("No se pudo determinar el color de fondo de todas las filas.")
    return Image.fromarray(
        np.clip(np.repeat(filas[:, None, :], w, axis=1), 0, 255).astype(np.uint8), "RGB"
    )


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Uso: python pruebas/generar-iconos.py <origen>")
    origen = sys.argv[1]
    im = Image.open(origen).convert("RGB")
    w, h = im.size
    os.makedirs(SALIDA, exist_ok=True)

    sq, dentro = recortar_squircle(im)

    # ── iconos de proposito "any": squircle con esquinas transparentes ──
    lado = max(sq.size)
    lienzo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    lienzo.paste(sq, ((lado - sq.width) // 2, (lado - sq.height) // 2))
    for n in TAMANOS:
        ruta = os.path.join(SALIDA, "icon-%d.png" % n)
        lienzo.resize((n, n), Image.LANCZOS).save(ruta, optimize=True)
        print("  %-28s %7d bytes" % (ruta, os.path.getsize(ruta)))

    # ── icono maskable: sin transparencia y dentro del circulo seguro ──
    fondo = fondo_degradado(im, dentro).resize((MASK, MASK), Image.LANCZOS)
    interior = int(MASK * SEGURO)
    cont = lienzo.resize((interior, interior), Image.LANCZOS)
    fondo.paste(cont, ((MASK - interior) // 2,) * 2, cont)
    ruta = os.path.join(SALIDA, "icon-maskable-512.png")
    fondo.save(ruta, optimize=True)
    print("  %-28s %7d bytes" % (ruta, os.path.getsize(ruta)))

    # comprobacion explicita del circulo seguro
    cima = (MASK - interior) / 2 + (CIMA_CABEZA / h) * interior
    d = MASK / 2 - cima
    radio = MASK * 0.40
    print("\n  cima de la cabeza a %.0f px del centro; radio seguro %.0f px -> %s"
          % (d, radio, "DENTRO" if d < radio else "FUERA"))

    b = np.array(fondo)
    esquinas = [b[0, 0], b[0, -1], b[-1, 0], b[-1, -1]]
    if any(int(c.sum()) < MIN_LUZ for c in esquinas):
        print("  AVISO: alguna esquina del maskable no es azul; revisar el origen.")
    else:
        print("  las cuatro esquinas del maskable son azules: no habra bordes negros.")


if __name__ == "__main__":
    main()
