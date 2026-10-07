"""Qué puede hacer cada rol.

Es la única fuente de verdad de los permisos: las rutas de la API la consultan y
las pruebas de permisos se generan a partir de ella.
"""

from enum import StrEnum

from app.core.exceptions import SinPermiso
from app.domain.enums import Rol

SIN_PERMISO = "No tienes permiso para esta acción."


class Accion(StrEnum):
    VER = "ver"  # catálogos, árboles, historial, fotos y reportes
    REGISTRAR = "registrar"  # árboles nuevos y visitas
    DAR_DE_BAJA = "dar_de_baja"
    ADMINISTRAR_USUARIOS = "administrar_usuarios"


PERMISOS: dict[Accion, frozenset[Rol]] = {
    Accion.VER: frozenset({Rol.ADMIN, Rol.REGISTRADOR, Rol.CONSULTA}),
    Accion.REGISTRAR: frozenset({Rol.ADMIN, Rol.REGISTRADOR}),
    Accion.DAR_DE_BAJA: frozenset({Rol.ADMIN}),
    Accion.ADMINISTRAR_USUARIOS: frozenset({Rol.ADMIN}),
}


def puede(rol: str, accion: Accion) -> bool:
    try:
        return Rol(rol) in PERMISOS[accion]
    except ValueError:
        return False


def autorizar(rol: str, accion: Accion) -> None:
    if not puede(rol, accion):
        raise SinPermiso(SIN_PERMISO)
