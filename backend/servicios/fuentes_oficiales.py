"""Clasificación oficial de cada especie: nativa o exótica, invasora, amenazada y de bosque seco.

Se consulta en GBIF, donde el SiB Colombia publica las listas oficiales del país (cada una con
su versión y su DOI):

- Catálogo de Plantas y Líquenes de Colombia (Universidad Nacional): si el nombre es aceptado o
  sinónimo, en qué departamentos se ha registrado y si en Colombia solo se conoce cultivada
  (establishmentMeans MANAGED). El catálogo trata aparte las nativas y las cultivadas. Si un
  sinónimo no trae su nombre aceptado, se toma el del árbol taxonómico de GBIF.
- Lista de plantas exóticas y trasplantadas de Colombia (Instituto Humboldt): origen, estatus
  (cultivada, naturalizada, trasplantada), potencial de invasión y si está declarada invasora
  por la Resolución 207 de 2010 del Ministerio de Ambiente.
- GRIIS Colombia (registro global de especies introducidas e invasoras).
- Especies silvestres amenazadas, Resolución 0126 de 2024 (Ministerio de Ambiente): CR, EN, VU.
- Plantas vasculares reportadas en los bosques secos de Colombia (Instituto Humboldt).

La veda no está publicada como lista en GBIF: la registra el administrador con la norma.

Si las listas no coinciden en el origen manda la lista de exóticas, después GRIIS y por último el
Catálogo, y la ficha lo avisa para que alguien lo revise.
"""
import json
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

from servicios.mapa import EXOTICA, NATIVA, clave_cientifica

GBIF = "https://api.gbif.org/v1"
ESPERA_S = 15
AGENTE = "ArboladoEscolar/1.0 (inventario arboreo escolar; Valledupar, Colombia)"
VIGENCIA_METADATOS_S = 24 * 3600

Traer = Callable[[str, dict | None], dict]


@dataclass(frozen=True)
class Lista:
    clave: str
    uuid: str
    titulo: str
    editor: str


CATALOGO = Lista("catalogo", "5c0b1470-8884-4914-ae76-70a7c81d6d08",
                 "Catálogo de Plantas y Líquenes de Colombia", "Universidad Nacional de Colombia")
EXOTICAS = Lista("exoticas", "dc7695df-3c05-41ca-bde1-f2fd1ef73ead",
                 "Lista de especies de plantas exóticas y trasplantadas de Colombia", "Instituto Humboldt")
GRIIS = Lista("griis", "168568e7-eb5f-4ef6-8c59-f73ceaf57e91",
              "Registro global de especies introducidas e invasoras: Colombia (GRIIS)", "ISSG - UICN")
AMENAZADAS = Lista("amenazadas", "09174029-d182-442c-a12f-8013aee328d7",
                   "Especies silvestres amenazadas de Colombia (Resolución 0126 de 2024)",
                   "Ministerio de Ambiente y Desarrollo Sostenible")
BOSQUE_SECO = Lista("bosque_seco", "c1b14414-6c2f-4985-900f-b6fe7b089a4a",
                    "Plantas vasculares reportadas en los bosques secos de Colombia", "Instituto Humboldt")
LISTAS = (CATALOGO, EXOTICAS, GRIIS, AMENAZADAS, BOSQUE_SECO)

AMENAZA = {"CRITICALLY_ENDANGERED": "CR", "ENDANGERED": "EN", "VULNERABLE": "VU"}
ETIQUETA_AMENAZA = {"CR": "En peligro crítico", "EN": "En peligro", "VU": "Vulnerable"}
# Cómo marca el Catálogo una especie que en Colombia solo se conoce cultivada o naturalizada.
MEDIOS_NO_NATIVOS = {"MANAGED": "cultivada", "INTRODUCED": "naturalizada", "NATURALISED": "naturalizada",
                     "INVASIVE": "naturalizada"}
ESTATUS = ("cultivada", "naturalizada", "trasplantada")


