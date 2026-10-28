"""Siembras con seguimiento de supervivencia (migración 013). Usa el Supabase en memoria."""
import json
from datetime import date

import pytest

from routers import prae as router_prae
from routers import siembras as router_siembras
from servicios import siembras as reglas
from tests.test_modulos_api import C1, C2, USUARIOS, api  # noqa: F401 (api es un fixture)

HOY = date(2026, 10, 18)
EST1, EST2, DOCENTE = USUARIOS["est1"][0], USUARIOS["est2"][0], USUARIOS["docente"][0]
JORNADA = {"nombre": "Día del Árbol 2026", "fecha": "2026-04-29", "lugar": "Lote junto a la cancha", "organizador": "alcaldia",
           "oficial": True, "area_de_vida": "Ronda del río Guatapurí"}
PLANTA = {"especie_id": 2, "lat": 10.4641, "lng": -73.2562, "precision_gps_m": 4, "vivero": "Vivero municipal",
          "vivero_registro_ica": "ICA-123", "altura_inicial_cm": 40, "padrino_tipo": "curso", "padrino_curso_id": C1}


@pytest.fixture(autouse=True)
def _hoy(monkeypatch):
    monkeypatch.setattr(router_siembras, "hoy", lambda: HOY)
    monkeypatch.setattr(router_prae, "hoy", lambda: HOY)


def _preparar(api):  # noqa: F811
    api.base.tablas["especies"] = [
        {"id": 1, "nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica"},
        {"id": 2, "nombre_comun": "Roble morado", "nombre_cientifico": "Tabebuia rosea"},
    ]
    api.como("docente")
    r = api.post("/siembras/jornadas", json=JORNADA)
    assert r.status_code == 201, r.text
    return r.json()


def _planta(api, jornada, **cambios):  # noqa: F811
    r = api.post(f"/siembras/jornadas/{jornada['id']}/plantas", json={**PLANTA, **cambios})
    assert r.status_code == 201, r.text
    return r.json()


def _s(fecha="2026-01-10", id_="s1"):
    return {"id": id_, "jornada_id": "j1", "institucion_id": "sj", "fecha": fecha}


def _c(hito, estado, fecha, id_="c"):
    return {"id": id_, "hito_meses": hito, "estado": estado, "fecha": fecha}


