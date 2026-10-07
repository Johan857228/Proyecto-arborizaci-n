"""Contraseñas (bcrypt) y tokens de sesión (JWT)."""

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import Settings


def hash_contrasena(contrasena: str) -> str:
    return bcrypt.hashpw(contrasena.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verificar_contrasena(contrasena: str, hash_guardado: str) -> bool:
    try:
        return bcrypt.checkpw(contrasena.encode("utf-8"), hash_guardado.encode("ascii"))
    except ValueError:
        return False


def crear_token(usuario_id: int, rol: str, settings: Settings, ahora: datetime | None = None) -> str:
    ahora = ahora or datetime.now(UTC)
    datos = {
        "sub": str(usuario_id),
        "rol": rol,
        "iat": ahora,
        "exp": ahora + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(datos, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm)


def leer_token(token: str, settings: Settings) -> dict:
    """Devuelve el contenido del token. Lanza jwt.ExpiredSignatureError o jwt.InvalidTokenError."""
    return jwt.decode(
        token,
        settings.jwt_secret.get_secret_value(),
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "exp"]},
    )
