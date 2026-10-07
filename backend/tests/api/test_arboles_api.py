"""Flujo completo por HTTP: API + base de datos + almacenamiento + cálculos."""

import json

import pytest

from app.domain.enums import Rol
from tests.conftest import datos_validos, enviar_registro, imagen


@pytest.fixture
def registrador(cabeceras):
    return cabeceras(Rol.REGISTRADOR)


def test_registro_completo_y_consulta(cliente, registrador, cabeceras):
    r = enviar_registro(cliente, registrador, datos_validos(dap_cm=None, cap_cm="126"), extras=1)
    assert r.status_code == 201, r.json()
    arbol = r.json()
    assert arbol["codigo"] == "IE001-0001"
    obs = arbol["ultima_observacion"]
    assert (obs["cap_cm"], obs["dap_cm"]) == (126, 40.11)
    assert obs["estado_sanitario"] == "en_riesgo"
    assert obs["registrado_por"] == "Usuario registrador"
    assert obs["calculos"]["densidad_estimada"] is True
    assert obs["fecha_hora"].endswith("-05:00")

    # La foto se descarga con sesión, y el usuario de consulta también puede verla
    foto = obs["fotos"][0]
    descarga = cliente.get(foto["url"], headers=cabeceras(Rol.CONSULTA))
    assert descarga.status_code == 200
    assert descarga.headers["content-type"] == "image/png"
    assert descarga.content == imagen()

    detalle = cliente.get("/api/arboles/ie001-0001", headers=registrador)  # sin importar mayúsculas
    assert detalle.json()["codigo"] == "IE001-0001"


def test_visita_e_historial(cliente, registrador):
    codigo = enviar_registro(cliente, registrador, datos_validos()).json()["codigo"]
    visita = datos_validos(fecha_hora="2026-09-15T09:00:00-05:00", altura_m=12.6, observaciones=[])
    r = enviar_registro(cliente, registrador, visita, url=f"/api/arboles/{codigo}/observaciones")
    assert r.status_code == 201, r.json()
    assert r.json()["total_observaciones"] == 2
    historial = cliente.get(f"/api/arboles/{codigo}/observaciones", headers=registrador).json()
    assert [o["estado_sanitario"] for o in historial] == ["en_riesgo", "sano"]


def test_errores_de_validacion_por_campo(cliente, registrador):
    r = enviar_registro(cliente, registrador, datos_validos(altura_m=30, zona="otra"), fotos=("completo",))
    assert r.status_code == 422
    assert r.json() == {
        "detail": "Hay datos inválidos o incompletos.",
        "errores": {
            "zona_otra": "Este campo es obligatorio.",
            "altura_m": "La altura no puede superar 25 m.",
            "fotos": "Debes registrar mínimo 2 fotografías para continuar.",
        },
    }


def test_datos_que_no_son_json(cliente, registrador):
    r = enviar_registro(cliente, registrador, "esto no es json")
    assert r.status_code == 422
    assert r.json()["errores"] == {"datos": "El campo datos debe ser un objeto JSON válido."}


def test_formulario_sin_campo_datos(cliente, registrador):
    r = cliente.post("/api/arboles", files=[("foto_completo", ("a.png", imagen(), "image/png"))], headers=registrador)
    assert r.status_code == 422
    assert "datos" in r.json()["errores"]


def test_foto_demasiado_grande(cliente, registrador):
    archivos = [
        ("foto_completo", ("grande.png", b"0" * (5 * 1024 * 1024 + 10), "image/png")),
        ("foto_detalle", ("b.png", imagen(), "image/png")),
    ]
    r = cliente.post("/api/arboles", data={"datos": json.dumps(datos_validos())}, files=archivos, headers=registrador)
    assert r.json()["errores"]["fotos"] == "Cada fotografía debe pesar máximo 5 MB."


def test_listado_y_resumen(cliente, registrador):
    enviar_registro(cliente, registrador, datos_validos(observaciones=[]))
    enviar_registro(cliente, registrador, datos_validos(institucion_id="la", especie_id=2))
    lista = cliente.get("/api/arboles", params={"buscar": "canaguate"}, headers=registrador).json()
    assert [a["codigo"] for a in lista["items"]] == ["IE002-0001"]
    assert lista["conteos"] == {"todos": 1, "sano": 0, "en_riesgo": 1, "critico": 0}
    criticos = cliente.get("/api/arboles", params={"estado_sanitario": "critico"}, headers=registrador).json()
    assert criticos["total"] == 0
    resumen = cliente.get("/api/reportes/resumen", headers=registrador).json()
    assert (resumen["total"], resumen["sano"], resumen["en_riesgo"]) == (2, 1, 1)


def test_baja_y_sus_efectos(cliente, cabeceras):
    admin = cabeceras(Rol.ADMIN)
    codigo = enviar_registro(cliente, admin, datos_validos()).json()["codigo"]
    assert cliente.post(f"/api/arboles/{codigo}/baja", json={"motivo": ""}, headers=admin).status_code == 422
    r = cliente.post(f"/api/arboles/{codigo}/baja", json={"motivo": "Talado por riesgo"}, headers=admin)
    assert (r.json()["estado"], r.json()["motivo_baja"]) == ("baja", "Talado por riesgo")
    visita = enviar_registro(cliente, admin, datos_validos(fecha_hora=None), url=f"/api/arboles/{codigo}/observaciones")
    assert visita.status_code == 409


@pytest.mark.parametrize("ruta", ["/api/arboles/IE009-0001", "/api/arboles/IE009-0001/observaciones", "/api/fotos/999"])
def test_no_encontrado(cliente, registrador, ruta):
    r = cliente.get(ruta, headers=registrador)
    assert r.status_code == 404
    assert r.json()["detail"].startswith("No existe")


def test_catalogos(cliente, registrador):
    c = cliente.get("/api/catalogos", headers=registrador).json()
    assert [i["prefijo"] for i in c["instituciones"]] == ["IE001", "IE002", "IE003"]
    assert c["etapas"] == ["plantula", "juvenil", "adulto", "senescente"]
    assert [g["grupo"] for g in c["hallazgos"]] == ["follaje", "tronco", "raiz", "plagas"]
    assert len(c["especies"]) == 14
