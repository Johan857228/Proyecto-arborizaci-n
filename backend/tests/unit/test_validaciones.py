"""Reglas de validación de un registro (sin base de datos ni API)."""

from datetime import datetime, timedelta

import pytest

from app.core.exceptions import ErrorValidacion
from app.domain.entities.registro import FotoEntrante
from app.domain.enums import EtapaDesarrollo, TipoFoto
from app.domain.services.validaciones import (
    FOTO_MAX_BYTES,
    HORA_COLOMBIA,
    CatalogoValido,
    validar_fotos,
    validar_identificacion,
    validar_nueva_visita,
    validar_observacion,
    validar_registro_nuevo,
)
from seeds.catalogos import HALLAZGOS, INSTITUCIONES, INTERFERENCIAS, ZONAS

CATALOGO = CatalogoValido(
    instituciones=frozenset(i["id"] for i in INSTITUCIONES),
    zonas=frozenset(codigo for codigo, _ in ZONAS),
    especies=frozenset(range(1, 15)),
    interferencias=frozenset(codigo for codigo, _ in INTERFERENCIAS),
    hallazgos=frozenset(codigo for _, items in HALLAZGOS for codigo, _ in items),
)
AHORA = datetime(2026, 10, 7, 12, 0, tzinfo=HORA_COLOMBIA)
FOTOS_OK = [FotoEntrante(TipoFoto.COMPLETO, "a.png", 1000), FotoEntrante(TipoFoto.DETALLE, "b.png", 1000)]


def datos(**cambios):
    base = {
        "institucion_id": "sj",
        "zona": "patio_central",
        "especie_id": 1,
        "latitud": 10.463722,
        "longitud": -73.253981,
        "fecha_hora": "2026-10-07T10:24:00-05:00",
        "dap_cm": "45.5",
        "altura_m": 12.5,
        "copa_m": "8,4",
        "etapa": "adulto",
        "interferencia": "ninguna",
        "observaciones": ["f_clorosis", "p_pulgones", "f_clorosis"],
    }
    base.update(cambios)
    return base


def errores_de(funcion, *args, **kwargs) -> dict:
    errores: dict[str, str] = {}
    funcion(*args, errores, **kwargs)
    return errores


# --- registro completo -------------------------------------------------------------


def test_registro_valido_devuelve_datos_normalizados():
    identificacion, observacion = validar_registro_nuevo(datos(), FOTOS_OK, CATALOGO, ahora=AHORA)
    assert identificacion.institucion_id == "sj"
    assert identificacion.zona_otra is None
    assert observacion.dap_cm == 45.5
    assert observacion.copa_m == 8.4
    assert observacion.etapa is EtapaDesarrollo.ADULTO
    assert observacion.hallazgos == ("f_clorosis", "p_pulgones")  # sin repetidos
    assert observacion.coordenadas.latitud == 10.463722


def test_registro_vacio_reporta_todos_los_campos():
    with pytest.raises(ErrorValidacion) as error:
        validar_registro_nuevo({}, [], CATALOGO, ahora=AHORA)
    assert error.value.errores == {
        "institucion_id": "Este campo es obligatorio.",
        "zona": "Debes seleccionar una zona.",
        "especie_id": "Debes seleccionar una especie.",
        "ubicacion": "Debes obtener la ubicación antes de continuar.",
        "altura_m": "Este campo es obligatorio.",
        "copa_m": "Este campo es obligatorio.",
        "etapa": "Debes seleccionar la etapa de desarrollo.",
        "dap_cm": "Este campo es obligatorio.",
        "interferencia": "Debes seleccionar una opción.",
        "fotos": "Debes registrar mínimo 2 fotografías para continuar.",
    }


def test_errores_previos_se_suman_a_los_del_dominio():
    with pytest.raises(ErrorValidacion) as error:
        validar_registro_nuevo(
            datos(zona=None), FOTOS_OK, CATALOGO, ahora=AHORA, errores_previos={"fotos": "No es una imagen."}
        )
    assert error.value.errores == {"fotos": "No es una imagen.", "zona": "Debes seleccionar una zona."}