class ErrorFuente(Exception):
    """No se pudo consultar GBIF o el nombre no sirve para buscar."""

    def __init__(self, estado: int, mensaje: str):
        super().__init__(mensaje)
        self.estado, self.mensaje = estado, mensaje


def traer_http(ruta: str, parametros: dict | None = None) -> dict:
    url = GBIF + ruta + ("?" + urllib.parse.urlencode(parametros) if parametros else "")
    peticion = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(peticion, timeout=ESPERA_S) as respuesta:
            return json.load(respuesta)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return {}
        raise ErrorFuente(502, "GBIF respondió con un error. Intenta de nuevo en unos minutos.")
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise ErrorFuente(503, "No fue posible consultar GBIF (SiB Colombia). Revisa la conexión del servidor.")


# Versión, DOI y fecha de cada lista: cambian poco, se guardan un día.
_metadatos: dict[str, tuple[float, dict]] = {}


def metadatos(lista: Lista, traer: Traer) -> dict:
    guardado = _metadatos.get(lista.uuid)
    if guardado and time.monotonic() - guardado[0] < VIGENCIA_METADATOS_S:
        return guardado[1]
    datos = traer(f"/dataset/{lista.uuid}", None)
    meta = {
        "version": datos.get("version"),
        "doi": datos.get("doi"),
        "publicado": (datos.get("pubDate") or "")[:10] or None,
    }
    _metadatos[lista.uuid] = (time.monotonic(), meta)
    return meta


def _sin_tildes(texto: str | None) -> str:
    descompuesto = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in descompuesto if unicodedata.category(c) != "Mn").lower().strip()


def nombre_de_busqueda(nombre_cientifico: str | None) -> str:
    """'Tabebuia rosea (Bertol.) DC.' -> 'Tabebuia rosea'."""
    return clave_cientifica(nombre_cientifico).capitalize()


def buscar(lista: Lista, nombre: str, traer: Traer) -> dict | None:
    """El registro de la lista con ese nombre exacto (género y especie); primero el aceptado."""
    datos = traer("/species/search", {"datasetKey": lista.uuid, "q": nombre, "limit": 20})
    clave = clave_cientifica(nombre)
    candidatos = [r for r in datos.get("results") or []
                  if clave_cientifica(r.get("canonicalName") or r.get("scientificName")) == clave]
    candidatos.sort(key=lambda r: r.get("taxonomicStatus") != "ACCEPTED")
    return candidatos[0] if candidatos else None


def _aceptado_en_gbif(nombre: str, traer: Traer) -> str | None:
    """Nombre aceptado según el árbol taxonómico de GBIF, si `nombre` es un sinónimo."""
    coincidencia = traer("/species/match", {"name": nombre, "kingdom": "Plantae"})
    if coincidencia.get("status") == "SYNONYM" and coincidencia.get("matchType") == "EXACT":
        return coincidencia.get("species")
    return None


def _resultados(traer: Traer, ruta: str) -> list[dict]:
    return traer(ruta, None).get("results") or []


def _url_registro(registro: dict | None) -> str | None:
    return f"https://www.gbif.org/species/{registro['key']}" if registro and registro.get("key") else None


