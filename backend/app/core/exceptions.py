"""Excepciones generales.

Las capas de dominio y aplicación las lanzan, y app/presentation/middleware/errores.py
las convierte en respuestas HTTP con mensajes en español.
"""


class ErrorAplicacion(Exception):
    codigo_http = 400

    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


class NoEncontrado(ErrorAplicacion):
    codigo_http = 404


class Conflicto(ErrorAplicacion):
    codigo_http = 409


class NoAutenticado(ErrorAplicacion):
    codigo_http = 401


class SinPermiso(ErrorAplicacion):
    codigo_http = 403


class ErrorValidacion(ErrorAplicacion):
    """Datos inválidos. `errores` asocia cada campo con su mensaje."""

    codigo_http = 422

    def __init__(self, errores: dict[str, str]):
        super().__init__("Hay datos inválidos o incompletos.")
        self.errores = errores