# --- identificación ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("cambios", "campo", "mensaje"),
    [
        ({"institucion_id": "zz"}, "institucion_id", "La institución seleccionada no existe."),
        ({"zona": "techo"}, "zona", "La zona seleccionada no existe."),
        ({"zona": "otra"}, "zona_otra", "Este campo es obligatorio."),
        ({"zona": "otra", "zona_otra": "x" * 121}, "zona_otra", "Máximo 120 caracteres."),
        ({"especie_id": 999}, "especie_id", "La especie seleccionada no existe."),
        ({"especie_id": "abc"}, "especie_id", "La especie seleccionada no existe."),
        ({"especie_id": " "}, "especie_id", "Debes seleccionar una especie."),
    ],
)
def test_identificacion_invalida(cambios, campo, mensaje):
    errores = errores_de(validar_identificacion, datos(**cambios), CATALOGO)
    assert errores == {campo: mensaje}


def test_zona_otra_con_texto():
    errores: dict[str, str] = {}
    identificacion = validar_identificacion(datos(zona="otra", zona_otra="  Jardín  "), CATALOGO, errores)
    assert errores == {}
    assert identificacion.zona_otra == "Jardín"


def test_zona_otra_se_ignora_si_la_zona_no_es_otra():
    identificacion = validar_identificacion(datos(zona_otra="sobra"), CATALOGO, {})
    assert identificacion.zona_otra is None


def test_especie_como_texto_numerico():
    assert validar_identificacion(datos(especie_id="3"), CATALOGO, {}).especie_id == 3


# --- observación -------------------------------------------------------------------


def observacion_de(**cambios):
    errores: dict[str, str] = {}
    resultado = validar_observacion(datos(**cambios), CATALOGO, errores, ahora=AHORA)
    return resultado, errores


@pytest.mark.parametrize(
    ("cambios", "campo", "mensaje"),
    [
        ({"latitud": None}, "ubicacion", "Debes obtener la ubicación antes de continuar."),
        ({"latitud": 95}, "ubicacion", "La ubicación recibida no es válida."),
        ({"longitud": "oeste"}, "ubicacion", "La ubicación recibida no es válida."),
        ({"dap_cm": "abc"}, "dap_cm", "Solo se permiten números y decimales."),
        ({"dap_cm": 0}, "dap_cm", "El DAP debe ser mayor que 0."),
        ({"dap_cm": 301}, "dap_cm", "El DAP no puede superar 300 cm."),
        ({"altura_m": 30}, "altura_m", "La altura no puede superar 25 m."),
        ({"altura_m": "-2"}, "altura_m", "La altura debe ser mayor que 0."),
        ({"copa_m": "x"}, "copa_m", "El diámetro de copa debe contener un valor numérico."),
        ({"copa_m": 41}, "copa_m", "El diámetro de copa no puede superar 40 m."),
        ({"etapa": "vieja"}, "etapa", "La etapa seleccionada no existe."),
        ({"interferencia": None}, "interferencia", "Debes seleccionar una opción."),
        ({"interferencia": "rayo"}, "interferencia", "La opción seleccionada no existe."),
        ({"interferencia": "otra_infraestructura"}, "interferencia_otra", "Este campo es obligatorio."),
        (
            {"interferencia": "otra_infraestructura", "interferencia_otra": "x" * 161},
            "interferencia_otra",
            "Máximo 160 caracteres.",
        ),
        ({"observaciones": ["nada"]}, "observaciones", "Observación desconocida: nada."),
        ({"observaciones": "f_manchas"}, "observaciones", "Debe ser una lista de códigos de observación."),
        ({"fecha_hora": "ayer"}, "fecha_hora", "La fecha y hora no tienen un formato válido (ISO 8601)."),
        ({"fecha_hora": "2026-10-08T12:00:00-05:00"}, "fecha_hora", "La fecha y hora no pueden estar en el futuro."),
    ],
)
def test_observacion_invalida(cambios, campo, mensaje):
    resultado, errores = observacion_de(**cambios)
    assert resultado is None
    assert errores == {campo: mensaje}


def test_interferencia_otra_con_descripcion():
    resultado, errores = observacion_de(interferencia="otra_infraestructura", interferencia_otra="Raíces en tubería")
    assert errores == {}
    assert resultado.interferencia_otra == "Raíces en tubería"


def test_sin_fecha_se_usa_la_hora_actual():
    resultado, _ = observacion_de(fecha_hora=None)
    assert resultado.fecha_hora == AHORA


