"""Guías de clase, ficha en PDF, bitácora de clases (migración 012) y laboratorio de datos."""
import re
from datetime import date

import pytest

from routers import guias as router_guias
from routers import prae as router_prae
from servicios import guias as reglas
from tests.test_modulos_api import A1, A2, C1, C2, _arbol, api  # noqa: F401 (api es un fixture)

HOY = date(2026, 10, 18)


@pytest.fixture(autouse=True)
def _hoy(monkeypatch):
    monkeypatch.setattr(router_guias, "hoy", lambda: HOY)
    monkeypatch.setattr(router_prae, "hoy", lambda: HOY)


def _textos(valor):
    if isinstance(valor, str):
        yield valor
    elif isinstance(valor, dict):
        for v in valor.values():
            yield from _textos(v)
    elif isinstance(valor, list):
        for v in valor:
            yield from _textos(v)


# ------------------------------------ Catálogo ------------------------------------
def test_catalogo_bien_armado():
    ids = [g["id"] for g in reglas.GUIAS]
    assert len(ids) == len(set(ids)) == 10
    for g in reglas.GUIAS:
        assert g["area"] in reglas.AREAS and g["datos"] in reglas.DESCRIPCION_DATOS
        assert g["grados"] and all(0 <= n <= 11 for n in g["grados"])
        assert g["momentos"] and all(m["pasos"] for m in g["momentos"]) and len(g["preguntas"]) >= 3
        # Ciencias se apoya en un DBA; Matemáticas en los Estándares (MEN, 2006)
        assert ("DBA" in g["referente"]) if g["area"] == "ciencias" else ("Estándares" in g["referente"])
        # Todo el texto debe caber en la codificación del PDF (sin π, ≈, ₂…)
        for texto in _textos(g):
            texto.encode("cp1252")
    grados_ciencias = sorted(n for g in reglas.GUIAS if g["area"] == "ciencias" for n in g["grados"])
    assert grados_ciencias == [2, 3, 4, 6, 7, 11]


def test_estadisticas_y_regresion():
    datos = [10.0, 20.0, 30.0, 40.0]
    poblacion = reglas.estadisticas(datos, poblacion=True)
    muestra = reglas.estadisticas(datos, poblacion=False)
    assert (poblacion["media"], poblacion["mediana"], poblacion["rango"]) == (25.0, 25.0, 30.0)
    assert round(poblacion["desviacion"], 4) == 11.1803 and round(muestra["desviacion"], 4) == 12.9099
    assert reglas.estadisticas([], True) is None and reglas.estadisticas([5.0], False)["desviacion"] is None
    r = reglas.regresion([1, 2, 3, 4], [3, 5, 7, 9])
    assert (round(r["a"], 6), round(r["b"], 6), round(r["r"], 6)) == (1.0, 2.0, 1.0)
    assert reglas.regresion([1, 1, 1], [2, 3, 4]) is None


def test_la_ruta_de_campo_no_incluye_arboles_peligrosos():
    arboles = [_arbol(f"a{n}", f"IE001-{n:04d}", "sj", estado="sano") for n in range(1, 13)]
    arboles[0]["estado"] = "critico"
    riesgos = {"a2": "alto", "a3": "inminente", "a4": "medio"}
    tablas, _ = reglas.tablas(reglas.POR_ID["ciclo-de-vida"], arboles, riesgos, {"a5"}, {}, semilla=7)
    ruta = next(t for t in tablas if t["titulo"] == "Ruta de observación")
    codigos = {f[0] for f in ruta["filas"]}
    assert len(codigos) == reglas.RUTA
    assert not codigos & {"IE001-0001", "IE001-0002", "IE001-0003", "IE001-0005"}


def test_la_misma_semilla_da_la_misma_muestra():
    arboles = [_arbol(f"a{n}", f"IE001-{n:04d}", "sj", dap_cm=10 + n, altura_m=3 + n / 4) for n in range(1, 41)]
    guia = reglas.POR_ID["medidas-dap"]
    a, clave_a = reglas.tablas(guia, arboles, {}, set(), {}, semilla=123)
    b, _ = reglas.tablas(guia, arboles, {}, set(), {}, semilla=123)
    c, _ = reglas.tablas(guia, arboles, {}, set(), {}, semilla=124)
    assert a[0]["filas"] == b[0]["filas"] != c[0]["filas"]
    assert len(a[0]["filas"]) == 20 and clave_a["poblacion"] is False and clave_a["dap"]["n"] == 20
    # con menos árboles que el tamaño de la muestra se usan todos: la desviación es poblacional
    _, clave = reglas.tablas(guia, arboles[:8], {}, set(), {}, semilla=1)
    assert clave["poblacion"] is True and clave["dap"]["n"] == 8


# --------------------------------------- API ---------------------------------------
def test_catalogo_y_detalle(api):  # noqa: F811
    todas = api.get("/guias")
    assert todas.status_code == 200, todas.text
    assert len(todas.json()) == 10 and all(g["aplicaciones"] == 0 for g in todas.json())
    assert [g["id"] for g in api.get("/guias", params={"area": "matematicas", "grado": 7}).json()] == ["medidas-dap"]
    detalle = api.get("/guias/carbono").json()
    assert detalle["momentos"][0]["titulo"].startswith("Exploración") and "celular del docente" in detalle["celular"]
    assert detalle["clases"] == [] and detalle["laboratorio"] is None
    assert api.get("/guias/regresion-altura").json()["laboratorio"] == {"variable": "dap_cm", "vista": "dispersion"}
    assert api.get("/guias/no-existe").status_code == 404


