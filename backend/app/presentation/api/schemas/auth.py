from pydantic import BaseModel, ConfigDict, Field


class UsuarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    correo: str
    rol: str
    activo: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioResponse


class CrearUsuarioRequest(BaseModel):
    nombre: str = Field(examples=["Camila Pérez"])
    correo: str = Field(examples=["camila@colegio.edu.co"])
    contrasena: str = Field(examples=["una-clave-segura"])
    rol: str = Field(examples=["registrador"], description="admin, registrador o consulta")
