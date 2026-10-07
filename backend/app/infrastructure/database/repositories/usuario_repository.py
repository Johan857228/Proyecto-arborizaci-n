from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.infrastructure.database.models import UsuarioModel


class UsuarioRepository:
    def __init__(self, db: Session):
        self.db = db

    def por_id(self, usuario_id: int) -> UsuarioModel | None:
        return self.db.get(UsuarioModel, usuario_id)

    def por_correo(self, correo: str) -> UsuarioModel | None:
        return self.db.scalar(select(UsuarioModel).where(UsuarioModel.correo == correo.strip().lower()))

    def listar(self) -> list[UsuarioModel]:
        return list(self.db.scalars(select(UsuarioModel).order_by(UsuarioModel.id)))

    def hay_usuarios(self) -> bool:
        return bool(self.db.scalar(select(func.count()).select_from(UsuarioModel)))

    def agregar(self, usuario: UsuarioModel) -> None:
        self.db.add(usuario)
        self.db.flush()
