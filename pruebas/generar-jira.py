# -*- coding: utf-8 -*-
"""
Genera los CSV de importacion a Jira desde backlog-y-sprints.md.

Se genera en lugar de escribirse a mano por dos motivos. El backlog del
documento es la fuente de verdad de la planificacion, y duplicarlo a mano en el
tablero garantiza que los dos se separen a la primera correccion. Y el estado
«Hecho» tiene que salir de lo que el codigo implementa de veras, no de la
memoria: se toma de docs/trazabilidad.md, que cruza cada requerimiento contra el
archivo que lo implementa.

SE IMPORTA EN DOS PASOS, Y NO POR GUSTO

El importador que Jira ofrece dentro del proyecto expone un juego de campos
reducido y a menudo no incluye ni Sprint ni el vinculo con la epica. Importar
todo junto depende entonces de que ese importador exponga lo que haga falta.

Partiendolo, el primer archivo crea las epicas y Jira les asigna sus claves; el
segundo trae las historias con la clave de su epica ya escrita en la columna
Parent, que cualquier importador acepta. Deja de depender de que campos ofrezca.

    python generar-jira.py backlog-y-sprints.md epicas    1-epicas.csv
    python generar-jira.py backlog-y-sprints.md historias 2-historias.csv MIRAME 1
"""

import csv, io, re, sys
from datetime import date

ANIO_INICIO = 2026   # ago-dic
ANIO_FIN = 2027      # ene

MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
         "jul": 7, "ago": 8, "set": 9, "sep": 9, "oct": 10, "nov": 11, "dic": 12}

# ── Estado real, tomado de docs/trazabilidad.md ─────────────────────────────
# Hecho: verificado en el codigo. En curso: implementado en parte, con la
# diferencia anotada. Lo que no aparece queda en Por hacer.
HECHO_RF = {
    "RF-01", "RF-02", "RF-03", "RF-04", "RF-06", "RF-07", "RF-08", "RF-09",
    "RF-10", "RF-11", "RF-12", "RF-13", "RF-14", "RF-15", "RF-16", "RF-18",
    "RF-19", "RF-20", "RF-21", "RF-25", "RF-26", "RF-27", "RF-30", "RF-31",
}
EN_CURSO_RF = {
    "RF-05": "Se registra latencia, pero mide el intervalo entre selecciones. La latencia de procesamiento que pide el OE 5 no esta cronometrada.",
    "RF-17": "El panel presenta el compuesto en sigmas, no en la escala -1 a +1 que especifica el requerimiento.",
    "RF-23": "Se configuran umbrales y frontalidad; falta la ventana temporal y la frecuencia de analisis.",
    "RF-24": "Exporta JSON; falta CSV.",
}

HECHO_TEXTO = [
    "montar el tablero de jira",
    "tabla comparativa de trabajos",
    "brecha identificada",
    "crear el proyecto web y el repositorio",
    "integrar @mediapipe/tasks-vision",
    "revisar y ajustar el documento de especificaci",
    "esquema de almacenamiento en indexeddb",
    "conjunto de pictogramas inicial desde arasaac",
    "criterios de éxito del poc",
    "preparar el entorno web y verificar el despliegue",
    "medir la frecuencia de análisis y la tasa de detecci",
    "implementar las reglas de clasificaci",
]
EN_CURSO_TEXTO = {
    "diagrama de componentes": "El README tiene el diagrama de arquitectura y flujo; falta formalizarlo como diagrama de componentes.",
    "diagrama de flujo de datos": "Cubierto en parte por el diagrama del README.",
    "grabar sesiones de calibraci": "Hay sesiones registradas y analizadas, pero los umbrales siguen sin calibrar contra ellas.",
}

PRIORIDAD_POR_MODULO = {
    "comunicador": "High", "modulo-a": "High", "modulo-b": "High",
    "modulo-c": "Medium", "gestion": "Medium", "documentacion": "High",
    "evaluacion": "High", "administracion": "Medium",
}


def epica_de(titulo):
    t = titulo.lower()
    if "estado del arte" in t or "gesti" in t:
        return ("Gestion y estado del arte", "gestion")
    if "requerimientos" in t or "arquitectura" in t:
        return ("Requerimientos y arquitectura", "documentacion")
    if "comunicador" in t:
        return ("Modulo base: comunicador", "comunicador")
    if "dulo a" in t:
        return ("Modulo A: captura y caracteristicas", "modulo-a")
    if "dulo b" in t:
        return ("Modulo B: clasificacion", "modulo-b")
    if "dulo c" in t:
        return ("Modulo C: heuristica", "modulo-c")
    if "integraci" in t or "pruebas" in t:
        return ("Integracion y pruebas", "administracion")
    if "sesiones" in t:
        return ("Evaluacion con el participante", "evaluacion")
    return ("Analisis y cierre", "evaluacion")


def fecha_fin(rango):
    """Ultimo dia del sprint, en el formato dd/MMM/yy que espera el importador."""
    m = re.search(r"(\d+)\s*(?:[a-z]{3})?\s*[–-]\s*(\d+)\s*([a-z]{3})", rango)
    if not m:
        return ""
    dia = int(m.group(2))
    mes = MESES.get(m.group(3))
    if not mes:
        return ""
    anio = ANIO_FIN if mes <= 6 else ANIO_INICIO
    return date(anio, mes, dia).strftime("%d/%b/%y").lower()


