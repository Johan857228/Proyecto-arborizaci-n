"""Búsqueda del inventario en el servidor y filtro por la persona que registró el árbol."""
import pytest
from fastapi.testclient import TestClient

import db
import main
from auth import Sesion, usuario_actual
from tests.memoria import BaseMemoria
from tests.test_modulos_api import USUARIOS, _arbol, _mundo

EST1, EST2 = USUARIOS["est1"][0], USUARIOS["est2"][0]


@pytest.fixture
def api(monkeypatch):
    mundo = _mundo()
    mundo["arboles_resumen"] = [
        _arbol("a1", "IE001-0001", "sj"),
        _arbol("a2", "IE001-0002", "sj", nombre_comun="Guayacán", nombre_cientifico="Handroanthus chrysanthus",
               registrado_por=EST2, zona="Otra", zona_otra="Huerta escolar"),
        _arbol("a3", "IE001-0003", "sj", nombre_comun="Ceiba", nombre_cientifico="Ceiba pentandra", registrado_por=EST2),
    ]
    base = BaseMemoria(mundo)
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: base)
    monkeypatch.setattr(db, "get_admin", lambda: base)

    def como(clave):
        uid = USUARIOS[clave][0]
        main.app.dependency_overrides[usuario_actual] = lambda: Sesion(token=clave, user_id=uid, email=f"{clave}@x.co")

    cliente = TestClient(main.app)
    cliente.como = como
    como("docente")
    yield cliente
    main.app.dependency_overrides.clear()


def _codigos(r):
    assert r.status_code == 200, r.text
    return sorted(a["codigo"] for a in r.json())


@pytest.mark.parametrize("texto, esperados", [
    ("ie001-0002", ["IE001-0002"]),
    ("GUAYA", ["IE001-0002"]),
    ("pentandra", ["IE001-0003"]),
    ("huerta", ["IE001-0002"]),
    ("patio", ["IE001-0001", "IE001-0003"]),
])
def test_busca_en_codigo_especie_y_zona(api, texto, esperados):
    assert _codigos(api.get("/arboles", params={"q": texto})) == esperados


def test_caracteres_especiales_no_rompen_la_busqueda(api):
    assert _codigos(api.get("/arboles", params={"q": 'mango,(x)"%'})) == []
    assert _codigos(api.get("/arboles", params={"q": " , ( ) "})) == ["IE001-0001", "IE001-0002", "IE001-0003"]


def test_docente_filtra_por_alumno(api):
    assert _codigos(api.get("/arboles", params={"registrado_por": EST2})) == ["IE001-0002", "IE001-0003"]
    assert _codigos(api.get("/arboles", params={"registrado_por": EST2, "q": "ceiba"})) == ["IE001-0003"]


def test_estudiante_solo_puede_pedir_sus_registros(api):
    api.como("est1")
    assert _codigos(api.get("/arboles", params={"registrado_por": EST1})) == ["IE001-0001"]
    assert api.get("/arboles", params={"registrado_por": EST2}).status_code == 403


def test_filtro_por_zona_propia(api):
    assert _codigos(api.get("/arboles", params={"zona": "Otra"})) == ["IE001-0002"]
