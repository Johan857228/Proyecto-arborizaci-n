"""Identificación asistida por IA (Claude) a partir de las fotos del árbol.

La IA solo SUGIERE: el formulario muestra cada sugerencia con su confianza y el usuario decide
si la aplica. Las respuestas se limitan a los catálogos (especies, observaciones y agentes
bióticos FB-01 a FB-06) y aquí se vuelven a revisar: un código que no está en el catálogo se
descarta y los valores fuera de escala se corrigen o se quitan.

Requiere ANTHROPIC_API_KEY en el .env del backend. Sin ella, la API responde 503 y el
formulario explica que la IA no está activada.
"""
import base64
import os
from functools import lru_cache
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from schemas import (
    MAX_OBSERVACIONES,
    Etapa,
    Interferencia,
    ParteArbol,
    TipoEnfermedad,
    TipoEpifita,
    TipoHemiparasita,
    TipoInsecto,
)

MODELO = "claude-opus-5-5"
# "medium" equilibra precisión y espera: el usuario aguarda la respuesta en campo.
ESFUERZO = "medium"
# Si el modelo declina una petición, la API la reintenta sola con el modelo de respaldo que
# recomienda Anthropic; ver https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback
BETA_RESPALDO = "server-side-fallback-2026-07-01"

Confianza = Literal["alta", "media", "baja"]


class ErrorIA(Exception):
    """Falla al analizar las fotos, con el código HTTP y el mensaje para el usuario."""

    def __init__(self, estado: int, mensaje: str):
        super().__init__(mensaje)
        self.estado, self.mensaje = estado, mensaje


# ------------------------- Formato de la respuesta de la IA -------------------------
# Sin límites numéricos en el esquema: la salida estructurada no los admite y un valor fuera
# de escala haría fallar toda la respuesta. Se corrigen después, en depurar().
class SugerenciaEspecie(BaseModel):
    especie_id: int | None = Field(description="id de la especie en el catálogo; null si no está o no se distingue")
    nombre_probable: str | None = Field(description="Nombre común probable cuando la especie NO está en el catálogo")
    confianza: Confianza
    razon: str


class SugerenciaEtapa(BaseModel):
    valor: Etapa | None
    confianza: Confianza
    razon: str


class SugerenciaInterferencia(BaseModel):
    valor: Interferencia | None
    confianza: Confianza
    razon: str


class SugerenciaObservacion(BaseModel):
    codigo: str = Field(description="Código del catálogo de observaciones")
    confianza: Confianza
    razon: str


class SugerenciaInsectos(BaseModel):
    tipo: TipoInsecto
    parte: ParteArbol
    severidad: int = Field(description="0 a 4")
    confianza: Confianza
    razon: str


class SugerenciaEnfermedad(BaseModel):
    tipo: TipoEnfermedad
    parte: ParteArbol
    severidad: int = Field(description="0 a 4")
    confianza: Confianza
    razon: str


class SugerenciaHemiparasitas(BaseModel):
    tipo: TipoHemiparasita
    pct_copa: float = Field(description="Porcentaje de la copa cubierto, de 1 a 100")
    confianza: Confianza
    razon: str


class SugerenciaBejucos(BaseModel):
    nivel: int = Field(description="1 a 4 según la porción del individuo cubierta")
    confianza: Confianza
    razon: str


class SugerenciaEpifitas(BaseModel):
    tipos: list[TipoEpifita]
    confianza: Confianza
    razon: str


class AnalisisIA(BaseModel):
    es_arbol: bool = Field(description="false si las fotos no muestran un árbol")
    calidad_foto: Literal["buena", "regular", "mala"]
    resumen: str = Field(description="Una o dos frases en español con lo más importante")
    especie: SugerenciaEspecie
    etapa: SugerenciaEtapa
    interferencia: SugerenciaInterferencia
    observaciones: list[SugerenciaObservacion]
    insectos: SugerenciaInsectos | None
    enfermedad: SugerenciaEnfermedad | None
    hemiparasitas: SugerenciaHemiparasitas | None
    bejucos: SugerenciaBejucos | None
    epifitas: SugerenciaEpifitas | None


class AnalisisOut(AnalisisIA):
    modelo: str


