from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.domain.enums import EtapaDesarrollo
from app.infrastructure.database.repositories.catalogo_repository import CatalogoRepository
from app.presentation.api.dependencies import get_db, puede_ver
from app.presentation.api.schemas.arboles import (
    CatalogosResponse,
    EspecieResponse,
    GrupoHallazgos,
    InstitucionResponse,
    Opcion,
)

router = APIRouter(tags=["Catálogos"], dependencies=[Depends(puede_ver)])


@router.get("/catalogos", response_model=CatalogosResponse, summary="Listas para los selectores del formulario")
def catalogos(db: Session = Depends(get_db)):
    repo = CatalogoRepository(db)
    grupos: dict[str, list[Opcion]] = {}
    for hallazgo in repo.hallazgos():
        grupos.setdefault(hallazgo.grupo, []).append(Opcion(codigo=hallazgo.codigo, nombre=hallazgo.nombre))
    return CatalogosResponse(
        instituciones=[
            InstitucionResponse(id=i.id, nombre=i.nombre, corto=i.corto, prefijo=i.prefijo)
            for i in repo.instituciones()
        ],
        zonas=[Opcion(codigo=z.codigo, nombre=z.nombre) for z in repo.zonas()],
        etapas=[etapa.value for etapa in EtapaDesarrollo],
        interferencias=[Opcion(codigo=i.codigo, nombre=i.nombre) for i in repo.interferencias()],
        especies=[
            EspecieResponse(id=e.id, nombre_comun=e.nombre_comun, nombre_cientifico=e.nombre_cientifico)
            for e in repo.especies()
        ],
        hallazgos=[GrupoHallazgos(grupo=grupo, items=items) for grupo, items in grupos.items()],
    )
