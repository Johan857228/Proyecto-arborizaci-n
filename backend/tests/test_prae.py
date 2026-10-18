"""PRAE digital con evaluación anual (migración 010). Usa el Supabase en memoria."""
from datetime import date

import pytest

from routers import prae as router_prae
from servicios import prae as reglas
from tests.test_modulos_api import api  # noqa: F401 (fixture)

HOY = date(2026, 10, 18)
JPG = ("f.jpg", b"\xff\xd8\xff\xe0abc", "image/jpeg")
NUEVO = {"institucion_id": "sj", "anio": 2026, "tema": "residuos", "titulo": "Colegio sin plástico de un solo uso",
         "problema": "El patio y las canchas se llenan de empaques plásticos después del descanso."}


@pytest.fixture(autouse=True)
def _hoy_fijo(monkeypatch):
    monkeypatch.setattr(router_prae, "hoy", lambda: HOY)


def _crear(api, **cambios):  # noqa: F811
    api.como("docente")
    r = api.post("/prae", json={**NUEVO, **cambios})
    assert r.status_code == 201, r.text
    return r.json()


# ------------------------------------ Reglas ------------------------------------
def test_estado_del_expediente():
    accion = [{"estado": "pendiente"}]
    assert reglas.estado([], []) == "formulacion"
    assert reglas.estado(accion, []) == "en_ejecucion"
    assert reglas.estado(accion, [{"instancia": "comite"}]) == "en_ejecucion"
    assert reglas.estado(accion, [{"instancia": "consejo_directivo"}]) == "evaluacion_parcial"
    assert reglas.estado([], [{"instancia": "secretaria"}, {"instancia": "consejo_directivo"}]) == "evaluado"


def test_resumen_de_acciones():
    acciones = [{"estado": e} for e in ("cumplida", "cumplida", "pendiente", "cancelada")]
    assert reglas.resumen_acciones(acciones) == {"total": 4, "pendiente": 1, "en_curso": 0, "cumplida": 2, "cancelada": 1, "pct_cumplidas": 66.7}
    assert reglas.resumen_acciones([])["pct_cumplidas"] is None
    assert reglas.tema_texto({"tema": "otro", "tema_otro": "Huerta escolar"}) == "Huerta escolar"
    assert reglas.tema_texto({"tema": "agua"}) == "Agua"


# ----------------------------------- Expediente -----------------------------------
def test_crear_y_permisos(api):  # noqa: F811
    assert api.post("/prae", json=NUEVO).status_code == 403  # estudiante
    api.como("docente_la")
    assert api.post("/prae", json=NUEVO).status_code == 403  # otra institución
    p = _crear(api)
    assert p["estado"] == "formulacion" and p["evaluaciones_faltantes"] == ["consejo_directivo", "secretaria"] and p["puede_editar"]
    assert api.post("/prae", json=NUEVO).status_code == 409
    assert api.post("/prae", json={**NUEVO, "anio": 2030}).status_code == 422
    assert api.post("/prae", json={**NUEVO, "anio": 2027, "tema": "otro"}).status_code == 422
    assert api.post("/prae", json={**NUEVO, "anio": 2027, "titulo": "Eco"}).status_code == 422

    api.como("est1")
    visto = api.get("/prae").json()
    assert visto["id"] == p["id"] and visto["puede_editar"] is False
    assert api.get("/prae?anio=2025").json() is None
    assert api.patch(f"/prae/{p['id']}", json={"diagnostico": "x"}).status_code == 403
    api.como("docente_la")
    assert api.get("/prae?institucion_id=sj").status_code == 403


def test_editar_expediente(api):  # noqa: F811
    p = _crear(api)
    r = api.patch(f"/prae/{p['id']}", json={
        "diagnostico": "Encuesta a 120 estudiantes: el 70 % usa vasos desechables.",
        "objetivo_general": "Reducir a la mitad los plásticos de un solo uso en 2026.",
        "objetivos_especificos": ["Instalar puntos de reciclaje", "  ", "Campaña de termos"],
        "comite": "Coordinación: docente de Ciencias. Representantes de 6.° a 11.°.",
    })
    assert r.status_code == 200, r.text
    assert r.json()["objetivos_especificos"] == ["Instalar puntos de reciclaje", "Campaña de termos"]
    assert api.patch(f"/prae/{p['id']}", json={"titulo": "  "}).status_code == 422
    assert api.patch(f"/prae/{p['id']}", json={"tema": "otro"}).status_code == 422
    assert api.patch(f"/prae/{p['id']}", json={"tema": "otro", "tema_otro": "Huerta escolar"}).json()["tema_otro"] == "Huerta escolar"
    assert api.patch(f"/prae/{p['id']}", json={"tema": "agua"}).json()["tema_otro"] is None
    assert api.patch(f"/prae/{p['id']}", json={}).status_code == 422