# ------------------------------------ Instrucciones ------------------------------------
# Señales de campo de la tabla de agentes bióticos (las mismas del formulario).
_SENALES = """\
Insectos (FB-01), tipo:
- defoliadores: hojas mordidas, orugas.
- chupadores: hojas enrolladas, pegajosas o con fumagina.
- escamas: costras o motas algodonosas.
- arrieras: cortes en media luna y caminos de hormigas.
- minadores: galerías dentro de la hoja.
- agalladores: abultamientos.
Enfermedad (FB-02), tipo:
- fungica: manchas con anillos, polvo blanco o negro.
- bacteriana: manchas aceitosas, exudado.
- viral: mosaicos, hojas deformes.
- indeterminada: hay síntomas pero no se puede decidir la causa.
Parte afectada: hojas, ramas, tronco, raiz, flores_frutos.
Severidad de insectos y enfermedad: 0 sin daño, 1 leve, 2 moderada, 3 severa, 4 muy severa.
Hemiparásitas (FB-04): pajarito (muérdago, Loranthaceae: matas de hojas distintas que nacen de la
rama, a menudo con flores rojas o naranjas) o cuscuta (filamentos amarillos o naranjas sobre la copa);
estima el porcentaje de la copa cubierto.
Bejucos (FB-05), porción del individuo cubierta: 1 hasta 25 %, 2 de 26 a 50 %, 3 de 51 a 75 %, 4 más de 75 %.
Epífitas (FB-06): bromelias, orquideas, helechos, liquenes, musgos."""

_REGLAS = """\
Eres el asistente de identificación del Inventario Arbóreo Escolar de instituciones educativas de
Valledupar (Cesar, Colombia), en zona de bosque seco tropical. Recibes la foto general de un árbol
y, a veces, una foto de detalle. Sugieres valores para el formulario de registro; un estudiante o
docente revisa cada sugerencia antes de guardarla.

Reglas:
- Usa solo las opciones de los catálogos de abajo. Si la especie no está en el catálogo, deja
  especie_id en null y escribe en nombre_probable el nombre común que creas.
- Sé conservador: reporta un problema solo si ves señales en la foto. Si no se distingue, usa null
  (o una lista vacía) en lugar de adivinar. No inventes detalles que no se ven.
- confianza: "alta" si las señales son claras, "media" si son probables, "baja" si es una sospecha.
- razon: una frase corta en español con la señal visible que respalda la sugerencia.
- No estimes medidas (altura, diámetro del tronco ni de copa): se toman en campo.
- interferencia: "Ninguna" si no se ve infraestructura afectada; null si la foto no lo permite saber.
- Si las fotos no muestran un árbol, es_arbol es false y el resto queda en null o vacío.
- Las fotos las toman estudiantes, muchos menores de edad: si aparecen personas, no las describas,
  no las identifiques ni menciones rasgos suyos; habla solo del árbol y su entorno.
- Escribe el resumen y las razones en español, sin tecnicismos innecesarios."""


def instrucciones(especies: list[dict], observaciones: list[dict]) -> str:
    """Instrucciones del sistema con los catálogos de la base de datos (orden estable)."""
    lineas_especies = "\n".join(
        f"- {e['id']}: {e['nombre_comun']} ({e['nombre_cientifico']})"
        for e in sorted(especies, key=lambda e: e["id"])
    )
    lineas_obs = "\n".join(
        f"- {o['codigo']} [{o['grupo']}]: {o['etiqueta']}"
        for o in sorted(observaciones, key=lambda o: (o["grupo"], o["codigo"]))
    )
    return (
        f"{_REGLAS}\n\n"
        f"Catálogo de especies (id: nombre común (nombre científico)):\n{lineas_especies}\n\n"
        f"Catálogo de observaciones fitosanitarias (código [grupo]: descripción):\n{lineas_obs}\n\n"
        "Etapas: Plántula, Juvenil, Adulto, Senescente.\n"
        "Interferencias: Ninguna, Levantamiento de pisos, Afectación de muros, Cables eléctricos, "
        "Otra infraestructura.\n\n"
        f"{_SENALES}"
    )


# ---------------------------------------- Llamada ----------------------------------------
def configurada() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


@lru_cache
def _cliente() -> anthropic.Anthropic:
    # Toma ANTHROPIC_API_KEY del entorno (db.py ya cargó el .env).
    return anthropic.Anthropic(timeout=90.0, max_retries=1)


