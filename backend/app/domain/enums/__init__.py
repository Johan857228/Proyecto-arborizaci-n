"""Valores controlados del dominio."""

from enum import StrEnum


class Rol(StrEnum):
    ADMIN = "admin"
    REGISTRADOR = "registrador"
    CONSULTA = "consulta"


class EtapaDesarrollo(StrEnum):
    PLANTULA = "plantula"
    JUVENIL = "juvenil"
    ADULTO = "adulto"
    SENESCENTE = "senescente"


class EstadoSanitario(StrEnum):
    SANO = "sano"
    EN_RIESGO = "en_riesgo"
    CRITICO = "critico"


class TipoFoto(StrEnum):
    COMPLETO = "completo"
    DETALLE = "detalle"
    EXTRA = "extra"


class EstadoArbol(StrEnum):
    ACTIVO = "activo"
    BAJA = "baja"
