"""Modelos Pydantic: definen y validan los datos que entran y salen de la API.

Las reglas replican las restricciones (CHECK) de la base de datos, para que el
usuario reciba el error ANTES de llegar a Supabase, con un mensaje claro.
"""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

# Límites del formulario (el frontend usa los mismos en src/features/trees/schemas.ts)
DAP_MAX_CM = 500       # 5 m de diámetro de tronco
ALTURA_MAX_M = 25
COPA_MAX_M = 40
TEXTO_OTRA_MIN = 3
TEXTO_OTRA_MAX = 120
MAX_OBSERVACIONES = 50

# Rectángulo que contiene a Colombia continental e insular (San Andrés incluido)
LAT_MIN, LAT_MAX = -4.3, 13.5
LNG_MIN, LNG_MAX = -82.0, -66.8

CodigoObservacion = Annotated[str, StringConstraints(min_length=1, max_length=40)]

Zona = Literal["Patio central", "Entrada principal", "Zona deportiva", "Bloques académicos", "Otra"]
Etapa = Literal["Plántula", "Juvenil", "Adulto", "Senescente"]
Interferencia = Literal[
    "Ninguna",
    "Levantamiento de pisos",
    "Afectación de muros",
    "Cables eléctricos",
    "Otra infraestructura",
]
Estado = Literal["sano", "riesgo", "critico"]
TipoFoto = Literal["completo", "detalle", "adicional"]
EstadoRevision = Literal["pendiente", "confirmada", "anulada"]
OrigenInspeccion = Literal["registro", "seguimiento"]
Rol = Literal["administrador", "docente", "estudiante"]

ZONAS: tuple[str, ...] = ("Patio central", "Entrada principal", "Zona deportiva", "Bloques académicos", "Otra")


# ------------------------------- Autenticación -------------------------------
class LoginIn(BaseModel):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def _normalizar_email(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


class RefrescarIn(BaseModel):
    refresh_token: str = Field(min_length=10)


class SesionOut(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
    user_id: str
    email: str | None = None


# --------------------------------- Catálogos ---------------------------------
class Especie(BaseModel):
    id: int
    nombre_comun: str
    nombre_cientifico: str


class Institucion(BaseModel):
    id: str
    nombre: str
    nombre_corto: str
    prefijo: str
    lat: float
    lng: float


class ObservacionCatalogo(BaseModel):
    codigo: str
    grupo: Literal["follaje", "tronco", "raiz", "plagas"]
    etiqueta: str
    orden: int


class Catalogos(BaseModel):
    especies: list[Especie]
    instituciones: list[Institucion]
    observaciones: list[ObservacionCatalogo]


# ----------------------------------- Árboles -----------------------------------
class ArbolCrear(BaseModel):
    """Lo que envía el formulario del frontend (pasos 1, 3 y 4 del prototipo)."""

    institucion_id: str = Field(min_length=1, max_length=64)
    zona: Zona
    zona_otra: str | None = Field(default=None, min_length=TEXTO_OTRA_MIN, max_length=TEXTO_OTRA_MAX)
    lat: float = Field(ge=LAT_MIN, le=LAT_MAX, description="Latitud dentro de Colombia")
    lng: float = Field(ge=LNG_MIN, le=LNG_MAX, description="Longitud dentro de Colombia")
    especie_id: int = Field(gt=0)
    dap_cm: float = Field(gt=0, le=DAP_MAX_CM, description="Diámetro a la altura del pecho, máximo 500 cm")
    altura_m: float = Field(gt=0, le=ALTURA_MAX_M, description="Altura total, máximo 25 m")
    copa_m: float = Field(gt=0, le=COPA_MAX_M, description="Diámetro de copa, máximo 40 m")
    etapa: Etapa
    interferencia: Interferencia
    interferencia_otra: str | None = Field(default=None, min_length=TEXTO_OTRA_MIN, max_length=TEXTO_OTRA_MAX)
    observaciones: list[CodigoObservacion] = Field(
        default_factory=list,
        max_length=MAX_OBSERVACIONES,
        description="Códigos de las casillas marcadas, p. ej. f_manchas",
    )
    precision_gps_m: float | None = Field(
        default=None, ge=0, le=10000, description="Precisión que reporta el GPS del dispositivo, en metros"
    )
    notas: str | None = Field(default=None, max_length=1000, description="Notas de la primera inspección")

    # mode="before": se limpian los espacios ANTES de medir el largo del texto
    @field_validator("zona_otra", "interferencia_otra", "notas", mode="before")
    @classmethod
    def _limpiar_texto(cls, v):
        if isinstance(v, str):
            v = v.strip()
        return v or None

    @model_validator(mode="after")
    def _textos_otra(self):
        if self.zona == "Otra" and not self.zona_otra:
            raise ValueError("Si la zona es 'Otra', escribe cuál en zona_otra")
        if self.interferencia == "Otra infraestructura" and not self.interferencia_otra:
            raise ValueError("Si la interferencia es 'Otra infraestructura', escribe cuál en interferencia_otra")
        return self


class ArbolResumen(BaseModel):
    """Una fila de la vista `arboles_resumen` (lista de árboles y semáforo)."""

    id: str
    codigo: str
    institucion_id: str
    prefijo: str
    nombre_corto: str
    zona: str
    zona_otra: str | None = None
    lat: float
    lng: float
    nombre_comun: str
    nombre_cientifico: str
    dap_cm: float
    altura_m: float
    copa_m: float
    etapa: str
    interferencia: str
    interferencia_otra: str | None = None
    registrado_en: datetime
    n_observaciones: int
    estado: Estado
    # Columnas de la vista desde la migración 001 (opcionales para no romper datos anteriores)
    especie_id: int | None = None
    registrado_por: str | None = None
    puntaje_riesgo: float | None = None
    ultima_inspeccion_id: str | None = None
    ultima_inspeccion_en: datetime | None = None
    ultima_revision: EstadoRevision | None = None
    n_inspecciones: int | None = None


class ObservacionOut(BaseModel):
    codigo: str
    grupo: str
    etiqueta: str


class FotoOut(BaseModel):
    id: str
    tipo: TipoFoto
    url: str | None = Field(default=None, description="URL firmada temporal (1 hora)")


class ArbolDetalle(ArbolResumen):
    observaciones: list[ObservacionOut]
    fotos: list[FotoOut]


class Calculos(BaseModel):
    codigo: str
    nombre_comun: str
    dap_cm: float
    altura_m: float
    densidad_madera: float
    biomasa_aerea_kg: float
    biomasa_raiz_kg: float
    biomasa_total_kg: float
    carbono_kg: float
    co2_kg: float
    o2_kg: float
    metodo: str
    advertencia: str


# --------------------------------- Estadísticas ---------------------------------
class ConteoInstitucion(BaseModel):
    prefijo: str
    nombre_corto: str
    total: int


class ConteoEspecie(BaseModel):
    nombre_comun: str
    total: int


class Promedios(BaseModel):
    dap_cm: float | None = None
    altura_m: float | None = None
    copa_m: float | None = None


class TotalesAmbientales(BaseModel):
    biomasa_total_kg: float = 0
    carbono_kg: float = 0
    co2_kg: float = 0
    o2_kg: float = 0


class Estadisticas(BaseModel):
    total: int
    inspecciones_pendientes: int = 0
    por_estado: dict[str, int]
    por_institucion: list[ConteoInstitucion]
    por_etapa: dict[str, int]
    especies_frecuentes: list[ConteoEspecie]
    promedios: Promedios
    totales_ambientales: TotalesAmbientales
