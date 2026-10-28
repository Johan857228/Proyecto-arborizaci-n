"""Modelos Pydantic: definen y validan los datos que entran y salen de la API.

Las reglas replican las restricciones (CHECK) de la base de datos, para que el
usuario reciba el error ANTES de llegar a Supabase, con un mensaje claro.
"""
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

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

# Agentes bióticos (tabla de variables FB-01 a FB-06). Se registran en cada inspección.
TipoInsecto = Literal["defoliadores", "chupadores", "escamas", "arrieras", "minadores", "agalladores"]
TipoEnfermedad = Literal["fungica", "bacteriana", "viral", "indeterminada"]
ParteArbol = Literal["hojas", "ramas", "tronco", "raiz", "flores_frutos"]
TipoHemiparasita = Literal["pajarito", "cuscuta"]
TipoEpifita = Literal["bromelias", "orquideas", "helechos", "liquenes", "musgos"]
CAMPOS_BIOTICOS = {
    "insectos", "insectos_parte", "insectos_sev", "enfermedad", "enfermedad_parte", "enfermedad_sev",
    "muestra_lab", "cod_muestra_lab", "hemiparasitas", "pct_hemiparasitas", "bejucos", "epifitas",
}
TipoFoto = Literal["completo", "detalle", "adicional"]
EstadoRevision = Literal["pendiente", "confirmada", "anulada"]
OrigenInspeccion = Literal["registro", "seguimiento"]
Rol = Literal["administrador", "docente", "estudiante", "territorial"]

ZONAS: tuple[str, ...] = ("Patio central", "Entrada principal", "Zona deportiva", "Bloques académicos", "Otra")