# ---------------------------------- Plan de acción ----------------------------------
def test_plan_de_accion(api):  # noqa: F811
    p = _crear(api)
    url = f"/prae/{p['id']}/acciones"
    a1 = api.post(url, json={"titulo": "Puntos de reciclaje", "responsable": "Grado 10-A", "fecha_inicio": "2026-03-01",
                             "fecha_fin": "2026-05-30", "indicador": "Kg de plástico recogido", "meta": "200 kg"}).json()
    assert a1["vencida"] is True  # pendiente y la fecha final ya pasó
    a2 = api.post(url, json={"titulo": "Campaña de termos", "fecha_fin": "2026-11-30"}).json()
    assert a2["vencida"] is False
    assert api.post(url, json={"titulo": "Mal", "fecha_inicio": "2026-05-01", "fecha_fin": "2026-04-01"}).status_code == 422
    assert api.patch(f"/prae/acciones/{a1['id']}", json={"fecha_fin": "2026-02-01"}).status_code == 422
    cumplida = api.patch(f"/prae/acciones/{a1['id']}", json={"estado": "cumplida"}).json()
    assert cumplida["estado"] == "cumplida" and cumplida["vencida"] is False

    expediente = api.get("/prae").json()
    assert expediente["estado"] == "en_ejecucion"
    assert [a["titulo"] for a in expediente["acciones"]] == ["Puntos de reciclaje", "Campaña de termos"]
    assert expediente["resumen_acciones"]["pct_cumplidas"] == 50
    assert api.delete(f"/prae/acciones/{a2['id']}").status_code == 204
    assert len(api.get("/prae").json()["acciones"]) == 1
    api.como("est1")
    assert api.post(url, json={"titulo": "Desde un estudiante"}).status_code == 403


# ------------------------------------ Evidencias ------------------------------------
def test_evidencias(api):  # noqa: F811
    p = _crear(api)
    otro = _crear(api, anio=2027)
    accion = api.post(f"/prae/{otro['id']}/acciones", json={"titulo": "De otro año"}).json()
    url = f"/prae/{p['id']}/evidencias"
    assert api.post(url, json={"tipo": "nota", "titulo": "Acta", "fecha": "2026-10-19"}).status_code == 422  # futura
    assert api.post(url, json={"tipo": "enlace", "titulo": "Video", "fecha": "2026-10-01", "url": "http://x.co"}).status_code == 422
    assert api.post(url, json={"tipo": "nota", "titulo": "Nota", "fecha": "2026-10-01", "accion_id": accion["id"]}).status_code == 422
    enlace = api.post(url, json={"tipo": "enlace", "titulo": "Video de la jornada", "fecha": "2026-09-20", "url": "https://video.ejemplo.co/1"})
    assert enlace.status_code == 201 and enlace.json()["url"] == "https://video.ejemplo.co/1"
    foto = api.post(url, json={"tipo": "foto", "titulo": "Punto de reciclaje", "fecha": "2026-09-21", "url": "https://ignorada"}).json()
    assert foto["url"] is None
    assert api.post(f"/prae/evidencias/{enlace.json()['id']}/foto", files={"archivo": JPG}).status_code == 409
    con_foto = api.post(f"/prae/evidencias/{foto['id']}/foto", files={"archivo": JPG})
    assert con_foto.status_code == 200 and con_foto.json()["foto_url"].startswith("https://memoria/prae/sj/2026/")
    assert len(api.base.archivos) == 1
    assert api.delete(f"/prae/evidencias/{foto['id']}").status_code == 204
    assert api.base.archivos == {}
    assert len(api.get("/prae").json()["evidencias"]) == 1


# ----------------------------------- Evaluaciones -----------------------------------
def test_evaluaciones_y_estado(api):  # noqa: F811
    p = _crear(api)
    url = f"/prae/{p['id']}/evaluaciones"
    assert api.post(url, json={"instancia": "consejo_directivo", "fecha": "2026-10-01"}).status_code == 422  # sin contenido
    assert api.post(url, json={"instancia": "secretaria", "fecha": "2026-11-01", "logros": "x"}).status_code == 422  # futura
    consejo = api.post(url, json={"instancia": "consejo_directivo", "fecha": "2026-10-10", "acta": "015", "cumplimiento_pct": 70,
                                  "logros": "Se instalaron 4 puntos de reciclaje"})
    assert consejo.status_code == 201
    r = api.get("/prae").json()
    assert r["estado"] == "evaluacion_parcial" and r["evaluaciones_faltantes"] == ["secretaria"]
    api.post(url, json={"instancia": "secretaria", "fecha": "2026-10-15", "recomendaciones": "Medir el peso recogido cada mes"})
    assert api.get("/prae").json()["estado"] == "evaluado"
    assert [a["estado"] for a in api.get("/prae/anios").json()] == ["evaluado"]
    assert api.delete(f"/prae/evaluaciones/{consejo.json()['id']}").status_code == 204
    assert api.get("/prae").json()["estado"] == "evaluacion_parcial"


