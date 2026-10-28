"""Tablero territorial e informe anual de la Secretaría (migración 014). Usa el Supabase en memoria."""
import io
import json
import zipfile
from datetime import date
from xml.dom import minidom

import pytest

import main
from auth import Sesion, usuario_actual
from routers import prae as router_prae
from routers import siembras as router_siembras
from routers import territorial as router_territorial
from servicios import territorial as reglas
from tests.test_modulos_api import api  # noqa: F401 (api es un fixture)

HOY = date(2026, 10, 18)
TERR = "00000000-0000-0000-0000-0000000000f1"
PRAE = {"anio": 2026, "tema": "arbolado", "titulo": "Cuidemos el arbolado", "problema": "Hay árboles enfermos y no sabemos cuáles."}
EVALUACION = {"fecha": "2026-10-10", "logros": "Se sembraron 20 plántulas nativas"}


@pytest.fixture(autouse=True)
def _hoy(monkeypatch):
    for modulo in (router_territorial, router_prae, router_siembras):
        monkeypatch.setattr(modulo, "hoy", lambda: HOY)


def _preparar(api):  # noqa: F811
    api.base.tablas["instituciones"][0].update({"divipola": "20001", "municipio": "Valledupar", "codigo_dane": "120001000001"})
    api.base.tablas["instituciones"][1].update({"divipola": "20011", "municipio": "Aguachica"})
    funcionario = {"usuario_id": TERR, "nombre": "Funcionaria Secretaría", "correo": "secretaria@ejemplo.test", "rol": "territorial",
                   "institucion_id": None, "curso_id": None, "activo": True}
    api.base.tablas["perfiles"].append(funcionario)


def _como_funcionario():
    main.app.dependency_overrides[usuario_actual] = lambda: Sesion(token="terr", user_id=TERR, email="secretaria@ejemplo.test")


def _territorio(api, **cambios):  # noqa: F811
    api.como("admin")
    r = api.post("/territorial/territorios", json={"nombre": "Secretaría de Educación de Valledupar", "divipolas": ["20001"],
                                                    "institucion_ids": ["la"], **cambios})
    assert r.status_code == 201, r.text
    return r.json()


# ------------------------------------ Reglas ------------------------------------
def test_semaforo_y_totales():
    assert reglas.semaforo(None) == "rojo"
    assert reglas.semaforo({"estado": "evaluacion_parcial"}) == "amarillo"
    assert reglas.semaforo({"estado": "evaluado"}) == "verde"
    filas = [
        {"semaforo": "verde", "siembras": {"jornadas": 1, "sembradas": 10, "nativas": 9, "clasificadas": 10, "evaluadas": 10, "vivas": 8, "asistentes": 12},
         "clases": {"clases": 3, "asistentes": 90}, "servicio_social": {"estudiantes": 40, "horas_aprobadas": 120.5}, "arboles": {"total": 50}, "inspectores": 7},
        {"semaforo": "rojo", "siembras": {"jornadas": 1, "sembradas": 30, "nativas": 6, "clasificadas": 20, "evaluadas": 10, "vivas": 5, "asistentes": 3},
         "clases": None, "servicio_social": None, "arboles": {"total": 5}, "inspectores": None},
    ]
    t = reglas.totales(filas)
    # los porcentajes salen de las cifras sumadas, no del promedio de porcentajes
    assert (t["sembradas"], t["pct_nativas"], t["supervivencia_pct"]) == (40, 50.0, 65.0)
    assert t["semaforo"] == {"verde": 1, "amarillo": 0, "rojo": 1}
    assert (t["clases"], t["estudiantes_en_clases"], t["horas_servicio"], t["arboles"], t["inspectores"]) == (3, 90, 120.5, 55, 7)


# --------------------------------------- API ---------------------------------------
def test_territorios_y_permisos(api):  # noqa: F811
    _preparar(api)
    api.como("docente")
    assert api.get("/territorial/tablero").status_code == 403
    assert api.post("/territorial/territorios", json={"nombre": "Otra"}).status_code == 403
    _como_funcionario()
    r = api.get("/territorial/tablero")
    assert r.status_code == 422 and "no tiene un territorio" in r.json()["detail"]

    t = _territorio(api)
    assert t["instituciones"] == 2 and t["divipolas"] == ["20001"]
    assert api.post("/territorial/territorios", json={"nombre": "Mal", "divipolas": ["2001"]}).status_code == 422
    assert api.post("/territorial/territorios", json={"nombre": "Mal", "institucion_ids": ["zz"]}).status_code == 422
    url = f"/territorial/territorios/{t['id']}/miembros"
    assert api.put(url, json={"usuario_ids": [api.base.tablas["perfiles"][3]["usuario_id"]]}).status_code == 422  # un estudiante
    r = api.put(url, json={"usuario_ids": [TERR]})
    assert r.status_code == 200 and [m["nombre"] for m in r.json()["miembros"]] == ["Funcionaria Secretaría"]
    otro = _territorio(api, nombre="Corpocesar", tipo="autoridad_ambiental", divipolas=["20011"], institucion_ids=[])

    _como_funcionario()
    mios = api.get("/territorial/territorios").json()
    assert [x["nombre"] for x in mios] == ["Secretaría de Educación de Valledupar"] and mios[0]["miembros"] == []
    assert api.get("/territorial/tablero", params={"territorio_id": otro["id"]}).status_code == 403
    assert api.patch(f"/territorial/territorios/{t['id']}", json={"nombre": "Cambio"}).status_code == 403


