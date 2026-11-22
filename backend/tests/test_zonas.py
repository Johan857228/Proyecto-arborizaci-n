"""Zonas propias de cada institución (migración 016)."""
import pytest
from fastapi.testclient import TestClient

import db
import main
from auth import Sesion, usuario_actual
from tests.memoria import BaseMemoria
from tests.test_modulos_api import A1, C1, USUARIOS, _arbol, _mundo


@pytest.fixture
def api(monkeypatch):
    mundo = _mundo()
    # La tabla arboles real tiene la zona; la vista arboles_resumen la repite.
    mundo["arboles"] = [{**a, "zona": "Patio central"} for a in mundo["arboles"]]
    mundo["instituciones"] = [{**i, "lat": 10.4638, "lng": -73.254} for i in mundo["instituciones"]]
    base = BaseMemoria(mundo)
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: base)
    monkeypatch.setattr(db, "get_admin", lambda: base)

    def como(clave):
        uid = USUARIOS[clave][0]
        main.app.dependency_overrides[usuario_actual] = lambda: Sesion(token=clave, user_id=uid, email=f"{clave}@x.co")

    cliente = TestClient(main.app)
    cliente.como = como
    cliente.base = base
    como("docente")
    yield cliente
    main.app.dependency_overrides.clear()


def _nombres(respuesta):
    return [z["nombre"] for z in respuesta.json()["zonas"]]


def _id(api, nombre):
    return next(z["id"] for z in api.base.tablas["zonas"] if z["nombre"] == nombre and z["institucion_id"] == "sj")


def test_institucion_sin_zonas_arranca_con_las_de_siempre(api):
    api.como("est1")
    r = api.get("/instituciones/sj/zonas")
    assert r.status_code == 200
    cuerpo = r.json()
    assert _nombres(r) == ["Patio central", "Entrada principal", "Zona deportiva", "Bloques académicos"]
    assert cuerpo["editable"] is True and cuerpo["puede_editar"] is False
    patio = cuerpo["zonas"][0]
    assert patio["arboles"] == 1 and patio["cursos"] == 1
    # Se guardaron una sola vez.
    api.get("/instituciones/sj/zonas")
    assert len([z for z in api.base.tablas["zonas"] if z["institucion_id"] == "sj"]) == 4


def test_sin_migracion_se_usan_las_de_siempre_y_no_se_editan(api):
    api.base.fallar["zonas"] = ("select", "PGRST205")
    r = api.get("/instituciones/sj/zonas")
    assert r.status_code == 200 and r.json()["editable"] is False and r.json()["puede_editar"] is False
    assert len(r.json()["zonas"]) == 4
    assert api.post("/instituciones/sj/zonas", json={"nombre": "Cancha"}).status_code == 503


def test_docente_crea_zona_en_su_institucion(api):
    r = api.post("/instituciones/sj/zonas", json={"nombre": "  Cancha múltiple "})
    assert r.status_code == 201 and "Cancha múltiple" in _nombres(r)
    assert r.json()["puede_editar"] is True


@pytest.mark.parametrize("quien", ["est1", "docente_la"])
def test_solo_quien_gestiona_la_institucion_crea_zonas(api, quien):
    api.como(quien)
    assert api.post("/instituciones/sj/zonas", json={"nombre": "Cancha"}).status_code == 403


def test_admin_crea_zonas_en_cualquier_institucion(api):
    api.como("admin")
    assert api.post("/instituciones/la/zonas", json={"nombre": "Huerta"}).status_code == 201


@pytest.mark.parametrize("nombre", ["patio CENTRAL", "Otra", "otra"])
def test_no_se_repiten_zonas_ni_se_usa_otra(api, nombre):
    api.get("/instituciones/sj/zonas")
    assert api.post("/instituciones/sj/zonas", json={"nombre": nombre}).status_code == 409


def test_renombrar_pasa_arboles_y_cursos_al_nombre_nuevo(api):
    api.get("/instituciones/sj/zonas")
    r = api.patch(f"/zonas/{_id(api, 'Patio central')}", json={"nombre": "Patio de primaria"})
    assert r.status_code == 200, r.text
    assert "Patio de primaria" in _nombres(r) and "Patio central" not in _nombres(r)
    arbol = next(a for a in api.base.tablas["arboles"] if a["id"] == A1)
    assert arbol["zona"] == "Patio de primaria"
    # El árbol de la otra institución no cambia.
    assert all(a["zona"] == "Patio central" for a in api.base.tablas["arboles"] if a["institucion_id"] == "la")
    assert {"curso_id": C1, "zona": "Patio de primaria"} in api.base.tablas["curso_zonas"]


def test_docente_de_otra_institucion_no_renombra(api):
    api.get("/instituciones/sj/zonas")
    api.como("docente_la")
    assert api.patch(f"/zonas/{_id(api, 'Patio central')}", json={"nombre": "Patio"}).status_code == 403


