"""Registro de cuentas nuevas (POST /auth/registro) con un Supabase Auth falso."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError, AuthWeakPasswordError

import db
import main

CUERPO = {"nombre": "  Ana   María  Pérez ", "email": "  Ana.Perez@Colegio.edu.co ", "password": "arboles2026", "acepta_politica": True}


class AuthFalso:
    def __init__(self, respuesta=None, error=None):
        self.respuesta, self.error, self.llamadas = respuesta, error, []

    def sign_up(self, credenciales):
        self.llamadas.append(credenciales)
        if self.error:
            raise self.error
        return self.respuesta


class TablaFalsa:
    """Anota los update(...).eq(...) que el registro hace sobre perfiles."""

    def __init__(self, registro):
        self.registro = registro

    def table(self, nombre):
        self.nombre = nombre
        return self

    def update(self, cambios):
        self.cambios = cambios
        return self

    def eq(self, columna, valor):
        self.registro.append((self.nombre, self.cambios, valor))
        return self

    def execute(self):
        return SimpleNamespace(data=[])


@pytest.fixture
def supabase(monkeypatch):
    auth = AuthFalso()
    auth.perfiles = []
    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: SimpleNamespace(auth=auth))
    monkeypatch.setattr(db, "get_admin", lambda: TablaFalsa(auth.perfiles))
    return auth


def _registrar(cuerpo=CUERPO):
    return TestClient(main.app).post("/auth/registro", json=cuerpo)


def _usuario():
    return SimpleNamespace(id="u-nuevo", email="ana.perez@colegio.edu.co")


def test_registro_con_sesion_inmediata(supabase):
    sesion = SimpleNamespace(access_token="tok", refresh_token="ref", expires_in=3600)
    supabase.respuesta = SimpleNamespace(user=_usuario(), session=sesion)
    r = _registrar()
    assert r.status_code == 201
    j = r.json()
    assert j["requiere_confirmacion"] is False
    assert j["sesion"]["access_token"] == "tok" and j["sesion"]["user_id"] == "u-nuevo"
    # El nombre llega limpio a los metadatos que usa el trigger que crea el perfil.
    enviado = supabase.llamadas[0]
    assert enviado["email"] == "ana.perez@colegio.edu.co"
    assert enviado["options"] == {"data": {"nombre": "Ana María Pérez", "politica_version": main.POLITICA_VERSION}}
    # La aceptación de la política queda en el perfil.
    (tabla, cambios, usuario), = supabase.perfiles
    assert tabla == "perfiles" and usuario == "u-nuevo"
    assert cambios["politica_version"] == main.POLITICA_VERSION and cambios["politica_aceptada_en"]


def test_registro_que_pide_confirmar_el_correo(supabase):
    supabase.respuesta = SimpleNamespace(user=_usuario(), session=None)
    j = _registrar().json()
    assert j["requiere_confirmacion"] is True and j["sesion"] is None
    assert "ana.perez@colegio.edu.co" in j["mensaje"]


@pytest.mark.parametrize(
    "error, estado",
    [
        (AuthApiError("User already registered", 422, "user_already_exists"), 409),
        (AuthWeakPasswordError("Password is too weak", 422, ["characters"]), 422),
        (AuthApiError("Signups not allowed", 422, "signup_disabled"), 403),
        (AuthApiError("Rate limit", 429, "over_email_send_rate_limit"), 429),
        (AuthApiError("Algo raro", 500, "unexpected_failure"), 400),
    ],
)
def test_errores_de_supabase_al_registrar(supabase, error, estado):
    supabase.error = error
    r = _registrar()
    assert r.status_code == estado
    assert r.json()["detail"]


@pytest.mark.parametrize(
    "cambio",
    [
        {"nombre": "A"},                      # muy corto
        {"nombre": "x" * 121},
        {"email": "sin-arroba"},
        {"password": "corta1"},               # menos de 8
        {"password": "solamenteletras"},      # sin números
        {"password": "1234567890"},           # sin letras
        {"password": "a1" * 40},              # más de 72
        {"acepta_politica": False},           # sin aceptar la política de datos
    ],
)
def test_registro_rechaza_datos_invalidos_sin_llamar_a_supabase(supabase, cambio):
    assert _registrar({**CUERPO, **cambio}).status_code == 422
    assert supabase.llamadas == []
