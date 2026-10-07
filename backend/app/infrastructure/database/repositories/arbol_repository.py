from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.infrastructure.database.models import ArbolModel, ObservacionModel


class ArbolRepository:
    def __init__(self, db: Session):
        self.db = db

    def _consulta(self):
        observaciones = selectinload(ArbolModel.observaciones)
        return select(ArbolModel).options(
            selectinload(ArbolModel.institucion),
            selectinload(ArbolModel.especie),
            selectinload(ArbolModel.zona),
            observaciones.selectinload(ObservacionModel.hallazgos),
            observaciones.selectinload(ObservacionModel.fotos),
            observaciones.selectinload(ObservacionModel.interferencia),
            observaciones.selectinload(ObservacionModel.usuario),
        )

    def por_codigo(self, codigo: str) -> ArbolModel | None:
        return self.db.scalar(self._consulta().where(ArbolModel.codigo == codigo.strip().upper()))

    def todos(self) -> list[ArbolModel]:
        """Todos los árboles, del más reciente al más antiguo."""
        return list(self.db.scalars(self._consulta().order_by(ArbolModel.id.desc())))

    def siguiente_consecutivo(self, institucion_id: str) -> int:
        actual = self.db.scalar(
            select(func.max(ArbolModel.consecutivo)).where(ArbolModel.institucion_id == institucion_id)
        )
        return (actual or 0) + 1

    def agregar(self, arbol: ArbolModel) -> None:
        """Inserta el árbol de inmediato, para que la base valide que el código no se repita."""
        self.db.add(arbol)
        self.db.flush()
