"""Servicio social con horas verificadas (migración 009). Usa el Supabase en memoria."""
import re
from datetime import date

import pytest
from postgrest.exceptions import APIError

from comun import fecha_local
from routers import servicio_social as router_ss
from servicios import servicio_social as ss
from servicios.certificado_pdf import certificado_pdf
from tests.test_modulos_api import A1, C1, USUARIOS, api  # noqa: F401 (api es un fixture)

HOY = date(2026, 10, 18)
JPG = ("f.jpg", b"\xff\xd8\xff\xe0abc", "image/jpeg")
EST1 = USUARIOS["est1"][0]


@pytest.fixture(autouse=True)
def _hoy_fijo(monkeypatch):
    monkeypatch.setattr(router_ss, "hoy", lambda: HOY)


def _actividad(api, **cambios):  # noqa: F811
    cuerpo = {"tipo": "siembra", "fecha": "2026-10-10", "horas": 3, "descripcion": "Sembramos dos guayacanes junto a la cancha", **cambios}
    return api.post("/servicio-social/actividades", json=cuerpo)


# ------------------------------------ Reglas ------------------------------------
@pytest.mark.parametrize(
    ("curso", "grado"),
    [({"grado": 11, "nombre": "x"}, 11), ({"nombre": "10-A"}, 10), ({"nombre": "11B"}, 11), ({"nombre": "1102"}, 11),
     ({"nombre": "601"}, 6), ({"nombre": "Décimo A"}, 10), ({"nombre": "once 2"}, 11), ({"nombre": "Primero"}, None),
     ({"nombre": "12"}, None), (None, None)],
)
def test_grado_del_curso(curso, grado):
    assert ss.grado_de_curso(curso) == grado


def test_periodo_y_horas_esperadas():
    assert ss.periodo(10, 2026) == (date(2026, 2, 1), date(2027, 11, 30))
    assert ss.periodo(11, 2026) == (date(2025, 2, 1), date(2026, 11, 30))
    inicio = date(2026, 2, 1)
    assert ss.meses_escolares(inicio, date(2026, 1, 20)) == 0
    assert ss.meses_escolares(inicio, date(2026, 2, 28)) == 1
    assert ss.meses_escolares(inicio, date(2026, 12, 20)) == 10  # diciembre y enero son vacaciones
    assert ss.meses_escolares(inicio, date(2027, 11, 30)) == 20
    assert ss.horas_esperadas(80, inicio, date(2026, 12, 20)) == 40


def test_estado():
    assert ss.estado(80, 80, 80) == "completo"
    assert ss.estado(10, 80, 40) == "atrasado"
    assert ss.estado(30, 80, 40) == "al_dia"
    assert ss.estado(0, 80, 3) == "al_dia"  # los primeros días nadie va atrasado


def test_horas_de_inspecciones_una_por_arbol_y_dia():
    i = lambda id_, arbol, fecha, estado="confirmada", quien=EST1: {  # noqa: E731
        "id": id_, "arbol_id": arbol, "fecha": fecha, "estado_revision": estado, "inspector_id": quien, "origen": "seguimiento"}
    inspecciones = [
        i("1", "a", "2026-09-01T13:00:00+00:00"), i("2", "a", "2026-09-01T15:00:00+00:00"),  # mismo árbol y día
        i("3", "b", "2026-09-01T15:00:00+00:00"), i("4", "a", "2026-09-02T15:00:00+00:00", "pendiente"),
        i("5", "c", "2026-09-03T15:00:00+00:00", "anulada"), i("6", "d", "2026-01-10T15:00:00+00:00"),  # antes del periodo
        i("7", "e", "2026-09-04T15:00:00+00:00", quien="otro"),
    ]
    confirmadas, pendientes = ss.horas_de_inspecciones(inspecciones, EST1, 1.5, date(2026, 2, 1), date(2027, 11, 30), fecha_local)
    assert [c["inspeccion_id"] for c in confirmadas] == ["1", "3"] and confirmadas[0]["horas"] == 1.5
    assert [p["inspeccion_id"] for p in pendientes] == ["4"]


