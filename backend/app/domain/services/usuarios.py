"""Reglas para crear usuarios."""

import re

from app.core.exceptions import ErrorValidacion
from app.domain.enums import Rol

LARGO_MINIMO_CONTRASENA = 8
# bcrypt solo usa los primeros 72 bytes de la contraseña.
MAX_BYTES_CONTRASENA = 72
_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validar_nuevo_usuario(nombre: str, correo: str, contrasena: str, rol: str) -> tuple[str, str, Rol]:
    """Devuelve el nombre y el correo normalizados y el rol. Lanza ErrorValidacion si algo falla."""
    errores: dict[str, str] = {}
    nombre = (nombre or "").strip()
    correo = (correo or "").strip().lower()
    if not nombre:
        errores["nombre"] = "Escribe el nombre."
    if not _CORREO.match(correo):
        errores["correo"] = "El correo no es válido."
    if len(contrasena or "") < LARGO_MINIMO_CONTRASENA:
        errores["contrasena"] = f"La contraseña debe tener al menos {LARGO_MINIMO_CONTRASENA} caracteres."
    elif len(contrasena.encode("utf-8")) > MAX_BYTES_CONTRASENA:
        errores["contrasena"] = "La contraseña es demasiado larga."
    try:
        rol_valido = Rol(rol)
    except ValueError:
        errores["rol"] = "El rol no existe. Usa admin, registrador o consulta."
        rol_valido = None
    if errores:
        raise ErrorValidacion(errores)
    return nombre, correo, rol_valido
