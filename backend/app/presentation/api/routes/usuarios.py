from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.application.use_cases.usuarios import crear_usuario, listar_usuarios
from app.presentation.api.dependencies import get_db, puede_administrar_usuarios
from app.presentation.api.schemas.auth import CrearUsuarioRequest, UsuarioResponse

router = APIRouter(prefix="/usuarios", tags=["Usuarios"], dependencies=[Depends(puede_administrar_usuarios)])


@router.post("", status_code=201, response_model=UsuarioResponse, summary="Crear usuario (solo admin)")
def crear(datos: CrearUsuarioRequest, db: Session = Depends(get_db)):
    return crear_usuario(db, nombre=datos.nombre, correo=datos.correo, contrasena=datos.contrasena, rol=datos.rol)


@router.get("", response_model=list[UsuarioResponse], summary="Listar usuarios (solo admin)")
def listar(db: Session = Depends(get_db)):
    return listar_usuarios(db)