# ------------------------------- Autenticación -------------------------------
class LoginIn(BaseModel):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def _normalizar_email(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


class RegistroIn(BaseModel):
    """Cuenta nueva: queda como estudiante y sin institución hasta que un docente o un
    administrador se la asigne (el perfil lo crea el trigger de la migración 001)."""

    nombre: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    # Supabase guarda la contraseña con bcrypt, que solo usa los primeros 72 bytes.
    password: str = Field(min_length=8, max_length=72)
    # Ley 1581: la autorización para tratar los datos se da antes de crear la cuenta.
    acepta_politica: bool = Field(description="Acepta la política de tratamiento de datos vigente")

    @field_validator("nombre", mode="before")
    @classmethod
    def _limpiar_nombre(cls, v):
        return " ".join(v.split()) if isinstance(v, str) else v

    @field_validator("email", mode="before")
    @classmethod
    def _normalizar_email(cls, v):
        return v.strip().lower() if isinstance(v, str) else v

    @field_validator("acepta_politica")
    @classmethod
    def _acepta(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Debes aceptar la política de tratamiento de datos para crear la cuenta")
        return v

    @field_validator("password")
    @classmethod
    def _contrasena_segura(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("La contraseña debe tener letras y números")
        return v


class RefrescarIn(BaseModel):
    refresh_token: str = Field(min_length=10)


class SesionOut(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
    user_id: str
    email: str | None = None


class RegistroOut(BaseModel):
    """Si Supabase pide confirmar el correo, no hay sesión hasta que la persona abra el enlace."""

    requiere_confirmacion: bool
    sesion: SesionOut | None = None
    mensaje: str


# --------------------------------- Catálogos ---------------------------------
class Especie(BaseModel):
    id: int
    nombre_comun: str
    nombre_cientifico: str
    origen: Literal["nativa", "exotica"] | None = Field(
        default=None, description="Origen en Colombia: el guardado (migración 011) o el de la lista del backend"
    )


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
class CamposSinConexion(BaseModel):
    """Datos que agrega la app cuando el registro se guardó en el teléfono sin señal y se
    envía después (comun.insertar_sin_duplicar)."""

    id_cliente: UUID | None = Field(
        default=None, description="UUID que genera la app: si el envío se repite, no se duplica el registro"
    )
    capturado_en: datetime | None = Field(
        default=None, description="Cuándo se tomó en campo; se descarta si el reloj del teléfono no es creíble"
    )


# ------------------------------ Riesgo de caída ------------------------------
DebajoDelArbol = Literal["aulas", "paso", "recreo", "cancha", "parqueadero", "via", "cables", "poco_uso", "cerrada"]
CategoriaRiesgo = Literal["bajo", "medio", "alto", "inminente"]


class Tamizaje(BaseModel):
    """Tamizaje visual del riesgo de caída: lo que se ve del árbol y qué hay debajo. La categoría
    la calcula servicios/riesgo_caida.py (no la envía la app)."""

    model_config = ConfigDict(extra="forbid")

    inclinacion: Literal["ninguna", "leve", "marcada", "reciente"] = "ninguna"
    raices: Literal["sanas", "expuestas", "danadas"] = "sanas"
    ramas_secas: Literal["ninguna", "pequenas", "grandes", "colgando"] = "ninguna"
    cavidades: Literal["ninguna", "pequena", "grande"] = "ninguna"
    hongos: Literal["ninguno", "en_ramas", "en_tronco_o_base"] = "ninguno"
    grietas: Literal["ninguna", "en_ramas", "en_tronco_o_union", "abriendose"] = "ninguna"
    debajo: list[DebajoDelArbol] = Field(
        min_length=1, max_length=9, description="Qué hay debajo o al alcance si el árbol o una rama cae"
    )

    @field_validator("debajo")
    @classmethod
    def _sin_repetir(cls, v: list[str]) -> list[str]:
        return sorted(set(v))


class ResultadoTamizaje(BaseModel):
    categoria: CategoriaRiesgo
    probabilidad: Literal["improbable", "posible", "probable", "inminente"]
    ocupacion: Literal["rara", "ocasional", "frecuente", "constante"]
    motivos: list[str]
    accion: str
    respuestas: Tamizaje


class CamposBioticos(BaseModel):
    """Agentes bióticos observados en la visita (FB-01 a FB-06). Todos son opcionales: si no se
    observa un agente, su tipo va vacío y no se envían su parte ni su severidad (escala 0 a 4)."""

    insectos: TipoInsecto | None = Field(default=None, description="FB-01 tipo de insecto")
    insectos_parte: ParteArbol | None = None
    insectos_sev: int | None = Field(default=None, ge=0, le=4)
    enfermedad: TipoEnfermedad | None = Field(default=None, description="FB-02 enfermedad sospechada")
    enfermedad_parte: ParteArbol | None = None
    enfermedad_sev: int | None = Field(default=None, ge=0, le=4)
    muestra_lab: bool = Field(default=False, description="FB-03 se tomó muestra para laboratorio")
    cod_muestra_lab: str | None = Field(default=None, min_length=3, max_length=40, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    hemiparasitas: TipoHemiparasita | None = Field(default=None, description="FB-04 pajarito o cuscuta")
    pct_hemiparasitas: float | None = Field(default=None, gt=0, le=100, description="Porcentaje de la copa afectado")
    bejucos: int | None = Field(default=None, ge=0, le=4, description="FB-05 severidad 0 a 4")
    epifitas: list[TipoEpifita] = Field(default_factory=list, max_length=5, description="FB-06 selección múltiple")

    @field_validator("cod_muestra_lab", mode="before")
    @classmethod
    def _limpiar_codigo(cls, v):
        if isinstance(v, str):
            v = v.strip().upper()
        return v or None

    @field_validator("epifitas", mode="before")
    @classmethod
    def _epifitas_vacias(cls, v):
        return [] if v is None else v

    @model_validator(mode="after")
    def _reglas_bioticas(self):
        for agente, nombre in (("insectos", "los insectos"), ("enfermedad", "la enfermedad")):
            if getattr(self, agente) is None:
                setattr(self, f"{agente}_parte", None)
                setattr(self, f"{agente}_sev", None)
            elif getattr(self, f"{agente}_parte") is None or getattr(self, f"{agente}_sev") is None:
                raise ValueError(f"Indica la parte afectada y la severidad de {nombre}")
        if self.muestra_lab and not self.cod_muestra_lab:
            raise ValueError("Escribe el código con que se rotuló la muestra de laboratorio")
        if not self.muestra_lab:
            self.cod_muestra_lab = None
        if self.hemiparasitas is None:
            self.pct_hemiparasitas = None
        elif self.pct_hemiparasitas is None:
            raise ValueError("Indica qué porcentaje de la copa cubren las hemiparásitas")
        self.epifitas = sorted(set(self.epifitas))
        return self


class ArbolCrear(CamposBioticos, CamposSinConexion):
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
    tamizaje: Tamizaje | None = Field(default=None, description="Tamizaje de riesgo de caída de la primera inspección")

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
    foto_url: str | None = Field(default=None, description="Foto general más reciente (URL firmada por 1 hora)")
    riesgo_caida: CategoriaRiesgo | None = Field(
        default=None, description="Categoría del último tamizaje de riesgo de caída (inspecciones no anuladas)"
    )


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
