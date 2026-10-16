"""Presupuestos por periodo: monto asignado, gasto ejecutado y proyecciones de costo."""
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

import datos
import db
from auth import Perfil, admin_actual, revisor_actual
from comun import a_fecha, hoy
from routers.intervenciones import recomendaciones_de
from servicios import presupuesto

router = APIRouter(tags=["Presupuestos"])


class PresupuestoCrear(BaseModel):
    institucion_id: str
    nombre: str = Field(min_length=3, max_length=80)
    fecha_inicio: date
    fecha_fin: date
    monto_asignado: float = Field(ge=0, le=100_000_000_000)
    notas: str | None = Field(default=None, max_length=500)

    @field_validator("nombre", "notas")
    @classmethod
    def _limpiar(cls, v):
        v = v.strip() if v else v
        return v or None

    @model_validator(mode="after")
    def _periodo(self):
        if not self.nombre or len(self.nombre) < 3:
            raise ValueError("El nombre debe tener al menos 3 caracteres")
        if self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final no puede ser anterior a la inicial")
        return self


class PresupuestoEditar(BaseModel):
    nombre: str | None = Field(default=None, min_length=3, max_length=80)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    monto_asignado: float | None = Field(default=None, ge=0, le=100_000_000_000)
    notas: str | None = Field(default=None, max_length=500)


class PresupuestoOut(BaseModel):
    id: str
    institucion_id: str
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    monto_asignado: float
    notas: str | None = None
    creado_en: datetime
    resumen: dict


def _datos_institucion(cliente, institucion_id: str):
    arboles = datos.arboles(cliente, institucion_id)
    ids = {a["id"] for a in arboles}
    intervenciones = [i for i in datos.intervenciones(cliente) if i["arbol_id"] in ids]
    recomendaciones = recomendaciones_de(cliente, arboles, intervenciones)
    costos = {codigo: float(t["costo_referencia"]) for codigo, t in datos.tipos_intervencion(cliente).items()}
    return intervenciones, recomendaciones, costos


def _con_resumen(cliente, presupuestos: list[dict]) -> list[dict]:
    resultado = []
    cache = {}
    for p in presupuestos:
        if p["institucion_id"] not in cache:
            cache[p["institucion_id"]] = _datos_institucion(cliente, p["institucion_id"])
        intervenciones, recomendaciones, costos = cache[p["institucion_id"]]
        resultado.append({**p, "id": str(p["id"]), "resumen": presupuesto.resumen(p, intervenciones, recomendaciones, costos, hoy())})
    return resultado


def _presupuesto(cliente, presupuesto_id: str) -> dict:
    filas = cliente.table("presupuestos").select("*").eq("id", presupuesto_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return filas[0]


def _validar_sin_cruce(cliente, institucion_id: str, inicio: date, fin: date, excepto: str | None = None):
    otros = cliente.table("presupuestos").select("id, nombre, fecha_inicio, fecha_fin").eq("institucion_id", institucion_id).execute().data
    for o in otros:
        if str(o["id"]) != excepto and presupuesto.se_cruzan(inicio, fin, a_fecha(o["fecha_inicio"]), a_fecha(o["fecha_fin"])):
            raise HTTPException(
                status_code=409,
                detail=f"El periodo se cruza con el presupuesto '{o['nombre']}' ({o['fecha_inicio']} a {o['fecha_fin']})",
            )


@router.get("/presupuestos", response_model=list[PresupuestoOut])
def listar(institucion_id: str | None = None, perfil: Perfil = Depends(revisor_actual)):
    """Presupuestos con gasto ejecutado, comprometido y proyección (docentes y administradores)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    consulta = cliente.table("presupuestos").select("*")
    if institucion_id:
        consulta = consulta.eq("institucion_id", institucion_id)
    filas = consulta.order("fecha_inicio", desc=True).execute().data
    return _con_resumen(cliente, filas)


@router.get("/presupuestos/{presupuesto_id}", response_model=PresupuestoOut)
def detalle(presupuesto_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    return _con_resumen(cliente, [_presupuesto(cliente, str(presupuesto_id))])[0]


@router.post("/presupuestos", response_model=PresupuestoOut, status_code=201)
def crear(d: PresupuestoCrear, perfil: Perfil = Depends(admin_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    if d.institucion_id not in datos.instituciones(cliente):
        raise HTTPException(status_code=422, detail="La institución no existe")
    _validar_sin_cruce(cliente, d.institucion_id, d.fecha_inicio, d.fecha_fin)
    creado = cliente.table("presupuestos").insert(d.model_dump(mode="json")).execute().data[0]
    return _con_resumen(cliente, [creado])[0]


@router.patch("/presupuestos/{presupuesto_id}", response_model=PresupuestoOut)
def editar(presupuesto_id: UUID, d: PresupuestoEditar, perfil: Perfil = Depends(admin_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    actual = _presupuesto(cliente, str(presupuesto_id))
    cambios = d.model_dump(mode="json", exclude_unset=True)
    for campo in ("nombre", "fecha_inicio", "fecha_fin", "monto_asignado"):
        if campo in cambios and cambios[campo] is None:
            raise HTTPException(status_code=422, detail=f"El campo {campo} no puede quedar vacío")
    if "nombre" in cambios:
        cambios["nombre"] = cambios["nombre"].strip()
        if len(cambios["nombre"]) < 3:
            raise HTTPException(status_code=422, detail="El nombre debe tener al menos 3 caracteres")
    if "notas" in cambios:
        cambios["notas"] = (cambios["notas"] or "").strip() or None
    if not cambios:
        raise HTTPException(status_code=422, detail="No hay cambios para guardar")
    inicio = a_fecha(cambios.get("fecha_inicio", actual["fecha_inicio"]))
    fin = a_fecha(cambios.get("fecha_fin", actual["fecha_fin"]))
    if fin < inicio:
        raise HTTPException(status_code=422, detail="La fecha final no puede ser anterior a la inicial")
    _validar_sin_cruce(cliente, actual["institucion_id"], inicio, fin, excepto=str(presupuesto_id))
    filas = cliente.table("presupuestos").update(cambios).eq("id", str(presupuesto_id)).execute().data
    return _con_resumen(cliente, filas)[0]


@router.delete("/presupuestos/{presupuesto_id}", status_code=204)
def borrar(presupuesto_id: UUID, perfil: Perfil = Depends(admin_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    _presupuesto(cliente, str(presupuesto_id))
    cliente.table("presupuestos").delete().eq("id", str(presupuesto_id)).execute()