def test_borrar_zona_con_arboles_pide_a_donde_pasarlos(api):
    api.get("/instituciones/sj/zonas")
    zona = _id(api, "Patio central")
    r = api.delete(f"/zonas/{zona}")
    assert r.status_code == 409 and "elige a qué zona" in r.json()["detail"]
    assert api.delete(f"/zonas/{zona}", params={"mover_a": "Patio central"}).status_code == 422
    r = api.delete(f"/zonas/{zona}", params={"mover_a": "Zona deportiva"})
    assert r.status_code == 200, r.text
    assert "Patio central" not in _nombres(r)
    assert next(a for a in api.base.tablas["arboles"] if a["id"] == A1)["zona"] == "Zona deportiva"
    assert not [cz for cz in api.base.tablas["curso_zonas"] if cz["zona"] == "Patio central"]


def test_borrar_zona_sin_arboles(api):
    api.get("/instituciones/sj/zonas")
    r = api.delete(f"/zonas/{_id(api, 'Bloques académicos')}")
    assert r.status_code == 200 and "Bloques académicos" not in _nombres(r)


def test_curso_solo_acepta_zonas_de_su_institucion(api):
    nuevo = {"institucion_id": "sj", "nombre": "11-A", "anio": 2026}
    assert api.post("/cursos", json={**nuevo, "zonas": ["Cancha"]}).status_code == 422
    api.post("/instituciones/sj/zonas", json={"nombre": "Cancha"})
    r = api.post("/cursos", json={**nuevo, "zonas": ["Cancha", "Otra"]})
    assert r.status_code == 201, r.text
    assert sorted(r.json()["zonas"]) == ["Cancha", "Otra"]


def test_arbol_con_zona_que_ya_no_existe_queda_como_otra(api):
    api.como("est1")
    api.base.tablas["arboles_resumen"].append(_arbol("id-por-asignar", "IE001-0002", "sj"))
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
    cuerpo = {"institucion_id": "sj", "zona": "Cancha vieja", "lat": 10.4, "lng": -73.2, "especie_id": 1, "dap_cm": 20,
              "altura_m": 5, "copa_m": 3, "etapa": "Juvenil", "interferencia": "Ninguna", "observaciones": []}
    r = api.post("/arboles", json=cuerpo)
    assert r.status_code == 201, r.text
    guardado = next(a for a in api.base.tablas["arboles"] if a["id"] == r.json()["id"])
    assert guardado["zona"] == "Otra" and guardado["zona_otra"] == "Cancha vieja"


# ------------------------------- Tipo y plano -------------------------------
CONTORNO = [[10.4640, -73.2542], [10.4640, -73.2538], [10.4636, -73.2538], [10.4636, -73.2542]]


def _zona_json(r, nombre):
    return next(z for z in r.json()["zonas"] if z["nombre"] == nombre)


def test_las_de_siempre_arrancan_con_su_tipo(api):
    r = api.get("/instituciones/sj/zonas")
    assert _zona_json(r, "Zona deportiva")["tipo"] == "cancha"
    assert _zona_json(r, "Bloques académicos")["tipo"] == "salones"
    assert _zona_json(r, "Patio central")["contorno"] is None


def test_crear_zona_con_tipo(api):
    r = api.post("/instituciones/sj/zonas", json={"nombre": "Biblioteca", "tipo": "biblioteca"})
    assert r.status_code == 201 and _zona_json(r, "Biblioteca")["tipo"] == "biblioteca"
    assert api.post("/instituciones/sj/zonas", json={"nombre": "Coliseo", "tipo": "estadio"}).status_code == 422


def test_cambiar_solo_el_tipo(api):
    api.get("/instituciones/sj/zonas")
    r = api.patch(f"/zonas/{_id(api, 'Patio central')}", json={"tipo": "otro"})
    assert r.status_code == 200 and _zona_json(r, "Patio central")["tipo"] == "otro"


def test_dibujar_y_quitar_el_contorno(api):
    api.get("/instituciones/sj/zonas")
    zona = _id(api, "Patio central")
    # El último punto repite el primero (se cerró la figura) y hay un doble toque: se limpian.
    r = api.put(f"/zonas/{zona}/contorno", json={"contorno": CONTORNO + [CONTORNO[3], CONTORNO[0]]})
    assert r.status_code == 200, r.text
    assert _zona_json(r, "Patio central")["contorno"] == CONTORNO
    r = api.put(f"/zonas/{zona}/contorno", json={"contorno": None})
    assert _zona_json(r, "Patio central")["contorno"] is None


@pytest.mark.parametrize("contorno, texto", [
    (CONTORNO[:2], "tres esquinas"),
    ([[10.4640, -73.2542], [10.4640, -73.2542], [10.4636, -73.2538]], "tres esquinas"),
    ([[40.41, -3.70], [40.42, -3.70], [40.42, -3.71]], "Colombia"),
    ([[10.50, -73.2542], [10.50, -73.2538], [10.4990, -73.2538]], "km"),
])
def test_contornos_que_no_sirven(api, contorno, texto):
    api.get("/instituciones/sj/zonas")
    r = api.put(f"/zonas/{_id(api, 'Patio central')}/contorno", json={"contorno": contorno})
    assert r.status_code == 422 and texto in r.text


def test_solo_quien_gestiona_dibuja(api):
    api.get("/instituciones/sj/zonas")
    api.como("est1")
    assert api.put(f"/zonas/{_id(api, 'Patio central')}/contorno", json={"contorno": CONTORNO}).status_code == 403

