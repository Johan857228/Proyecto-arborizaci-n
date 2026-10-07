"""Primer usuario administrador.

Si la base no tiene ningún usuario y en el .env están ADMIN_EMAIL y ADMIN_PASSWORD,
se crea ese administrador al arrancar. Con él se crean los demás usuarios desde
POST /api/usuarios.
"""

from sqlalchemy.orm import Session

from app.application.use_cases.usuarios import crear_usuario
from app.domain.enums import Rol
from app.infrastructure.database.models import UsuarioModel
from app.infrastructure.database.repositories.usuario_repository import UsuarioRepository


def crear_admin_inicial(db: Session, correo: str | None, contrasena: str | None) -> UsuarioModel | None:
    if not correo or not contrasena or UsuarioRepository(db).hay_usuarios():
        return None
    return crear_usuario(db, nombre="Administrador", correo=correo, contrasena=contrasena, rol=Rol.ADMIN)
