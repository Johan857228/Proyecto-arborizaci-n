"""Pruebas de API de los módulos nuevos con Supabase en memoria (tests/memoria.py)."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import db
import main
from auth import Sesion, usuario_actual
from comun import hoy
from tests.memoria import BaseMemoria

A1 = "11111111-1111-1111-1111-111111111111"
A2 = "22222222-2222-2222-2222-222222222222"
I1 = "aaaaaaaa-0000-0000-0000-000000000001"
I2 = "aaaaaaaa-0000-0000-0000-000000000002"
I3 = "aaaaaaaa-0000-0000-0000-000000000003"
C1 = "cccccccc-0000-0000-0000-000000000001"
C2 = "cccccccc-0000-0000-0000-000000000002"
M1 = "eeeeeeee-0000-0000-0000-000000000001"
M2 = "eeeeeeee-0000-0000-0000-000000000002"

USUARIOS = {
    "admin": ("00000000-0000-0000-0000-00000000000a", "administrador", "sj", None),
    "docente": ("00000000-0000-0000-0000-00000000000d", "docente", "sj", None),
    "docente_la": ("00000000-0000-0000-0000-0000000000d2", "docente", "la", None),
    "est1": ("00000000-0000-0000-0000-000000000001", "estudiante", "sj", C1),
    "est2": ("00000000-0000-0000-0000-000000000002", "estudiante", "sj", None),
}


def _perfil(clave, nombre=None, activo=True):
    uid, rol, inst, curso = USUARIOS[clave]
    return {"usuario_id": uid, "nombre": nombre or clave.capitalize(), "correo": f"{clave}@x.co", "rol": rol,
            "institucion_id": inst, "curso_id": curso, "activo": activo}


def _arbol(id_, codigo, inst, zona="Patio central", **extra):
    return {"id": id_, "codigo": codigo, "institucion_id": inst, "prefijo": "IE001" if inst == "sj" else "IE002",
            "nombre_corto": "San José" if inst == "sj" else "Los Almendros", "zona": zona, "zona_otra": None,
            "lat": 10.4638, "lng": -73.254, "especie_id": 1, "nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica",
            "dap_cm": 30.0, "altura_m": 8.0, "copa_m": 4.0, "etapa": "Adulto", "interferencia": "Ninguna",
            "interferencia_otra": None, "registrado_en": "2026-09-01T12:00:00+00:00",
            "registrado_por": USUARIOS["est1"][0], "n_observaciones": 1, "estado": "riesgo", "puntaje_riesgo": 1,
            "ultimo_metodo_id": M1, "ultima_inspeccion_en": "2026-09-01T12:00:00+00:00", "ultima_revision": "pendiente",
            "n_inspecciones": 1, **extra}


def _insp(id_, arbol, inspector, estado="pendiente", origen="seguimiento", fecha="2026-09-01T12:00:00+00:00"):
    return {"id": id_, "arbol_id": arbol, "inspector_id": USUARIOS[inspector][0], "fecha": fecha, "origen": origen,
            "lat": None, "lng": None, "precision_gps_m": None, "dap_cm": 30.0, "altura_m": 8.0, "copa_m": 4.0,
            "etapa": "Adulto", "interferencia": "Ninguna", "interferencia_otra": None, "notas": None, "metodo_id": M1,
            "puntaje_riesgo": 1, "calificacion": "riesgo", "estado_revision": estado, "revisado_por": None,
            "revisado_en": None, "comentario_revision": None}


def _mundo():
    perfiles = [_perfil(k, nombre={"est1": "Laura", "est2": "Mateo"}.get(k)) for k in USUARIOS]
    return {
        "instituciones": [
            {"id": "sj", "nombre": "IE San José", "nombre_corto": "San José", "prefijo": "IE001"},
            {"id": "la", "nombre": "IE Los Almendros", "nombre_corto": "Los Almendros", "prefijo": "IE002"},
        ],
        "perfiles": perfiles,
        "perfiles_publicos": [{k: p[k] for k in ("usuario_id", "nombre", "rol", "institucion_id", "curso_id", "activo")} for p in perfiles],
        "metodos_calculo": [
            {"id": M1, "version": 1, "nombre": "Conteo de hallazgos", "umbral_riesgo": 1, "umbral_critico": 4,
             "pesos_observacion": {}, "creado_en": "2026-01-01T00:00:00+00:00"},
            {"id": M2, "version": 2, "nombre": "Plagas pesan triple", "peso_plagas": 3, "umbral_riesgo": 1, "umbral_critico": 4,
             "pesos_observacion": {}, "creado_en": "2026-02-01T00:00:00+00:00"},
        ],
        "parametros_institucionales": [
            {"institucion_id": "la", "metodo_id": M2, "dias_revisita": 90, "precision_gps_max_m": 10,
             "puntos_inspeccion": 10, "puntos_arbol_nuevo": 15},
        ],
        "observaciones_catalogo": [
            {"codigo": "f_manchas", "grupo": "follaje", "etiqueta": "Manchas", "orden": 1},
            {"codigo": "p_termitas", "grupo": "plagas", "etiqueta": "Termitas", "orden": 1},
            {"codigo": "t_micelio", "grupo": "tronco", "etiqueta": "Micelio", "orden": 1},
        ],
        "arboles_resumen": [_arbol(A1, "IE001-0001", "sj", ultima_inspeccion_id=I1),
                            _arbol(A2, "IE002-0001", "la", ultima_inspeccion_id=I3)],
        "arboles": [{"id": A1, "registrado_por": USUARIOS["est1"][0], "institucion_id": "sj"},
                    {"id": A2, "registrado_por": USUARIOS["est1"][0], "institucion_id": "la"}],
        "inspecciones": [_insp(I1, A1, "est1", origen="registro"), _insp(I2, A1, "docente"),
                         _insp(I3, A2, "est1", estado="confirmada", origen="registro")],
        "inspeccion_observaciones": [{"inspeccion_id": I1, "observacion_codigo": "f_manchas"}],
        "inspeccion_fotos": [],
        "arbol_fotos": [],
        "tipos_intervencion": [
            {"codigo": "control_plagas", "nombre": "Control de plagas", "descripcion": None, "costo_referencia": 120000, "orden": 1},
            {"codigo": "poda_sanitaria", "nombre": "Poda sanitaria", "descripcion": None, "costo_referencia": 150000, "orden": 2},
            {"codigo": "tratamiento_fitosanitario", "nombre": "Tratamiento", "descripcion": None, "costo_referencia": 100000, "orden": 3},
            {"codigo": "evaluacion_riesgo", "nombre": "Evaluación de riesgo", "descripcion": None, "costo_referencia": 180000, "orden": 4},
        ],
        "intervenciones": [],
        "cursos": [
            {"id": C1, "institucion_id": "sj", "nombre": "10-A", "anio": 2026, "docente_id": None, "activo": True,
             "creado_en": "2026-01-10T00:00:00+00:00"},
            {"id": C2, "institucion_id": "la", "nombre": "9-B", "anio": 2026, "docente_id": None, "activo": True,
             "creado_en": "2026-01-10T00:00:00+00:00"},
        ],
        "curso_zonas": [{"curso_id": C1, "zona": "Patio central"}],
        "presupuestos": [
            {"id": "pppppppp-0000-0000-0000-000000000001", "institucion_id": "sj", "nombre": "Presupuesto 2026",
             "fecha_inicio": "2026-01-01", "fecha_fin": "2026-12-31", "monto_asignado": 1000000, "notas": None,
             "creado_en": "2026-01-01T00:00:00+00:00"},
        ],
        "metas": [],
        "escenarios_presupuestales": [],
    }


@pytest.fixture
def api(monkeypatch):
    base = BaseMemoria(_mundo())
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: base)
    monkeypatch.setattr(db, "get_admin", lambda: base)

    def como(clave):
        uid = USUARIOS[clave][0]
        main.app.dependency_overrides[usuario_actual] = lambda: Sesion(token=clave, user_id=uid, email=f"{clave}@x.co")

    cliente = TestClient(main.app)
    cliente.como = como
    cliente.base = base
    como("est1")
    yield cliente
    main.app.dependency_overrides.clear()


# ----------------------------------- Perfil -----------------------------------
def test_perfil_se_crea_si_no_existe(api):
    api.base.tablas["perfiles"] = []
    r = api.get("/perfil")
    assert r.status_code == 200 and r.json()["rol"] == "estudiante" and r.json()["nombre"] == "est1"
    assert api.base.tablas["perfiles"][0]["usuario_id"] == USUARIOS["est1"][0]


def test_usuario_desactivado_no_entra(api):
    api.base.tablas["perfiles"][3]["activo"] = False
    assert api.get("/perfil").status_code == 403


def test_refrescar_sesion(monkeypatch):
    sesion = SimpleNamespace(access_token="nuevo", refresh_token="otro", expires_in=3600)

    class Anon:
        class auth:
            @staticmethod
            def refresh_session(token):
                return SimpleNamespace(session=sesion, user=SimpleNamespace(id="u1", email="a@b.c"))

    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: Anon)
    r = TestClient(main.app).post("/auth/refresh", json={"refresh_token": "r" * 20})
    assert r.status_code == 200 and r.json()["access_token"] == "nuevo"


# --------------------------------- Inspecciones ---------------------------------
def test_inspeccion_se_califica_con_el_metodo_de_la_institucion(api):
    cuerpo = {"dap_cm": 31, "altura_m": 8.4, "copa_m": 4.1, "etapa": "Adulto", "interferencia": "Ninguna",
              "observaciones": ["p_termitas", "p_termitas"]}
    r = api.post(f"/arboles/{A2}/inspecciones", json=cuerpo)  # 'la' usa la versión 2: plagas pesan 3
    assert r.status_code == 201, r.text
    assert r.json()["puntaje_riesgo"] == 3 and r.json()["calificacion"] == "riesgo" and r.json()["metodo_version"] == 2
    r = api.post(f"/arboles/{A1}/inspecciones", json={**cuerpo, "observaciones": ["p_termitas", "t_micelio", "f_manchas"]})
    assert r.json()["puntaje_riesgo"] == 3 and r.json()["metodo_version"] == 1  # 'sj' sin parámetros: versión 1
    obs = [o for o in api.base.tablas["inspeccion_observaciones"] if o["inspeccion_id"] == r.json()["id"]]
    assert len(obs) == 3


def test_inspeccion_valida_datos(api):
    base = {"dap_cm": 31, "altura_m": 8, "copa_m": 4, "etapa": "Adulto", "interferencia": "Ninguna"}
    assert api.post(f"/arboles/{A1}/inspecciones", json={**base, "observaciones": ["zz"]}).status_code == 422
    assert api.post(f"/arboles/{A1}/inspecciones", json={**base, "lat": 10}).status_code == 422
    assert api.post(f"/arboles/{A1}/inspecciones", json={**base, "interferencia": "Otra infraestructura"}).status_code == 422
    assert api.post(f"/arboles/{A1}/inspecciones", json={**base, "altura_m": 26}).status_code == 422
    assert api.post("/arboles/33333333-3333-3333-3333-333333333333/inspecciones", json=base).status_code == 404


def test_sin_metodos_la_api_pide_la_migracion(api):
    api.base.tablas["metodos_calculo"] = []
    base = {"dap_cm": 31, "altura_m": 8, "copa_m": 4, "etapa": "Adulto", "interferencia": "Ninguna"}
    r = api.post(f"/arboles/{A1}/inspecciones", json=base)
    assert r.status_code == 503 and "001_fase1_modulos.sql" in r.json()["detail"]


def test_si_fallan_los_hallazgos_se_borra_la_inspeccion(api):
    api.base.fallar["inspeccion_observaciones"] = "insert"
    base = {"dap_cm": 31, "altura_m": 8, "copa_m": 4, "etapa": "Adulto", "interferencia": "Ninguna", "observaciones": ["f_manchas"]}
    assert api.post(f"/arboles/{A1}/inspecciones", json=base).status_code == 422
    assert len(api.base.tablas["inspecciones"]) == 3


def test_registrar_arbol_crea_inspeccion_de_registro(api):
    api.base.tablas["arboles_resumen"].append(_arbol("id-por-asignar", "IE001-0002", "sj"))
    cuerpo = {"institucion_id": "sj", "zona": "Patio central", "lat": 10.4, "lng": -73.2, "especie_id": 1, "dap_cm": 20,
              "altura_m": 5, "copa_m": 3, "etapa": "Juvenil", "interferencia": "Ninguna", "observaciones": ["f_manchas"],
              "precision_gps_m": 7, "notas": "Cerca del aula 3"}
    # el cliente en memoria asigna un id aleatorio: se apunta el resumen a ese id después de insertar
    original = api.base.table

    def tabla(nombre):
        consulta = original(nombre)
        if nombre == "arboles":
            ejecutar = consulta.execute

            def execute():
                r = ejecutar()
                if consulta.op == "insert":
                    api.base.tablas["arboles_resumen"][-1]["id"] = r.data[0]["id"]
                return r
            consulta.execute = execute
        return consulta

    api.base.table = tabla
    r = api.post("/arboles", json=cuerpo)
    assert r.status_code == 201, r.text
    insertado = next(f for f in api.base.tablas["arboles"] if f["id"] == r.json()["id"])
    assert "notas" not in insertado and "precision_gps_m" not in insertado
    registro = [i for i in api.base.tablas["inspecciones"] if i["arbol_id"] == r.json()["id"]]
    assert len(registro) == 1 and registro[0]["origen"] == "registro" and registro[0]["notas"] == "Cerca del aula 3"
    assert registro[0]["precision_gps_m"] == 7 and registro[0]["calificacion"] == "riesgo"


def test_fotos_de_inspeccion(api):
    jpg = ("f.jpg", b"\xff\xd8\xff\xe0abc", "image/jpeg")
    api.como("est2")
    assert api.post(f"/inspecciones/{I1}/fotos?tipo=completo", files={"archivo": jpg}).status_code == 403
    api.como("est1")
    assert api.post(f"/inspecciones/{I3}/fotos?tipo=completo", files={"archivo": jpg}).status_code == 409  # ya revisada
    r = api.post(f"/inspecciones/{I1}/fotos?tipo=completo", files={"archivo": jpg})
    assert r.status_code == 201 and r.json()["storage_path"].startswith(f"{A1}/inspecciones/{I1}/")
    assert api.post(f"/inspecciones/{I1}/fotos?tipo=completo", files={"archivo": jpg}).status_code == 409
    for _ in range(3):
        assert api.post(f"/inspecciones/{I1}/fotos?tipo=adicional", files={"archivo": jpg}).status_code == 201
    assert api.post(f"/inspecciones/{I1}/fotos?tipo=adicional", files={"archivo": jpg}).status_code == 409
    historial = api.get(f"/arboles/{A1}/inspecciones").json()
    assert [i["id"] for i in historial] == [I2, I1] or [i["id"] for i in historial] == [I1, I2]
    assert len(next(i for i in historial if i["id"] == I1)["fotos"]) == 4


# ----------------------------------- Revisión -----------------------------------
def test_revision_permisos(api):
    assert api.get("/revision/pendientes").status_code == 403
    api.como("docente")
    p = api.get("/revision/pendientes").json()
    assert p["total"] == 2  # solo las de su institución
    propia = next(i for i in p["items"] if i["id"] == I2)
    assert propia["puede_revisar"] is False and "propias" in propia["motivo_no_revisable"]
    assert api.post(f"/inspecciones/{I2}/confirmar", json={}).status_code == 403
    api.como("docente_la")
    assert api.post(f"/inspecciones/{I1}/confirmar", json={}).status_code == 403
    assert api.get("/revision/pendientes").json()["total"] == 0


def test_confirmar_y_anular(api):
    api.como("docente")
    assert api.post(f"/inspecciones/{I1}/anular", json={"motivo": "   "}).status_code == 422
    r = api.post(f"/inspecciones/{I1}/confirmar", json={"comentario": "  ok  "})
    assert r.status_code == 200 and r.json()["estado_revision"] == "confirmada" and r.json()["comentario_revision"] == "ok"
    assert api.post(f"/inspecciones/{I1}/anular", json={"motivo": "Error de medida"}).status_code == 409
    api.como("admin")
    r = api.post(f"/inspecciones/{I2}/anular", json={"motivo": "Foto equivocada"})
    assert r.status_code == 200 and r.json()["comentario_revision"] == "Foto equivocada"


# --------------------------------- Intervenciones ---------------------------------
EJECUTADA = {"arbol_id": A1, "tipo_codigo": "control_plagas", "estado": "ejecutada", "responsable": "Brigada",
             "costo_real": 100000, "resultado": "exitosa"}


def test_intervenciones_permisos_y_reglas(api):
    cuerpo = {**EJECUTADA, "fecha_ejecucion": hoy().isoformat()}
    assert api.post("/intervenciones", json=cuerpo).status_code == 403
    api.como("docente_la")
    assert api.post("/intervenciones", json=cuerpo).status_code == 403
    api.como("docente")
    assert api.post("/intervenciones", json={**cuerpo, "resultado": None}).status_code == 422
    assert api.post("/intervenciones", json={**cuerpo, "tipo_codigo": "inventado"}).status_code == 422
    assert api.post("/intervenciones", json={**cuerpo, "inspeccion_id": I3}).status_code == 422  # de otro árbol
    assert api.post("/intervenciones", json={**cuerpo, "responsable": "  "}).status_code == 422
    r = api.post("/intervenciones", json=cuerpo)
    assert r.status_code == 201 and r.json()["codigo"] == "IE001-0001"
    api.como("est1")
    assert api.get(f"/intervenciones/{r.json()['id']}").json()["tipo_nombre"] == "Control de plagas"
    assert api.get("/intervenciones/99999999-9999-9999-9999-999999999999").status_code == 404
    api.como("docente")
    assert api.patch(f"/intervenciones/{r.json()['id']}", json={"costo_real": 1}).status_code == 409
    api.como("admin")
    assert api.patch(f"/intervenciones/{r.json()['id']}", json={"costo_real": 1}).status_code == 200


def test_intervencion_programada_toma_el_costo_de_referencia(api):
    api.como("docente")
    r = api.post("/intervenciones", json={"arbol_id": A1, "tipo_codigo": "poda_sanitaria", "estado": "programada",
                                          "responsable": "Jardinería", "fecha_programada": "2026-12-01"})
    assert r.status_code == 201 and r.json()["costo_estimado"] == 150000
    assert api.post("/intervenciones", json={"arbol_id": A1, "tipo_codigo": "poda_sanitaria", "estado": "programada",
                                             "responsable": "Jardinería"}).status_code == 422
    r2 = api.patch(f"/intervenciones/{r.json()['id']}", json={"estado": "cancelada"})
    assert r2.status_code == 200 and r2.json()["estado"] == "cancelada"


def test_recomendaciones_de_un_arbol(api):
    r = api.get(f"/arboles/{A1}/recomendaciones").json()
    assert [x["tipo_codigo"] for x in r] == ["tratamiento_fitosanitario"] and r[0]["costo_referencia"] == 100000


# ------------------------------------ Cursos ------------------------------------
def test_cursos_permisos_y_avance(api):
    nuevo = {"institucion_id": "sj", "nombre": "11-A", "anio": 2026, "zonas": ["Zona deportiva"]}
    assert api.post("/cursos", json=nuevo).status_code == 403
    api.como("docente_la")
    assert api.post("/cursos", json=nuevo).status_code == 403
    api.como("docente")
    assert api.post("/cursos", json={**nuevo, "zonas": ["Cancha"]}).status_code == 422
    assert api.post("/cursos", json={**nuevo, "docente_id": USUARIOS["est1"][0]}).status_code == 422
    assert api.post("/cursos", json={**nuevo, "docente_id": USUARIOS["docente_la"][0]}).status_code == 422
    r = api.post("/cursos", json={**nuevo, "docente_id": USUARIOS["docente"][0]})
    assert r.status_code == 201 and r.json()["zonas"] == ["Zona deportiva"] and r.json()["docente_nombre"] == "Docente"
    assert api.post("/cursos", json=nuevo).status_code == 409
    av = api.get(f"/cursos/{C1}/avance?desde=2026-08-01&hasta=2026-09-30").json()
    assert av["cobertura"]["arboles_asignados"] == 1 and av["cobertura"]["arboles_inspeccionados"] == 1
    assert av["productividad"]["integrantes"] == 1 and av["productividad"]["por_integrante"][0]["nombre"] == "Laura"
    assert api.get(f"/cursos/{C1}/avance?desde=2026-09-30&hasta=2026-08-01").status_code == 422
    r = api.put(f"/cursos/{C1}/zonas", json={"zonas": ["Entrada principal", "Patio central"]})
    assert r.json()["zonas"] == ["Entrada principal", "Patio central"]


# ----------------------------------- Usuarios -----------------------------------
def test_gestion_de_usuarios(api):
    est2 = USUARIOS["est2"][0]
    assert api.get("/usuarios").status_code == 403
    api.como("docente")
    assert len(api.get("/usuarios").json()) == 4  # los de San José
    assert api.patch(f"/usuarios/{est2}", json={"rol": "docente"}).status_code == 403
    assert api.patch(f"/usuarios/{est2}", json={"curso_id": C2}).status_code == 422  # curso de otra institución
    assert api.patch(f"/usuarios/{est2}", json={"curso_id": C1}).json()["curso_id"] == C1
    api.como("docente_la")
    assert api.patch(f"/usuarios/{est2}", json={"curso_id": None}).status_code == 403
    api.como("admin")
    r = api.patch(f"/usuarios/{est2}", json={"institucion_id": "la"})
    assert r.json()["institucion_id"] == "la" and r.json()["curso_id"] is None  # el curso era de otra institución
    assert api.patch(f"/usuarios/{USUARIOS['admin'][0]}", json={"activo": False}).status_code == 409
    assert api.patch(f"/usuarios/{est2}", json={"institucion_id": "zz"}).status_code == 422


# --------------------------------- Presupuestos ---------------------------------
def test_presupuestos(api):
    assert api.get("/presupuestos").status_code == 403
    api.como("docente")
    assert api.get("/presupuestos").json()[0]["resumen"]["monto_asignado"] == 1000000
    nuevo = {"institucion_id": "sj", "nombre": "Plan 2027", "fecha_inicio": "2027-01-01", "fecha_fin": "2027-12-31", "monto_asignado": 5}
    assert api.post("/presupuestos", json=nuevo).status_code == 403
    api.como("admin")
    assert api.post("/presupuestos", json={**nuevo, "fecha_inicio": "2026-12-01"}).status_code == 409
    assert api.post("/presupuestos", json={**nuevo, "fecha_fin": "2026-12-01"}).status_code == 422
    assert api.post("/presupuestos", json=nuevo).status_code == 201
    assert api.post("/presupuestos", json={**nuevo, "institucion_id": "la"}).status_code == 201  # otra institución no se cruza


# -------------------------------- Configuración --------------------------------
def test_configuracion_de_metodos_y_parametros(api):
    metodo = {"nombre": "Nuevo", "umbral_riesgo": 2, "umbral_critico": 5, "pesos_observacion": {"p_termitas": 4}}
    assert api.post("/configuracion/metodos", json=metodo).status_code == 403
    api.como("admin")
    assert api.post("/configuracion/metodos", json={**metodo, "umbral_critico": 2}).status_code == 422
    assert api.post("/configuracion/metodos", json={**metodo, "pesos_observacion": {"zz": 1}}).status_code == 422
    assert api.post("/configuracion/metodos", json={**metodo, "pesos_observacion": {"p_termitas": 101}}).status_code == 422
    r = api.post("/configuracion/metodos", json=metodo)
    assert r.status_code == 201 and r.json()["version"] == 3
    lista = api.get("/configuracion/parametros").json()
    assert [(p["institucion_id"], p["metodo_version"], p["configurado"]) for p in lista] == [("sj", 1, False), ("la", 2, True)]
    cuerpo = {"metodo_id": r.json()["id"], "dias_revisita": 120, "precision_gps_max_m": 12, "puntos_inspeccion": 5, "puntos_arbol_nuevo": 5}
    assert api.put("/configuracion/parametros/zz", json=cuerpo).status_code == 404
    assert api.put("/configuracion/parametros/sj", json={**cuerpo, "dias_revisita": 1}).status_code == 422
    assert api.put("/configuracion/parametros/sj", json=cuerpo).json()["metodo_version"] == 3
    sim = api.post("/configuracion/metodos/simular", json={"metodo_id": M2}).json()
    assert sim["arboles_evaluados"] == 2


# ------------------------------- Gamificación -------------------------------
def test_progreso_y_ranking(api):
    p = api.get("/gamificacion/mi-progreso").json()
    assert p["puntos"] == 25 and p["resumen"]["confirmadas"] == 1  # I3 es un registro confirmado en 'la'
    r = api.get("/gamificacion/ranking").json()
    assert r["filas"][0]["nombre"] == "Laura" and r["filas"][0]["curso_nombre"] == "10-A"
    cursos = api.get("/gamificacion/ranking?tipo=curso&institucion_id=sj").json()
    assert cursos["filas"][0]["nombre"] == "10-A" and cursos["mi_posicion"]["puntos"] == 25


# ---------------------------- Reportes, metas y escenarios ----------------------------
def test_reportes(api):
    r = api.get("/reportes/indicadores?institucion_id=sj&desde=2026-01-01&hasta=2026-12-31").json()
    assert r["inventario"]["total_arboles"] == 1 and r["cobertura"]["revision"]["pendientes"] == 2


def test_metas(api):
    meta = {"institucion_id": "sj", "indicador": "cobertura_inspeccion_pct", "fecha_inicio": "2026-01-01",
            "fecha_fin": "2026-12-31", "valor_meta": 80}
    assert api.post("/metas", json=meta).status_code == 403
    api.como("admin")
    assert api.post("/metas", json={**meta, "valor_meta": 101}).status_code == 422
    assert api.post("/metas", json={**meta, "indicador": "inventado"}).status_code == 422
    r = api.post("/metas", json=meta)
    assert r.status_code == 201 and r.json()["valor_actual"] == 100 and r.json()["unidad"] == "%"
    assert api.post("/metas", json=meta).status_code == 409
    assert api.patch(f"/metas/{r.json()['id']}", json={"fecha_fin": "2025-01-01"}).status_code == 422


def test_escenarios(api):
    api.como("docente")
    assert api.post("/escenarios/simular", json={"institucion_id": "sj", "monto": 1, "tipos": ["zz"]}).status_code == 422
    s = api.post("/escenarios/simular", json={"institucion_id": "sj", "monto": 100000}).json()
    assert s["acciones_incluidas"] == 1 and s["incluidas"][0]["tipo_codigo"] == "tratamiento_fitosanitario"
    assert api.post("/escenarios", json={"institucion_id": "sj", "monto": 1, "nombre": "Plan"}).status_code == 403
    api.como("admin")
    r = api.post("/escenarios", json={"institucion_id": "sj", "monto": 50000, "nombre": "Plan corto"})
    assert r.status_code == 201 and r.json()["resultado"]["acciones_excluidas"] == 1
