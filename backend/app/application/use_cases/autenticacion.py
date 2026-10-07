"""Inicio de sesión y lectura del usuario a partir del token."""

from functools import cache

import jwt
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import NoAutenticado
from app.core.security import crear_token, hash_contrasena, leer_token, verificar_contrasena
from app.infrastructure.database.models import UsuarioModel
from app.infrastructure.database.repositories.usuario_repository import UsuarioRepository

CREDENCIALES_INVALIDAS = "Correo o contraseña incorrectos."
SESION_INVALIDA = "La sesión no es válida. Inicia sesión de nuevo."
SESION_EXPIRADA = "La sesión expiró. Inicia sesión de nuevo."


@cache
def _hash_de_relleno() -> str:
    return hash_contrasena("contrasena-de-relleno")


def iniciar_sesion(db: Session, settings: Settings, correo: str, contrasena: str) -> tuple[str, UsuarioModel]:
    usuario = UsuarioRepository(db).por_correo(correo or "")
    # Si el correo no existe se verifica igual contra un hash de relleno, para que el
    # tiempo de respuesta no delate qué correos están registrados.
    hash_guardado = usuario.hash_contrasena if usuario else _hash_de_relleno()
    contrasena_ok = verificar_contrasena(contrasena or "", hash_guardado)
    if usuario is None or not contrasena_ok or not usuario.activo:
        raise NoAutenticado(CREDENCIALES_INVALIDAS)
    return crear_token(usuario.id, usuario.rol, settings), usuario


def usuario_desde_token(db: Session, settings: Settings, token: str) -> UsuarioModel:
    """El rol se lee de la base, no del token: un cambio de rol aplica de inmediato."""
    try:
        datos = leer_token(token, settings)
    except jwt.ExpiredSignatureError:
        raise NoAutenticado(SESION_EXPIRADA) from None
    except jwt.InvalidTokenError:
        raise NoAutenticado(SESION_INVALIDA) from None
    try:
        usuario_id = int(datos["sub"])
    except ValueError:
        raise NoAutenticado(SESION_INVALIDA) from None
    usuario = UsuarioRepository(db).por_id(usuario_id)
    if usuario is None or not usuario.activo:
        raise NoAutenticado(SESION_INVALIDA)
    return usuario