def consultar(nombre_cientifico: str | None, traer: Traer | None = None) -> dict:
    """Ficha oficial de una especie. No guarda nada."""
    traer = traer or traer_http
    nombre = nombre_de_busqueda(nombre_cientifico)
    if len(nombre.split()) < 2:
        raise ErrorFuente(422, "La especie no tiene un nombre científico completo (género y especie) para buscarla.")

    fuentes: list[dict] = []
    avisos: list[str] = []

    def anotar(lista: Lista, registro: dict | None, dato: str):
        fuentes.append({"clave": lista.clave, "titulo": lista.titulo, "editor": lista.editor,
                        **metadatos(lista, traer), "encontrada": registro is not None,
                        "registro_url": _url_registro(registro), "dato": dato})

    # 1) Catálogo de Plantas y Líquenes de Colombia
    uso = buscar(CATALOGO, nombre, traer)
    coincidencia, nombre_aceptado, taxon = "no_encontrada", None, None
    if uso and (uso.get("taxonomicStatus") == "ACCEPTED" or not uso.get("acceptedKey")):
        coincidencia, taxon, nombre_aceptado = "exacta", uso.get("key"), uso.get("canonicalName") or nombre
    else:
        # Sinónimo, o nombre antiguo que el Catálogo no trae: se busca el nombre aceptado (si el
        # Catálogo lo deja sin ubicar, "Incertae sedis", se usa el árbol taxonómico de GBIF).
        aceptado = traer(f"/species/{uso['acceptedKey']}", None).get("canonicalName") if uso else None
        if len((aceptado or "").split()) < 2 or _sin_tildes(aceptado) == "incertae sedis":
            aceptado = _aceptado_en_gbif(nombre, traer)
        uso_aceptado = buscar(CATALOGO, aceptado, traer) if aceptado else None
        if uso_aceptado and uso_aceptado.get("taxonomicStatus") == "ACCEPTED":
            coincidencia, taxon, nombre_aceptado = "sinonimo", uso_aceptado.get("key"), uso_aceptado.get("canonicalName")
            uso = uso or uso_aceptado
        elif uso:
            coincidencia = "sinonimo"

    departamentos: list[str] = []
    medio, forma_de_vida = None, None
    if taxon:
        for d in _resultados(traer, f"/species/{taxon}/distributions"):
            if d.get("country") not in (None, "CO"):
                continue
            for depto in (d.get("locality") or "").split(","):
                if depto.strip() and depto.strip() not in departamentos:
                    departamentos.append(depto.strip())
            medio = medio or d.get("establishmentMeans")
        forma_de_vida = next((p["lifeForm"] for p in _resultados(traer, f"/species/{taxon}/speciesProfiles")
                              if p.get("lifeForm")), None)
    en_cesar = any(_sin_tildes(d) == "cesar" for d in departamentos)
    origen_catalogo = (EXOTICA if medio in MEDIOS_NO_NATIVOS else NATIVA) if taxon else None
    estatus_catalogo = MEDIOS_NO_NATIVOS.get(medio)

    if coincidencia == "no_encontrada":
        dato = "No aparece con ese nombre."
        avisos.append("El nombre no aparece en el Catálogo de Plantas y Líquenes de Colombia: revisa la ortografía "
                      "del nombre científico.")
    elif taxon is None:
        dato = "Aparece como sinónimo, sin nombre aceptado."
        avisos.append(f"En el Catálogo, {nombre} figura como sinónimo pero no se encontró su nombre aceptado: "
                      "revisa el nombre científico de la especie en la app.")
    else:
        dato = (estatus_catalogo or "nativa").capitalize()
        dato += f"; registrada en {len(departamentos)} departamentos" if departamentos else "; sin departamentos registrados"
        dato += " (incluido Cesar)." if en_cesar else "."
        if coincidencia == "sinonimo":
            dato = f"Sinónimo de {nombre_aceptado}. {dato}"
            avisos.append(f"En el Catálogo, {nombre} es sinónimo de {nombre_aceptado}: conviene actualizar el nombre "
                          "científico de la especie en la app.")
    anotar(CATALOGO, uso, dato)

    nombres = [nombre] + ([nombre_aceptado] if nombre_aceptado and clave_cientifica(nombre_aceptado) != clave_cientifica(nombre) else [])

    def en_lista(lista: Lista) -> dict | None:
        return next((r for r in (buscar(lista, n, traer) for n in nombres) if r), None)

    # 2) Plantas exóticas y trasplantadas (Instituto Humboldt)
    exotica = en_lista(EXOTICAS)
    origen_lista, estatus_lista, riesgo, invasora = None, None, None, False
    if exotica:
        for d in _resultados(traer, f"/species/{exotica['key']}/descriptions"):
            tipo, valor = _sin_tildes(d.get("type")), (d.get("description") or "").strip()
            if tipo == "origen":
                origen_lista = EXOTICA if "exot" in _sin_tildes(valor) else NATIVA if "nativ" in _sin_tildes(valor) else None
            elif tipo.startswith("estatus"):
                estatus_lista = next((e for e in ESTATUS if e in _sin_tildes(valor)), None)
            elif tipo.startswith("potencial de establecimiento"):
                riesgo = valor[:80] or None
                invasora = invasora or _sin_tildes(valor) == "invasora"
            elif tipo.startswith("invasividad resolucion"):  # declaración oficial (Resolución 207 de 2010)
                invasora = invasora or _sin_tildes(valor) == "invasora"
    partes = [p for p in ((origen_lista or "").replace("exotica", "exótica").capitalize(), estatus_lista,
                          "declarada invasora (Resolución 207 de 2010)" if invasora else None,
                          f"potencial de invasión: {riesgo.lower()}" if riesgo and _sin_tildes(riesgo) != "invasora" else None)
              if p]
    anotar(EXOTICAS, exotica, (", ".join(partes) + ".") if exotica else "No aparece en la lista.")

    # 3) GRIIS Colombia
    griis = en_lista(GRIIS)
    introducida = bool(griis) and any(d.get("establishmentMeans") in ("INTRODUCED", "NATURALISED", "INVASIVE")
                                      for d in _resultados(traer, f"/species/{griis['key']}/distributions"))
    anotar(GRIIS, griis, "Registrada como introducida en Colombia." if introducida
           else "Aparece en el registro." if griis else "No aparece en el registro.")

    # 4) Especies amenazadas (Resolución 0126 de 2024)
    amenazada = en_lista(AMENAZADAS)
    amenaza = None
    if amenazada:
        estados = list(amenazada.get("threatStatuses") or [])
        if not estados:
            estados = [d.get("threatStatus") for d in _resultados(traer, f"/species/{amenazada['key']}/distributions")]
        amenaza = next((AMENAZA[e] for e in estados if e in AMENAZA), None)
    anotar(AMENAZADAS, amenazada, f"{ETIQUETA_AMENAZA[amenaza]} ({amenaza})." if amenaza
           else "Aparece sin categoría de amenaza." if amenazada else "No está en la lista de especies amenazadas.")

    # 5) Bosque seco (Instituto Humboldt)
    bosque = en_lista(BOSQUE_SECO)
    anotar(BOSQUE_SECO, bosque, "Reportada en bosque seco." if bosque else "No aparece en la lista.")

    # Origen: lista de exóticas > GRIIS > Catálogo; si no coinciden, se avisa.
    opiniones = {CATALOGO.titulo: origen_catalogo, EXOTICAS.titulo: origen_lista,
                 GRIIS.titulo: EXOTICA if introducida else None}
    origen = origen_lista or (EXOTICA if introducida else None) or origen_catalogo
    distintas = {fuente: o for fuente, o in opiniones.items() if o and o != origen}
    for fuente, o in distintas.items():
        avisos.append(f"Las listas no coinciden en el origen: {fuente} la trata como "
                      f"{'nativa' if o == NATIVA else 'exótica'}. Se usa {'nativa' if origen == NATIVA else 'exótica'}.")
    if invasora:
        avisos.append("Especie declarada oficialmente invasora en Colombia: no se recomienda sembrarla.")

    return {
        "nombre_consultado": nombre,
        "nombre_aceptado": nombre_aceptado,
        "coincidencia": coincidencia,
        "en_catalogo": taxon is not None,
        "departamentos": departamentos,
        "en_cesar": en_cesar,
        "forma_de_vida": forma_de_vida,
        "origen": origen,
        "estatus": estatus_lista or estatus_catalogo,
        "invasora": invasora,
        "riesgo_invasion": riesgo if riesgo and _sin_tildes(riesgo) != "invasora" else None,
        "amenaza": amenaza,
        "bosque_seco": bosque is not None,
        "avisos": avisos,
        "fuentes": fuentes,
    }


def bosque_seco_del_cesar(ficha: dict | None) -> bool:
    """Nativa, reportada en bosque seco y registrada en el Cesar según las listas oficiales."""
    return bool(ficha) and ficha.get("origen") == NATIVA and bool(ficha.get("bosque_seco")) and bool(ficha.get("en_cesar"))
