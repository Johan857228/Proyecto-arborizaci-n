"""Mapa con capas (migración 011). Usa el Supabase en memoria."""
from datetime import date

import pytest

from routers import mapa as router_mapa
from servicios import mapa as reglas
from tests.test_modulos_api import A1, A2, I1, I2, I3, _arbol, api  # noqa: F401 (api es un fixture)

HOY = date(2026, 10, 18)
SEDES = [
    {"id": "sj", "nombre": "IE San José", "nombre_corto": "San José", "prefijo": "IE001", "lat": 10.46, "lng": -73.25},
    {"id": "la", "nombre": "IE Los Almendros", "nombre_corto": "Los Almendros", "prefijo": "IE002", "lat": 10.48, "lng": -73.26},
]


@pytest.fixture(autouse=True)
def _hoy(monkeypatch):
    monkeypatch.setattr(router_mapa, "hoy", lambda: HOY)


def _mundo_mapa(api):  # noqa: F811
    api.base.tablas["instituciones"] = [dict(s) for s in SEDES]
    api.base.tablas["especies"] = [
        {"id": 1, "nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica"},
        {"id": 2, "nombre_comun": "Roble morado", "nombre_cientifico": "Tabebuia rosea (Bertol.) DC."},
        {"id": 3, "nombre_comun": "Mamón cotoprix", "nombre_cientifico": "Melicoccus oliviformis"},
    ]


# ------------------------------------ Reglas ------------------------------------
@pytest.mark.parametrize(
    ("nombre", "origen"),
    [
        ("Tabebuia rosea (Bertol.) DC.", "nativa"),
        ("  HANDROANTHUS   chrysanthus ", "nativa"),
        ("Mangifera indica L.", "exotica"),
        ("Citrus × sinensis", "exotica"),
        ("Melicoccus oliviformis", None),
        (None, None),
    ],
)
def test_origen_sugerido(nombre, origen):
    assert reglas.origen_sugerido(nombre) == origen


def test_lo_guardado_manda_sobre_la_lista():
    assert reglas.origen_de("Mangifera indica", "nativa") == "nativa"
    assert reglas.origen_de("Mangifera indica", None) == "exotica"
    assert reglas.origen_de("Especie rara", "exotica") == "exotica"
    assert reglas.origen_de("Especie rara", "otra cosa") is None


def test_siembra_reciente_es_plantula_de_los_ultimos_12_meses():
    assert reglas.es_siembra({"etapa": "Plántula", "registrado_en": "2026-03-01T10:00:00+00:00"}, HOY)
    assert reglas.es_siembra({"etapa": "Plántula", "registrado_en": "2025-10-18"}, HOY)
    assert not reglas.es_siembra({"etapa": "Plántula", "registrado_en": "2025-10-17"}, HOY)
    assert not reglas.es_siembra({"etapa": "Adulto", "registrado_en": "2026-09-01"}, HOY)
    assert not reglas.es_siembra({"etapa": "Plántula", "registrado_en": None}, HOY)


def test_capas_cuentan_por_estado_riesgo_origen_y_sede():
    arboles = [
        _arbol("a1", "IE001-0001", "sj", estado="sano"),
        _arbol("a2", "IE001-0002", "sj", estado="critico", zona="Otra", zona_otra="Huerta"),
        _arbol("a3", "IE002-0001", "la", especie_id=2, nombre_comun="Roble morado", nombre_cientifico="Tabebuia rosea",
               etapa="Plántula", registrado_en="2026-08-01T00:00:00+00:00", lat=10.5, lng=-73.3),
        _arbol("a4", "IE002-0002", "la", especie_id=3, nombre_comun="Mamón cotoprix", nombre_cientifico="Melicoccus oliviformis"),
        _arbol("sin_gps", "IE002-0003", "la", lat=None, lng=None),
    ]
    r = reglas.capas(arboles, SEDES, {"a2": "inminente", "a3": "bajo"}, {"a2": "confirmada"}, {"3": "nativa"}, HOY)
    assert [a["codigo"] for a in r["arboles"]] == ["IE001-0001", "IE001-0002", "IE002-0001", "IE002-0002"]
    a2 = r["arboles"][1]
    assert a2["riesgo"] == "inminente" and a2["alerta"] == "confirmada" and a2["zona"] == "Huerta" and a2["origen"] == "exotica"
    assert r["arboles"][2]["siembra"] is True and r["arboles"][3]["origen"] == "nativa"
    resumen = r["resumen"]
    assert resumen["total"] == 4 and resumen["siembras"] == 1 and resumen["alertas"] == 1 and resumen["especies"] == 3
    assert resumen["por_estado"] == {"sano": 1, "riesgo": 2, "critico": 1}
    assert resumen["por_riesgo"] == {"bajo": 1, "medio": 0, "alto": 0, "inminente": 1, "sin_tamizaje": 2}
    assert resumen["por_origen"] == {"nativa": 2, "exotica": 2, "sin_dato": 0} and resumen["pct_nativas"] == 50.0
    assert [(s["id"], s["arboles"], s["alertas"]) for s in r["sedes"]] == [("sj", 2, 1), ("la", 2, 0)]
    assert r["especies"][0] == {"especie_id": 1, "nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica",
                                "origen": "exotica", "origen_sugerido": "exotica", "total": 2}
    assert r["limites"] == {"sur": 10.4638, "oeste": -73.3, "norte": 10.5, "este": -73.254}


