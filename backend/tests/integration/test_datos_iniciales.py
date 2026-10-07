"""Arranque: tablas, catálogos y administrador inicial."""

import pytest
from sqlalchemy import func, select

from app.application.use_cases.usuarios import crear_usuario
from app.core.exceptions import Conflicto
from app.infrastructure.database.models import EspecieModel, HallazgoModel, UsuarioModel
from app.infrastructure.database.repositories.catalogo_repository import CatalogoRepository
from app.infrastructure.database.repositories.usuario_repository import UsuarioRepository
from seeds.catalogos import cargar_catalogos
from seeds.usuarios import crear_admin_inicial
from tests.conftest import ADMIN_CORREO


def test_catalogos_cargados_al_arrancar(db):
    catalogo = CatalogoRepository(db).catalogo_valido()
    assert catalogo.instituciones == {"sj", "la", "vv"}
    assert "otra" in catalogo.zonas
    assert len(catalogo.especies) == 14
    assert len(catalogo.hallazgos) == 14


def test_cargar_catalogos_dos_veces_no_duplica(db):
    cargar_catalogos(db)
    assert db.scalar(select(func.count()).select_from(EspecieModel)) == 14
    assert db.scalar(select(func.count()).select_from(HallazgoModel)) == 14


def test_admin_inicial_creado_una_sola_vez(db):
    admin = UsuarioRepository(db).por_correo(ADMIN_CORREO)
    assert admin.rol == "admin"
    assert crear_admin_inicial(db, "otro@pruebas.co", "clave-larga-1") is None  # ya hay usuarios
    assert crear_admin_inicial(db, None, None) is None
    assert db.scalar(select(func.count()).select_from(UsuarioModel)) == 1


def test_correo_repetido_sin_importar_mayusculas(db):
    with pytest.raises(Conflicto):
        crear_usuario(db, nombre="Otro", correo=ADMIN_CORREO.upper(), contrasena="clave-larga-1", rol="consulta")
