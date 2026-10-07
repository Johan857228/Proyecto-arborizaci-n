"""Modelos de SQLAlchemy. Importarlos aquí registra todas las tablas en Base.metadata."""

from app.infrastructure.database.models.arbol import ArbolModel, FotoModel, ObservacionModel, observacion_hallazgo
from app.infrastructure.database.models.catalogos import (
    EspecieModel,
    HallazgoModel,
    InstitucionModel,
    InterferenciaModel,
    ZonaModel,
)
from app.infrastructure.database.models.usuario import UsuarioModel

__all__ = [
    "ArbolModel",
    "EspecieModel",
    "FotoModel",
    "HallazgoModel",
    "InstitucionModel",
    "InterferenciaModel",
    "ObservacionModel",
    "UsuarioModel",
    "ZonaModel",
    "observacion_hallazgo",
]
