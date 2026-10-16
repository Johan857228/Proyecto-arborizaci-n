"""Metas institucionales (Fase 2): una meta por indicador y periodo, y su avance."""
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

import datos
import db
from auth import Perfil, admin_actual, perfil_actual
from comun import a_fecha, hoy
from routers.reportes import cargar_datos
from servicios import indicadores

router = APIRouter(prefix="/metas", tags=["Metas"])

Indicador = Literal[
    "arboles_registrados", "inspecciones_confirmadas", "cobertura_inspeccion_pct", "arboles_sanos_pct",
    "arboles_criticos", "intervenciones_ejecutadas", "co2_almacenado_kg", "cobertura_copa_m2", "gasto_ejecutado",
]
PORCENTAJES = ("cobertura_inspeccion_pct", "arboles_sanos_pct")


class MetaCrear(BaseModel):
    institucion_id: str
    indicador: Indicador
    fecha_inicio: date
    fecha_fin: date
    valor_meta: float = Field(ge=0, le=1_000_000_000_000)
    descripcion: str | None = Field(default=None, max_length=300)

    @field_validator("descripcion")
    @classmethod
    def _limpiar(cls, v):
        v = v.strip() if v else v
        return v or None

    @model_validator(mode="after")
    def _reglas(self):
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final no puede ser anterior a la inicial")
        if self.indicador in PORCENTAJES and self.valor_meta > 100:
            raise ValueError("Una meta en porcentaje no puede superar 100")
        return self


class MetaEditar(BaseModel):
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    valor_meta: float | None = Field(default=None, ge=0, le=1_000_000_000_000)
    descripcion: str | None = Field(default=None, max_length=300)


class MetaOut(BaseModel):
    id: str
    institucion_id: str
    indicador: Indicador
    indicador_nombre: str
    unidad: str
    sentido: Literal["mayor", "menor"]
    fecha_inicio: date
    fecha_fin: date
    valor_meta: float
    descripcion: str | None = None
    creado_en: datetime
    valor_actual: float
    avance_pct: float
    estado: Literal["por_iniciar", "en_curso", "cumplida", "no_cumplida"]


def con_avance(cliente, metas: list[dict]) -> list[dict]:
    """Calcula cada meta con los indicadores de su institución en su periodo."""
    resultado = []
    cache: dict[str, tuple] = {}
    hoy_ = hoy()
    for m in metas:
        if m["institucion_id"] not in cache:
            cache[m["institucion_id"]] = cargar_datos(cliente, m["institucion_id"])
        base, dias = cache[m["institucion_id"]]
        reporte = indicadores.calcular(base, a_fecha(m["fecha_inicio"]), a_fecha(m["fecha_fin"]), dias)
        resultado.append({**m, "id": str(m["id"]), **indicadores.evaluar_meta(m, reporte, hoy_)})
    return resultado


def _meta(cliente, meta_id: str) -> dict:
    filas = cliente.table("metas").select("*").eq("id", meta_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Meta no encontrada")
    return filas[0]


@router.get("/indicadores")
def catalogo_indicadores(perfil: Perfil = Depends(perfil_actual)):
    """Indicadores que admiten metas, con su unidad y si conviene que suba o que baje."""
    return [
        {"codigo": codigo, "nombre": nombre, "unidad": unidad, "sentido": sentido}
        for codigo, (nombre, unidad, sentido, _) in indicadores.INDICADORES_META.items()
    ]


@router.get("", response_model=list[MetaOut])
def listar(institucion_id: str | None = None, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    consulta = cliente.table("metas").select("*")
    if institucion_id:
        consulta = consulta.eq("institucion_id", institucion_id)
    filas = consulta.order("fecha_inicio", desc=True).execute().data
    return con_avance(cliente, filas)


@router.post("", response_model=MetaOut, status_code=201)
def crear(d: MetaCrear, perfil: Perfil = Depends(admin_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    if d.institucion_id not in datos.instituciones(cliente):
        raise HTTPException(status_code=422, detail="La institución no existe")
    creada = cliente.table("metas").insert(d.model_dump(mode="json")).execute().data[0]
    return con_avance(cliente, [creada])[0]


@router.patch("/{meta_id}", response_model=MetaOut)
def editar(meta_id: UUID, d: MetaEditar, perfil: Perfil = Depends(admin_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    actual = _meta(cliente, str(meta_id))
    cambios = d.model_dump(mode="json", exclude_unset=True)
    for campo in ("fecha_inicio", "fecha_fin", "valor_meta"):
        if campo in cambios and cambios[campo] is None:
            raise HTTPException(status_code=422, detail=f"El campo {campo} no puede quedar vacío")
    if "descripcion" in cambios:
        cambios["descripcion"] = (cambios["descripcion"] or "").strip() or None
    if not cambios:
        raise HTTPException(status_code=422, detail="No hay cambios para guardar")
    final = {**actual, **cambios}
    try:
        MetaCrear(**{k: final[k] for k in MetaCrear.model_fields})
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors()[0]["msg"].removeprefix("Value error, "))
    filas = cliente.table("metas").update(cambios).eq("id", str(meta_id)).execute().data
    return con_avance(cliente, filas)[0]


@router.delete("/{meta_id}", status_code=204)
def borrar(meta_id: UUID, perfil: Perfil = Depends(admin_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    _meta(cliente, str(meta_id))
    cliente.table("metas").delete().eq("id", str(meta_id)).execute()