def test_tope_de_ocho_horas_por_dia():
    dia = date(2026, 9, 1)
    r = ss.sumar([{"fecha": dia, "horas": 6, "tipo": "siembra"}, {"fecha": dia, "horas": 4, "tipo": "riego"},
                  {"fecha": date(2026, 9, 2), "horas": 1, "tipo": "inspeccion"}])
    assert r == {"total": 9, "por_tipo": {"inspeccion": 1, "riego": 4, "siembra": 6}, "fuera_del_tope": 2}


def test_iniciales():
    assert ss.iniciales("Laura Sofía  Gómez Peñaloza") == "L. S. G. P."
    assert ss.iniciales(" ") == "—"


# ------------------------------------- Estudiante -------------------------------------
def test_resumen_del_estudiante(api):  # noqa: F811
    r = api.get("/servicio-social/resumen").json()
    assert r["en_servicio"] and r["grado"] == 10 and r["curso_nombre"] == "10-A"
    assert r["periodo_inicio"] == "2026-02-01" and r["periodo_fin"] == "2027-11-30"
    # I3 (confirmada) cuenta; I1 (pendiente) aparece por revisar
    assert r["horas_aprobadas"] == 1 and r["horas_pendientes"] == 1 and r["inspecciones_contadas"] == 1
    assert r["meta"] == 80 and r["horas_esperadas"] == pytest.approx(34.3, abs=0.1) and r["estado"] == "atrasado"
    assert r["por_tipo"] == [{"tipo": "inspeccion", "etiqueta": ss.TIPOS["inspeccion"], "horas": 1}]


def test_quien_no_presta_servicio_social(api):  # noqa: F811
    api.como("est2")
    r = api.get("/servicio-social/resumen").json()
    assert not r["en_servicio"] and "curso" in r["motivo"]
    assert _actividad(api).status_code == 403
    api.como("docente")
    assert not api.get("/servicio-social/resumen").json()["en_servicio"]
    # un curso de 9.° no presta servicio social
    next(c for c in api.base.tablas["cursos"] if c["id"] == C1)["grado"] = 9
    api.como("est1")
    assert "10.° y 11.°" in api.get("/servicio-social/resumen").json()["motivo"]


def test_registrar_actividad_con_sus_reglas(api):  # noqa: F811
    r = _actividad(api)
    assert r.status_code == 201, r.text
    assert r.json()["estado"] == "pendiente" and r.json()["etiqueta"] == "Siembra"
    assert _actividad(api, horas=6).status_code == 422  # 3 + 6 pasa del tope de 8 horas ese día
    assert _actividad(api, horas=1.25).status_code == 422  # medias horas
    assert _actividad(api, fecha="2026-10-19").status_code == 422  # futura
    assert _actividad(api, fecha="2026-05-01").status_code == 422  # más de 90 días atrás
    assert _actividad(api, descripcion="corta").status_code == 422
    assert _actividad(api, tipo="poda").status_code == 422  # no apta para estudiantes
    assert _actividad(api, arbol_id=A1, lat=10.46).status_code == 422  # latitud sin longitud
    assert _actividad(api, horas=1, arbol_id=A1, lat=10.46, lng=-73.25).status_code == 201

    foto = api.post(f"/servicio-social/actividades/{r.json()['id']}/foto", files={"archivo": JPG})
    assert foto.status_code == 200 and foto.json()["foto_url"].startswith("https://memoria/servicio/")
    api.como("est2")
    assert api.post(f"/servicio-social/actividades/{r.json()['id']}/foto", files={"archivo": JPG}).status_code == 403


