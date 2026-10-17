"""Autenticación: lee el token del encabezado Authorization y comprueba que sea válido.
También carga el perfil (rol, institución y curso) de quien hace la petición."""
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_auth.errors import AuthError

import db

# auto_error=False para devolver nuestro propio 401 con un mensaje claro
esquema_bearer = HTTPBearer(auto_error=False)

ROLES_REVISORES = ("administrador", "docente")

# Errores de Supabase Auth al crear cuentas o enviar correos, con un mensaje para la persona.
ERRORES_AUTH = {
    "weak_password": (422, "La contraseña es muy débil. Usa al menos 8 caracteres y mezcla letras y números."),
    "email_exists": (409, "Ya existe una cuenta con ese correo."),
    "user_already_exists": (409, "Ya existe una cuenta con ese correo."),
    "email_address_invalid": (422, "Supabase no acepta ese correo. Revisa que esté bien escrito."),
    "signup_disabled": (403, "El registro de cuentas está cerrado. Pide al administrador que te cree la cuenta."),
    "email_not_confirmed": (403, "Todavía no confirmas tu correo. Abre el enlace que te enviamos al crear la cuenta o pide uno nuevo."),
    "over_email_send_rate_limit": (429, "Se enviaron demasiados correos en poco tiempo. Intenta de nuevo en una hora."),
    "over_request_rate_limit": (429, "Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo."),
    "email_address_not_authorized": (
        503,
        "Supabase todavía no puede enviar correos a esta dirección (el proyecto usa el correo de prueba de "
        "Supabase). Pide al administrador que te cree la cuenta.",
    ),
}


def error_de_auth(e: AuthError, por_defecto: str) -> HTTPException:
    """Convierte un error de Supabase Auth en una respuesta con mensaje en español."""
    codigo = getattr(e, "code", None)
    if codigo in ERRORES_AUTH:
        estado, mensaje = ERRORES_AUTH[codigo]
        return HTTPException(status_code=estado, detail=mensaje)
    if (getattr(e, "status", 0) or 0) >= 500:
        # Por ejemplo, el servidor de correo de Supabase no respondió.
        return HTTPException(status_code=503, detail=f"{por_defecto} Supabase no respondió; intenta más tarde.")
    return HTTPException(status_code=400, detail=por_defecto)


@dataclass
class Sesion:
    token: str
    user_id: str
    email: str | None


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

    return Sesion(token=token, user_id=str(usuario.id), email=usuario.email)


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
