# -*- coding: utf-8 -*-
"""
Genera el CSV de importacion a Jira desde backlog-y-sprints.md.

Se genera en lugar de escribirse a mano por dos motivos. El backlog del
documento es la fuente de verdad de la planificacion, y duplicarlo a mano en el
tablero garantiza que los dos se separen a la primera correccion. Y el estado
«Hecho» tiene que salir de lo que el codigo implementa de veras, no de la
memoria: se toma de la misma matriz de trazabilidad que ya cruza los
requerimientos contra los archivos.

Uso:
    python generar_jira.py backlog-y-sprints.md salida.csv
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

# Tareas sin numero de requerimiento cuyo estado consta. La clave es un trozo
# distintivo del texto.
HECHO_TEXTO = [
    "Montar el tablero de Jira",
    "tabla comparativa de trabajos",
    "brecha identificada",
    "Crear el proyecto web y el repositorio",
    "Integrar @mediapipe/tasks-vision",
    "Revisar y ajustar el documento de especificación",
    "esquema de almacenamiento en IndexedDB",
    "conjunto de pictogramas inicial desde ARASAAC",
    "criterios de éxito del POC",
    "Preparar el entorno web y verificar el despliegue",
    "Medir la frecuencia de análisis y la tasa de detección",
    "Implementar las reglas de clasificación",
]
EN_CURSO_TEXTO = {
    "diagrama de componentes": "El README tiene el diagrama de arquitectura y flujo; falta formalizarlo como diagrama de componentes.",
    "diagrama de flujo de datos": "Cubierto en parte por el diagrama del README.",
    "Grabar sesiones de calibración": "Hay sesiones registradas y analizadas, pero los umbrales siguen sin calibrar contra ellas.",
}

PRIORIDAD_POR_MODULO = {
    "comunicador": "High", "modulo-a": "High", "modulo-b": "High",
    "modulo-c": "Medium", "gestion": "Medium", "documentacion": "High",
    "evaluacion": "High", "administracion": "Medium",
}


def epica_de(titulo):
    t = titulo.lower()
    if "estado del arte" in t or "gestión" in t: return ("Gestion y estado del arte", "gestion")
    if "requerimientos" in t or "arquitectura" in t: return ("Requerimientos y arquitectura", "documentacion")
    if "comunicador" in t: return ("Modulo base: comunicador", "comunicador")
    if "módulo a" in t: return ("Modulo A: captura y caracteristicas", "modulo-a")
    if "módulo b" in t: return ("Modulo B: clasificacion", "modulo-b")
    if "módulo c" in t: return ("Modulo C: heuristica", "modulo-c")
    if "integración" in t or "pruebas" in t: return ("Integracion y pruebas", "administracion")
    if "sesiones" in t: return ("Evaluacion con el participante", "evaluacion")
    return ("Analisis y cierre", "evaluacion")


def fecha_fin(rango):
    """Ultimo dia del sprint, en el formato que espera el importador de Jira."""
    m = re.search(r'(\d+)\s*(?:ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)?\s*[–-]\s*(\d+)\s*(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)', rango)
    if not m:
        return ""
    dia, mes = int(m.group(2)), MESES[m.group(3)]
    anio = ANIO_FIN if mes <= 6 else ANIO_INICIO
    return date(anio, mes, dia).strftime("%d/%b/%y").lower()


def estado_de(texto):
    rf = re.match(r'(RF-\d+|RNF-\d+)', texto)
    clave = rf.group(1) if rf else None
    if clave in HECHO_RF:
        return "Done", ""
    if clave in EN_CURSO_RF:
        return "In Progress", EN_CURSO_RF[clave]
    for frag, nota in EN_CURSO_TEXTO.items():
        if frag.lower() in texto.lower():
            return "In Progress", nota
    for frag in HECHO_TEXTO:
        if frag.lower() in texto.lower():
            return "Done", ""
    return "To Do", ""


def main():
    origen, destino = sys.argv[1], sys.argv[2]
    s = io.open(origen, encoding="utf-8").read()
    bloques = re.findall(r'## (Sprint \d+) · ([^\n·]+) · ([^\n]+)\n+```\n(.*?)```', s, re.S)

    filas = []
    epicas = {}
    for nombre, fechas, titulo, cuerpo in bloques:
        epica, etiqueta = epica_de(titulo)
        epicas.setdefault(epica, etiqueta)
        vence = fecha_fin(fechas)
        for linea in [l.strip() for l in cuerpo.strip().split("\n") if l.strip()]:
            estado, nota = estado_de(linea)
            rf = re.match(r'(RF-\d+|RNF-\d+)\s+(.*)', linea)
            resumen = linea
            desc = []
            if rf:
                desc.append(f"Requerimiento {rf.group(1)}.")
            desc.append(f"{nombre} · {titulo.strip()} ({fechas.strip()}).")
            if nota:
                desc.append(f"Pendiente: {nota}")
            filas.append({
                "Summary": resumen[:250],
                "Issue Type": "Story",
                "Status": estado,
                "Priority": PRIORIDAD_POR_MODULO.get(etiqueta, "Medium"),
                "Sprint": nombre,
                "Epic Link": epica,
                "Labels": etiqueta,
                "Due Date": vence,
                "Description": " ".join(desc),
            })

    # Las epicas van como incidencias propias, antes que las historias.
    cabecera = ["Summary", "Issue Type", "Status", "Priority", "Sprint",
                "Epic Link", "Epic Name", "Labels", "Due Date", "Description"]
    salida = []
    for epica, etiqueta in epicas.items():
        salida.append({"Summary": epica, "Issue Type": "Epic", "Status": "To Do",
                       "Priority": PRIORIDAD_POR_MODULO.get(etiqueta, "Medium"),
                       "Sprint": "", "Epic Link": "", "Epic Name": epica,
                       "Labels": etiqueta, "Due Date": "",
                       "Description": f"Agrupa el trabajo de {epica.lower()}."})
    salida.extend(filas)

    with io.open(destino, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cabecera)
        w.writeheader()
        for r in salida:
            r.setdefault("Epic Name", "")
            w.writerow(r)

    hechas = sum(1 for r in filas if r["Status"] == "Done")
    curso = sum(1 for r in filas if r["Status"] == "In Progress")
    print(f"{len(salida)} filas: {len(epicas)} epicas y {len(filas)} historias")
    print(f"  Hecho {hechas} · En curso {curso} · Por hacer {len(filas)-hechas-curso}")


if __name__ == "__main__":
    main()
