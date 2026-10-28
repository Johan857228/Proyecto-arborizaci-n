"""Precisión y costo de la IA (migración 015). El cliente de Anthropic es falso: no gasta saldo."""
from types import SimpleNamespace

import pytest

from routers import ia as router_ia
from servicios import ia
from servicios import precision_ia as reglas
from tests.conftest import CUERPO_ARBOL
from tests.test_ia import JPG, _analisis
from tests.test_modulos_api import A1, A2, USUARIOS, api  # noqa: F401 (api es un fixture)

ADMIN, EST1 = USUARIOS["admin"][0], USUARIOS["est1"][0]
FICHA_BOSQUE = {"origen": "nativa", "bosque_seco": True, "en_cesar": True}


# ------------------------------------- Reglas -------------------------------------
def test_intervalo_de_wilson():
    assert reglas.wilson(8, 10) == [49.0, 94.3]
    assert reglas.wilson(0, 0) is None
    assert reglas.wilson(10, 10)[1] == 100.0 and reglas.wilson(0, 5)[0] == 0.0
    assert reglas.tasa(3, 4) == {"n": 4, "aciertos": 3, "pct": 75.0, "ic95": reglas.wilson(3, 4)}


def test_costo_con_la_tarifa_publicada():
    assert ia.costo_usd("claude-opus-5-5", 1_000_000, 0) == 4.0
    assert ia.costo_usd("claude-opus-5-5", 2500, 800) == 0.026
    assert ia.costo_usd("claude-opus-4-8", 1000, 1000, cache_lectura=1000) == 0.0305
    assert ia.costo_usd("otro-modelo", 1000, 1000) is None
    respuesta = SimpleNamespace(model="claude-opus-5-5", usage=SimpleNamespace(
        input_tokens=3000, output_tokens=900, cache_read_input_tokens=None, cache_creation_input_tokens=None))
    consumo = ia.consumo_de(respuesta, 4200)
    assert consumo.costo_usd == 0.03 and consumo.tokens_cache_lectura == 0 and consumo.duracion_ms == 4200
    assert ia.consumo_de(SimpleNamespace(), 10).costo_usd is None  # sin uso reportado no se inventa el costo


def _a(tipo="campo", sugerida=1, real=None, arbol=None, confianza="alta", costo=0.03, fotos=1, modelo="claude-opus-5-5"):
    return {"tipo": tipo, "especie_sugerida_id": sugerida, "especie_real_id": real, "arbol_id": arbol, "confianza": confianza,
            "costo_usd": costo, "fotos": fotos, "modelo": modelo, "tokens_entrada": 3000, "tokens_salida": 900, "duracion_ms": 4000}


