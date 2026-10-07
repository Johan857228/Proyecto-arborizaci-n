"""Lectura y validación de medidas (DAP, CAP, altura, copa)."""

import math
import re
from typing import Any

OBLIGATORIO = "Este campo es obligatorio."
FORMATO_CIFRAS = "Máximo 4 cifras enteras y 2 decimales."

_NUMERO = re.compile(r"^-?(\d+([.,]\d*)?|[.,]\d+)$")


class ValorInvalido(ValueError):
    """Un valor que no cumple una regla del dominio. `mensaje` es el texto para el usuario."""

    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


def esta_vacio(valor: Any) -> bool:
    return valor is None or (isinstance(valor, str) and valor.strip() == "")


def leer_medida(
    valor: Any,
    *,
    msg_formato: str,
    msg_positivo: str,
    maximo: float | None = None,
    msg_maximo: str = "",
) -> float:
    """Convierte una medida en número.

    Acepta número o texto, con punto o coma decimal ("45.5" o "45,5"), igual que
    el teclado numérico del frontend: hasta 4 cifras enteras y 2 decimales.
    """
    if esta_vacio(valor):
        raise ValorInvalido(OBLIGATORIO)
    if isinstance(valor, bool):
        raise ValorInvalido(msg_formato)
    texto = str(valor).strip()
    if not _NUMERO.match(texto):
        raise ValorInvalido(msg_formato)
    numero = float(texto.replace(",", "."))
    if not math.isfinite(numero):
        raise ValorInvalido(msg_formato)
    if numero <= 0:
        raise ValorInvalido(msg_positivo)
    entero, _, decimales = texto.lstrip("-").replace(",", ".").partition(".")
    if len(entero.lstrip("0")) > 4 or len(decimales) > 2:
        raise ValorInvalido(FORMATO_CIFRAS)
    if maximo is not None and numero > maximo:
        raise ValorInvalido(msg_maximo)
    return round(numero, 2)