# ------------------------------- Indicadores e informe -------------------------------
def test_indicadores_e_informe(api):  # noqa: F811
    p = _crear(api)
    api.post(f"/prae/{p['id']}/acciones", json={"titulo": "Puntos de reciclaje", "responsable": "Grado 10-A", "estado": "cumplida"})
    api.post(f"/prae/{p['id']}/evidencias", json={"tipo": "nota", "titulo": "Jornada de limpieza", "fecha": "2026-09-01"})

    api.como("est1")  # cualquier persona de la institución puede ver los indicadores y el informe
    ind = api.get(f"/prae/{p['id']}/indicadores").json()
    assert ind["periodo"] == {"desde": "2026-01-01", "hasta": "2026-10-18"}
    assert ind["arbolado"]["total_arboles"] == 1  # solo los árboles de San José
    assert ind["arbolado"]["participantes"] >= 1
    assert ind["servicio_social"]["estudiantes"] == 1 and ind["alertas"]["total"] == 0

    r = api.post(f"/prae/{p['id']}/informe")
    assert r.status_code == 200 and r.json()["nombre"] == "informe-prae-2026.pdf"
    pdf = api.base.archivos["prae/sj/2026/informe-prae-2026.pdf"]
    assert pdf.startswith(b"%PDF-1.4") and b"Colegio sin pl\xe1stico" in pdf
    assert "Falta registrar la evaluación de: Consejo directivo y Secretaría de Educación".encode("cp1252") in pdf
    assert b"Puntos de reciclaje" in pdf and b"Jornada de limpieza" in pdf
    # estructura: cada entrada del xref apunta a su objeto
    inicio = int(pdf.rsplit(b"startxref\n", 1)[1].split(b"\n")[0])
    filas = pdf[inicio:].split(b"\n")
    total = int(filas[1].split()[1])
    for numero, fila in enumerate(filas[3:2 + total], start=1):
        assert pdf[int(fila[:10]):].startswith(f"{numero} 0 obj".encode())
    api.como("docente_la")
    assert api.post(f"/prae/{p['id']}/informe").status_code == 403


def test_informe_de_varias_paginas():
    acciones = [{"id": str(i), "titulo": f"Acción número {i} con un nombre largo para ocupar espacio", "estado": "pendiente",
                 "responsable": "Comité ambiental", "fecha_inicio": "2026-02-01", "fecha_fin": "2026-11-30"} for i in range(60)]
    pdf = reglas.informe_pdf(
        {"anio": 2026, "titulo": "PRAE largo", "tema": "agua", "problema": "Fugas en los baños. " * 30, "objetivos_especificos": ["A", "B"]},
        {"nombre": "IE (San José)"}, acciones, [], [], {"arbolado": {}}, date(2026, 10, 18),
    )
    paginas = pdf.count(b"/Type /Page /Parent")
    assert paginas >= 3
    assert f"Página {paginas} de {paginas}".encode("cp1252") in pdf
    assert b"IE \\(San Jos\xe9\\)" in pdf


# -------------------------------------- Copiar --------------------------------------
def test_copiar_al_anio_siguiente(api):  # noqa: F811
    p = _crear(api)
    api.patch(f"/prae/{p['id']}", json={"objetivo_general": "Reducir plásticos", "objetivos_especificos": ["Reciclar"]})
    api.post(f"/prae/{p['id']}/acciones", json={"titulo": "Puntos de reciclaje", "fecha_inicio": "2026-03-01", "fecha_fin": "2026-05-30", "estado": "cumplida"})
    api.post(f"/prae/{p['id']}/acciones", json={"titulo": "Descartada", "estado": "cancelada"})
    api.post(f"/prae/{p['id']}/evaluaciones", json={"instancia": "comite", "fecha": "2026-10-01", "logros": "Bien"})

    assert api.post(f"/prae/{p['id']}/copiar", json={"anio": 2026}).status_code == 422
    assert api.post(f"/prae/{p['id']}/copiar", json={"anio": 2030}).status_code == 422
    nuevo = api.post(f"/prae/{p['id']}/copiar", json={"anio": 2027})
    assert nuevo.status_code == 201, nuevo.text
    n = nuevo.json()
    assert n["anio"] == 2027 and n["objetivo_general"] == "Reducir plásticos" and n["evaluaciones"] == [] and n["evidencias"] == []
    assert [(a["titulo"], a["estado"], a["fecha_inicio"], a["fecha_fin"]) for a in n["acciones"]] == [
        ("Puntos de reciclaje", "pendiente", "2027-03-01", "2027-05-30")]
    assert api.post(f"/prae/{p['id']}/copiar", json={"anio": 2027}).status_code == 409
    assert [a["anio"] for a in api.get("/prae/anios").json()] == [2027, 2026]
