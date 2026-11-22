"""Borrar un árbol: solo el administrador o un docente de la institución del árbol."""
import pytest
from fastapi.testclient import TestClient

import db
import main
from auth import Sesion, usuario_actual
from tests.memoria import BaseMemoria
from tests.test_modulos_api import A1, A2, I1, I2, USUARIOS, _mundo

MOTIVO = {"motivo": "Registro duplicado de IE001-0002"}


@pytest.fixture
def api(monkeypatch):
    mundo = _mundo()
    mundo["arbol_fotos"] = [{"id": "f1", "arbol_id": A1, "tipo": "completo", "storage_path": f"{A1}/general.jpg"}]
    mundo["inspeccion_fotos"] = [{"id": "f2", "inspeccion_id": I2, "tipo": "completo", "storage_path": f"insp/{I2}/a.jpg"}]
    base = BaseMemoria(mundo)
    base.archivos = {f"{A1}/general.jpg": b"x", f"insp/{I2}/a.jpg": b"y", "otro/foto.jpg": b"z"}
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: base)
    monkeypatch.setattr(db, "get_admin", lambda: base)

    def como(clave):
        uid = USUARIOS[clave][0]
        main.app.dependency_overrides[usuario_actual] = lambda: Sesion(token=clave, user_id=uid, email=f"{clave}@x.co")

    cliente = TestClient(main.app)
    cliente.como = como
    cliente.base = base
    yield cliente
    main.app.dependency_overrides.clear()


def _borrar(api, arbol_id, cuerpo=MOTIVO):
    return api.request("DELETE", f"/arboles/{arbol_id}", json=cuerpo)


@pytest.mark.parametrize("quien", ["est1", "docente_la"])
def test_no_borra_quien_no_gestiona_la_institucion(api, quien):
    api.como(quien)
    assert _borrar(api, A1).status_code == 403
    assert any(a["id"] == A1 for a in api.base.tablas["arboles"])


def test_docente_borra_un_arbol_de_su_institucion(api):
    api.como("docente")
    r = _borrar(api, A1)
    assert r.status_code == 204, r.text
    assert not any(a["id"] == A1 for a in api.base.tablas["arboles"])
    constancia = api.base.tablas["arboles_eliminados"][0]
    assert constancia["arbol_id"] == A1 and constancia["codigo"] == "IE001-0001"
    assert constancia["motivo"] == MOTIVO["motivo"] and constancia["eliminado_por"] == USUARIOS["docente"][0]
    assert constancia["datos"]["zona"] == "Patio central"
    # Las fotos del árbol y de sus inspecciones salen de Storage; las de otros árboles no.
    assert set(api.base.archivos) == {"otro/foto.jpg"}


def test_admin_borra_en_cualquier_institucion(api):
    api.como("admin")
    assert _borrar(api, A2).status_code == 204
    assert not any(a["id"] == A2 for a in api.base.tablas["arboles"])


def test_el_motivo_es_obligatorio(api):
    api.como("docente")
    assert _borrar(api, A1, {"motivo": "  no "}).status_code == 422
    assert _borrar(api, A1, {}).status_code == 422


def test_arbol_que_no_existe(api):
    api.como("docente")
    assert _borrar(api, "99999999-9999-9999-9999-999999999999").status_code == 404


def test_sin_migracion_016_se_borra_igual(api):
    api.como("docente")
    api.base.fallar["arboles_eliminados"] = ("insert", "PGRST205")
    assert _borrar(api, A1).status_code == 204
    assert not any(a["id"] == A1 for a in api.base.tablas["arboles"])


def test_otro_error_al_dejar_constancia_no_borra(api):
    api.como("docente")
    api.base.fallar["arboles_eliminados"] = ("insert", "23514")
    assert _borrar(api, A1).status_code == 422
    assert any(a["id"] == A1 for a in api.base.tablas["arboles"])
    assert any(i["id"] == I1 for i in api.base.tablas["inspecciones"])