def test_fecha_sin_zona_horaria_se_toma_como_hora_de_colombia():
    resultado, _ = observacion_de(fecha_hora="2026-10-07T08:00:00")
    assert resultado.fecha_hora.utcoffset() == timedelta(hours=-5)


def test_reloj_del_celular_un_poco_adelantado_se_acepta():
    resultado, errores = observacion_de(fecha_hora=(AHORA + timedelta(minutes=3)).isoformat())
    assert errores == {}


def test_sin_observaciones_es_lista_vacia():
    resultado, _ = observacion_de(observaciones=None)
    assert resultado.hallazgos == ()


# --- DAP y CAP ---------------------------------------------------------------------


def test_cap_en_lugar_de_dap():
    resultado, errores = observacion_de(dap_cm=None, cap_cm="126")
    assert errores == {}
    assert (resultado.dap_cm, resultado.cap_cm) == (None, 126.0)


def test_no_se_aceptan_dap_y_cap_a_la_vez():
    _, errores = observacion_de(cap_cm=126)
    assert errores == {"cap_cm": "Envía el DAP o el CAP, no los dos."}


@pytest.mark.parametrize(
    ("cap", "mensaje"),
    [
        ("x", "La circunferencia (CAP) debe contener un valor numérico."),
        ("0", "La circunferencia (CAP) debe ser mayor que 0."),
        ("943", "El CAP no puede superar 942.48 cm."),
    ],
)
def test_cap_invalido(cap, mensaje):
    _, errores = observacion_de(dap_cm=None, cap_cm=cap)
    assert errores == {"cap_cm": mensaje}


def test_plantula_puede_ir_sin_dap():
    resultado, errores = observacion_de(dap_cm=None, etapa="plantula", altura_m=0.6)
    assert errores == {}
    assert resultado.dap_cm is None


def test_arbol_de_menos_de_1_30_m_puede_ir_sin_dap():
    _, errores = observacion_de(dap_cm=None, etapa="juvenil", altura_m=1.2)
    assert errores == {}


def test_arbol_adulto_necesita_dap():
    _, errores = observacion_de(dap_cm="")
    assert errores == {"dap_cm": "Este campo es obligatorio."}


# --- visitas y fotos ---------------------------------------------------------------


def test_visita_debe_ser_posterior_a_la_anterior():
    anterior = datetime(2026, 10, 7, 11, 0, tzinfo=HORA_COLOMBIA)
    with pytest.raises(ErrorValidacion) as error:
        validar_nueva_visita(
            datos(fecha_hora="2026-10-07T10:00:00-05:00"), FOTOS_OK, CATALOGO, ahora=AHORA, ultima_fecha=anterior
        )
    assert error.value.errores == {"fecha_hora": "La fecha debe ser posterior a la última observación del árbol."}


def test_visita_valida():
    anterior = datetime(2026, 9, 1, tzinfo=HORA_COLOMBIA)
    observacion = validar_nueva_visita(datos(), FOTOS_OK, CATALOGO, ahora=AHORA, ultima_fecha=anterior)
    assert observacion.altura_m == 12.5


@pytest.mark.parametrize(
    ("fotos", "mensaje"),
    [
        ([], "Debes registrar mínimo 2 fotografías para continuar."),
        (FOTOS_OK[:1], "Debes registrar mínimo 2 fotografías para continuar."),
        (FOTOS_OK + FOTOS_OK[:1], "Debes registrar mínimo 2 fotografías para continuar."),
        (FOTOS_OK + [FotoEntrante(TipoFoto.EXTRA, "e.png", 10)] * 4, "Puedes agregar hasta 3 fotografías adicionales."),
        (
            [FotoEntrante(TipoFoto.COMPLETO, "a.png", FOTO_MAX_BYTES + 1), FOTOS_OK[1]],
            "Cada fotografía debe pesar máximo 5 MB.",
        ),
    ],
)
def test_fotos_invalidas(fotos, mensaje):
    assert errores_de(validar_fotos, fotos) == {"fotos": mensaje}


def test_fotos_con_tres_adicionales():
    assert errores_de(validar_fotos, FOTOS_OK + [FotoEntrante(TipoFoto.EXTRA, "e.png", 10)] * 3) == {}
