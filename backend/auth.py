"""Autenticación: lee el token del encabezado Authorization y comprueba que sea válido.
También carga el perfil (rol, institución y curso) de quien hace la petición."""
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import db

# auto_error=False para devolver nuestro propio 401 con un mensaje claro
esquema_bearer = HTTPBearer(auto_error=False)

ROLES_REVISORES = ("administrador", "docente")


@dataclass
class Sesion:
    token: str
    user_id: str
    email: str | None
    # app_metadata de Supabase Auth: solo lo escribe el backend (la persona no puede cambiarlo).
    # Guarda las rutas de la foto de perfil y de la portada.
    metadatos_app: dict = field(default_factory=dict)


@dataclass
class Perfil:
    usuario_id: str
    nombre: str
    rol: str
    institucion_id: str | None
    curso_id: str | None
    activo: bool
    correo: str | None
    sesion: Sesion

    @property
    def es_admin(self) -> bool:
        return self.rol == "administrador"

    @property
    def es_revisor(self) -> bool:
        return self.rol in ROLES_REVISORES

    def gestiona(self, institucion_id: str | None) -> bool:
        """Administrador en cualquier institución; docente solo en la suya."""
        return self.es_admin or (self.rol == "docente" and institucion_id is not None and self.institucion_id == institucion_id)


def usuario_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(esquema_bearer),
) -> Sesion:
    """Dependencia de FastAPI: protege un endpoint.

    El frontend debe enviar:  Authorization: Bearer <access_token>
    """
    if credenciales is None:
        raise HTTPException(status_code=401, detail="Falta el token. Inicia sesión.")

    token = credenciales.credentials
    try:
        # Supabase Auth confirma que el token es válido y no ha expirado
        usuario = db.get_admin().auth.get_user(token).user
    except Exception:
        usuario = None

    if usuario is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    return Sesion(token=token, user_id=str(usuario.id), email=usuario.email, metadatos_app=dict(usuario.app_metadata or {}))


def _nombre_por_defecto(email: str | None) -> str:
    return ((email or "").split("@")[0] or "Usuario")[:120]


def perfil_actual(sesion: Sesion = Depends(usuario_actual)) -> Perfil:
    """Dependencia: el perfil de quien llama. Si aún no existe (usuario creado antes de la
    migración o sin el trigger de perfiles) se crea como estudiante."""
    cliente = db.cliente_de_usuario(sesion.token)
    filas = (
        cliente.table("perfiles")
        .select("usuario_id, nombre, correo, rol, institucion_id, curso_id, activo")
        .eq("usuario_id", sesion.user_id)
        .execute()
        .data
    )
    if filas:
        fila = filas[0]
    else:
        fila = {
            "usuario_id": sesion.user_id,
            "nombre": _nombre_por_defecto(sesion.email),
            "correo": sesion.email,
            "rol": "estudiante",
            "institucion_id": None,
            "curso_id": None,
            "activo": True,
        }
        db.get_admin().table("perfiles").upsert(
            {k: fila[k] for k in ("usuario_id", "nombre", "correo")}, on_conflict="usuario_id", ignore_duplicates=True
        ).execute()

    if not fila.get("activo", True):
        raise HTTPException(status_code=403, detail="Tu cuenta está desactivada. Habla con el administrador.")

    return Perfil(
        usuario_id=str(fila["usuario_id"]),
        nombre=fila["nombre"],
        rol=fila["rol"],
        institucion_id=fila.get("institucion_id"),
        curso_id=fila.get("curso_id"),
        activo=bool(fila.get("activo", True)),
        correo=fila.get("correo"),
        sesion=sesion,
    )


def revisor_actual(perfil: Perfil = Depends(perfil_actual)) -> Perfil:
    if not perfil.es_revisor:
        raise HTTPException(status_code=403, detail="Esta función es solo para docentes y administradores")
    return perfil


def admin_actual(perfil: Perfil = Depends(perfil_actual)) -> Perfil:
    if not perfil.es_admin:
        raise HTTPException(status_code=403, detail="Esta función es solo para administradores")
    return perfil
