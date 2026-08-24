# -*- coding: utf-8 -*-
"""
Crea el backlog en Jira por la API REST, sin pasar por el importador de CSV.

POR QUE EXISTE ESTE SCRIPT

El importador de CSV fallo cuatro veces seguidas con el mismo mensaje —«Error in
issue type "task" — not found in target jira project»— con tres archivos
distintos y con un solo valor de tipo. El archivo nunca fue la variable: el
importador buscaba un tipo en minuscula que el proyecto tiene en mayuscula, y no
hay nada que escribir en el CSV que cambie eso.

La API no tiene ese problema porque no se le pasa un nombre para que lo traduzca:
se le pasa el IDENTIFICADOR del tipo, que el propio script consulta antes de
crear nada. Desaparecen la pantalla de equivalencias, los nombres traducidos y la
sensibilidad a mayusculas.

De paso queda reproducible, que para el informe vale mas que un archivo subido a
mano una vez.

CREDENCIALES

Nunca van en el archivo. Se leen del entorno y no se imprimen:

    JIRA_SITE     mirame-tfg.atlassian.net
    JIRA_EMAIL    el correo de la cuenta
    JIRA_TOKEN    token de id.atlassian.com/manage-profile/security/api-tokens
    JIRA_PROJECT  KAN

USO

    python crear-en-jira.py backlog-y-sprints.md --ensayo    ver que haria
    python crear-en-jira.py backlog-y-sprints.md             crear de verdad

SOBRE LOS SPRINTS

El proyecto es de plantilla Kanban, y un tablero Kanban no tiene sprints: por eso
el importador tampoco ofrecia ese campo. La planificacion viaja como etiqueta
`sprint-01`…`sprint-12`, que permite filtrar y agrupar igual. Si mas adelante se
convierte a Scrum, las etiquetas siguen sirviendo para repartir en sprints reales.
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "generar_jira", os.path.join(os.path.dirname(os.path.abspath(__file__)), "generar-jira.py"))
_gj = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_gj)


# ── Conexion ────────────────────────────────────────────────────────────────

def entorno(nombre):
    v = os.environ.get(nombre, "").strip()
    if not v:
        raise SystemExit(
            "Falta la variable de entorno %s.\n"
            "Definir antes de ejecutar:\n"
            "  JIRA_SITE, JIRA_EMAIL, JIRA_TOKEN, JIRA_PROJECT" % nombre)
    return v


class Jira:
    def __init__(self):
        self.sitio = entorno("JIRA_SITE").replace("https://", "").rstrip("/")
        self.proyecto = entorno("JIRA_PROJECT")
        credencial = "%s:%s" % (entorno("JIRA_EMAIL"), entorno("JIRA_TOKEN"))
        self.auth = base64.b64encode(credencial.encode()).decode()

    def pedir(self, metodo, ruta, cuerpo=None):
        url = "https://%s%s" % (self.sitio, ruta)
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        req = urllib.request.Request(url, data=datos, method=metodo)
        req.add_header("Authorization", "Basic " + self.auth)
        req.add_header("Accept", "application/json")
        if datos:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                texto = r.read().decode()
                return json.loads(texto) if texto else {}
        except urllib.error.HTTPError as e:
            detalle = e.read().decode()[:400]
            # El token no se incluye en el mensaje: solo el codigo y la respuesta.
            raise SystemExit("Jira devolvio %s en %s %s\n%s"
                             % (e.code, metodo, ruta, detalle))

    def tipos(self):
        """Identificadores reales de los tipos del proyecto."""
        d = self.pedir("GET", "/rest/api/3/project/%s" % self.proyecto)
        return {t["name"]: t["id"] for t in d.get("issueTypes", [])
                if not t.get("subtask")}

    def resumenes_existentes(self):
        """
        Resumenes ya creados, para no duplicar si se vuelve a ejecutar.

        Se intenta primero el endpoint nuevo, que pagina por token, y se cae al
        antiguo, que pagina por indice. Atlassian esta retirando el segundo y no
        conviene depender de el; pero si ninguno responde, esto NO detiene la
        ejecucion: se sigue con el conjunto vacio y a lo sumo se duplican
        incidencias en una segunda pasada, que es mucho menos grave que no poder
        crear nada.
        """
        try:
            vistos = set()
            token = None
            while True:
                ruta = ("/rest/api/3/search/jql?jql=project%%3D%s&fields=summary&maxResults=100"
                        % self.proyecto)
                if token:
                    ruta += "&nextPageToken=" + token
                d = self.pedir("GET", ruta)
                for i in d.get("issues", []):
                    vistos.add(i["fields"]["summary"])
                token = d.get("nextPageToken")
                if not token or d.get("isLast"):
                    return vistos
        except SystemExit:
            pass

        try:
            vistos = set()
            inicio = 0
            while True:
                d = self.pedir(
                    "GET",
                    "/rest/api/3/search?jql=project%%3D%s&fields=summary&maxResults=100&startAt=%d"
                    % (self.proyecto, inicio))
                for i in d.get("issues", []):
                    vistos.add(i["fields"]["summary"])
                inicio += len(d.get("issues", []))
                if inicio >= d.get("total", 0) or not d.get("issues"):
                    return vistos
        except SystemExit:
            print("Aviso: no se pudo consultar lo ya existente; se creara todo.\n")
            return set()

    def crear(self, campos):
        return self.pedir("POST", "/rest/api/3/issue", {"fields": campos})

    def transicionar(self, clave, destino):
        """Mueve la incidencia al estado pedido, si existe la transicion."""
        d = self.pedir("GET", "/rest/api/3/issue/%s/transitions" % clave)
        for t in d.get("transitions", []):
            if t["to"]["name"].lower() == destino.lower():
                self.pedir("POST", "/rest/api/3/issue/%s/transitions" % clave,
                           {"transition": {"id": t["id"]}})
                return True
        return False


def documento(texto):
    """
    La API v3 no acepta texto plano en la descripcion: espera el formato de
    documento de Atlassian. Un parrafo simple basta.
    """
    return {"type": "doc", "version": 1,
            "content": [{"type": "paragraph",
                         "content": [{"type": "text", "text": texto}]}]}


# ── Programa ────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        raise SystemExit("Uso: python crear-en-jira.py <backlog.md> [--ensayo]")
    origen = sys.argv[1]
    ensayo = "--ensayo" in sys.argv

    epicas, historias = _gj.leer(origen)

    # Las epicas entran como incidencias normales con la etiqueta `epica`: la
    # jerarquia no la pide la rubrica y evita depender de que el proyecto tenga
    # el tipo Epic habilitado.
    tareas = []
    for epica, etiqueta in epicas.items():
        tareas.append({
            "resumen": epica, "estado": "To Do",
            "prioridad": _gj.PRIORIDAD_POR_MODULO.get(etiqueta, "Medium"),
            "etiquetas": [etiqueta, "epica"], "vence": "",
            "desc": "Agrupa el trabajo de %s." % epica.lower(),
        })
    for h in historias:
        tareas.append({
            "resumen": h["resumen"], "estado": h["estado"],
            "prioridad": h["prioridad"],
            "etiquetas": [h["etiqueta"], "sprint-%02d" % h["sprintNum"]],
            "vence": h["vence"], "desc": h["desc"],
        })

    if ensayo:
        print("ENSAYO · no se crea nada\n")
        print("%d incidencias" % len(tareas))
        for t in tareas[:5]:
            print("  [%-11s] %-58s %s" % (t["estado"], t["resumen"][:58],
                                          ",".join(t["etiquetas"])))
        print("  ... y %d mas" % (len(tareas) - 5))
        return

    jira = Jira()
    print("Proyecto %s en %s" % (jira.proyecto, jira.sitio))

    tipos = jira.tipos()
    print("Tipos disponibles: %s" % ", ".join("%s(%s)" % (n, i) for n, i in tipos.items()))
    # Se prefiere Story y se cae a lo que haya, por nombre exacto y sin traducir.
    tipo = None
    for candidato in ("Story", "Task", "Historia", "Tarea"):
        if candidato in tipos:
            tipo = (candidato, tipos[candidato])
            break
    if not tipo:
        tipo = (list(tipos)[0], list(tipos.values())[0])
    print("Se usara el tipo «%s» (id %s)\n" % tipo)

    existentes = jira.resumenes_existentes()
    if existentes:
        print("Ya hay %d incidencias; las que coincidan por resumen se omiten.\n"
              % len(existentes))

    creadas = omitidas = fallidas = 0
    sin_transicion = []
    for i, t in enumerate(tareas, 1):
        if t["resumen"] in existentes:
            omitidas += 1
            continue
        campos = {
            "project": {"key": jira.proyecto},
            "issuetype": {"id": tipo[1]},
            "summary": t["resumen"],
            "description": documento(t["desc"]),
            "labels": t["etiquetas"],
        }
        if t["vence"]:
            d, m, a = t["vence"].split("/")
            campos["duedate"] = "%s-%s-%s" % (a, m, d)   # la API pide aaaa-mm-dd
        try:
            r = jira.crear(campos)
        except SystemExit as e:
            # La prioridad y la fecha no siempre estan habilitadas: se reintenta
            # sin ellas antes de darla por perdida.
            campos.pop("duedate", None)
            try:
                r = jira.crear(campos)
            except SystemExit:
                print("  %3d/%d  FALLO  %s" % (i, len(tareas), t["resumen"][:56]))
                fallidas += 1
                continue
        clave = r.get("key", "?")
        if t["estado"] != "To Do":
            if not jira.transicionar(clave, t["estado"]):
                sin_transicion.append((clave, t["estado"]))
        creadas += 1
        print("  %3d/%d  %-8s %s" % (i, len(tareas), clave, t["resumen"][:56]))
        time.sleep(0.12)   # margen para no chocar con el limite de peticiones

    print("\nCreadas %d · omitidas %d · fallidas %d" % (creadas, omitidas, fallidas))
    if sin_transicion:
        print("\nSin transicion disponible al estado pedido (%d):" % len(sin_transicion))
        for clave, estado in sin_transicion[:10]:
            print("  %s -> %s" % (clave, estado))
        print("  Revisar los estados del flujo del proyecto.")


if __name__ == "__main__":
    main()
