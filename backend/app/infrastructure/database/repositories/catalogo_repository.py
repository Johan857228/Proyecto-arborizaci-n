from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.services.validaciones import CatalogoValido
from app.infrastructure.database.models import (
    EspecieModel,
    HallazgoModel,
    InstitucionModel,
    InterferenciaModel,
    ZonaModel,
)


class CatalogoRepository:
    def __init__(self, db: Session):
        self.db = db

    def catalogo_valido(self) -> CatalogoValido:
        """Códigos permitidos, para que las reglas del dominio validen sin consultar la base."""
        return CatalogoValido(
            instituciones=frozenset(self.db.scalars(select(InstitucionModel.id))),
            zonas=frozenset(self.db.scalars(select(ZonaModel.codigo))),
            especies=frozenset(self.db.scalars(select(EspecieModel.id))),
            interferencias=frozenset(self.db.scalars(select(InterferenciaModel.codigo))),
            hallazgos=frozenset(self.db.scalars(select(HallazgoModel.codigo))),
        )

    def institucion(self, institucion_id: str) -> InstitucionModel | None:
        return self.db.get(InstitucionModel, institucion_id)

    def especie(self, especie_id: int) -> EspecieModel | None:
        return self.db.get(EspecieModel, especie_id)

    def hallazgos_por_codigo(self, codigos: Iterable[str]) -> list[HallazgoModel]:
        codigos = list(codigos)
        if not codigos:
            return []
        return list(self.db.scalars(select(HallazgoModel).where(HallazgoModel.codigo.in_(codigos))))

    def instituciones(self) -> list[InstitucionModel]:
        return list(self.db.scalars(select(InstitucionModel).order_by(InstitucionModel.prefijo)))

    def zonas(self) -> list[ZonaModel]:
        return list(self.db.scalars(select(ZonaModel).order_by(ZonaModel.orden)))

    def interferencias(self) -> list[InterferenciaModel]:
        return list(self.db.scalars(select(InterferenciaModel).order_by(InterferenciaModel.orden)))

    def especies(self) -> list[EspecieModel]:
        return list(self.db.scalars(select(EspecieModel).order_by(EspecieModel.id)))

    def hallazgos(self) -> list[HallazgoModel]:
        return list(self.db.scalars(select(HallazgoModel).order_by(HallazgoModel.orden)))
