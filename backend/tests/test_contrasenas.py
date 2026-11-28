"""Contraseñas sin depender del correo: temporal creada por el administrador o el docente, cambio
desde Mi perfil, y "recuperar contraseña" que no manda enlaces que caerían en localhost."""
import re
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

import db
import main
from auth import Sesion, usuario_actual
from tests.memoria import BaseMemoria
from tests.test_modulos_api import USUARIOS, _mundo


class AdminAuthFalso:
    def __init__(self):
        self.cambios = []

    def update_user_by_id(self, uid, atributos):
        self.cambios.append((uid, atributos))


class AnonFalso:
    def __init__(self, clave_buena="vieja2026"):
        self.clave_buena = clave_buena
        self.intentos = []
        self.recuperaciones = []

    def sign_in_with_password(self, datos):
        self.intentos.append(datos)
        if datos["password"] != self.clave_buena:
            raise AuthApiError("Invalid login credentials", 400, "invalid_credentials")
        return SimpleNamespace(user=None, session=None)

    def reset_password_for_email(self, email, opciones):
        self.recuperaciones.append((email, opciones))


@pytest.fixture
def api(monkeypatch):
    base = BaseMemoria(_mundo())
    base.auth = SimpleNamespace(admin=AdminAuthFalso())
    anon = AnonFalso()
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: base)
    monkeypatch.setattr(db, "get_admin", lambda: base)
    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: SimpleNamespace(auth=anon))

    def como(clave):
        uid = USUARIOS[clave][0]
        main.app.dependency_overrides[usuario_actual] = lambda: Sesion(token=clave, user_id=uid, email=f"{clave}@x.co")

    cliente = TestClient(main.app)
    cliente.como, cliente.base, cliente.anon = como, base, anon
    cliente.cambios = base.auth.admin.cambios
    yield cliente
    main.app.dependency_overrides.clear()


def _temporal(api, quien, a_quien):
    api.como(quien)
    return api.post(f"/usuarios/{USUARIOS[a_quien][0]}/contrasena-temporal")


# ============================== Contraseña temporal ==============================
def test_admin_crea_una_contrasena_temporal_y_confirma_el_correo(api):
    r = _temporal(api, "admin", "est1")
    assert r.status_code == 200, r.text
    clave = r.json()["contrasena"]
    assert re.fullmatch(r"[a-z]+-\d{6}-[a-z]+", clave)
    assert api.cambios == [(USUARIOS["est1"][0], {"password": clave, "email_confirm": True})]


def test_dos_contrasenas_temporales_no_se_repiten(api):
    assert _temporal(api, "admin", "est1").json()["contrasena"] != _temporal(api, "admin", "est1").json()["contrasena"]


@pytest.mark.parametrize("quien, a_quien, estado", [
    ("docente", "est1", 200),        # estudiante de su institución
    ("docente", "docente_la", 403),  # otro docente
    ("docente_la", "est1", 403),     # estudiante de otra institución
    ("admin", "admin", 409),         # la propia se cambia en Mi perfil
    ("est2", "est1", 403),           # los estudiantes no gestionan cuentas
])
def test_quien_puede_crear_contrasenas_temporales(api, quien, a_quien, estado):
    assert _temporal(api, quien, a_quien).status_code == estado


def test_no_se_toca_la_contrasena_de_otro_administrador(api):
    otro = "00000000-0000-0000-0000-0000000000ff"
    api.base.tablas["perfiles"].append({**api.base.tablas["perfiles"][0], "usuario_id": otro, "rol": "administrador"})
    api.como("admin")
    assert api.post(f"/usuarios/{otro}/contrasena-temporal").status_code == 403
    assert api.post("/usuarios/00000000-0000-0000-0000-0000000000ee/contrasena-temporal").status_code == 404
    assert api.cambios == []


# ============================== Cambiar la propia ==============================
def test_cambiar_mi_contrasena(api):
    api.como("est1")
    r = api.post("/perfil/contrasena", json={"actual": "vieja2026", "nueva": "nueva2026x"})
    assert r.status_code == 200, r.text
    assert api.anon.intentos[0]["email"] == "est1@x.co"
    assert api.cambios == [(USUARIOS["est1"][0], {"password": "nueva2026x"})]


@pytest.mark.parametrize("cuerpo", [
    {"actual": "otra2026", "nueva": "nueva2026x"},     # la actual no es la correcta
    {"actual": "vieja2026", "nueva": "vieja2026"},     # igual a la actual
    {"actual": "vieja2026", "nueva": "sololetras"},    # sin números
    {"actual": "vieja2026", "nueva": "corta1"},        # muy corta
])
def test_cambios_de_contrasena_que_no_se_aceptan(api, cuerpo):
    api.como("est1")
    assert api.post("/perfil/contrasena", json=cuerpo).status_code == 422
    assert api.cambios == []


# ======================== Recuperar sin caer en localhost ========================
def test_no_manda_el_correo_si_el_enlace_caeria_en_localhost(api, monkeypatch):
    monkeypatch.setattr(main, "redireccion_permitida", lambda destino: False)
    r = TestClient(main.app).post("/auth/recuperar", json={"email": "ana@x.co"}, headers={"Origin": "http://localhost:3001"})
    assert r.status_code == 200
    assert r.json()["enviado"] is False and "contraseña temporal" in r.json()["mensaje"]
    assert api.anon.recuperaciones == []


def test_manda_el_correo_cuando_supabase_acepta_la_direccion(api, monkeypatch):
    monkeypatch.setattr(main, "redireccion_permitida", lambda destino: True)
    r = TestClient(main.app).post("/auth/recuperar", json={"email": "ana@x.co"}, headers={"Origin": "http://localhost:3001"})
    assert r.json()["enviado"] is True
    assert api.anon.recuperaciones == [("ana@x.co", {"redirect_to": "http://localhost:3001/restablecer"})]


@pytest.mark.parametrize("ubicacion, esperado", [
    ("http://localhost:3000/#error=access_denied&error_code=otp_expired", False),
    ("https://app.example.co/restablecer#error=access_denied&error_code=otp_expired", True),
])
def test_comprueba_a_donde_lleva_el_enlace(monkeypatch, ubicacion, esperado):
    llamadas = []

    def get(url, **kwargs):
        llamadas.append((url, kwargs["params"]))
        return SimpleNamespace(headers={"location": ubicacion})

    monkeypatch.setattr(httpx, "get", get)
    monkeypatch.setenv("SUPABASE_URL", "https://proyecto.supabase.co")
    main._redirecciones.clear()
    assert main.redireccion_permitida("https://app.example.co/restablecer") is esperado
    assert main.redireccion_permitida("https://app.example.co/restablecer") is esperado
    assert len(llamadas) == 1  # el resultado queda guardado unos minutos
    url, params = llamadas[0]
    assert url == "https://proyecto.supabase.co/auth/v1/verify" and params["redirect_to"] == "https://app.example.co/restablecer"
    main._redirecciones.clear()