# ------------------------------------ Reglas ------------------------------------
def test_sumar_meses():
    assert reglas.sumar_meses(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert reglas.sumar_meses(date(2027, 11, 30), 3) == date(2028, 2, 29)
    assert reglas.sumar_meses(date(2026, 4, 29), 24) == date(2028, 4, 29)


def test_siguiente_control_y_su_ventana():
    s = _s("2026-07-01")  # hito de 3 meses: 1 de octubre
    assert reglas.siguiente_control(s, [], date(2026, 9, 15))["estado"] == "proximo"
    assert reglas.siguiente_control(s, [], date(2026, 9, 16))["estado"] == "pendiente"  # 15 días antes
    assert reglas.siguiente_control(s, [], date(2026, 10, 31))["estado"] == "pendiente"  # 30 días después
    vencido = reglas.siguiente_control(s, [], date(2026, 11, 1))
    assert vencido == {"hito_meses": 3, "fecha": date(2026, 10, 1), "estado": "vencido"}
    hecho = [_c(3, "viva_buena", "2026-10-02")]
    assert reglas.siguiente_control(s, hecho, date(2026, 11, 1))["hito_meses"] == 6
    assert reglas.siguiente_control(s, [_c(3, "muerta", "2026-10-02")], date(2026, 11, 1)) is None
    todos = [_c(h, "viva_buena", "2028-07-01", id_=str(h)) for h in reglas.HITOS]
    assert reglas.siguiente_control(s, todos, date(2028, 7, 2)) is None


def test_supervivencia_por_cohorte():
    hoy = date(2027, 1, 20)  # las sembradas el 10 de enero de 2026 ya pasaron los 12 meses
    siembras = [_s(id_="viva"), _s(id_="murio6"), _s(id_="sin6"), _s("2026-12-01", "nueva")]
    controles = {
        "viva": [_c(3, "viva_buena", "2026-04-10"), _c(6, "viva_regular", "2026-07-10"), _c(12, "viva_buena", "2027-01-11")],
        "murio6": [_c(3, "viva_buena", "2026-04-10"), _c(6, "muerta", "2026-07-12")],
        "sin6": [_c(3, "viva_buena", "2026-04-12")],
    }
    r = reglas.resumen(siembras, controles, {"viva": "nativa", "murio6": "nativa", "sin6": "exotica"}, hoy)
    assert (r["sembradas"], r["evaluadas"], r["vivas"], r["muertas"], r["supervivencia_pct"]) == (4, 3, 2, 1, 66.7)
    assert r["pct_nativas"] == 66.7
    hitos = {h["hito_meses"]: h for h in r["por_hito"]}
    assert (hitos[3]["debidas"], hitos[3]["conocidas"], hitos[3]["vivas"]) == (3, 3, 3)
    # a los 6 meses: viva sigue, murio6 murió y sin6 no tiene control -> pendiente
    assert (hitos[6]["conocidas"], hitos[6]["vivas"], hitos[6]["pendientes"], hitos[6]["supervivencia_pct"]) == (2, 1, 1, 50.0)
    # a los 12: murio6 cuenta como muerta aunque nadie la volvió a controlar
    assert (hitos[12]["conocidas"], hitos[12]["vivas"], hitos[12]["pendientes"]) == (2, 1, 1)
    assert hitos[24]["debidas"] == 0 and hitos[24]["supervivencia_pct"] is None
    assert r["controles_vencidos"] == 1  # sin6 no tuvo su control de 6 meses


# --------------------------------------- API ---------------------------------------
def test_jornadas_y_plantulas(api):  # noqa: F811
    api.como("est1")
    assert api.post("/siembras/jornadas", json=JORNADA).status_code == 403
    jornada = _preparar(api)
    assert jornada["oficial"] is True and jornada["resumen"]["sembradas"] == 0 and jornada["puede_editar"] is True
    assert api.post("/siembras/jornadas", json={**JORNADA, "fecha": "2028-01-01"}).status_code == 422

    planta = _planta(api, jornada)
    assert planta["especie"] == "Roble morado" and planta["origen"] == "nativa" and planta["padrino"] == "10-A"
    assert planta["fecha"] == "2026-04-29" and planta["estado"] == "sin_control"
    # sembrada el 29 de abril: el control de 3 meses (29 de julio) ya venció
    assert planta["siguiente"] == {"hito_meses": 3, "fecha": "2026-07-29", "estado": "vencido"}
    # padrino estudiante: el nombre escrito se descarta; para el docente se ve el nombre real
    con_estudiante = _planta(api, jornada, padrino_tipo="estudiante", padrino_usuario_id=EST1, padrino_curso_id=None, padrino_nombre="Laura Gómez")
    assert con_estudiante["padrino"] == "Laura"
    assert api.base.tablas["siembras"][-1]["padrino_nombre"] is None
    url = f"/siembras/jornadas/{jornada['id']}/plantas"
    assert api.post(url, json={**PLANTA, "fecha": "2026-10-19"}).status_code == 422  # futura
    assert api.post(url, json={**PLANTA, "padrino_curso_id": C2}).status_code == 422  # curso de otra institución
    assert api.post(url, json={**PLANTA, "especie_id": None}).status_code == 422
    assert api.post(url, json={**PLANTA, "lat": 40.4}).status_code == 422
    assert api.post(url, json={**PLANTA, "padrino_tipo": "empresa", "padrino_curso_id": None}).status_code == 422  # falta el nombre
    assert api.post(url, json={**PLANTA, "padrino_tipo": "estudiante", "padrino_curso_id": None, "padrino_usuario_id": DOCENTE}).status_code == 422
    exotica = _planta(api, jornada, especie_id=1, padrino_tipo="empresa", padrino_curso_id=None, padrino_nombre="Ferretería El Roble")
    assert exotica["origen"] == "exotica" and exotica["padrino"] == "Ferretería El Roble"

    api.como("est1")  # el estudiante ve la jornada, con el padrino estudiante en iniciales
    detalle = api.get(f"/siembras/jornadas/{jornada['id']}").json()
    assert detalle["resumen"]["sembradas"] == 3 and detalle["resumen"]["pct_nativas"] == 66.7 and detalle["puede_editar"] is False
    assert [s["padrino"] for s in detalle["siembras"]][1] == "L."
    api.como("docente_la")
    assert api.get(f"/siembras/jornadas/{jornada['id']}").status_code == 403
    assert api.post(url, json=PLANTA).status_code == 403

    api.como("docente")
    assert api.delete(f"/siembras/jornadas/{jornada['id']}").status_code == 409  # tiene plántulas


def test_controles_de_supervivencia(api):  # noqa: F811
    jornada = _preparar(api)
    planta = _planta(api, jornada)
    url = f"/siembras/plantas/{planta['id']}/controles"
    api.como("est1")  # los estudiantes hacen el monitoreo
    r = api.post(url, json={"hito_meses": 3, "fecha": "2026-07-30", "estado": "viva_buena", "altura_cm": 55, "mantenimiento": True})
    assert r.status_code == 201, r.text
    assert api.post(url, json={"hito_meses": 3, "fecha": "2026-08-01", "estado": "viva_buena"}).status_code == 409
    temprano = api.post(url, json={"hito_meses": 12, "fecha": "2026-10-10", "estado": "viva_buena"})
    assert temprano.status_code == 422 and "12 meses" in temprano.json()["detail"]
    assert api.post(url, json={"fecha": "2026-04-01", "estado": "viva_buena"}).status_code == 422  # antes de la siembra
    assert api.post(url, json={"hito_meses": 6, "fecha": "2026-10-17", "estado": "viva_regular", "observaciones": "Hojas secas"}).status_code == 201

    detalle = api.get(f"/siembras/jornadas/{jornada['id']}").json()
    s = detalle["siembras"][0]
    assert s["estado"] == "viva" and [c["hito_meses"] for c in s["controles"]] == [3, 6]
    assert s["siguiente"] == {"hito_meses": 12, "fecha": "2027-04-29", "estado": "proximo"}
    assert detalle["resumen"]["supervivencia_pct"] == 100.0

    api.como("est2")  # otro estudiante no borra un control ajeno; el docente sí
    control = s["controles"][0]["id"]
    assert api.delete(f"/siembras/controles/{control}").status_code == 403
    api.como("docente")
    assert api.delete(f"/siembras/controles/{control}").status_code == 204
    api.como("docente_la")
    assert api.post(url, json={"fecha": "2026-10-17", "estado": "muerta"}).status_code == 403


def test_asistentes_y_lista_para_la_alcaldia(api):  # noqa: F811
    jornada = _preparar(api)
    _planta(api, jornada)
    url = f"/siembras/jornadas/{jornada['id']}/asistentes"
    lista = {"asistentes": [
        {"usuario_id": EST1, "arboles_sembrados": 2, "autoriza_certificado": True},
        {"usuario_id": EST2, "arboles_sembrados": 1},
        {"usuario_id": DOCENTE, "autoriza_certificado": True},
        {"nombre_externo": "Marta Ríos", "rol": "acudiente", "arboles_sembrados": 1, "autoriza_certificado": True},
    ]}
    r = api.put(url, json=lista)
    assert r.status_code == 200, r.text
    asistentes = {a["nombre"]: a for a in r.json()}
    assert asistentes["Laura"]["rol"] == "estudiante" and asistentes["Laura"]["curso"] == "10-A"
    assert asistentes["Docente"]["rol"] == "docente" and asistentes["Laura"]["autorizacion_registrada_en"]
    fila = next(a for a in api.base.tablas["asistentes_jornada"] if a.get("usuario_id") == EST1)
    assert fila["autorizacion_registrada_por"] == DOCENTE
    assert api.put(url, json={"asistentes": [{"nombre_externo": "Pedro Pérez", "rol": "estudiante"}]}).status_code == 422
    assert api.put(url, json={"asistentes": [{"usuario_id": USUARIOS["docente_la"][0]}]}).status_code == 422
    assert api.put(url, json={"asistentes": [{"usuario_id": EST1}, {"usuario_id": EST1}]}).status_code == 422
    assert api.get(f"/siembras/jornadas/{jornada['id']}").json()["asistentes"] == {"total": 4, "estudiantes": 2, "con_autorizacion": 3}

    r = api.post(f"/siembras/jornadas/{jornada['id']}/lista", json={"formato": "pdf"})
    assert r.status_code == 200, r.text
    assert r.json()["filas"] == 3
    pdf = api.base.archivos[f"siembras/{DOCENTE}/{jornada['id']}.pdf"]
    assert "Laura".encode("cp1252") in pdf and "Marta Ríos".encode("cp1252") in pdf
    assert b"Mateo" not in pdf and "1 persona más asistió".encode("cp1252") in pdf
    csv = api.post(f"/siembras/jornadas/{jornada['id']}/lista", json={"formato": "csv"})
    texto = api.base.archivos[f"siembras/{DOCENTE}/{jornada['id']}.csv"].decode("utf-8-sig")
    assert csv.json()["filas"] == 3 and texto.splitlines()[0].startswith("nombre,rol,curso") and "Mateo" not in texto

    api.como("est1")  # los nombres solo los ven docentes y administradores
    assert api.get(url).status_code == 403
    assert api.post(f"/siembras/jornadas/{jornada['id']}/lista", json={"formato": "pdf"}).status_code == 403


def test_resumen_y_exportar_sin_datos_personales(api):  # noqa: F811
    jornada = _preparar(api)
    planta = _planta(api, jornada, padrino_tipo="estudiante", padrino_usuario_id=EST1, padrino_curso_id=None)
    _planta(api, jornada, especie_id=1, padrino_tipo="empresa", padrino_curso_id=None, padrino_nombre="Ferretería El Roble")
    api.post(f"/siembras/plantas/{planta['id']}/controles", json={"hito_meses": 3, "fecha": "2026-07-30", "estado": "viva_buena"})

    api.como("est1")
    r = api.get("/siembras/resumen").json()
    assert r["total"]["sembradas"] == 2 and r["por_jornada"][0]["nombre"] == "Día del Árbol 2026"
    assert r["por_sede"][0]["nombre"] == "IE San José"
    assert {p["especie"] for p in r["proximos"]} == {"Roble morado", "Mango"}  # control de 6 meses (y el de 3 vencido del mango)

    api.como("docente")
    r = api.post("/siembras/exportar", json={"formato": "geojson"})
    assert r.status_code == 200, r.text
    assert r.json()["filas"] == 2
    datos = json.loads(api.base.archivos[f"siembras/{DOCENTE}/plantulas.geojson"])
    propiedades = [f["properties"] for f in datos["features"]]
    assert datos["features"][0]["geometry"]["coordinates"] == [-73.2562, 10.4641]
    assert {p["padrino"] for p in propiedades} == {None, "Ferretería El Roble"}  # el estudiante no sale
    assert {p["control_3m"] for p in propiedades} == {"viva_buena", None}
    assert "Laura" not in json.dumps(datos, ensure_ascii=False)


def test_las_siembras_cuentan_en_el_prae(api):  # noqa: F811
    jornada = _preparar(api)
    planta = _planta(api, jornada)
    _planta(api, jornada, especie_id=1)
    api.post(f"/siembras/plantas/{planta['id']}/controles", json={"hito_meses": 3, "fecha": "2026-07-30", "estado": "viva_buena"})
    p = api.post("/prae", json={"institucion_id": "sj", "anio": 2026, "tema": "arbolado", "titulo": "Sembrar y cuidar",
                                "problema": "Pocas especies nativas en el colegio."}).json()
    ind = api.get(f"/prae/{p['id']}/indicadores").json()
    assert ind["siembras"] == {"jornadas": 1, "sembradas": 2, "pct_nativas": 50.0, "evaluadas": 1, "supervivencia_pct": 100.0}
