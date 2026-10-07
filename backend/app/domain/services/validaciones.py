"""Reglas de validación de un registro de árbol.

No dependen de FastAPI ni de la base de datos: reciben los datos tal como llegan y
un `CatalogoValido` con los códigos permitidos. Cada error queda asociado al campo
que lo causó, con el mismo mensaje que muestra el frontend.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.exceptions import ErrorValidacion
from app.domain.entities.registro import FotoEntrante, Identificacion, Observacion
from app.domain.enums import EtapaDesarrollo, TipoFoto
from app.domain.value_objects.coordenadas import Coordenadas
from app.domain.value_objects.medicion import OBLIGATORIO, ValorInvalido, esta_vacio, leer_medida

# Colombia no tiene horario de verano: UTC-5 todo el año.
HORA_COLOMBIA = timezone(timedelta(hours=-5), "America/Bogota")

ZONA_OTRA = "otra"
INTERFERENCIA_OTRA = "otra_infraestructura"

ALTURA_MAXIMA_M = 25
DAP_MAXIMO_CM = 300
COPA_MAXIMA_M = 40
# El DAP se mide a 1,30 m del suelo: un árbol más bajo (o una plántula) no tiene DAP.
ALTURA_DEL_DAP_M = 1.3

FOTOS_EXTRA_MAX = 3
FOTO_MAX_BYTES = 5 * 1024 * 1024
FALTAN_FOTOS = "Debes registrar mínimo 2 fotografías para continuar."

# Margen para relojes de celular un poco adelantados.
TOLERANCIA_RELOJ = timedelta(minutes=5)

MAX_TEXTO_ZONA = 120
MAX_TEXTO_INTERFERENCIA = 160


@dataclass(frozen=True)
class CatalogoValido:
    instituciones: frozenset[str]
    zonas: frozenset[str]
    especies: frozenset[int]
    interferencias: frozenset[str]
    hallazgos: frozenset[str]


def _texto(valor: Any) -> str | None:
    return None if esta_vacio(valor) else str(valor).strip()


def _medida(datos: dict, campo: str, errores: dict[str, str], **reglas) -> float | None:
    try:
        return leer_medida(datos.get(campo), **reglas)
    except ValorInvalido as error:
        errores[campo] = error.mensaje
        return None


def validar_identificacion(
    datos: dict[str, Any], catalogo: CatalogoValido, errores: dict[str, str]
) -> Identificacion | None:
    institucion_id = _texto(datos.get("institucion_id"))
    if institucion_id is None:
        errores["institucion_id"] = OBLIGATORIO
    elif institucion_id not in catalogo.instituciones:
        errores["institucion_id"] = "La institución seleccionada no existe."

    zona = _texto(datos.get("zona"))
    zona_otra = _texto(datos.get("zona_otra"))
    if zona is None:
        errores["zona"] = "Debes seleccionar una zona."
    elif zona not in catalogo.zonas:
        errores["zona"] = "La zona seleccionada no existe."
    elif zona == ZONA_OTRA:
        if zona_otra is None:
            errores["zona_otra"] = OBLIGATORIO
        elif len(zona_otra) > MAX_TEXTO_ZONA:
            errores["zona_otra"] = f"Máximo {MAX_TEXTO_ZONA} caracteres."
    else:
        zona_otra = None

    especie_id = datos.get("especie_id")
    if esta_vacio(especie_id):
        errores["especie_id"] = "Debes seleccionar una especie."
    else:
        try:
            especie_id = int(especie_id)
        except (TypeError, ValueError):
            especie_id = None
        if especie_id is None or especie_id not in catalogo.especies:
            errores["especie_id"] = "La especie seleccionada no existe."

    campos = ("institucion_id", "zona", "zona_otra", "especie_id")
    if any(campo in errores for campo in campos):
        return None
    return Identificacion(institucion_id, zona, zona_otra, especie_id)


def _fecha_hora(valor: Any, ahora: datetime, ultima: datetime | None, errores: dict[str, str]) -> datetime:
    if esta_vacio(valor):
        fecha = ahora
    else:
        try:
            fecha = datetime.fromisoformat(str(valor).strip())
        except ValueError:
            errores["fecha_hora"] = "La fecha y hora no tienen un formato válido (ISO 8601)."
            return ahora
        if fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=HORA_COLOMBIA)
        if fecha > ahora + TOLERANCIA_RELOJ:
            errores["fecha_hora"] = "La fecha y hora no pueden estar en el futuro."
            return fecha
    if ultima is not None and fecha <= ultima:
        errores["fecha_hora"] = "La fecha debe ser posterior a la última observación del árbol."
    return fecha


def _etapa(valor: Any, errores: dict[str, str]) -> EtapaDesarrollo | None:
    texto = _texto(valor)
    if texto is None:
        errores["etapa"] = "Debes seleccionar la etapa de desarrollo."
        return None
    try:
        return EtapaDesarrollo(texto)
    except ValueError:
        errores["etapa"] = "La etapa seleccionada no existe."
        return None


def _dap_o_cap(
    datos: dict, etapa: EtapaDesarrollo | None, altura: float | None, errores: dict[str, str]
) -> tuple[float | None, float | None]:
    """Se acepta el DAP o la circunferencia (CAP) medida con cinta, pero no los dos."""
    hay_dap = not esta_vacio(datos.get("dap_cm"))
    hay_cap = not esta_vacio(datos.get("cap_cm"))
    if hay_dap and hay_cap:
        errores["cap_cm"] = "Envía el DAP o el CAP, no los dos."
        return None, None
    if hay_cap:
        cap_maximo = round(DAP_MAXIMO_CM * math.pi, 2)
        cap = _medida(
            datos,
            "cap_cm",
            errores,
            msg_formato="La circunferencia (CAP) debe contener un valor numérico.",
            msg_positivo="La circunferencia (CAP) debe ser mayor que 0.",
            maximo=cap_maximo,
            msg_maximo=f"El CAP no puede superar {cap_maximo:g} cm.",
        )
        return None, cap
    if not hay_dap:
        sin_dap = etapa == EtapaDesarrollo.PLANTULA or (altura is not None and altura < ALTURA_DEL_DAP_M)
        if not sin_dap:
            errores["dap_cm"] = OBLIGATORIO
        return None, None
    dap = _medida(
        datos,
        "dap_cm",
        errores,
        msg_formato="Solo se permiten números y decimales.",
        msg_positivo="El DAP debe ser mayor que 0.",
        maximo=DAP_MAXIMO_CM,
        msg_maximo=f"El DAP no puede superar {DAP_MAXIMO_CM} cm.",
    )
    return dap, None


def _hallazgos(valor: Any, catalogo: CatalogoValido, errores: dict[str, str]) -> tuple[str, ...]:
    if valor is None:
        return ()
    if not isinstance(valor, list) or not all(isinstance(v, str) for v in valor):
        errores["observaciones"] = "Debe ser una lista de códigos de observación."
        return ()
    desconocidos = [v for v in valor if v not in catalogo.hallazgos]
    if desconocidos:
        errores["observaciones"] = "Observación desconocida: " + ", ".join(desconocidos) + "."
        return ()
    return tuple(dict.fromkeys(valor))


def validar_observacion(
    datos: dict[str, Any],
    catalogo: CatalogoValido,
    errores: dict[str, str],
    *,
    ahora: datetime,
    ultima_fecha: datetime | None = None,
) -> Observacion | None:
    campos_antes = set(errores)

    try:
        coordenadas = Coordenadas.desde(datos.get("latitud"), datos.get("longitud"))
    except ValorInvalido as error:
        errores["ubicacion"] = error.mensaje
        coordenadas = None

    fecha_hora = _fecha_hora(datos.get("fecha_hora"), ahora, ultima_fecha, errores)
    altura = _medida(
        datos,
        "altura_m",
        errores,
        msg_formato="La altura debe contener un valor numérico.",
        msg_positivo="La altura debe ser mayor que 0.",
        maximo=ALTURA_MAXIMA_M,
        msg_maximo=f"La altura no puede superar {ALTURA_MAXIMA_M} m.",
    )
    copa = _medida(
        datos,
        "copa_m",
        errores,
        msg_formato="El diámetro de copa debe contener un valor numérico.",
        msg_positivo="El diámetro de copa debe ser mayor que 0.",
        maximo=COPA_MAXIMA_M,
        msg_maximo=f"El diámetro de copa no puede superar {COPA_MAXIMA_M} m.",
    )
    etapa = _etapa(datos.get("etapa"), errores)
    dap, cap = _dap_o_cap(datos, etapa, altura, errores)

    interferencia = _texto(datos.get("interferencia"))
    interferencia_otra = _texto(datos.get("interferencia_otra"))
    if interferencia is None:
        errores["interferencia"] = "Debes seleccionar una opción."
    elif interferencia not in catalogo.interferencias:
        errores["interferencia"] = "La opción seleccionada no existe."
    elif interferencia == INTERFERENCIA_OTRA:
        if interferencia_otra is None:
            errores["interferencia_otra"] = OBLIGATORIO
        elif len(interferencia_otra) > MAX_TEXTO_INTERFERENCIA:
            errores["interferencia_otra"] = f"Máximo {MAX_TEXTO_INTERFERENCIA} caracteres."
    else:
        interferencia_otra = None

    hallazgos = _hallazgos(datos.get("observaciones"), catalogo, errores)

    if set(errores) - campos_antes:
        return None
    return Observacion(
        coordenadas=coordenadas,
        fecha_hora=fecha_hora,
        dap_cm=dap,
        cap_cm=cap,
        altura_m=altura,
        copa_m=copa,
        etapa=etapa,
        interferencia=interferencia,
        interferencia_otra=interferencia_otra,
        hallazgos=hallazgos,
    )


def validar_fotos(fotos: Sequence[FotoEntrante], errores: dict[str, str]) -> None:
    """Cada visita lleva una foto del árbol completo y una de detalle; hasta 3 adicionales."""
    tipos = [foto.tipo for foto in fotos]
    if tipos.count(TipoFoto.COMPLETO) != 1 or tipos.count(TipoFoto.DETALLE) != 1:
        errores["fotos"] = FALTAN_FOTOS
    elif tipos.count(TipoFoto.EXTRA) > FOTOS_EXTRA_MAX:
        errores["fotos"] = f"Puedes agregar hasta {FOTOS_EXTRA_MAX} fotografías adicionales."
    elif any(foto.tamano_bytes > FOTO_MAX_BYTES for foto in fotos):
        errores["fotos"] = f"Cada fotografía debe pesar máximo {FOTO_MAX_BYTES // (1024 * 1024)} MB."


def validar_registro_nuevo(
    datos: dict[str, Any],
    fotos: Sequence[FotoEntrante],
    catalogo: CatalogoValido,
    *,
    ahora: datetime,
    errores_previos: dict[str, str] | None = None,
) -> tuple[Identificacion, Observacion]:
    """Valida un árbol nuevo completo. `errores_previos` son los que ya encontraron otras
    capas (por ejemplo, una foto que no es imagen), para mostrarlos todos juntos."""
    errores = dict(errores_previos or {})
    identificacion = validar_identificacion(datos, catalogo, errores)
    observacion = validar_observacion(datos, catalogo, errores, ahora=ahora)
    validar_fotos(fotos, errores)
    if errores:
        raise ErrorValidacion(errores)
    return identificacion, observacion


def validar_nueva_visita(
    datos: dict[str, Any],
    fotos: Sequence[FotoEntrante],
    catalogo: CatalogoValido,
    *,
    ahora: datetime,
    ultima_fecha: datetime,
    errores_previos: dict[str, str] | None = None,
) -> Observacion:
    errores = dict(errores_previos or {})
    observacion = validar_observacion(datos, catalogo, errores, ahora=ahora, ultima_fecha=ultima_fecha)
    validar_fotos(fotos, errores)
    if errores:
        raise ErrorValidacion(errores)
    return observacion
