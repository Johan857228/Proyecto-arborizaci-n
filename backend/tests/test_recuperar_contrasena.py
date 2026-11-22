"""Recuperar la contraseña con un enlace al correo (Supabase Auth)."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

import db
import main


class AnonQueGuarda:
    def __init__(self, error=None):
        self.llamadas = []
        self.error = error
        self.auth = self

    def reset_password_for_email(self, email, opciones):
        self.llamadas.append((email, opciones))
        if self.error:
            raise self.error


@pytest.fixture
def anon(monkeypatch):
    cliente = AnonQueGuarda()
    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: cliente)
    monkeypatch.delenv("URL_FRONTEND", raising=False)
    return cliente


def test_el_enlace_vuelve_a_la_pagina_web_que_lo_pidio(anon):
    r = TestClient(main.app).post("/auth/recuperar", json={"email": " Ana@Colegio.edu.co "},
                                  headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 200 and "ana@colegio.edu.co" in r.json()["mensaje"]
    assert anon.llamadas == [("ana@colegio.edu.co", {"redirect_to": "http://localhost:3000/restablecer"})]


def test_sin_origen_permitido_usa_url_frontend(anon, monkeypatch):
    monkeypatch.setenv("URL_FRONTEND", "https://arbolado.example.co/")
    TestClient(main.app).post("/auth/recuperar", json={"email": "a@b.co"}, headers={"Origin": "https://malicioso.example"})
    assert anon.llamadas[0][1] == {"redirect_to": "https://arbolado.example.co/restablecer"}


def test_sin_origen_ni_url_frontend_usa_la_de_supabase(anon):
    TestClient(main.app).post("/auth/recuperar", json={"email": "a@b.co"})
    assert anon.llamadas[0][1] == {}


def test_responde_igual_si_el_correo_no_existe(monkeypatch):
    cliente = AnonQueGuarda(AuthApiError("User not found", 400, "user_not_found"))
    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: cliente)
    r = TestClient(main.app).post("/auth/recuperar", json={"email": "nadie@b.co"})
    assert r.status_code == 200 and "Si nadie@b.co tiene una cuenta" in r.json()["mensaje"]


def test_demasiados_pedidos(monkeypatch):
    cliente = AnonQueGuarda(AuthApiError("rate limit", 429, "over_email_send_rate_limit"))
    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: cliente)
    assert TestClient(main.app).post("/auth/recuperar", json={"email": "a@b.co"}).status_code == 429


def test_correo_mal_escrito():
    assert TestClient(main.app).post("/auth/recuperar", json={"email": "sin-arroba"}).status_code == 422


class AdminAuth:
    def __init__(self, usuario=None, error=None):
        self.usuario, self.error = usuario, error
        self.cambios = []
        self.auth = self
        self.admin = self

    def get_user(self, token):
        if self.usuario is None:
            raise Exception("token vencido")
        return SimpleNamespace(user=self.usuario)

    def update_user_by_id(self, uid, datos):
        if self.error:
            raise self.error
        self.cambios.append((uid, datos))


TOKEN = "t" * 40


def test_restablecer_guarda_la_contrasena_nueva(monkeypatch):
    admin = AdminAuth(usuario=SimpleNamespace(id="u1"))
    monkeypatch.setattr(db, "get_admin", lambda: admin)
    r = TestClient(main.app).post("/auth/restablecer", json={"access_token": TOKEN, "password": "arboles2026"})
    assert r.status_code == 200, r.text
    assert admin.cambios == [("u1", {"password": "arboles2026"})]


def test_enlace_vencido(monkeypatch):
    monkeypatch.setattr(db, "get_admin", lambda: AdminAuth())
    r = TestClient(main.app).post("/auth/restablecer", json={"access_token": TOKEN, "password": "arboles2026"})
    assert r.status_code == 401 and "Pide uno nuevo" in r.json()["detail"]


@pytest.mark.parametrize("password", ["corta1", "sololetrasaqui", "12345678901"])
def test_contrasena_debil_no_llega_a_supabase(monkeypatch, password):
    admin = AdminAuth(usuario=SimpleNamespace(id="u1"))
    monkeypatch.setattr(db, "get_admin", lambda: admin)
    r = TestClient(main.app).post("/auth/restablecer", json={"access_token": TOKEN, "password": password})
    assert r.status_code == 422 and admin.cambios == []


def test_misma_contrasena_que_antes(monkeypatch):
    admin = AdminAuth(usuario=SimpleNamespace(id="u1"), error=AuthApiError("same", 422, "same_password"))
    monkeypatch.setattr(db, "get_admin", lambda: admin)
    r = TestClient(main.app).post("/auth/restablecer", json={"access_token": TOKEN, "password": "arboles2026"})
    assert r.status_code == 422 and "distinta" in r.json()["detail"]
