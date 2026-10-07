from sqlalchemy.orm import Session

from app.core.exceptions import Conflicto
from app.core.security import hash_contrasena
from app.domain.services.usuarios import validar_nuevo_usuario
from app.infrastructure.database.models import UsuarioModel
from app.infrastructure.database.repositories.usuario_repository import UsuarioRepository


def crear_usuario(db: Session, *, nombre: str, correo: str, contrasena: str, rol: str) -> UsuarioModel:
    nombre, correo, rol_valido = validar_nuevo_usuario(nombre, correo, contrasena, rol)
    usuarios = UsuarioRepository(db)
    if usuarios.por_correo(correo) is not None:
        raise Conflicto("Ya existe un usuario con ese correo.")
    usuario = UsuarioModel(
        nombre=nombre, correo=correo, hash_contrasena=hash_contrasena(contrasena), rol=rol_valido.value, activo=True
    )
    usuarios.agregar(usuario)
    db.commit()
    return usuario


def listar_usuarios(db: Session) -> list[UsuarioModel]:
    return UsuarioRepository(db).listar()