def estado_de(texto):
    t = texto.lower()
    rf = re.match(r"(RF-\d+|RNF-\d+)", texto)
    clave = rf.group(1) if rf else None
    if clave in HECHO_RF:
        return "Done", ""
    if clave in EN_CURSO_RF:
        return "In Progress", EN_CURSO_RF[clave]
    for frag, nota in EN_CURSO_TEXTO.items():
        if frag in t:
            return "In Progress", nota
    for frag in HECHO_TEXTO:
        if frag in t:
            return "Done", ""
    return "To Do", ""


def leer(origen):
    """Devuelve (epicas, historias) a partir del backlog."""
    s = io.open(origen, encoding="utf-8").read()
    patron = "## (Sprint \\d+) · ([^\\n·]+) · ([^\\n]+)\\n+```\\n(.*?)```"
    bloques = re.findall(patron, s, re.S)
    if not bloques:
        raise SystemExit("No se encontro ningun sprint en " + origen)

    epicas = {}
    historias = []
    for nombre, fechas, titulo, cuerpo in bloques:
        epica, etiqueta = epica_de(titulo)
        epicas.setdefault(epica, etiqueta)
        vence = fecha_fin(fechas)
        num = int(re.search(r"\d+", nombre).group())
        for linea in [l.strip() for l in cuerpo.strip().split("\n") if l.strip()]:
            estado, nota = estado_de(linea)
            rf = re.match(r"(RF-\d+|RNF-\d+)\s+", linea)
            desc = []
            if rf:
                desc.append("Requerimiento " + rf.group(1) + ".")
            desc.append(nombre + " · " + titulo.strip() + " (" + fechas.strip() + ").")
            if nota:
                desc.append("Pendiente: " + nota)
            historias.append({
                "resumen": linea[:250],
                "estado": estado,
                "prioridad": PRIORIDAD_POR_MODULO.get(etiqueta, "Medium"),
                "sprint": nombre,
                "sprintNum": num,
                "epica": epica,
                "etiqueta": etiqueta,
                "vence": vence,
                "desc": " ".join(desc),
            })
    return epicas, historias


def escribir_epicas(epicas, destino):
    with io.open(destino, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Summary", "Issue Type", "Priority", "Labels", "Description"])
        for epica, etiqueta in epicas.items():
            w.writerow([epica, "Epic",
                        PRIORIDAD_POR_MODULO.get(etiqueta, "Medium"), etiqueta,
                        "Agrupa el trabajo de " + epica.lower() + "."])
    return len(epicas)


def escribir_historias(historias, destino, claves):
    """
    `claves` asocia cada epica con la clave que Jira le dio al importarla.

    El sprint va TAMBIEN como etiqueta. Si el importador no expone el campo
    Sprint —lo habitual en proyectos gestionados por el equipo— esa columna se
    descarta en el mapeo y la planificacion se perderia. Como etiqueta sobrevive
    siempre, y desde el backlog se pueden seleccionar por etiqueta y arrastrarlas
    al sprint de una vez.
    """
    with io.open(destino, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        # Labels repetido: asi el importador carga varios valores en el campo.
        w.writerow(["Summary", "Issue Type", "Status", "Priority", "Parent",
                    "Sprint", "Due Date", "Labels", "Labels", "Description"])
        for h in historias:
            w.writerow([h["resumen"], "Story", h["estado"], h["prioridad"],
                        claves.get(h["epica"], ""), h["sprint"], h["vence"],
                        h["etiqueta"], "sprint-%02d" % h["sprintNum"], h["desc"]])
    return len(historias)


def main():
    if len(sys.argv) < 4:
        raise SystemExit(
            "Uso:\n"
            "  python generar-jira.py <backlog.md> epicas    <salida.csv>\n"
            "  python generar-jira.py <backlog.md> historias <salida.csv> [PREFIJO] [PRIMERA]\n"
            "\nPRIMERA es el numero de la clave de la primera epica importada.")
    origen = sys.argv[1]
    modo = sys.argv[2]
    destino = sys.argv[3]
    epicas, historias = leer(origen)

    if modo == "epicas":
        n = escribir_epicas(epicas, destino)
        print("%d epicas -> %s" % (n, destino))
        print("\nImportalas primero. Jira les asigna claves correlativas en este orden:")
        for i, e in enumerate(epicas, 1):
            print("  %d. %s" % (i, e))
        return

    prefijo = sys.argv[4] if len(sys.argv) > 4 else "MIRAME"
    primera = int(sys.argv[5]) if len(sys.argv) > 5 else 1
    claves = {}
    for i, e in enumerate(epicas):
        claves[e] = "%s-%d" % (prefijo, primera + i)
    n = escribir_historias(historias, destino, claves)
    hechas = sum(1 for h in historias if h["estado"] == "Done")
    curso = sum(1 for h in historias if h["estado"] == "In Progress")
    print("%d historias -> %s" % (n, destino))
    print("  Hecho %d · En curso %d · Por hacer %d"
          % (hechas, curso, n - hechas - curso))
    print("\nPadre asignado a cada epica:")
    for e, k in claves.items():
        print("  %-10s %s" % (k, e))


if __name__ == "__main__":
    main()
