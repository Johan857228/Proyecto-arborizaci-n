"""Datos de un registro ya validados por las reglas del dominio."""

from dataclasses import dataclass
from datetime import datetime

from app.domain.enums import EtapaDesarrollo, TipoFoto
from app.domain.value_objects.coordenadas import Coordenadas


@dataclass(frozen=True)
class Identificacion:
    """Lo que no cambia entre visitas: institución, zona y especie del árbol."""

    institucion_id: str
    zona: str
    zona_otra: str | None
    especie_id: int


@dataclass(frozen=True)
class Observacion:
    """Lo que se mide en cada visita al árbol."""

    coordenadas: Coordenadas
    fecha_hora: datetime
    dap_cm: float | None
    cap_cm: float | None
    altura_m: float
    copa_m: float
    etapa: EtapaDesarrollo
    interferencia: str
    interferencia_otra: str | None
    hallazgos: tuple[str, ...]


@dataclass(frozen=True)
class FotoEntrante:
    """Datos de una foto recibida que le importan a las reglas (no el archivo en sí)."""

    tipo: TipoFoto
    nombre: str
    tamano_bytes: int
