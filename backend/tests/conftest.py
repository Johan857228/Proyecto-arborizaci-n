"""Utilidades para probar la API SIN conectarse a Supabase (clientes falsos)."""
import os
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

# Valores falsos para que db.py no se queje de variables faltantes
os.environ.setdefault("SUPABASE_URL", "https://falso.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "sb_publishable_falsa")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "sb_secret_falsa")

import db  # noqa: E402
import main  # noqa: E402
from auth import Sesion, usuario_actual  # noqa: E402


class ConsultaFalsa:
    """Imita la cadena  cliente.table("x").select(...).eq(...).execute()."""

    def __init__(self, tabla, almacen, registro):
        self.tabla, self.almacen, self.registro = tabla, almacen, registro
        self.accion, self.fila = "select", None

    def _anotar(self, metodo, *a, **k):
        self.registro.append((self.tabla, metodo, a, k))
        return self

    def __getattr__(self, metodo):
        if metodo in ("select", "eq", "ilike", "order", "range", "limit", "in_"):
            return lambda *a, **k: self._anotar(metodo, *a, **k)
        raise AttributeError(metodo)

    def insert(self, fila):
        self.accion, self.fila = "insert", fila
        return self._anotar("insert", fila)

    def delete(self):
        self.accion = "delete"
        return self._anotar("delete")

    def update(self, fila):
        self.accion, self.fila = "update", fila
        return self._anotar("update", fila)

    def upsert(self, fila, **opciones):
        self.accion, self.fila = "insert", fila
        return self._anotar("upsert", fila, **opciones)

    def execute(self):
        if self.accion == "insert":
            if self.almacen.get("falla_insert") == self.tabla:
                raise APIError({"message": "falla simulada", "code": "23503", "hint": None, "details": None})
            filas = self.fila if isinstance(self.fila, list) else [self.fila]
            return SimpleNamespace(data=[{"id": "id-nuevo", **f} for f in filas])
        if self.accion == "delete":
            return SimpleNamespace(data=[])
        if self.accion == "update":
            return SimpleNamespace(data=[{**f, **self.fila} for f in self.almacen.get(self.tabla, [])])
        return SimpleNamespace(data=self.almacen.get(self.tabla, []))


class StorageFalso:
    def __init__(self, registro):
        self.registro = registro

    def from_(self, bucket):
        return self

    def upload(self, ruta, contenido, opciones=None):
        self.registro.append(("storage", "upload", (ruta,), {}))

    def remove(self, rutas):
        self.registro.append(("storage", "remove", (rutas,), {}))

    def create_signed_url(self, ruta, segundos):
        return {"signedURL": f"https://falso/{ruta}"}


class ClienteFalso:
    def __init__(self, almacen, registro):
        self.almacen, self.registro = almacen, registro
        self.storage = StorageFalso(registro)

    def table(self, nombre):
        return ConsultaFalsa(nombre, self.almacen, self.registro)


ARBOL = {
    "id": "11111111-1111-1111-1111-111111111111",
    "codigo": "IE001-0001",
    "institucion_id": "sj",
    "prefijo": "IE001",
    "nombre_corto": "San José",
    "zona": "Patio central",
    "zona_otra": None,
    "lat": 10.4638,
    "lng": -73.254,
    "nombre_comun": "Mango",
    "nombre_cientifico": "Mangifera indica",
    "dap_cm": 35.5,
    "altura_m": 8.2,
    "copa_m": 4.5,
    "etapa": "Adulto",
    "interferencia": "Ninguna",
    "interferencia_otra": None,
    "registrado_en": "2026-10-07T22:07:50.136524+00:00",
    "n_observaciones": 0,
    "estado": "sano",
    "registrado_por": "usuario-1",
}

PERFIL = {
    "usuario_id": "usuario-1",
    "nombre": "Usuario Uno",
    "correo": "a@b.c",
    "rol": "estudiante",
    "institucion_id": "sj",
    "curso_id": None,
    "activo": True,
}

METODO_V1 = {
    "id": "metodo-1",
    "version": 1,
    "nombre": "Conteo de hallazgos",
    "umbral_riesgo": 1,
    "umbral_critico": 4,
}

CUERPO_ARBOL = {
    "institucion_id": "sj",
    "zona": "Patio central",
    "lat": 10.4638,
    "lng": -73.254,
    "especie_id": 1,
    "dap_cm": 35.5,
    "altura_m": 8.2,
    "copa_m": 4.5,
    "etapa": "Adulto",
    "interferencia": "Ninguna",
    "observaciones": [],
}


@pytest.fixture
def entorno(monkeypatch):
    """Devuelve (cliente HTTP de prueba, almacén de datos, registro de llamadas)."""
    almacen = {
        "arboles_resumen": [ARBOL],
        "arboles": [ARBOL],
        "arbol_fotos": [],
        "perfiles": [PERFIL],
        "metodos_calculo": [METODO_V1],
    }
    registro: list = []
    falso = ClienteFalso(almacen, registro)
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: falso)
    monkeypatch.setattr(db, "get_admin", lambda: falso)
    main.app.dependency_overrides[usuario_actual] = lambda: Sesion(token="t", user_id="usuario-1", email="a@b.c")
    yield TestClient(main.app), almacen, registro
    main.app.dependency_overrides.clear()
