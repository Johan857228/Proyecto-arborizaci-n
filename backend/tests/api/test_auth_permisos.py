"""Autenticación y permisos por rol, probados por HTTP como los usaría el frontend."""

import itertools
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.security import crear_token
from app.domain.enums import Rol
from app.domain.services.permisos import PERMISOS, Accion
from tests.conftest import (
    ADMIN_CLAVE,
    ADMIN_CORREO,
    SECRETO_PRUEBAS,
    clave_de,
    correo_de,
    datos_validos,
    enviar_registro,
    iniciar_sesion,
)

# --- inicio de sesión --------------------------------------------------------------


def test_login_correcto(cliente):
    r = iniciar_sesion(cliente, ADMIN_CORREO, ADMIN_CLAVE)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["token_type"] == "bearer"
    assert cuerpo["usuario"]["rol"] == "admin"
    assert "hash_contrasena" not in cuerpo["usuario"]


def test_login_ignora_mayusculas_del_correo(cliente):
    assert iniciar_sesion(cliente, ADMIN_CORREO.upper(), ADMIN_CLAVE).status_code == 200


@pytest.mark.parametrize(("correo", "clave"), [(ADMIN_CORREO, "clave-equivocada"), ("nadie@pruebas.co", "lo-que-sea")])
def test_login_fallido_no_revela_si_el_correo_existe(cliente, correo, clave):
    r = iniciar_sesion(cliente, correo, clave)
    assert r.status_code == 401
    assert r.json() == {"detail": "Correo o contraseña incorrectos."}


def test_login_sin_datos(cliente):
    r = iniciar_sesion(cliente, "", "")
    assert r.status_code == 422
    assert set(r.json()["errores"]) == {"username", "password"}


def test_usuario_desactivado_no_puede_entrar(cliente, db, usuarios):
    usuarios[Rol.REGISTRADOR].activo = False
    db.commit()
    assert iniciar_sesion(cliente, correo_de(Rol.REGISTRADOR), clave_de(Rol.REGISTRADOR)).status_code == 401


def test_quien_soy(cliente, cabeceras):
    r = cliente.get("/api/auth/yo", headers=cabeceras(Rol.CONSULTA))
    assert r.status_code == 200
    assert (r.json()["correo"], r.json()["rol"]) == ("consulta@pruebas.co", "consulta")


# --- tokens inválidos --------------------------------------------------------------


def _token(usuario_id, rol="admin", secreto=SECRETO_PRUEBAS, ahora=None, algoritmo="HS256"):
    ahora = ahora or datetime.now(UTC)
    datos = {"sub": str(usuario_id), "rol": rol, "iat": ahora, "exp": ahora + timedelta(minutes=30)}
    return jwt.encode(datos, secreto, algorithm=algoritmo)


@pytest.mark.parametrize(
    ("cabecera", "mensaje"),
    [
        (None, "Debes iniciar sesión."),
        ("Bearer", "Debes iniciar sesión."),
        ("Basic YWRtaW46YWRtaW4=", "Debes iniciar sesión."),
        ("Bearer no-es-un-token", "La sesión no es válida. Inicia sesión de nuevo."),
    ],
)
def test_peticion_sin_sesion_valida(cliente, cabecera, mensaje):
    headers = {"Authorization": cabecera} if cabecera else {}
    r = cliente.get("/api/arboles", headers=headers)
    assert r.status_code == 401
    assert r.json() == {"detail": mensaje}
    assert r.headers["www-authenticate"] == "Bearer"


