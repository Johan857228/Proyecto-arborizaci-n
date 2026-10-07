from fastapi import APIRouter, Depends, Request, Response

from app.core.config import Settings
from app.core.database import verificar_conexion
from app.presentation.api.dependencies import get_settings_app

router = APIRouter(tags=["Sistema"])


@router.get("/salud", summary="Estado del backend y de la base de datos")
def salud(request: Request, response: Response, settings: Settings = Depends(get_settings_app)):
    """Lo usan Docker Compose y el proxy HTTPS para saber si el backend está listo."""
    base_ok = verificar_conexion(request.app.state.engine)
    if not base_ok:
        response.status_code = 503
    return {
        "estado": "ok" if base_ok else "sin base de datos",
        "entorno": settings.app_env,
        "base_de_datos": "ok" if base_ok else "sin conexión",
        "version": request.app.version,
    }
