"""Coordenadas GPS en WGS84."""

import math
from dataclasses import dataclass
from typing import Any

from app.domain.value_objects.medicion import ValorInvalido, esta_vacio

SIN_UBICACION = "Debes obtener la ubicación antes de continuar."
UBICACION_INVALIDA = "La ubicación recibida no es válida."


def _grados(valor: Any, limite: float) -> float:
    if isinstance(valor, bool):
        raise ValorInvalido(UBICACION_INVALIDA)
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        raise ValorInvalido(UBICACION_INVALIDA) from None
    if not math.isfinite(numero) or abs(numero) > limite:
        raise ValorInvalido(UBICACION_INVALIDA)
    return round(numero, 6)


@dataclass(frozen=True)
class Coordenadas:
    """Latitud entre -90 y 90 y longitud entre -180 y 180, con 6 decimales (unos 11 cm)."""

    latitud: float
    longitud: float

    @classmethod
    def desde(cls, latitud: Any, longitud: Any) -> "Coordenadas":
        if esta_vacio(latitud) or esta_vacio(longitud):
            raise ValorInvalido(SIN_UBICACION)
        return cls(_grados(latitud, 90), _grados(longitud, 180))
