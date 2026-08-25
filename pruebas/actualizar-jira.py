# -*- coding: utf-8 -*-
"""
Pone al dia el estado de las incidencias que ya existen en Jira.

QUE HACE Y QUE NO

`crear-en-jira.py` crea lo que falta y omite lo que ya esta. Eso resuelve la
carga inicial, pero no la segunda semana: cuando una tarjeta ya existe, el
script la deja intacta aunque el trabajo haya avanzado. El tablero se queda
congelado en el estado que tenia el dia de la importacion.

Este script hace lo contrario: no crea nada, solo mueve. Compara el estado que
tiene cada incidencia en Jira contra el que le corresponde segun el backlog y la
matriz de trazabilidad, y transiciona unicamente las que no coinciden.

DE DONDE SALE EL ESTADO

De `docs/trazabilidad.md` para los requerimientos, que cruza cada uno contra el
archivo que lo implementa y marca hecho, a medias o sin empezar. De la lista de
`generar-jira.py` para las tareas de gestion y documentacion, que no tienen
codigo asociado y se comprueban a mano.

En ningun caso sale de la memoria de nadie. Esa es la razon de que exista.

NO RETROCEDE POR SU CUENTA

Si una incidencia esta en Jira mas avanzada de lo que dice el backlog, se
informa pero no se toca, salvo que se pida con `--retroceder`. Alguien pudo
moverla a mano con motivo, y un script que deshace trabajo ajeno en silencio es
peor que un tablero desactualizado.

USO

    python actualizar-jira.py ../../backlog-y-sprints.md --plan     sin conectarse
    python actualizar-jira.py ../../backlog-y-sprints.md --ensayo   conecta, no cambia
    python actualizar-jira.py ../../backlog-y-sprints.md            aplica

Credenciales por entorno, como en el resto: JIRA_SITE, JIRA_EMAIL, JIRA_TOKEN,
JIRA_PROJECT. No se escriben en ningun archivo ni se imprimen.
"""

import collections
import importlib.util
import os
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))


def _cargar(nombre, archivo):
    sp = importlib.util.spec_from_file_location(nombre, os.path.join(AQUI, archivo))
    mod = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(mod)
    return mod


_gj = _cargar("generar_jira", "generar-jira.py")

ORDEN = {"To Do": 0, "In Progress": 1, "Done": 2}


def objetivos(origen):
    """Estado que le corresponde a cada resumen, segun backlog y trazabilidad."""
    epicas, historias = _gj.leer(origen)
    mapa = {}
    for epica in epicas:
        mapa[epica] = "To Do"          # las epicas las mueve el tablero, no esto
    for h in historias:
        mapa[h["resumen"]] = h["estado"]
    return mapa, epicas, historias


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Uso: python actualizar-jira.py <backlog.md> [--plan|--ensayo]")
    origen = sys.argv[1]
    plan = "--plan" in sys.argv
    ensayo = "--ensayo" in sys.argv
    retroceder = "--retroceder" in sys.argv

    mapa, epicas, historias = objetivos(origen)
    cuenta = collections.Counter(h["estado"] for h in historias)
    print("Backlog: %d epicas · %d historias" % (len(epicas), len(historias)))
    print("Objetivo: Done %d · In Progress %d · To Do %d\n"
          % (cuenta["Done"], cuenta["In Progress"], cuenta["To Do"]))

    if plan:
        for estado in ("Done", "In Progress"):
            print("--- %s ---" % estado)
            for h in historias:
                if h["estado"] == estado:
                    print("  s%-2d  %s" % (h["sprintNum"], h["resumen"][:72]))
            print()
        return

    _cj = _cargar("crear_en_jira", "crear-en-jira.py")
    jira = _cj.Jira()
    print("Proyecto %s en %s\n" % (jira.proyecto, jira.sitio))

    # Estado actual de cada incidencia. Se pide el campo status ademas del
    # resumen, que es lo unico que trae `resumenes_existentes`.
    actuales = {}
    token = None
    while True:
        ruta = ("/rest/api/3/search/jql?jql=project%%3D%s&fields=summary,status"
                "&maxResults=100" % jira.proyecto)
        if token:
            ruta += "&nextPageToken=" + token
        d = jira.pedir("GET", ruta)
        for i in d.get("issues", []):
            actuales[i["fields"]["summary"]] = (i["key"],
                                                i["fields"]["status"]["name"])
        token = d.get("nextPageToken")
        if not token or d.get("isLast"):
            break
    print("Incidencias en el tablero: %d\n" % len(actuales))

    cambios, adelantadas, ausentes = [], [], []
    for resumen, destino in mapa.items():
        if resumen not in actuales:
            ausentes.append(resumen)
            continue
        clave, ahora = actuales[resumen]
        if ahora == destino:
            continue
        if ORDEN.get(ahora, 0) > ORDEN.get(destino, 0) and not retroceder:
            adelantadas.append((clave, resumen, ahora, destino))
            continue
        cambios.append((clave, resumen, ahora, destino))

    cambios.sort(key=lambda c: ORDEN.get(c[3], 0), reverse=True)

    if not cambios:
        print("El tablero ya coincide con el backlog. Nada que mover.")
    else:
        print("Por mover (%d):" % len(cambios))
        for clave, resumen, ahora, destino in cambios:
            print("  %-8s %-11s -> %-11s %s" % (clave, ahora, destino, resumen[:52]))

    if ensayo:
        print("\nENSAYO · no se movio nada")
    elif cambios:
        print()
        movidas = fallidas = 0
        for clave, resumen, ahora, destino in cambios:
            try:
                if jira.transicionar(clave, destino):
                    movidas += 1
                    print("  %-8s -> %s" % (clave, destino))
                else:
                    fallidas += 1
                    print("  %-8s sin transicion disponible a «%s»" % (clave, destino))
            except SystemExit as e:
                fallidas += 1
                print("  %-8s error: %s" % (clave, str(e)[:80]))
            time.sleep(0.12)
        print("\nMovidas %d · fallidas %d" % (movidas, fallidas))

    if adelantadas:
        print("\nMas avanzadas en Jira que en el backlog (%d) · no se tocan:"
              % len(adelantadas))
        for clave, resumen, ahora, destino in adelantadas:
            print("  %-8s %-11s (backlog dice %s)  %s" % (clave, ahora, destino,
                                                          resumen[:44]))
        print("  Si el backlog es el que esta atrasado, corregilo ahi.")
        print("  Para forzar el retroceso: --retroceder")

    if ausentes:
        print("\nEn el backlog pero no en el tablero (%d):" % len(ausentes))
        for r in ausentes[:12]:
            print("  %s" % r[:70])
        if len(ausentes) > 12:
            print("  ... y %d mas" % (len(ausentes) - 12))
        print("  Crearlas con: python crear-en-jira.py %s" % origen)


if __name__ == "__main__":
    main()
