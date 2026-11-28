"""Registro de cuentas nuevas (POST /auth/registro) y cuentas sin confirmar al iniciar sesión,
con un Supabase Auth falso."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError, AuthWeakPasswordError

import db
import main

CUERPO = {"nombre": "  Ana   María  Pérez ", "email": "  Ana.Perez@Colegio.edu.co ", "password": "arboles2026", "acepta_politica": True}
SESION = SimpleNamespace(access_token="tok", refresh_token="ref", expires_in=3600)


def _usuario():
    return SimpleNamespace(id="u-nuevo", email="ana.perez@colegio.edu.co")


class AuthFalso:
    """Lo que el backend usa de supabase-py: sign_up y sign_in_with_password con la llave anónima,
    y create_user, list_users y update_user_by_id con la de servicio."""

    def __init__(self):
        self.respuesta = None
        self.error = None
        self.llamadas = []            # sign_up
        self.creados = []             # admin.create_user
        self.confirmados = []         # admin.update_user_by_id
        self.cuentas = {}             # correo → {"password", "confirmada"}
        self.perfiles = []
        self.admin = self

    # ---- cliente anónimo ----
    def sign_up(self, credenciales):
        self.llamadas.append(credenciales)
        if self.error:
            raise self.error
        return self.respuesta

    def sign_in_with_password(self, credenciales):
        cuenta = self.cuentas.get(credenciales["email"])
        if not cuenta or cuenta["password"] != credenciales["password"]:
            raise AuthApiError("Invalid login credentials", 400, "invalid_credentials")
        if not cuenta["confirmada"]:
            raise AuthApiError("Email not confirmed", 400, "email_not_confirmed")
        return SimpleNamespace(user=SimpleNamespace(id=cuenta["id"], email=credenciales["email"]), session=SESION)

    # ---- administración ----
    def create_user(self, atributos):
        self.creados.append(atributos)
        if self.error:
            raise self.error
        self.cuentas[atributos["email"]] = {"id": "u-nuevo", "password": atributos["password"], "confirmada": atributos["email_confirm"]}
        return SimpleNamespace(user=_usuario())

    def list_users(self, page=1, per_page=50):
        if page > 1:
            return []
        return [SimpleNamespace(id=c["id"], email=correo) for correo, c in self.cuentas.items()]

    def update_user_by_id(self, uid, atributos):
        self.confirmados.append((uid, atributos))
        for cuenta in self.cuentas.values():
            if cuenta["id"] == uid and atributos.get("email_confirm"):
                cuenta["confirmada"] = True


class AdminFalso:
    """Cliente de servicio: auth.admin y los update(...).eq(...) sobre perfiles."""

    def __init__(self, auth):
        self.auth = auth
        self.registro = auth.perfiles

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
    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: SimpleNamespace(auth=auth))
    monkeypatch.setattr(db, "get_admin", lambda: AdminFalso(auth))
    monkeypatch.delenv("CONFIRMAR_CORREO", raising=False)
    main._registros.clear()
    return auth


def _registrar(cuerpo=CUERPO, ip="200.1.1.1"):
    return TestClient(main.app).post("/auth/registro", json=cuerpo, headers={"X-Forwarded-For": ip})


def _login(email="ana.perez@colegio.edu.co", password="arboles2026"):
    return TestClient(main.app).post("/auth/login", json={"email": email, "password": password})


# ======================== Sin confirmar el correo (lo normal) ========================
def test_registro_crea_la_cuenta_confirmada_y_entra(supabase):
    r = _registrar()
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["requiere_confirmacion"] is False
    assert j["sesion"]["access_token"] == "tok" and j["sesion"]["user_id"] == "u-nuevo"
    creado = supabase.creados[0]
    assert creado["email"] == "ana.perez@colegio.edu.co" and creado["email_confirm"] is True
    # El nombre llega limpio a los metadatos que usa el trigger que crea el perfil.
    assert creado["user_metadata"] == {"nombre": "Ana María Pérez", "politica_version": main.POLITICA_VERSION}
    assert supabase.llamadas == []  # no se usó sign_up, que enviaría el correo
    (tabla, cambios, usuario), = supabase.perfiles
    assert tabla == "perfiles" and usuario == "u-nuevo"
    assert cambios["politica_version"] == main.POLITICA_VERSION and cambios["politica_aceptada_en"]


@pytest.mark.parametrize(
    "error, estado",
    [
        (AuthApiError("A user with this email address has already been registered", 422, "email_exists"), 409),
        (AuthWeakPasswordError("Password is too weak", 422, ["characters"]), 422),
        (AuthApiError("Algo raro", 500, "unexpected_failure"), 400),
    ],
)
def test_errores_al_crear_la_cuenta(supabase, error, estado):
    supabase.error = error
    r = _registrar()
    assert r.status_code == estado
    assert r.json()["detail"]


def test_limite_de_registros_por_direccion(supabase):
    for n in range(main.REGISTROS_POR_IP[0]):
        assert _registrar({**CUERPO, "email": f"ana{n}@colegio.edu.co"}).status_code == 201
    assert _registrar({**CUERPO, "email": "otra@colegio.edu.co"}).status_code == 429
    # Desde otra dirección sí se puede.
    assert _registrar({**CUERPO, "email": "otra@colegio.edu.co"}, ip="200.2.2.2").status_code == 201


def test_cuenta_que_quedo_sin_confirmar_entra_y_se_confirma(supabase):
    supabase.cuentas["ana.perez@colegio.edu.co"] = {"id": "u-viejo", "password": "arboles2026", "confirmada": False}
    r = _login()
    assert r.status_code == 200, r.text
    assert r.json()["access_token"] == "tok"
    assert supabase.confirmados == [("u-viejo", {"email_confirm": True})]


def test_contrasena_mala_no_confirma_nada(supabase):
    supabase.cuentas["ana.perez@colegio.edu.co"] = {"id": "u-viejo", "password": "arboles2026", "confirmada": False}
    assert _login(password="otra2026").status_code == 401
    assert supabase.confirmados == []


# ============================ Con CONFIRMAR_CORREO=1 ============================
@pytest.fixture
def con_correo(supabase, monkeypatch):
    monkeypatch.setenv("CONFIRMAR_CORREO", "1")
    monkeypatch.setenv("URL_FRONTEND", "https://arbolado.example.co")
    return supabase


def test_registro_que_pide_confirmar_el_correo(con_correo):
    con_correo.respuesta = SimpleNamespace(user=_usuario(), session=None)
    j = _registrar().json()
    assert j["requiere_confirmacion"] is True and j["sesion"] is None
    assert "ana.perez@colegio.edu.co" in j["mensaje"]
    enviado = con_correo.llamadas[0]
    assert enviado["options"]["data"] == {"nombre": "Ana María Pérez", "politica_version": main.POLITICA_VERSION}
    # El enlace del correo lleva a la app, no al Site URL de Supabase.
    assert enviado["options"]["email_redirect_to"] == "https://arbolado.example.co/login"
    assert con_correo.creados == []


def test_con_confirmacion_y_sesion_inmediata(con_correo):
    con_correo.respuesta = SimpleNamespace(user=_usuario(), session=SESION)
    j = _registrar().json()
    assert j["requiere_confirmacion"] is False and j["sesion"]["access_token"] == "tok"


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
def test_errores_de_supabase_al_registrar(con_correo, error, estado):
    con_correo.error = error
    r = _registrar()
    assert r.status_code == estado
    assert r.json()["detail"]


def test_con_confirmacion_la_cuenta_sin_confirmar_no_entra(con_correo):
    con_correo.cuentas["ana.perez@colegio.edu.co"] = {"id": "u-viejo", "password": "arboles2026", "confirmada": False}
    r = _login()
    assert r.status_code == 403
    assert "confirmas tu correo" in r.json()["detail"]
    assert con_correo.confirmados == []


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
    assert supabase.llamadas == [] and supabase.creados == []
