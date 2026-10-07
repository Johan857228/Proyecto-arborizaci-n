"""Dependencias reutilizables de FastAPI: configuración, sesión de base de datos y permisos.

Flujo de una ruta protegida:
    token JWT -> usuario actual -> verificación del permiso -> endpoint
"""

from collections.abc import Callable, Iterator

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.application.use_cases.autenticacion import usuario_desde_token
from app.core.config import Settings, get_settings
from app.core.exceptions import NoAutenticado
from app.domain.services.permisos import Accion, autorizar
from app.infrastructure.database.models import UsuarioModel
from app.infrastructure.storage.fotos import AlmacenFotos

# auto_error=False para responder con nuestro propio mensaje en español.
esquema_token = OAuth2PasswordBearer(tokenUrl=f"{get_settings().api_prefix}/auth/login", auto_error=False)


def get_settings_app(request: Request) -> Settings:
    return request.app.state.settings


def get_almacen(request: Request) -> AlmacenFotos:
    return request.app.state.almacen


def get_db(request: Request) -> Iterator[Session]:
    db = request.app.state.sesiones()
    try:
        yield db
    finally:
        db.close()


def usuario_actual(
    token: str | None = Depends(esquema_token),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_app),
) -> UsuarioModel:
    if not token:
        raise NoAutenticado("Debes iniciar sesión.")
    return usuario_desde_token(db, settings, token)


def requiere(accion: Accion) -> Callable[..., UsuarioModel]:
    """Dependencia que deja pasar solo a los roles con permiso para `accion`."""

    def dependencia(usuario: UsuarioModel = Depends(usuario_actual)) -> UsuarioModel:
        autorizar(usuario.rol, accion)
        return usuario

    return dependencia


# Una por acción, para usarlas en las rutas: usuario = Depends(puede_registrar)
puede_ver = requiere(Accion.VER)
puede_registrar = requiere(Accion.REGISTRAR)
puede_dar_de_baja = requiere(Accion.DAR_DE_BAJA)
puede_administrar_usuarios = requiere(Accion.ADMINISTRAR_USUARIOS)
