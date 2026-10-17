"""Foto de perfil y portada del inicio (PUT/DELETE /perfil/{foto|portada}) con Storage y Auth falsos."""
from types import SimpleNamespace

import pytest

import db
import main
from auth import Sesion, usuario_actual

JPG = b"\xff\xd8\xff\xe0" + b"0" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


@pytest.fixture
def api(entorno):
    """Cliente de prueba con un Auth de administrador falso que guarda el app_metadata."""
    cliente, almacen, registro = entorno
    metadatos: dict = {}
    llamadas: list = []

    def update_user_by_id(uid, atributos):
        llamadas.append((uid, atributos))
        for clave, valor in atributos["app_metadata"].items():
            if valor is None:
                metadatos.pop(clave, None)
            else:
                metadatos[clave] = valor

    db.get_admin().auth = SimpleNamespace(admin=SimpleNamespace(update_user_by_id=update_user_by_id))
    main.app.dependency_overrides[usuario_actual] = lambda: Sesion(
        token="t", user_id="usuario-1", email="a@b.c", metadatos_app=dict(metadatos)
    )
    return SimpleNamespace(http=cliente, registro=registro, metadatos=metadatos, llamadas=llamadas)


def _subidas(registro):
    return [a[0] for (tabla, metodo, a, _k) in registro if tabla == "storage" and metodo == "upload"]


def _borrados(registro):
    return [a[0] for (tabla, metodo, a, _k) in registro if tabla == "storage" and metodo == "remove"]


def test_perfil_sin_imagenes(api):
    r = api.http.get("/perfil")
    assert r.status_code == 200
    assert r.json()["foto_url"] is None
    assert r.json()["portada_url"] is None


@pytest.mark.parametrize("imagen", ["foto", "portada"])
def test_subir_imagen_la_guarda_en_la_carpeta_de_la_persona(api, imagen):
    r = api.http.put(f"/perfil/{imagen}", files={"archivo": ("x.jpg", JPG, "image/jpeg")})
    assert r.status_code == 200, r.text
    (ruta,) = _subidas(api.registro)
    assert ruta.startswith(f"perfiles/usuario-1/{imagen}-") and ruta.endswith(".jpg")
    clave = f"{imagen}_path"
    assert api.metadatos == {clave: ruta}
    assert api.llamadas == [("usuario-1", {"app_metadata": {clave: ruta}})]
    assert r.json()[f"{imagen}_url"] == f"https://falso/{ruta}"


def test_cambiar_foto_borra_la_anterior(api):
    api.metadatos["foto_path"] = "perfiles/usuario-1/foto-vieja.jpg"
    r = api.http.put("/perfil/foto", files={"archivo": ("x.png", PNG, "image/png")})
    assert r.status_code == 200
    assert _borrados(api.registro) == [["perfiles/usuario-1/foto-vieja.jpg"]]
    assert api.metadatos["foto_path"].endswith(".png")


def test_ruta_ajena_en_metadatos_no_se_firma_ni_se_borra(api):
    """Una ruta fuera de la carpeta de la persona (p. ej. la foto de un árbol) se ignora."""
    api.metadatos["portada_path"] = "11111111-1111-1111-1111-111111111111/arbol.jpg"
    assert api.http.get("/perfil").json()["portada_url"] is None
    r = api.http.put("/perfil/portada", files={"archivo": ("x.jpg", JPG, "image/jpeg")})
    assert r.status_code == 200
    assert _borrados(api.registro) == []


def test_quitar_imagen(api):
    api.metadatos["portada_path"] = "perfiles/usuario-1/portada-a.jpg"
    r = api.http.delete("/perfil/portada")
    assert r.status_code == 200
    assert r.json()["portada_url"] is None
    assert api.metadatos == {}
    assert _borrados(api.registro) == [["perfiles/usuario-1/portada-a.jpg"]]


def test_quitar_imagen_inexistente_no_hace_nada(api):
    r = api.http.delete("/perfil/foto")
    assert r.status_code == 200
    assert api.llamadas == []


def test_imagen_desconocida_se_rechaza(api):
    r = api.http.put("/perfil/fondo", files={"archivo": ("x.jpg", JPG, "image/jpeg")})
    assert r.status_code == 422


def test_archivo_que_no_es_imagen_se_rechaza(api):
    r = api.http.put("/perfil/foto", files={"archivo": ("x.jpg", b"no soy una imagen", "image/jpeg")})
    assert r.status_code == 422
    assert _subidas(api.registro) == []


def test_si_falla_auth_se_borra_lo_subido(api):
    def falla(uid, atributos):
        raise RuntimeError("auth caído")

    db.get_admin().auth = SimpleNamespace(admin=SimpleNamespace(update_user_by_id=falla))
    r = api.http.put("/perfil/foto", files={"archivo": ("x.jpg", JPG, "image/jpeg")})
    assert r.status_code == 502
    (ruta,) = _subidas(api.registro)
    assert _borrados(api.registro) == [[ruta]]
