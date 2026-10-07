from dataclasses import dataclass

from app.domain.entities.registro import FotoEntrante
from app.domain.enums import EstadoSanitario, TipoFoto


@dataclass(frozen=True)
class FotoRecibida:
    """Una foto tal como llega en la petición."""

    tipo: TipoFoto
    nombre: str
    contenido: bytes

    def para_reglas(self) -> FotoEntrante:
        return FotoEntrante(self.tipo, self.nombre, len(self.contenido))


@dataclass(frozen=True)
class FiltrosArboles:
    institucion: str | None = None
    estado_sanitario: EstadoSanitario | None = None
    buscar: str = ""
    incluir_bajas: bool = False
    desde: int = 0
    limite: int = 40
