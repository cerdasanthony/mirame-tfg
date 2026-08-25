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

    python generar-jira.py backlog-y-sprints.md plano     mirame-jira.csv Historia
    python generar-jira.py backlog-y-sprints.md todo      mirame-jira.csv
    python generar-jira.py backlog-y-sprints.md epicas    1-epicas.csv
    python generar-jira.py backlog-y-sprints.md historias 2-historias.csv MIRAME 1
"""

import csv, io, os, re, sys
from datetime import date

ANIO_INICIO = 2026   # ago-dic
ANIO_FIN = 2027      # ene

MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
         "jul": 7, "ago": 8, "set": 9, "sep": 9, "oct": 10, "nov": 11, "dic": 12}

# ── Estado real, tomado de docs/trazabilidad.md ─────────────────────────────
# Hecho: verificado en el codigo. En curso: implementado en parte, con la
# diferencia anotada. Lo que no aparece queda en Por hacer.
# El estado de cada requerimiento NO se escribe aqui: se lee de la matriz de
# trazabilidad, que es donde se decide. Tenerlo duplicado en este archivo ya
# tuvo consecuencias: RF-32 a RF-39 siguieron figurando como pendientes en el
# tablero mucho despues de estar implementados y marcados en la matriz, porque
# nadie se acordo de venir a actualizar la lista de aqui abajo.
MARCA_ESTADO = {u"✅": "Done", u"🟡": "In Progress", u"⬜": "To Do"}
ESTADOS_RF = {}


def estados_trazabilidad(ruta_md):
    """
    Estado y nota de cada requerimiento, segun la matriz de trazabilidad.

    La matriz marca cada fila con un simbolo —hecho, parcial, sin empezar— y
    anota al lado que es lo que falta. Leyendo de ahi hay una sola fuente: si la
    matriz cambia, el tablero cambia con ella en la siguiente ejecucion, sin
    that nadie tenga que acordarse de nada.

    La nota solo se arrastra cuando el requerimiento esta a medias, que es el
    unico caso en que dice algo util: en los terminados repite lo que ya se ve.
    """
    try:
        s = io.open(ruta_md, encoding="utf-8").read()
    except Exception:
        return {}
    fuera = {}
    patron = r"\|\s*(RF-\d+|RNF-\d+)\s*\|\s*(\S+)\s*\|[^|]*\|\s*([^|\n]*?)\s*\|"
    for m in re.finditer(patron, s):
        estado = MARCA_ESTADO.get(m.group(2))
        if estado:
            nota = re.sub(r"[`*]", "", m.group(3)).strip()
            fuera[m.group(1)] = (estado, nota if estado == "In Progress" else "")
    return fuera


# Las tareas de gestion y documentacion no tienen matriz de trazabilidad porque
# no se implementan en codigo: su evidencia es un archivo en disco o un tramite.
# Se comprueban a mano y por eso si van escritas aqui.
HECHO_TEXTO = [
    "montar el tablero de jira",
    "cargar el backlog priorizado",
    "tabla comparativa de trabajos",
    "brecha identificada",
    "fuente metodol",
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
    "asesora en terapia del lenguaje": "Solicitada. De ella depende la ultima cita pendiente del Capitulo II.",
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
    """
    Ultimo dia del sprint, en formato numerico dd/MM/yyyy.

    Se usa numerico y no dd/MMM/yy a proposito. `strftime` abrevia los meses en
    el idioma del sistema, que aqui es ingles, y produce «30/aug/26»; un Jira en
    espanol espera «ago» y rechaza el archivo con «Formato de fecha no valido».
    Con cifras no hay idioma de por medio, y el ano de cuatro digitos quita
    tambien la ambiguedad del siglo.
    """
    m = re.search(r"(\d+)\s*(?:[a-z]{3})?\s*[–-]\s*(\d+)\s*([a-z]{3})", rango)
    if not m:
        return ""
    dia = int(m.group(2))
    mes = MESES.get(m.group(3))
    if not mes:
        return ""
    anio = ANIO_FIN if mes <= 6 else ANIO_INICIO
    return date(anio, mes, dia).strftime("%d/%m/%Y")


def estado_de(texto):
    t = texto.lower()
    rf = re.match(r"(RF-\d+|RNF-\d+)", texto)
    clave = rf.group(1) if rf else None
    if clave and clave in ESTADOS_RF:
        return ESTADOS_RF[clave]
    for frag, nota in EN_CURSO_TEXTO.items():
        if frag in t:
            return "In Progress", nota
    for frag in HECHO_TEXTO:
        if frag in t:
            return "Done", ""
    return "To Do", ""


def texto_requerimientos(ruta_docx):
    """
    Texto completo de cada requerimiento, leido del documento de especificacion.

    POR QUE SE LEE DEL DOCUMENTO Y NO SE COPIA AQUI
    El backlog solo tiene el titulo corto de cada requerimiento, y con eso la
    descripcion de la tarjeta queda en puro metadato: el sprint y las fechas.
    Quien la abre no sabe que hay que hacer sin ir a buscar el documento aparte.

    El texto vive en el documento de requerimientos, que es su fuente. Copiarlo
    aqui garantizaria que las dos versiones se separen en cuanto se corrija una.
    Se lee del .docx directamente, que es un ZIP con XML dentro, sin necesidad de
    ninguna biblioteca externa.

    Si el documento no esta donde se espera devuelve vacio y las tarjetas salen
    como antes: es informacion que enriquece, no de la que se depende.
    """
    try:
        import zipfile
        x = zipfile.ZipFile(ruta_docx).read("word/document.xml").decode("utf-8")
    except Exception:
        return {}

    x = x.replace("</w:tc>", "\x00").replace("</w:tr>", "\n")
    x = re.sub(r"<[^>]+>", "", x)
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"')):
        x = x.replace(a, b)

    PRIORIDADES = {"alta", "media", "baja"}
    fuera = {}
    for fila in x.split("\n"):
        celdas = [c.strip() for c in fila.split("\x00") if c.strip()]
        if len(celdas) < 2 or not re.match(r"^(RF|RNF)-\d+$", celdas[0]):
            continue
        # Las filas de requerimientos no funcionales llevan una columna de
        # categoria antes del texto, asi que no sirve tomar siempre la segunda:
        # se toma la celda mas larga que no sea la prioridad.
        candidatas = [c for c in celdas[1:] if c.lower() not in PRIORIDADES]
        if candidatas:
            fuera[celdas[0]] = max(candidatas, key=len)
    return fuera


def implementaciones(ruta_md):
    """Archivo que implementa cada requerimiento, segun la matriz de trazabilidad."""
    try:
        s = io.open(ruta_md, encoding="utf-8").read()
    except Exception:
        return {}
    fuera = {}
    for m in re.finditer(r"\|\s*(RF-\d+)\s*\|[^|]*\|\s*([^|]*?)\s*\|", s):
        d = m.group(2).replace("`", "").strip()
        if d and d != "—":
            fuera[m.group(1)] = d
    return fuera


def etapas_dsr(s):
    """
    Etapa de Design Science Research de cada sprint, del calendario del backlog.

    Las tareas sin numero de requerimiento —redactar un capitulo, conseguir el
    soporte, pedir un permiso— no tienen un texto de especificacion del que
    tirar, y su descripcion se quedaba en el sprint y las fechas. La etapa las
    situa en el metodo: saber que «conseguir la fuente metodologica» cae en
    identificacion del problema y no en evaluacion cambia como se prioriza.

    Es ademas lo que la rubrica llama coherencia entre objetivos, planificacion y
    avances, visible desde la propia tarjeta.
    """
    fuera = {}
    for m in re.finditer(r"\|\s*(\d+)\s*\|[^|]*\|\s*([^|]+?)\s*\|", s):
        etapa = m.group(2).strip()
        if etapa and not re.match(r"^\d", etapa) and "Fechas" not in etapa:
            fuera["Sprint " + m.group(1)] = etapa
    return fuera


def leer(origen):
    """Devuelve (epicas, historias) a partir del backlog."""
    base = os.path.dirname(os.path.abspath(origen))
    aqui = os.path.dirname(os.path.abspath(__file__))
    textos = texto_requerimientos(os.path.join(base, "documento-requerimientos.docx"))
    donde = implementaciones(os.path.join(aqui, "..", "docs", "trazabilidad.md"))
    ESTADOS_RF.clear()
    ESTADOS_RF.update(
        estados_trazabilidad(os.path.join(aqui, "..", "docs", "trazabilidad.md")))

    s = io.open(origen, encoding="utf-8").read()
    etapas = etapas_dsr(s)
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
            clave = rf.group(1) if rf else None

            # La descripcion se arma para que la tarjeta se entienda sola: que
            # pide el requerimiento, en que sprint va, donde vive si ya existe y
            # que le falta si esta a medias.
            desc = []
            if clave and clave in textos:
                desc.append(clave + ": " + textos[clave])
            elif clave:
                desc.append("Requerimiento " + clave + ".")
            contexto = nombre + " · " + titulo.strip() + " (" + fechas.strip() + ")."
            if nombre in etapas:
                contexto += " Etapa DSR: " + etapas[nombre] + "."
            desc.append(contexto)
            if clave and clave in donde and estado != "To Do":
                desc.append("Implementado en " + donde[clave] + ".")
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


def escribir_todo(epicas, historias, destino):
    """
    Un solo archivo, con los encabezados en espanol.

    POR QUE EN ESPANOL
    El importador asigna las columnas por el nombre del campo en el idioma de la
    interfaz. Con encabezados en ingles solo se asignaban solas «Issue Type» y
    «Priority», y quedaban a mano Resumen, Etiquetas y Descripcion. Resumen es
    obligatorio: sin asignarlo la importacion falla entera. Con los encabezados
    en espanol se asignan todas y no hay nada que elegir.

    POR QUE NO VA LA COLUMNA DEL PADRE
    Vincular una historia con su epica exige la clave que Jira le asigna al
    importarla, que no existe todavia cuando el archivo es uno solo. Pasar el
    nombre en vez de la clave puede hacer fallar la importacion entera, y la
    jerarquia de epicas no es algo que la rubrica pida.

    Las epicas se crean igual, y el vinculo se puede establecer despues desde el
    backlog: la etiqueta de modulo agrupa exactamente las historias de cada una.
    Lo que si importa —sprint, prioridad, estado y etiquetas— viaja completo.
    """
    with io.open(destino, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        # «Issue Type» y «Priority» se asignan solas aunque esten en ingles.
        w.writerow(["Resumen", "Issue Type", "Estado", "Priority", "Sprint",
                    "Fecha de vencimiento", "Etiquetas", "Etiquetas", "Descripcion"])
        for epica, etiqueta in epicas.items():
            w.writerow([epica, "Epic", "To Do",
                        PRIORIDAD_POR_MODULO.get(etiqueta, "Medium"), "", "",
                        etiqueta, "epica",
                        "Agrupa el trabajo de " + epica.lower() + "."])
        for h in historias:
            w.writerow([h["resumen"], "Story", h["estado"], h["prioridad"],
                        h["sprint"], h["vence"], h["etiqueta"],
                        "sprint-%02d" % h["sprintNum"], h["desc"]])
    return len(epicas) + len(historias)


def escribir_plano(epicas, historias, destino, tipo="Historia"):
    """
    Todo con UN SOLO tipo de actividad, y ese tipo escrito en espanol.

    POR QUE EXISTE ESTE MODO
    La importacion fallo dos veces con «Error in issue type "task" — not found in
    target jira project». El CSV no contenia esa palabra: solo Epic y Story. El
    valor lo ponia Jira al no registrarse la equivalencia de «Story», cayendo a
    su tipo por defecto, que en ese proyecto no existe.

    Con un unico valor, y ademas escrito igual que el tipo del proyecto, la
    pantalla de equivalencias tiene una sola fila y se resuelve sola. Deja de
    haber nada que se pueda quedar sin asignar.

    Las epicas se convierten en historias con la etiqueta `epica`. Se pierde la
    jerarquia, que la rubrica no pide; se conserva el tablero, los sprints, las
    prioridades, los estados y las etiquetas, que es lo que si pide.
    """
    with io.open(destino, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Resumen", "Issue Type", "Estado", "Priority", "Sprint",
                    "Fecha de vencimiento", "Etiquetas", "Etiquetas", "Descripcion"])
        for epica, etiqueta in epicas.items():
            w.writerow([epica, tipo, "To Do",
                        PRIORIDAD_POR_MODULO.get(etiqueta, "Medium"), "", "",
                        etiqueta, "epica",
                        "Agrupa el trabajo de " + epica.lower() + "."])
        for h in historias:
            w.writerow([h["resumen"], tipo, h["estado"], h["prioridad"],
                        h["sprint"], h["vence"], h["etiqueta"],
                        "sprint-%02d" % h["sprintNum"], h["desc"]])
    return len(epicas) + len(historias)


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

    if modo == "plano":
        tipo = sys.argv[4] if len(sys.argv) > 4 else "Historia"
        n = escribir_plano(epicas, historias, destino, tipo)
        print("%d filas -> %s  (todas de tipo «%s»)" % (n, destino, tipo))
        return

    if modo == "todo":
        n = escribir_todo(epicas, historias, destino)
        hechas = sum(1 for h in historias if h["estado"] == "Done")
        curso = sum(1 for h in historias if h["estado"] == "In Progress")
        print("%d filas -> %s" % (n, destino))
        print("  %d epicas y %d historias" % (len(epicas), len(historias)))
        print("  Hecho %d · En curso %d · Por hacer %d"
              % (hechas, curso, len(historias) - hechas - curso))
        return

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