def test_tablero_con_semaforo_y_sin_datos_personales(api):  # noqa: F811
    _preparar(api)
    t = _territorio(api)
    api.put(f"/territorial/territorios/{t['id']}/miembros", json={"usuario_ids": [TERR]})
    api.como("docente")
    p = api.post("/prae", json={**PRAE, "institucion_id": "sj"}).json()
    for instancia in ("consejo_directivo", "secretaria"):
        assert api.post(f"/prae/{p['id']}/evaluaciones", json={**EVALUACION, "instancia": instancia}).status_code == 201
    api.post("/guias/clases", json={"guia_id": "carbono", "fecha": "2026-09-01", "asistentes": 30})

    _como_funcionario()
    r = api.get("/territorial/tablero")
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["territorio"] == "Secretaría de Educación de Valledupar" and datos["anio"] == 2026
    filas = {f["id"]: f for f in datos["instituciones"]}
    assert (filas["sj"]["semaforo"], filas["la"]["semaforo"]) == ("verde", "rojo")
    assert [f["id"] for f in datos["instituciones"]] == ["la", "sj"]  # primero los que necesitan atención
    assert filas["sj"]["prae"]["estado"] == "evaluado" and filas["sj"]["codigo_dane"] == "120001000001"
    assert filas["sj"]["clases"] == {"clases": 1, "guias": 1, "asistentes": 30}
    assert filas["sj"]["arboles"]["total"] == 1 and filas["sj"]["inspectores"] >= 1
    assert datos["totales"]["semaforo"] == {"verde": 1, "amarillo": 0, "rojo": 1}
    texto = json.dumps(datos, ensure_ascii=False)
    assert "Laura" not in texto and "Mateo" not in texto  # sin nombres de estudiantes

    api.como("docente_la")  # la otra institución: PRAE con solo una evaluación -> amarillo
    p2 = api.post("/prae", json={**PRAE, "institucion_id": "la"}).json()
    api.post(f"/prae/{p2['id']}/evaluaciones", json={**EVALUACION, "instancia": "consejo_directivo"})
    _como_funcionario()
    fila_la = next(f for f in api.get("/territorial/tablero").json()["instituciones"] if f["id"] == "la")
    assert fila_la["semaforo"] == "amarillo" and fila_la["prae"]["evaluaciones_faltantes"] == ["secretaria"]

    api.como("admin")  # el administrador puede ver todas las instituciones
    todas = api.get("/territorial/tablero").json()
    assert todas["territorio"] == "Todas las instituciones" and len(todas["instituciones"]) == 2


def test_informe_editable_en_pdf_y_word(api):  # noqa: F811
    _preparar(api)
    t = _territorio(api)
    api.put(f"/territorial/territorios/{t['id']}/miembros", json={"usuario_ids": [TERR]})
    _como_funcionario()
    vacio = api.get("/territorial/informe", params={"territorio_id": t["id"], "anio": 2026}).json()
    assert vacio["secciones"] == {} and vacio["estado"] == "borrador" and vacio["titulos"]["logros"] == "Logros"

    cuerpo = {"territorio_id": t["id"], "anio": 2026, "secciones": {"presentacion": "  Informe de prueba de la Secretaría.  ",
                                                                      "logros": "Más colegios con PRAE evaluado.\nPrimera jornada oficial."}}
    r = api.put("/territorial/informe", json=cuerpo)
    assert r.status_code == 200, r.text
    assert r.json()["secciones"]["presentacion"] == "Informe de prueba de la Secretaría."
    assert api.put("/territorial/informe", json={**cuerpo, "secciones": {"otra": "x"}}).status_code == 422
    assert api.put("/territorial/informe", json={**cuerpo, "secciones": {"logros": "x" * 6001}}).status_code == 422

    r = api.post("/territorial/informe/archivo", json={"territorio_id": t["id"], "anio": 2026, "formato": "pdf"})
    assert r.status_code == 200, r.text
    assert r.json()["nombre"] == "informe-prae-2026.pdf"
    pdf = api.base.archivos[f"territorial/{t['id']}/2026/informe-prae-2026.pdf"]
    for texto in ("Informe anual de los PRAE 2026", "Informe de prueba de la Secretaría.", "Primera jornada oficial.", "no lo han registrado"):
        assert texto.encode("cp1252") in pdf, texto

    r = api.post("/territorial/informe/archivo", json={"territorio_id": t["id"], "anio": 2026, "formato": "docx"})
    assert r.status_code == 200 and r.json()["nombre"] == "informe-prae-2026.docx"
    with zipfile.ZipFile(io.BytesIO(api.base.archivos[f"territorial/{t['id']}/2026/informe-prae-2026.docx"])) as z:
        assert {"[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"} <= set(z.namelist())
        documento = z.read("word/document.xml").decode("utf-8")
    minidom.parseString(documento)  # XML bien formado
    assert "Informe de prueba de la Secretaría." in documento and "[Escriba aquí: dificultades]" in documento
    assert "IE San José" in documento