def test_bitacora_de_clases(api):  # noqa: F811
    clase = {"guia_id": "carbono", "fecha": "2026-10-15", "curso_id": C1, "asistentes": 32, "notas": "  Salida al patio  "}
    assert api.post("/guias/clases", json=clase).status_code == 403  # estudiante

    api.como("docente")
    r = api.post("/guias/clases", json=clase)
    assert r.status_code == 201, r.text
    creada = r.json()
    assert (creada["institucion_id"], creada["curso_nombre"], creada["docente_nombre"], creada["notas"]) == ("sj", "10-A", "Docente", "Salida al patio")
    assert creada["puede_borrar"] is True and creada["guia_titulo"] == reglas.POR_ID["carbono"]["titulo"]
    assert api.post("/guias/clases", json={**clase, "curso_id": C2}).status_code == 422  # curso de otra institución
    assert api.post("/guias/clases", json={**clase, "fecha": "2026-10-19"}).status_code == 422
    assert api.post("/guias/clases", json={**clase, "guia_id": "no-existe"}).status_code == 404
    assert api.post("/guias/clases", json={**clase, "asistentes": 0}).status_code == 422

    # la docente de otra institución registra en la suya y no puede borrar la clase ajena
    api.como("docente_la")
    assert api.post("/guias/clases", json={**clase, "curso_id": C2, "institucion_id": "sj"}).json()["institucion_id"] == "la"
    assert api.delete(f"/guias/clases/{creada['id']}").status_code == 403

    api.como("est1")  # todos en la institución ven la bitácora y el conteo por guía
    bitacora = api.get("/guias/clases").json()
    assert [c["id"] for c in bitacora] == [creada["id"]] and bitacora[0]["puede_borrar"] is False
    assert next(g for g in api.get("/guias").json() if g["id"] == "carbono")["aplicaciones"] == 1
    assert api.get("/guias/carbono").json()["clases"][0]["asistentes"] == 32

    api.como("docente")
    assert api.delete(f"/guias/clases/{creada['id']}").status_code == 204
    assert api.get("/guias/clases").json() == []


def test_sin_la_migracion_012(api):  # noqa: F811
    api.base.fallar["clases_guia"] = ("select", "PGRST205")
    assert api.get("/guias/clases").json() == [] and api.get("/guias").status_code == 200
    api.base.fallar["clases_guia"] = ("insert", "42P01")
    api.como("docente")
    r = api.post("/guias/clases", json={"guia_id": "carbono", "fecha": "2026-10-15"})
    assert r.status_code == 409 and "012" in r.json()["detail"]


def test_ficha_en_pdf(api):  # noqa: F811
    api.base.tablas["arboles_resumen"] += [_arbol(f"00000000-0000-0000-0000-{n:012d}", f"IE001-{n + 1:04d}", "sj",
                                                  dap_cm=10 + n, altura_m=3 + n / 3) for n in range(1, 30)]
    assert api.post("/guias/medidas-dap/ficha", json={}).status_code == 403  # estudiante

    api.como("docente")
    r = api.post("/guias/medidas-dap/ficha", json={"curso_id": C1, "semilla": 42})
    assert r.status_code == 200, r.text
    assert r.json()["semilla"] == 42 and r.json()["nombre"] == "ficha-medidas-dap-2026-10-18.pdf"
    pdf = api.base.archivos[f"guias/{api.base.tablas['perfiles'][1]['usuario_id']}/medidas-dap.pdf"]
    assert pdf.startswith(b"%PDF") and int(re.search(rb"/Count (\d+)", pdf).group(1)) >= 3  # docente, estudiante y clave
    for texto in ("Para el docente", "Ficha del estudiante", "Clave para el docente", "MUESTRA DE 20", "Curso 10-A"):
        assert texto.encode("cp1252") in pdf, texto
    assert api.post("/guias/medidas-dap/ficha", json={"curso_id": C2}).status_code == 422

    # una guía de Ciencias no trae clave de respuestas
    api.post("/guias/clave-dicotomica/ficha", json={})
    sin_clave = api.base.archivos[f"guias/{api.base.tablas['perfiles'][1]['usuario_id']}/clave-dicotomica.pdf"]
    assert "Ficha del estudiante".encode("cp1252") in sin_clave and b"Clave para el docente" not in sin_clave


def test_laboratorio(api):  # noqa: F811
    r = api.get("/laboratorio/datos", params={"institucion_id": "la"})  # el estudiante ve solo la suya
    assert r.status_code == 200, r.text
    assert r.json()["institucion_id"] == "sj" and [a["id"] for a in r.json()["arboles"]] == [A1]
    assert set(r.json()["arboles"][0]) >= {"especie", "dap_cm", "altura_m", "zona"}
    assert "registrado_por" not in r.json()["arboles"][0]
    api.como("admin")
    assert [a["id"] for a in api.get("/laboratorio/datos", params={"institucion_id": "la"}).json()["arboles"]] == [A2]
    assert {a["id"] for a in api.get("/laboratorio/datos").json()["arboles"]} == {A1}  # la propia por defecto


def test_las_clases_cuentan_en_los_indicadores_del_prae(api):  # noqa: F811
    api.como("docente")
    p = api.post("/prae", json={"institucion_id": "sj", "anio": 2026, "tema": "arbolado", "titulo": "Cuidemos el arbolado",
                                "problema": "Hay árboles enfermos y no sabemos cuáles."}).json()
    for guia, asistentes in (("carbono", 30), ("carbono", 28), ("medidas-dap", None)):
        api.post("/guias/clases", json={"guia_id": guia, "fecha": "2026-09-01", "asistentes": asistentes})
    api.post("/guias/clases", json={"guia_id": "carbono", "fecha": "2025-11-01"})  # otro año
    ind = api.get(f"/prae/{p['id']}/indicadores").json()
    assert ind["pedagogia"] == {"clases": 3, "guias": 2, "asistentes": 58}