def test_resumen_cuenta_solo_lo_confirmado_y_las_pruebas():
    analisis = [
        _a("prueba", sugerida=2, real=2),                       # acierto
        _a("prueba", sugerida=1, real=2, confianza="media"),     # confunde roble con mango
        _a("prueba", sugerida=None, real=2, confianza="baja"),  # no se atrevió: cuenta como fallo
        _a(arbol="t1"),                                          # confirmado, mango: acierto
        _a(arbol="t2", sugerida=2),                              # pendiente de revisión: no cuenta
        _a(arbol="t3"),                                          # anulado: no cuenta
        _a(),                                                    # nunca se guardó el árbol
        _a(arbol="t1", fotos=2, costo=None, modelo="otro"),     # sin precio conocido
    ]
    especies = {1: {"nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica"},
                2: {"nombre_comun": "Roble morado", "nombre_cientifico": "Tabebuia rosea"}}
    r = reglas.resumen(analisis, {"t1": 1, "t2": 2, "t3": 1}, {"t1": "confirmada", "t2": "pendiente", "t3": "anulada"},
                       especies, {2: FICHA_BOSQUE}, {1: "exotica", 2: "nativa"}, trm=4000)
    assert r["general"]["n"] == 5 and r["general"]["aciertos"] == 3 and r["general"]["pct"] == 60.0
    assert r["muestra_pequena"] is True
    assert r["fuera"] == {"sin_arbol": 1, "por_revisar": 1, "anulados": 1, "sin_especie": 0}
    assert r["cobertura"]["aciertos"] == 4 and r["al_sugerir"]["pct"] == 75.0
    assert r["por_tipo"]["prueba"]["n"] == 3 and r["por_tipo"]["campo"]["aciertos"] == 2
    assert r["por_confianza"]["alta"] == reglas.tasa(3, 3) and r["por_confianza"]["media"]["aciertos"] == 0
    assert r["por_confianza"]["baja"]["n"] == 0  # la que no sugirió especie no entra por confianza
    assert r["bosque_seco_cesar"]["n"] == 3 and r["bosque_seco_cesar"]["aciertos"] == 1 and r["bosque_seco_cesar"]["especies"] == 1
    assert r["por_origen"]["exotica"]["pct"] == 100.0
    assert r["por_especie"][0]["nombre_comun"] == "Roble morado" and r["por_especie"][0]["bosque_seco_cesar"] is True
    assert r["confusiones"] == [{"real": "Roble morado", "sugerida": "Mango", "veces": 1}]
    c = r["costo"]
    assert c["analisis"] == 8 and c["fotos"] == 9 and c["sin_precio"] == 1
    assert c["total_usd"] == 0.21 and c["por_analisis_usd"] == 0.03 and c["por_foto_usd"] == 0.03 and c["por_foto_cop"] == 120
    assert c["por_modelo"][0] == {"modelo": "claude-opus-5-5", "analisis": 7, "total_usd": 0.21}
    assert c["duracion_mediana_s"] == 4.0


# -------------------------------------- API --------------------------------------
@pytest.fixture
def con_ia(api, monkeypatch):  # noqa: F811
    for sede in api.base.tablas["instituciones"]:
        sede.update(lat=10.46, lng=-73.25)
    api.base.tablas["especies"] = [{"id": 1, "nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica"},
                                   {"id": 2, "nombre_comun": "Roble morado", "nombre_cientifico": "Tabebuia rosea"}]
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-falsa")
    monkeypatch.setenv("IA_TRM", "4000")
    monkeypatch.setattr(router_ia, "_uso", type(router_ia._uso)(router_ia._uso.default_factory))
    respuesta = SimpleNamespace(stop_reason="end_turn", parsed_output=_analisis(), model="claude-opus-5-5",
                                usage=SimpleNamespace(input_tokens=3000, output_tokens=900,
                                                      cache_read_input_tokens=0, cache_creation_input_tokens=0))
    mensajes = SimpleNamespace(parse=lambda **_: respuesta)
    monkeypatch.setattr(ia, "_cliente", lambda: SimpleNamespace(beta=SimpleNamespace(messages=mensajes)))
    return api


def test_cada_analisis_se_anota_con_su_costo_y_se_enlaza_al_arbol(con_ia):
    r = con_ia.post("/ia/analizar-foto", files={"general": JPG})
    assert r.status_code == 200
    analisis_id = r.json()["analisis_id"]
    fila = con_ia.base.tablas["analisis_ia"][0]
    assert fila["id"] == analisis_id and fila["usuario_id"] == EST1 and fila["institucion_id"] == "sj"
    assert fila["especie_sugerida_id"] == 1 and fila["confianza"] == "alta" and fila["fotos"] == 1
    assert fila["costo_usd"] == 0.03 and fila["modelo"] == "claude-opus-5-5" and fila["tipo"] == "campo"

    # Otra persona no puede enlazar ese análisis a su árbol.
    router_ia.enlazar_analisis(analisis_id, A2, ADMIN)
    assert fila["arbol_id"] is None
    router_ia.enlazar_analisis(analisis_id, A1, EST1)
    assert con_ia.base.tablas["analisis_ia"][0]["arbol_id"] == A1
    router_ia.enlazar_analisis(analisis_id, A2, EST1)  # ya enlazado: no cambia
    assert con_ia.base.tablas["analisis_ia"][0]["arbol_id"] == A1

    # Sin la migración el análisis sigue funcionando, solo que sin anotarse.
    con_ia.base.fallar["analisis_ia"] = ("insert", "42P01")
    r = con_ia.post("/ia/analizar-foto", files={"general": JPG})
    assert r.status_code == 200 and r.json()["analisis_id"] is None