def analizar(fotos: list[tuple[bytes, str]], especies: list[dict], observaciones: list[dict]) -> AnalisisIA:
    """Envía las fotos (contenido, tipo MIME) a Claude y devuelve su análisis sin depurar.
    La primera foto es la general; la segunda, si existe, la de detalle."""
    contenido: list[dict] = []
    for indice, (datos, tipo) in enumerate(fotos):
        contenido.append({"type": "text", "text": "Foto general del árbol:" if indice == 0 else "Foto de detalle:"})
        contenido.append({
            "type": "image",
            "source": {"type": "base64", "media_type": tipo, "data": base64.standard_b64encode(datos).decode("ascii")},
        })
    contenido.append({"type": "text", "text": "Analiza las fotos y completa las sugerencias para el formulario."})

    try:
        respuesta = _cliente().beta.messages.parse(
            model=MODELO,
            max_tokens=16000,
            betas=[BETA_RESPALDO],
            fallbacks="default",
            output_config={"effort": ESFUERZO},
            system=instrucciones(especies, observaciones),
            messages=[{"role": "user", "content": contenido}],
            output_format=AnalisisIA,
        )
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
        raise ErrorIA(503, "La clave de la IA no es válida o no tiene permisos. Revisa ANTHROPIC_API_KEY.")
    except anthropic.RateLimitError:
        raise ErrorIA(429, "La IA recibió demasiadas solicitudes. Espera un momento e intenta de nuevo.")
    except anthropic.APIConnectionError:  # incluye el tiempo de espera agotado
        raise ErrorIA(503, "No fue posible conectar con el servicio de IA. Intenta de nuevo.")
    except anthropic.APIStatusError:
        raise ErrorIA(502, "El servicio de IA respondió con un error. Intenta de nuevo en un momento.")

    if respuesta.stop_reason == "refusal":
        raise ErrorIA(422, "La IA no pudo analizar estas fotos. Prueba con otra foto del árbol.")
    if respuesta.stop_reason == "max_tokens" or respuesta.parsed_output is None:
        raise ErrorIA(502, "La IA no terminó el análisis. Intenta de nuevo.")
    return respuesta.parsed_output


def _escala(valor: int, minimo: int, maximo: int) -> int:
    return max(minimo, min(maximo, valor))


def depurar(analisis: AnalisisIA, especies_validas: set[int], codigos_validos: set[str]) -> AnalisisIA:
    """Deja solo lo que el formulario puede aceptar: ids y códigos del catálogo, escalas 0–4 y
    porcentajes de 1 a 100. Lo que no se puede corregir se quita."""
    especie = analisis.especie
    if especie.especie_id is not None and especie.especie_id not in especies_validas:
        especie = especie.model_copy(update={"especie_id": None})

    observaciones, vistos = [], set()
    for obs in analisis.observaciones:
        if obs.codigo in codigos_validos and obs.codigo not in vistos:
            vistos.add(obs.codigo)
            observaciones.append(obs)

    insectos = analisis.insectos
    if insectos:
        insectos = insectos.model_copy(update={"severidad": _escala(insectos.severidad, 0, 4)})
    enfermedad = analisis.enfermedad
    if enfermedad:
        enfermedad = enfermedad.model_copy(update={"severidad": _escala(enfermedad.severidad, 0, 4)})

    hemiparasitas = analisis.hemiparasitas
    if hemiparasitas:
        if hemiparasitas.pct_copa <= 0:
            hemiparasitas = None
        else:
            hemiparasitas = hemiparasitas.model_copy(update={"pct_copa": round(min(hemiparasitas.pct_copa, 100), 2)})

    bejucos = analisis.bejucos
    if bejucos:
        bejucos = None if bejucos.nivel <= 0 else bejucos.model_copy(update={"nivel": _escala(bejucos.nivel, 1, 4)})

    epifitas = analisis.epifitas
    if epifitas:
        tipos = sorted(set(epifitas.tipos))
        epifitas = epifitas.model_copy(update={"tipos": tipos}) if tipos else None

    return analisis.model_copy(update={
        "especie": especie,
        "observaciones": observaciones[:MAX_OBSERVACIONES],
        "insectos": insectos,
        "enfermedad": enfermedad,
        "hemiparasitas": hemiparasitas,
        "bejucos": bejucos,
        "epifitas": epifitas,
    })
