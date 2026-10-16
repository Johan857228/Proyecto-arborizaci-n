"""Identificación con IA: se prueba con un cliente de Anthropic falso (no gasta saldo)."""
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from fastapi.testclient import TestClient

import main
from routers import ia as router_ia
from servicios import ia

JPG = ("general.jpg", b"\xff\xd8\xff\xe0foto-general", "image/jpeg")
PNG = ("detalle.png", b"\x89PNG\r\n\x1a\nfoto-detalle", "image/png")

ESPECIES = [
    {"id": 1, "nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica"},
    {"id": 2, "nombre_comun": "Ceiba", "nombre_cientifico": "Ceiba pentandra"},
]
OBSERVACIONES = [
    {"codigo": "f_manchas", "grupo": "follaje", "etiqueta": "Manchas en hojas"},
    {"codigo": "t_grietas", "grupo": "tronco", "etiqueta": "Grietas en el tronco"},
]


def _analisis(**cambios) -> ia.AnalisisIA:
    base = {
        "es_arbol": True,
        "calidad_foto": "buena",
        "resumen": "Mango adulto con manchas en las hojas.",
        "especie": {"especie_id": 1, "nombre_probable": None, "confianza": "alta", "razon": "Hojas lanceoladas."},
        "etapa": {"valor": "Adulto", "confianza": "media", "razon": "Copa desarrollada."},
        "interferencia": {"valor": "Ninguna", "confianza": "alta", "razon": "No se ve infraestructura."},
        "observaciones": [{"codigo": "f_manchas", "confianza": "media", "razon": "Manchas oscuras."}],
        "insectos": None,
        "enfermedad": {"tipo": "fungica", "parte": "hojas", "severidad": 2, "confianza": "media", "razon": "Anillos."},
        "hemiparasitas": None,
        "bejucos": None,
        "epifitas": None,
    }
    base.update(cambios)
    return ia.AnalisisIA.model_validate(base)


class MensajesFalsos:
    def __init__(self, respuesta=None, error=None):
        self.respuesta, self.error, self.llamadas = respuesta, error, []

    def parse(self, **kwargs):
        self.llamadas.append(kwargs)
        if self.error:
            raise self.error
        return self.respuesta


@pytest.fixture
def con_ia(entorno, monkeypatch):
    """Entorno con clave configurada, catálogos y un cliente de Anthropic falso."""
    cliente, almacen, registro = entorno
    almacen["especies"] = ESPECIES
    almacen["observaciones_catalogo"] = OBSERVACIONES
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-falsa")
    monkeypatch.setattr(router_ia, "_uso", type(router_ia._uso)(router_ia._uso.default_factory))
    mensajes = MensajesFalsos(SimpleNamespace(stop_reason="end_turn", parsed_output=_analisis()))
    monkeypatch.setattr(ia, "_cliente", lambda: SimpleNamespace(beta=SimpleNamespace(messages=mensajes)))
    return cliente, mensajes


def _analizar(cliente, general=JPG, detalle=None):
    archivos = {"general": general}
    if detalle:
        archivos["detalle"] = detalle
    return cliente.post("/ia/analizar-foto", files=archivos)


# ----------------------------------- Disponibilidad -----------------------------------
def test_estado_sin_clave(entorno, monkeypatch):
    cliente, _, _ = entorno
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert cliente.get("/ia/estado").json() == {"disponible": False, "modelo": "claude-opus-5-5"}


def test_analizar_sin_clave_da_503(entorno, monkeypatch):
    cliente, _, _ = entorno
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    r = _analizar(cliente)
    assert r.status_code == 503
    assert "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_analizar_requiere_sesion():
    main.app.dependency_overrides.clear()
    assert TestClient(main.app).post("/ia/analizar-foto", files={"general": JPG}).status_code == 401