# --------------------------------------- Docente ---------------------------------------
def test_revision_de_actividades(api):  # noqa: F811
    sin_foto = _actividad(api, tipo="riego", fecha="2026-10-11", horas=2).json()
    con_foto = _actividad(api).json()
    api.post(f"/servicio-social/actividades/{con_foto['id']}/foto", files={"archivo": JPG})

    assert api.post(f"/servicio-social/actividades/{con_foto['id']}/aprobar", json={}).status_code == 403  # estudiante
    api.como("docente_la")
    assert api.get("/servicio-social/actividades/pendientes").json() == []
    assert api.post(f"/servicio-social/actividades/{con_foto['id']}/aprobar", json={}).status_code == 403
    assert api.get(f"/servicio-social/resumen?estudiante_id={EST1}").status_code == 403

    api.como("docente")
    pendientes = api.get("/servicio-social/actividades/pendientes").json()
    assert [p["estudiante_nombre"] for p in pendientes] == ["Laura", "Laura"] and pendientes[0]["curso_nombre"] == "10-A"
    assert api.post(f"/servicio-social/actividades/{sin_foto['id']}/aprobar", json={}).status_code == 409
    aprobada = api.post(f"/servicio-social/actividades/{con_foto['id']}/aprobar", json={"comentario": "Bien documentado"})
    assert aprobada.status_code == 200 and aprobada.json()["estado"] == "aprobada"
    assert api.post(f"/servicio-social/actividades/{con_foto['id']}/aprobar", json={}).status_code == 409
    assert api.post(f"/servicio-social/actividades/{sin_foto['id']}/rechazar", json={"motivo": "no"}).status_code == 422
    rechazada = api.post(f"/servicio-social/actividades/{sin_foto['id']}/rechazar", json={"motivo": "Falta la foto del riego"})
    assert rechazada.json()["estado"] == "rechazada" and rechazada.json()["comentario"] == "Falta la foto del riego"

    r = api.get(f"/servicio-social/resumen?estudiante_id={EST1}").json()
    assert r["horas_aprobadas"] == 4 and r["horas_pendientes"] == 1
    assert {a["estado"] for a in r["actividades"]} == {"aprobada", "rechazada"}


def test_lista_de_estudiantes_y_parametros(api):  # noqa: F811
    api.como("docente")
    lista = api.get("/servicio-social/estudiantes").json()
    assert [(e["nombre"], e["estado"]) for e in lista] == [("Laura", "atrasado")]  # Mateo no tiene curso
    assert api.get("/servicio-social/parametros/sj").json() == {"institucion_id": "sj", "meta_horas": 80, "horas_por_inspeccion": 1}
    assert api.put("/servicio-social/parametros/sj", json={"meta_horas": 1, "horas_por_inspeccion": 9}).status_code == 422
    assert api.put("/servicio-social/parametros/sj", json={"meta_horas": 1, "horas_por_inspeccion": 1}).status_code == 200
    assert api.get("/servicio-social/estudiantes").json()[0]["estado"] == "completo"
    api.como("docente_la")
    assert api.put("/servicio-social/parametros/sj", json={"meta_horas": 50, "horas_por_inspeccion": 1}).status_code == 403
    api.como("est1")
    assert api.get("/servicio-social/estudiantes").status_code == 403


# ------------------------------------- Certificados -------------------------------------
def test_certificado_y_verificacion(api):  # noqa: F811
    api.como("docente")
    cuerpo = {"estudiante_id": EST1, "firmante_nombre": "María Fernanda Ríos", "firmante_cargo": "Rectora", "autorizado_por_rectoria": True}
    assert api.post("/servicio-social/certificados", json={**cuerpo, "autorizado_por_rectoria": False}).status_code == 422
    assert "Aún no completa" in api.post("/servicio-social/certificados", json=cuerpo).json()["detail"]
    api.put("/servicio-social/parametros/sj", json={"meta_horas": 1, "horas_por_inspeccion": 1})

    emitido = api.post("/servicio-social/certificados", json=cuerpo)
    assert emitido.status_code == 201, emitido.text
    c = emitido.json()
    assert re.fullmatch(r"[A-Z2-9]{10}", c["codigo"]) and c["estudiante_nombre"] == "Laura" and c["horas"] == 1
    pdf = api.base.archivos[f"certificados/sj/{c['codigo']}.pdf"]
    assert pdf.startswith(b"%PDF-1.4") and b"Laura" in pdf and b"Mar\xeda Fernanda R\xedos" in pdf
    assert f"/verificar/{c['codigo']}".encode() in pdf
    assert api.post("/servicio-social/certificados", json=cuerpo).status_code == 409  # ya tiene uno vigente

    api.como("est1")
    assert api.get(f"/servicio-social/certificados/{c['id']}/descarga").json()["nombre"] == f"certificado-servicio-social-{c['codigo']}.pdf"
    assert api.get("/servicio-social/resumen").json()["certificado"]["codigo"] == c["codigo"]
    api.como("docente_la")
    assert api.get(f"/servicio-social/certificados/{c['id']}/descarga").status_code == 403

    # verificación pública: sin sesión y solo con iniciales
    publica = api.get(f"/servicio-social/verificar/{c['codigo'][:4]}-{c['codigo'][4:8]}-{c['codigo'][8:]}").json()
    assert publica["valido"] and publica["estudiante"] == "L." and publica["institucion"] == "IE San José"
    pagina = api.get(f"/verificar/{c['codigo']}")
    assert pagina.status_code == 200 and "Certificado válido" in pagina.text and "Laura" not in pagina.text
    assert api.get("/verificar/NOEXISTE22").status_code == 404
    assert api.get("/servicio-social/verificar/abc").status_code == 404

    api.como("docente")
    assert api.post(f"/servicio-social/certificados/{c['id']}/anular", json={"motivo": "Nombre mal escrito"}).status_code == 200
    assert api.post(f"/servicio-social/certificados/{c['id']}/anular", json={"motivo": "Otra vez"}).status_code == 409
    assert api.get(f"/servicio-social/verificar/{c['codigo']}").json()["estado"] == "anulado"
    assert "anulado" in api.get(f"/verificar/{c['codigo']}").text
    assert api.post("/servicio-social/certificados", json=cuerpo).status_code == 201  # se puede emitir otro


