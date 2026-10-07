"""Configuración compartida de las pruebas.

Base de datos: si la variable TEST_DATABASE_URL tiene valor (por ejemplo en la
integración continua), las pruebas corren contra ese PostgreSQL; si no, contra un
SQLite temporal. Cada prueba arranca con la base vacía.
"""

import io
import json
import os

import bcrypt
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine

from app.application.dto.registro import FotoRecibida
from app.application.use_cases.usuarios import crear_usuario
from app.core.config import Settings
from app.core.database import Base
from app.domain.enums import Rol, TipoFoto
from app.infrastructure.database import models  # noqa: F401  (registra las tablas)
from app.main import create_app

ADMIN_CORREO = "admin@pruebas.co"
ADMIN_CLAVE = "clave-admin-123"
SECRETO_PRUEBAS = "s" * 48


def clave_de(rol: str) -> str:
    return ADMIN_CLAVE if rol == Rol.ADMIN else f"clave-{rol}-123"


def correo_de(rol: str) -> str:
    return ADMIN_CORREO if rol == Rol.ADMIN else f"{rol}@pruebas.co"


@pytest.fixture(autouse=True)
def bcrypt_rapido(monkeypatch):
    """bcrypt con costo mínimo: las pruebas no necesitan hashes lentos."""
    original = bcrypt.gensalt
    monkeypatch.setattr(bcrypt, "gensalt", lambda rounds=4, prefix=b"2b": original(4, prefix))


def _vaciar(url: str) -> None:
    engine = create_engine(url)
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def url_bd(tmp_path):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        yield f"sqlite:///{(tmp_path / 'pruebas.db').as_posix()}"
        return
    _vaciar(url)
    yield url
    _vaciar(url)


@pytest.fixture
def ajustes(url_bd, tmp_path):
    return Settings(
        _env_file=None,
        app_env="pruebas",
        database_url=url_bd,
        storage_path=tmp_path / "fotos",
        jwt_secret=SECRETO_PRUEBAS,
        admin_email=ADMIN_CORREO,
        admin_password=ADMIN_CLAVE,
    )


@pytest.fixture
def app(ajustes):
    return create_app(ajustes)


@pytest.fixture
def cliente(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db(app, cliente):
    """Sesión de la misma base que usa la API (ya con tablas, catálogos y admin)."""
    with app.state.sesiones() as sesion:
        yield sesion


@pytest.fixture
def almacen(app, cliente):
    return app.state.almacen


@pytest.fixture
def usuarios(db):
    """Un usuario por rol. El admin lo crea el arranque a partir de ADMIN_EMAIL."""
    from app.infrastructure.database.repositories.usuario_repository import UsuarioRepository

    repo = UsuarioRepository(db)
    resultado = {Rol.ADMIN: repo.por_correo(ADMIN_CORREO)}
    for rol in (Rol.REGISTRADOR, Rol.CONSULTA):
        resultado[rol] = crear_usuario(
            db, nombre=f"Usuario {rol}", correo=correo_de(rol), contrasena=clave_de(rol), rol=rol
        )
    return resultado


def iniciar_sesion(cliente, correo: str, clave: str):
    return cliente.post("/api/auth/login", data={"username": correo, "password": clave})


@pytest.fixture
def cabeceras(cliente, usuarios):
    """cabeceras(rol) -> {"Authorization": "Bearer ..."} de un usuario con ese rol."""
    cache = {}

    def _cabeceras(rol: str) -> dict:
        if rol not in cache:
            r = iniciar_sesion(cliente, correo_de(rol), clave_de(rol))
            assert r.status_code == 200, r.json()
            cache[rol] = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return cache[rol]

    return _cabeceras


def imagen(formato: str = "PNG", tamano=(40, 30)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", tamano, (18, 150, 111)).save(buffer, format=formato)
    return buffer.getvalue()


def fotos_validas(extras: int = 0) -> list[FotoRecibida]:
    fotos = [
        FotoRecibida(TipoFoto.COMPLETO, "completo.png", imagen()),
        FotoRecibida(TipoFoto.DETALLE, "detalle.jpg", imagen("JPEG")),
    ]
    return fotos + [FotoRecibida(TipoFoto.EXTRA, f"extra{i}.webp", imagen("WEBP")) for i in range(extras)]


def datos_validos(**cambios) -> dict:
    datos = {
        "institucion_id": "sj",
        "zona": "patio_central",
        "latitud": 10.463722,
        "longitud": -73.253981,
        "fecha_hora": "2026-09-01T10:24:00-05:00",
        "especie_id": 1,
        "dap_cm": 40,
        "altura_m": 12,
        "copa_m": 8,
        "etapa": "adulto",
        "interferencia": "ninguna",
        "observaciones": ["f_clorosis", "p_pulgones"],
    }
    datos.update(cambios)
    return datos


def enviar_registro(cliente, cabeceras: dict, datos, *, url="/api/arboles", fotos=("completo", "detalle"), extras=0):
    archivos = [(f"foto_{tipo}", (f"{tipo}.png", imagen(), "image/png")) for tipo in fotos]
    archivos += [("fotos_extra", (f"extra{i}.jpg", imagen("JPEG"), "image/jpeg")) for i in range(extras)]
    contenido = datos if isinstance(datos, str) else json.dumps(datos)
    return cliente.post(url, data={"datos": contenido}, files=archivos or None, headers=cabeceras)
