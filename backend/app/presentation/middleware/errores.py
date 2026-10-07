"""Convierte las excepciones en respuestas JSON con mensajes en español."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.exceptions import ErrorAplicacion, ErrorValidacion, NoAutenticado


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ErrorAplicacion)
    async def _error_aplicacion(request: Request, error: ErrorAplicacion):
        contenido: dict = {"detail": error.mensaje}
        if isinstance(error, ErrorValidacion):
            contenido["errores"] = error.errores
        cabeceras = {"WWW-Authenticate": "Bearer"} if isinstance(error, NoAutenticado) else None
        return JSONResponse(contenido, status_code=error.codigo_http, headers=cabeceras)

    @app.exception_handler(RequestValidationError)
    async def _solicitud_invalida(request: Request, error: RequestValidationError):
        errores = {
            ".".join(str(p) for p in e["loc"] if p not in ("body", "query", "path", "form")): e["msg"]
            for e in error.errors()
        }
        return JSONResponse({"detail": "La solicitud no es válida.", "errores": errores}, status_code=422)
