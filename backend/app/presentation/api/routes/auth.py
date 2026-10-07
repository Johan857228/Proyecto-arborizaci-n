from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.application.use_cases.autenticacion import iniciar_sesion
from app.core.config import Settings
from app.infrastructure.database.models import UsuarioModel
from app.presentation.api.dependencies import get_db, get_settings_app, usuario_actual
from app.presentation.api.schemas.auth import TokenResponse, UsuarioResponse

router = APIRouter(prefix="/auth", tags=["Autenticación"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Iniciar sesión",
    description=(
        "Se envía como formulario (`application/x-www-form-urlencoded`): `username` es el correo y "
        "`password` la contraseña. Devuelve el token, que se manda en las demás peticiones con la "
        "cabecera `Authorization: Bearer <token>`."
    ),
)
def login(
    formulario: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_app),
):
    token, usuario = iniciar_sesion(db, settings, formulario.username, formulario.password)
    return TokenResponse(access_token=token, usuario=UsuarioResponse.model_validate(usuario))


@router.get("/yo", response_model=UsuarioResponse, summary="Usuario de la sesión actual")
def yo(usuario: UsuarioModel = Depends(usuario_actual)):
    return usuario