def test_token_firmado_con_otro_secreto(cliente, usuarios):
    token = _token(usuarios[Rol.ADMIN].id, secreto="otro-secreto-" * 4)
    r = cliente.get("/api/arboles", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_token_sin_firma_alg_none(cliente, usuarios):
    token = jwt.encode({"sub": str(usuarios[Rol.ADMIN].id), "exp": 9999999999}, None, algorithm="none")
    assert cliente.get("/api/arboles", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_token_vencido(cliente, usuarios, ajustes):
    token = crear_token(usuarios[Rol.ADMIN].id, "admin", ajustes, ahora=datetime.now(UTC) - timedelta(days=1))
    r = cliente.get("/api/arboles", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.json()["detail"] == "La sesión expiró. Inicia sesión de nuevo."


@pytest.mark.parametrize("sub", ["999", "no-es-numero"])
def test_token_de_usuario_inexistente(cliente, sub):
    r = cliente.get("/api/arboles", headers={"Authorization": f"Bearer {_token(sub)}"})
    assert r.status_code == 401


def test_el_rol_del_token_no_da_permisos(cliente, usuarios):
    """Un token alterado que diga rol=admin no sirve: el rol se lee de la base."""
    token = _token(usuarios[Rol.CONSULTA].id, rol="admin")
    r = cliente.get("/api/usuarios", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_cambio_de_rol_aplica_de_inmediato(cliente, db, usuarios, cabeceras):
    headers = cabeceras(Rol.REGISTRADOR)
    usuarios[Rol.REGISTRADOR].rol = "consulta"
    db.commit()
    assert enviar_registro(cliente, headers, datos_validos()).status_code == 403


def test_usuario_desactivado_pierde_la_sesion(cliente, db, usuarios, cabeceras):
    headers = cabeceras(Rol.REGISTRADOR)
    usuarios[Rol.REGISTRADOR].activo = False
    db.commit()
    assert cliente.get("/api/arboles", headers=headers).status_code == 401


# --- matriz de permisos ------------------------------------------------------------
# (método, ruta, acción que exige, código esperado si se permite)

OPERACIONES = [
    ("GET", "/api/catalogos", Accion.VER, 200),
    ("GET", "/api/arboles", Accion.VER, 200),
    ("GET", "/api/arboles/{codigo}", Accion.VER, 200),
    ("GET", "/api/arboles/{codigo}/observaciones", Accion.VER, 200),
    ("GET", "/api/fotos/{foto}", Accion.VER, 200),
    ("GET", "/api/reportes/resumen", Accion.VER, 200),
    ("POST", "/api/arboles", Accion.REGISTRAR, 201),
    ("POST", "/api/arboles/{codigo}/observaciones", Accion.REGISTRAR, 201),
    ("POST", "/api/arboles/{codigo}/baja", Accion.DAR_DE_BAJA, 200),
    ("GET", "/api/usuarios", Accion.ADMINISTRAR_USUARIOS, 200),
    ("POST", "/api/usuarios", Accion.ADMINISTRAR_USUARIOS, 201),
]


def test_la_matriz_cubre_todas_las_rutas_protegidas(app):
    publicas = {("GET", "/api/salud"), ("POST", "/api/auth/login"), ("GET", "/api/auth/yo")}
    rutas = {(metodo.upper(), ruta) for ruta, operaciones in app.openapi()["paths"].items() for metodo in operaciones}
    probadas = {(m, r.replace("{codigo}", "{codigo}").replace("{foto}", "{foto_id}")) for m, r, _, _ in OPERACIONES}
    assert rutas - publicas == probadas


@pytest.fixture
def arbol_existente(cliente, cabeceras):
    r = enviar_registro(cliente, cabeceras(Rol.ADMIN), datos_validos())
    assert r.status_code == 201, r.json()
    return r.json()


def _hacer(cliente, metodo, ruta, headers, arbol):
    ruta = ruta.format(codigo=arbol["codigo"], foto=arbol["ultima_observacion"]["fotos"][0]["id"])
    if metodo == "GET":
        return cliente.get(ruta, headers=headers)
    if ruta == "/api/arboles":
        return enviar_registro(cliente, headers, datos_validos())
    if ruta.endswith("/observaciones"):
        return enviar_registro(cliente, headers, datos_validos(fecha_hora=None), url=ruta)
    if ruta.endswith("/baja"):
        return cliente.post(ruta, json={"motivo": "Prueba de permisos"}, headers=headers)
    return cliente.post(
        ruta,
        json={"nombre": "Nuevo", "correo": "nuevo@pruebas.co", "contrasena": "clave-larga-1", "rol": "consulta"},
        headers=headers,
    )


@pytest.mark.parametrize(
    ("rol", "operacion"),
    list(itertools.product(list(Rol), OPERACIONES)),
    ids=lambda v: v if isinstance(v, str) else f"{v[0]} {v[1]}",
)
def test_cada_rol_solo_hace_lo_permitido(cliente, cabeceras, arbol_existente, rol, operacion):
    metodo, ruta, accion, codigo_ok = operacion
    r = _hacer(cliente, metodo, ruta, cabeceras(rol), arbol_existente)
    if rol in PERMISOS[accion]:
        assert r.status_code == codigo_ok, r.text
    else:
        assert r.status_code == 403, r.text
        assert r.json() == {"detail": "No tienes permiso para esta acción."}


@pytest.mark.parametrize("operacion", OPERACIONES, ids=lambda o: f"{o[0]} {o[1]}")
def test_sin_sesion_todo_responde_401(cliente, arbol_existente, operacion):
    metodo, ruta, _, _ = operacion
    assert _hacer(cliente, metodo, ruta, {}, arbol_existente).status_code == 401


def test_la_operacion_rechazada_no_cambia_nada(cliente, cabeceras, arbol_existente):
    consulta = cabeceras(Rol.CONSULTA)
    assert enviar_registro(cliente, consulta, datos_validos()).status_code == 403
    assert (
        cliente.post(
            f"/api/arboles/{arbol_existente['codigo']}/baja", json={"motivo": "x"}, headers=consulta
        ).status_code
        == 403
    )
    admin = cabeceras(Rol.ADMIN)
    assert cliente.get("/api/arboles", headers=admin).json()["total"] == 1
    assert cliente.get(f"/api/arboles/{arbol_existente['codigo']}", headers=admin).json()["estado"] == "activo"


def test_solo_el_admin_crea_usuarios_y_puede_crear_otros_admin(cliente, cabeceras):
    nuevo = {"nombre": "Otra admin", "correo": "otra@pruebas.co", "contrasena": "clave-larga-1", "rol": "admin"}
    assert cliente.post("/api/usuarios", json=nuevo, headers=cabeceras(Rol.REGISTRADOR)).status_code == 403
    r = cliente.post("/api/usuarios", json=nuevo, headers=cabeceras(Rol.ADMIN))
    assert r.status_code == 201
    assert iniciar_sesion(cliente, "otra@pruebas.co", "clave-larga-1").json()["usuario"]["rol"] == "admin"


def test_crear_usuario_con_datos_invalidos(cliente, cabeceras):
    malo = {"nombre": "", "correo": "x", "contrasena": "123", "rol": "jefe"}
    r = cliente.post("/api/usuarios", json=malo, headers=cabeceras(Rol.ADMIN))
    assert r.status_code == 422
    assert set(r.json()["errores"]) == {"nombre", "correo", "contrasena", "rol"}
    repetido = {"nombre": "Otro", "correo": ADMIN_CORREO, "contrasena": "clave-larga-1", "rol": "consulta"}
    assert cliente.post("/api/usuarios", json=repetido, headers=cabeceras(Rol.ADMIN)).status_code == 409