def test_registrar_arbol_enlaza_el_analisis(entorno):
    cliente, almacen, registro = entorno
    almacen["analisis_ia"] = [{"id": "an-1", "usuario_id": "usuario-1", "tipo": "campo", "arbol_id": None}]
    r = cliente.post("/arboles", json={**CUERPO_ARBOL, "ia_analisis_id": "8d5f2c3e-1b4a-4c6d-9e8f-0a1b2c3d4e5f"})
    assert r.status_code == 201
    insercion = next(a[0] for t, m, a, _ in registro if t == "arboles" and m == "insert")
    assert "ia_analisis_id" not in insercion
    assert ("analisis_ia", "update", ({"arbol_id": "id-nuevo"},), {}) in registro
    assert cliente.post("/arboles", json={**CUERPO_ARBOL, "ia_analisis_id": "no-es-uuid"}).status_code == 422


def test_prueba_a_ciegas_y_tablero_de_precision(con_ia):
    assert con_ia.get("/ia/precision").status_code == 403
    assert con_ia.post("/ia/prueba", data={"especie_id": "2"}, files={"general": JPG}).status_code == 403
    con_ia.como("admin")
    assert con_ia.post("/ia/prueba", data={"especie_id": "99"}, files={"general": JPG}).status_code == 404

    r = con_ia.post("/ia/prueba", data={"especie_id": "2"}, files={"general": JPG})
    assert r.status_code == 200
    j = r.json()
    assert j["acierto"] is False and j["especie_sugerida_id"] == 1 and j["especie_real_id"] == 2 and j["costo_usd"] == 0.03
    assert con_ia.post("/ia/prueba", data={"especie_id": "1"}, files={"general": JPG}).json()["acierto"] is True

    # Un análisis de campo enlazado a A2, cuyo registro ya confirmó un docente (I3).
    con_ia.como("est1")
    analisis_id = con_ia.post("/ia/analizar-foto", files={"general": JPG}).json()["analisis_id"]
    router_ia.enlazar_analisis(analisis_id, A2, EST1)
    con_ia.base.tablas["arboles"][1]["especie_id"] = 1
    con_ia.base.tablas["especies_fuente_oficial"] = [{"especie_id": 2, **FICHA_BOSQUE}]

    con_ia.como("admin")
    r = con_ia.get("/ia/precision")
    assert r.status_code == 200
    j = r.json()
    assert j["general"] == {"n": 3, "aciertos": 2, "pct": 66.7, "ic95": reglas.wilson(2, 3)}
    assert j["por_tipo"]["campo"]["aciertos"] == 1 and j["bosque_seco_cesar"]["n"] == 1
    assert j["costo"]["analisis"] == 3 and j["costo"]["por_foto_cop"] == 120 and j["modelo_actual"] == "claude-opus-5-5"
    assert j["confusiones"] == [{"real": "Roble morado", "sugerida": "Mango", "veces": 1}]
    assert con_ia.get("/ia/precision", params={"desde": "2999-01-01"}).json()["costo"]["analisis"] == 0

    con_ia.base.fallar["analisis_ia"] = ("select", "42P01")
    assert con_ia.get("/ia/precision").status_code == 409
    con_ia.base.fallar["analisis_ia"] = ("insert", "42P01")
    assert con_ia.post("/ia/prueba", data={"especie_id": "1"}, files={"general": JPG}).status_code == 409