# ------------------------------------- Análisis -------------------------------------
def test_analizar_envia_las_fotos_y_el_catalogo(con_ia):
    cliente, mensajes = con_ia
    r = _analizar(cliente, detalle=PNG)
    assert r.status_code == 200
    j = r.json()
    assert j["modelo"] == "claude-opus-5-5"
    assert j["especie"]["especie_id"] == 1
    assert j["enfermedad"]["tipo"] == "fungica"

    llamada = mensajes.llamadas[0]
    assert llamada["model"] == "claude-opus-5-5"
    assert llamada["fallbacks"] == "default" and llamada["betas"] == ["server-side-fallback-2026-07-01"]
    assert llamada["output_format"] is ia.AnalisisIA
    imagenes = [b for b in llamada["messages"][0]["content"] if b["type"] == "image"]
    assert [i["source"]["media_type"] for i in imagenes] == ["image/jpeg", "image/png"]
    assert "1: Mango (Mangifera indica)" in llamada["system"]
    assert "f_manchas [follaje]: Manchas en hojas" in llamada["system"]


def test_analizar_quita_lo_que_no_esta_en_el_catalogo(con_ia):
    cliente, mensajes = con_ia
    mensajes.respuesta = SimpleNamespace(stop_reason="end_turn", parsed_output=_analisis(
        especie={"especie_id": 99, "nombre_probable": "Guayacán", "confianza": "baja", "razon": "Flores amarillas."},
        observaciones=[
            {"codigo": "f_manchas", "confianza": "media", "razon": "a"},
            {"codigo": "f_manchas", "confianza": "baja", "razon": "repetida"},
            {"codigo": "no_existe", "confianza": "alta", "razon": "b"},
        ],
        insectos={"tipo": "chupadores", "parte": "hojas", "severidad": 7, "confianza": "media", "razon": "c"},
        hemiparasitas={"tipo": "pajarito", "pct_copa": 140, "confianza": "alta", "razon": "d"},
        bejucos={"nivel": 0, "confianza": "baja", "razon": "e"},
        epifitas={"tipos": ["musgos", "bromelias", "musgos"], "confianza": "alta", "razon": "f"},
    ))
    j = _analizar(cliente).json()
    assert j["especie"]["especie_id"] is None and j["especie"]["nombre_probable"] == "Guayacán"
    assert [o["codigo"] for o in j["observaciones"]] == ["f_manchas"]
    assert j["insectos"]["severidad"] == 4
    assert j["hemiparasitas"]["pct_copa"] == 100
    assert j["bejucos"] is None
    assert j["epifitas"]["tipos"] == ["bromelias", "musgos"]


def test_analizar_rechaza_archivos_que_no_son_imagen(con_ia):
    cliente, mensajes = con_ia
    assert _analizar(cliente, general=("a.jpg", b"MZ no es imagen", "image/jpeg")).status_code == 422
    assert _analizar(cliente, general=("a.pdf", b"%PDF", "application/pdf")).status_code == 422
    assert mensajes.llamadas == []  # no se gastó saldo


@pytest.mark.parametrize(
    "respuesta, estado",
    [
        (SimpleNamespace(stop_reason="refusal", parsed_output=None), 422),
        (SimpleNamespace(stop_reason="max_tokens", parsed_output=None), 502),
    ],
)
def test_respuestas_incompletas_de_la_ia(con_ia, respuesta, estado):
    cliente, mensajes = con_ia
    mensajes.respuesta = respuesta
    assert _analizar(cliente).status_code == estado


def _error_http(clase, codigo):
    peticion = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return clase("falla", response=httpx2.Response(codigo, request=peticion), body=None)


@pytest.mark.parametrize(
    "error, estado",
    [
        (lambda: _error_http(anthropic.AuthenticationError, 401), 503),
        (lambda: _error_http(anthropic.RateLimitError, 429), 429),
        (lambda: _error_http(anthropic.InternalServerError, 500), 502),
        (lambda: anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com")), 503),
    ],
)
def test_errores_del_servicio_de_ia(con_ia, error, estado):
    cliente, mensajes = con_ia
    mensajes.error = error()
    r = _analizar(cliente)
    assert r.status_code == estado
    assert r.json()["detail"]


def test_limite_de_analisis_por_usuario(con_ia, monkeypatch):
    cliente, _ = con_ia
    monkeypatch.setattr(router_ia, "MAX_ANALISIS_POR_HORA", 2)
    assert [_analizar(cliente).status_code for _ in range(3)] == [200, 200, 429]