def test_pdf_bien_formado():
    pdf = certificado_pdf({
        "institucion": "IE (San José)", "codigo_dane": None, "municipio": None, "estudiante": "Ana Ñañez", "curso": None,
        "horas": 80, "meta": 80, "detalle": [("Riego", 80)], "inicio": date(2025, 2, 1), "fin": date(2026, 10, 18),
        "firmante": "Rector", "cargo": "Rector(a)", "emitido": date(2026, 10, 18), "codigo": "ABCD2345XY",
    }, "https://ejemplo.test/verificar/ABCD2345XY")
    assert pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF")
    assert b"IE \\(San Jos\xe9\\)" in pdf  # paréntesis escapados y cp1252
    inicio_xref = int(pdf.rsplit(b"startxref\n", 1)[1].split(b"\n")[0])
    assert pdf[inicio_xref:].startswith(b"xref\n0 8\n")
    posiciones = [int(linea[:10]) for linea in pdf[inicio_xref:].split(b"\n")[3:10]]
    for numero, posicion in enumerate(posiciones, start=1):
        assert pdf[posicion:].startswith(f"{numero} 0 obj".encode())
    assert pdf.count(b" re\n") > 100  # el QR


# --------------------------------- Sin la migración 009 ---------------------------------
def test_sin_la_migracion_009(api):  # noqa: F811
    original = api.base.table

    def tabla(nombre):
        if nombre in ("actividades_servicio", "certificados_servicio", "servicio_social_parametros"):
            raise APIError({"message": "relation does not exist", "code": "42P01", "hint": None, "details": None})
        return original(nombre)

    api.base.table = tabla
    r = api.get("/servicio-social/resumen").json()
    assert r["en_servicio"] and r["horas_aprobadas"] == 1 and r["actividades"] == [] and r["meta"] == 80
    api.como("docente")
    assert api.get("/servicio-social/actividades/pendientes").json() == []
    assert len(api.get("/servicio-social/estudiantes").json()) == 1
    assert api.get("/servicio-social/certificados").json() == []


def test_grado_del_curso_en_la_api(api):  # noqa: F811
    api.como("docente")
    assert next(c for c in api.get("/cursos").json() if c["id"] == C1)["grado"] == 10  # del nombre "10-A"
    r = api.post("/cursos", json={"institucion_id": "sj", "nombre": "Media A", "anio": 2026, "grado": 11})
    assert r.status_code == 201 and r.json()["grado"] == 11
    assert api.patch(f"/cursos/{r.json()['id']}", json={"grado": 12}).status_code == 422
    assert api.patch(f"/cursos/{r.json()['id']}", json={"grado": 10}).json()["grado"] == 10