def test_sin_arboles_el_encuadre_son_las_sedes():
    r = reglas.capas([], SEDES, {}, {}, {}, HOY)
    assert r["resumen"]["total"] == 0 and r["resumen"]["pct_nativas"] is None
    assert r["limites"] == {"sur": 10.46, "oeste": -73.26, "norte": 10.48, "este": -73.25}


# ------------------------------------ API ------------------------------------
def test_cada_quien_ve_su_institucion(api):  # noqa: F811
    _mundo_mapa(api)
    r = api.get("/mapa", params={"institucion_id": "la"})  # el estudiante no puede elegir otra
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["institucion_id"] == "sj" and [a["id"] for a in datos["arboles"]] == [A1]
    assert [s["id"] for s in datos["sedes"]] == ["sj"] and datos["origen_editable"] is False
    assert datos["arboles"][0]["origen"] == "exotica"

    api.como("admin")
    todas = api.get("/mapa").json()
    assert todas["institucion_id"] is None and {a["id"] for a in todas["arboles"]} == {A1, A2}
    assert [s["id"] for s in todas["sedes"]] == ["sj", "la"] and todas["origen_editable"] is True
    assert [a["id"] for a in api.get("/mapa", params={"institucion_id": "la"}).json()["arboles"]] == [A2]
    assert api.get("/mapa", params={"institucion_id": "zz"}).status_code == 404


def test_riesgo_vigente_y_alertas_abiertas(api):  # noqa: F811
    _mundo_mapa(api)
    api.base.tablas["tamizajes_riesgo"] = [
        {"inspeccion_id": I1, "arbol_id": A1, "categoria": "medio", "creado_en": "2026-09-01T12:00:00+00:00"},
        {"inspeccion_id": I2, "arbol_id": A1, "categoria": "alto", "creado_en": "2026-09-10T12:00:00+00:00"},
        {"inspeccion_id": I3, "arbol_id": A2, "categoria": "bajo", "creado_en": "2026-09-01T12:00:00+00:00"},
    ]
    api.base.tablas["alertas_riesgo"] = [
        {"id": "al1", "arbol_id": A1, "institucion_id": "sj", "estado": "confirmada", "categoria": "alto"},
        {"id": "al2", "arbol_id": A2, "institucion_id": "la", "estado": "atendida", "categoria": "alto"},
    ]
    api.como("admin")
    arboles = {a["id"]: a for a in api.get("/mapa").json()["arboles"]}
    assert (arboles[A1]["riesgo"], arboles[A1]["alerta"]) == ("alto", "confirmada")
    assert (arboles[A2]["riesgo"], arboles[A2]["alerta"]) == ("bajo", None)

    # una inspección anulada no cuenta: queda el tamizaje anterior
    next(i for i in api.base.tablas["inspecciones"] if i["id"] == I2)["estado_revision"] = "anulada"
    assert {a["id"]: a for a in api.get("/mapa").json()["arboles"]}[A1]["riesgo"] == "medio"


def test_muchos_arboles_se_piden_por_lotes(api):  # noqa: F811
    _mundo_mapa(api)
    ids = [f"00000000-0000-0000-0000-{n:012d}" for n in range(1, 251)]
    api.base.tablas["arboles_resumen"] = [_arbol(i, f"IE001-{n:04d}", "sj") for n, i in enumerate(ids, 1)]
    api.base.tablas["tamizajes_riesgo"] = [{"inspeccion_id": f"insp-{i}", "arbol_id": i, "categoria": "alto",
                                            "creado_en": "2026-09-01T12:00:00+00:00"} for i in ids[::50]]
    api.base.llamadas.clear()
    datos = api.get("/mapa").json()
    assert datos["resumen"]["total"] == 250 and datos["resumen"]["por_riesgo"]["alto"] == 5
    assert api.base.llamadas.count(("tamizajes_riesgo", "select")) == 3


def test_clasificar_especie(api):  # noqa: F811
    _mundo_mapa(api)
    assert api.patch("/especies/3", json={"origen": "nativa"}).status_code == 403
    api.como("docente")
    assert api.patch("/especies/3", json={"origen": "nativa"}).status_code == 403

    api.como("admin")
    r = api.patch("/especies/3", json={"origen": "nativa"})
    assert r.status_code == 200, r.text
    assert r.json() == {"id": 3, "nombre_comun": "Mamón cotoprix", "nombre_cientifico": "Melicoccus oliviformis",
                        "origen": "nativa", "origen_guardado": "nativa", "origen_sugerido": None}
    # quitar lo guardado vuelve a la lista del backend
    r = api.patch("/especies/1", json={"origen": None}).json()
    assert (r["origen"], r["origen_guardado"], r["origen_sugerido"]) == ("exotica", None, "exotica")
    assert api.patch("/especies/1", json={"origen": "importada"}).status_code == 422
    assert api.patch("/especies/99", json={"origen": "nativa"}).status_code == 404

    catalogo = {e["id"]: e["origen"] for e in api.get("/catalogos").json()["especies"]}
    assert catalogo == {1: "exotica", 2: "nativa", 3: "nativa"}


def test_sin_la_migracion_011_el_mapa_usa_la_lista(api):  # noqa: F811
    _mundo_mapa(api)
    api.base.fallar["especies"] = ("select", "42703")
    api.como("admin")
    datos = api.get("/mapa").json()
    assert datos["origen_editable"] is False and datos["arboles"][0]["origen"] == "exotica"
    api.base.fallar["especies"] = ("update", "PGRST204")
    r = api.patch("/especies/1", json={"origen": "nativa"})
    assert r.status_code == 409 and "011" in r.json()["detail"]
