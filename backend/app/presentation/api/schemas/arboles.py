from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.services.validaciones import HORA_COLOMBIA
from app.infrastructure.database.models import ArbolModel, ObservacionModel


class Opcion(BaseModel):
    codigo: str
    nombre: str


class HallazgoResponse(Opcion):
    grupo: str


class InstitucionResponse(BaseModel):
    id: str
    nombre: str
    corto: str
    prefijo: str


class EspecieResponse(BaseModel):
    id: int
    nombre_comun: str
    nombre_cientifico: str


class FotoResponse(BaseModel):
    id: int
    tipo: str
    url: str
    mime: str
    ancho: int
    alto: int


class CalculosResponse(BaseModel):
    area_copa_m2: float
    biomasa_kg: float | None
    carbono_kg: float | None
    co2_kg: float | None
    o2_kg: float | None
    densidad_usada: float | None
    densidad_estimada: bool = Field(description="True si se usó la densidad provisional")
    version: str


class ObservacionResponse(BaseModel):
    id: int
    fecha_hora: datetime
    latitud: float
    longitud: float
    dap_cm: float | None
    cap_cm: float | None
    altura_m: float
    copa_m: float
    etapa: str
    interferencia: Opcion
    interferencia_otra: str | None
    hallazgos: list[HallazgoResponse]
    estado_sanitario: str
    regla_calificacion: str
    calculos: CalculosResponse
    fotos: list[FotoResponse]
    registrado_por: str | None


class ArbolResponse(BaseModel):
    codigo: str
    consecutivo: int
    estado: str
    motivo_baja: str | None
    institucion: InstitucionResponse
    especie: EspecieResponse
    zona: Opcion
    zona_otra: str | None
    latitud: float
    longitud: float
    creado_en: datetime
    total_observaciones: int
    ultima_observacion: ObservacionResponse


class ArbolResumen(BaseModel):
    codigo: str
    institucion_id: str
    especie: str
    cientifico: str
    zona: str
    estado: str
    estado_sanitario: str
    latitud: float
    longitud: float


class Conteos(BaseModel):
    todos: int
    sano: int
    en_riesgo: int
    critico: int


class ListaArboles(BaseModel):
    total: int
    desde: int
    limite: int
    conteos: Conteos
    items: list[ArbolResumen]


class ResumenResponse(BaseModel):
    total: int
    sano: int
    en_riesgo: int
    critico: int
    dados_de_baja: int
    instituciones: int


class BajaRequest(BaseModel):
    motivo: str = Field(examples=["Árbol caído por tormenta"])


class GrupoHallazgos(BaseModel):
    grupo: str
    items: list[Opcion]


class CatalogosResponse(BaseModel):
    instituciones: list[InstitucionResponse]
    zonas: list[Opcion]
    etapas: list[str]
    interferencias: list[Opcion]
    especies: list[EspecieResponse]
    hallazgos: list[GrupoHallazgos]


# --- conversión desde los modelos de la base -----------------------------------


def _zona_texto(arbol: ArbolModel) -> str:
    return f"Otra: {arbol.zona_otra}" if arbol.zona_otra else arbol.zona.nombre


def observacion_response(observacion: ObservacionModel, prefijo_api: str) -> ObservacionResponse:
    return ObservacionResponse(
        id=observacion.id,
        fecha_hora=observacion.fecha_hora.astimezone(HORA_COLOMBIA),
        latitud=observacion.latitud,
        longitud=observacion.longitud,
        dap_cm=observacion.dap_cm,
        cap_cm=observacion.cap_cm,
        altura_m=observacion.altura_m,
        copa_m=observacion.copa_m,
        etapa=observacion.etapa,
        interferencia=Opcion(codigo=observacion.interferencia.codigo, nombre=observacion.interferencia.nombre),
        interferencia_otra=observacion.interferencia_otra,
        hallazgos=[HallazgoResponse(codigo=h.codigo, nombre=h.nombre, grupo=h.grupo) for h in observacion.hallazgos],
        estado_sanitario=observacion.estado_sanitario,
        regla_calificacion=observacion.regla_calificacion,
        calculos=CalculosResponse(
            area_copa_m2=observacion.area_copa_m2,
            biomasa_kg=observacion.biomasa_kg,
            carbono_kg=observacion.carbono_kg,
            co2_kg=observacion.co2_kg,
            o2_kg=observacion.o2_kg,
            densidad_usada=observacion.densidad_usada,
            densidad_estimada=observacion.densidad_estimada,
            version=observacion.version_formulas,
        ),
        fotos=[
            FotoResponse(
                id=f.id, tipo=f.tipo, url=f"{prefijo_api}/fotos/{f.id}", mime=f.mime, ancho=f.ancho, alto=f.alto
            )
            for f in observacion.fotos
        ],
        registrado_por=observacion.usuario.nombre if observacion.usuario else None,
    )


def arbol_response(arbol: ArbolModel, prefijo_api: str) -> ArbolResponse:
    i, e = arbol.institucion, arbol.especie
    return ArbolResponse(
        codigo=arbol.codigo,
        consecutivo=arbol.consecutivo,
        estado=arbol.estado,
        motivo_baja=arbol.motivo_baja,
        institucion=InstitucionResponse(id=i.id, nombre=i.nombre, corto=i.corto, prefijo=i.prefijo),
        especie=EspecieResponse(id=e.id, nombre_comun=e.nombre_comun, nombre_cientifico=e.nombre_cientifico),
        zona=Opcion(codigo=arbol.zona.codigo, nombre=arbol.zona.nombre),
        zona_otra=arbol.zona_otra,
        latitud=arbol.latitud,
        longitud=arbol.longitud,
        creado_en=arbol.creado_en,
        total_observaciones=len(arbol.observaciones),
        ultima_observacion=observacion_response(arbol.ultima, prefijo_api),
    )


def arbol_resumen(arbol: ArbolModel) -> ArbolResumen:
    return ArbolResumen(
        codigo=arbol.codigo,
        institucion_id=arbol.institucion_id,
        especie=arbol.especie.nombre_comun,
        cientifico=arbol.especie.nombre_cientifico,
        zona=_zona_texto(arbol),
        estado=arbol.estado,
        estado_sanitario=arbol.ultima.estado_sanitario,
        latitud=arbol.latitud,
        longitud=arbol.longitud,
    )
