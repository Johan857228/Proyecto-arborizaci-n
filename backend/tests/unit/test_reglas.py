"""Estado sanitario, códigos, permisos, usuarios y seguridad."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import Settings
from app.core.exceptions import ErrorValidacion, SinPermiso
from app.core.security import crear_token, hash_contrasena, leer_token, verificar_contrasena
from app.domain.enums import EstadoSanitario, Rol
from app.domain.services.codigos import codigo_arbol
from app.domain.services.estado_sanitario import calificar
from app.domain.services.permisos import PERMISOS, Accion, autorizar, puede
from app.domain.services.usuarios import validar_nuevo_usuario

# --- estado sanitario --------------------------------------------------------------


@pytest.mark.parametrize(
    ("hallazgos", "estado"),
    [
        ([], EstadoSanitario.SANO),
        (["a"], EstadoSanitario.EN_RIESGO),
        (["a", "b", "c"], EstadoSanitario.EN_RIESGO),
        (["a", "a", "a", "a"], EstadoSanitario.EN_RIESGO),  # los repetidos cuentan una vez
        (["a", "b", "c", "d"], EstadoSanitario.CRITICO),
    ],
)
def test_calificacion(hallazgos, estado):
    assert calificar(hallazgos) is estado


# --- códigos -----------------------------------------------------------------------


def test_codigo_de_arbol():
    assert codigo_arbol("IE001", 7) == "IE001-0007"
    assert codigo_arbol("IE002", 12345) == "IE002-12345"
    with pytest.raises(ValueError):
        codigo_arbol("IE001", 0)


# --- permisos ----------------------------------------------------------------------


def test_matriz_de_permisos():
    assert {accion: {r.value for r in roles} for accion, roles in PERMISOS.items()} == {
        Accion.VER: {"admin", "registrador", "consulta"},
        Accion.REGISTRAR: {"admin", "registrador"},
        Accion.DAR_DE_BAJA: {"admin"},
        Accion.ADMINISTRAR_USUARIOS: {"admin"},
    }


def test_autorizar():
    autorizar("registrador", Accion.REGISTRAR)
    with pytest.raises(SinPermiso, match="No tienes permiso"):
        autorizar("consulta", Accion.REGISTRAR)


def test_rol_desconocido_no_puede_nada():
    assert not any(puede("superusuario", accion) for accion in Accion)


# --- usuarios ----------------------------------------------------------------------


def test_usuario_valido_se_normaliza():
    assert validar_nuevo_usuario(" Ana ", " Ana@Colegio.EDU.co ", "12345678", "consulta") == (
        "Ana",
        "ana@colegio.edu.co",
        Rol.CONSULTA,
    )


def test_usuario_invalido():
    with pytest.raises(ErrorValidacion) as error:
        validar_nuevo_usuario("", "sin-arroba", "corta", "jefe")
    assert error.value.errores == {
        "nombre": "Escribe el nombre.",
        "correo": "El correo no es válido.",
        "contrasena": "La contraseña debe tener al menos 8 caracteres.",
        "rol": "El rol no existe. Usa admin, registrador o consulta.",
    }


def test_contrasena_demasiado_larga_para_bcrypt():
    with pytest.raises(ErrorValidacion) as error:
        validar_nuevo_usuario("Ana", "ana@x.co", "ñ" * 40, "consulta")  # 80 bytes
    assert error.value.errores == {"contrasena": "La contraseña es demasiado larga."}


# --- seguridad ---------------------------------------------------------------------

AJUSTES = Settings(_env_file=None, jwt_secret="s" * 48, jwt_expire_minutes=60)


def test_hash_de_contrasena():
    guardado = hash_contrasena("clave-segura")
    assert guardado != "clave-segura"
    assert verificar_contrasena("clave-segura", guardado)
    assert not verificar_contrasena("otra", guardado)
    assert not verificar_contrasena("clave-segura", "no-es-un-hash")


def test_token_ida_y_vuelta():
    datos = leer_token(crear_token(7, "registrador", AJUSTES), AJUSTES)
    assert (datos["sub"], datos["rol"]) == ("7", "registrador")


def test_token_vencido():
    hace_dos_horas = datetime.now(UTC) - timedelta(hours=2)
    with pytest.raises(jwt.ExpiredSignatureError):
        leer_token(crear_token(7, "admin", AJUSTES, ahora=hace_dos_horas), AJUSTES)


def test_token_firmado_con_otro_secreto():
    otro = Settings(_env_file=None, jwt_secret="o" * 48)
    with pytest.raises(jwt.InvalidSignatureError):
        leer_token(crear_token(7, "admin", otro), AJUSTES)
