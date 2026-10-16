"""Escenarios presupuestales (Fase 2): repartir un monto entre las intervenciones
recomendadas o programadas y ver qué acciones entran y cuáles quedan fuera."""
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

import datos
import db
from auth import Perfil, admin_actual, revisor_actual
from routers.intervenciones import recomendaciones_de
from servicios import escenarios

router = APIRouter(prefix="/escenarios", tags=["Escenarios presupuestales"])

Criterio = Literal["riesgo", "cantidad"]


class SimulacionIn(BaseModel):
    institucion_id: str
    monto: float = Field(ge=0, le=100_000_000_000)
    criterio: Criterio = "riesgo"
    incluir_programadas: bool = True
    tipos: list[str] | None = Field(default=None, max_length=50, description="Solo estos tipos de intervención")


class EscenarioCrear(SimulacionIn):
    nombre: str = Field(min_length=3, max_length=80)

    @field_validator("nombre")
    @classmethod
    def _limpiar(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("El nombre debe tener al menos 3 caracteres")
        return v


class EscenarioOut(BaseModel):
    id: str
    institucion_id: str
    nombre: str
    monto: float
    criterio: Criterio
    incluir_programadas: bool
    tipos: list[str] | None = None
    resultado: dict
    creado_en: datetime


def candidatas(cliente, institucion_id: str, incluir_programadas: bool, tipos: list[str] | None) -> list[dict]:
    arboles = datos.arboles(cliente, institucion_id)
    por_id = {a["id"]: a for a in arboles}
    intervenciones = [i for i in datos.intervenciones(cliente) if i["arbol_id"] in por_id]
    catalogo_tipos = datos.tipos_intervencion(cliente)
    if tipos is not None:
        invalidos = sorted(set(tipos) - set(catalogo_tipos))
        if invalidos:
            raise HTTPException(status_code=422, detail=f"Tipos de intervención no válidos: {invalidos}")

    lista = []
    for r in recomendaciones_de(cliente, arboles, intervenciones):
        lista.append({
            "origen": "recomendada",
            "intervencion_id": None,
            "arbol_id": r["arbol_id"],
            "codigo": r["codigo"],
            "nombre_comun": r["nombre_comun"],
            "zona": r["zona"],
            "estado": r["estado"],
            "puntaje_riesgo": r["puntaje_riesgo"],
            "tipo_codigo": r["tipo_codigo"],
            "tipo_nombre": r["tipo_nombre"],
            "prioridad": r["prioridad"],
            "motivo": r["motivo"],
            "costo": r["costo_referencia"],
        })
    if incluir_programadas:
        for i in intervenciones:
            if i["estado"] != "programada":
                continue
            a = por_id[i["arbol_id"]]
            tipo = catalogo_tipos.get(i["tipo_codigo"], {})
            costo = i.get("costo_estimado")
            lista.append({
                "origen": "programada",
                "intervencion_id": str(i["id"]),
                "arbol_id": a["id"],
                "codigo": a["codigo"],
                "nombre_comun": a["nombre_comun"],
                "zona": a["zona"],
                "estado": a["estado"],
                "puntaje_riesgo": a.get("puntaje_riesgo"),
                "tipo_codigo": i["tipo_codigo"],
                "tipo_nombre": tipo.get("nombre", i["tipo_codigo"]),
                # ya decidida: va antes que una recomendación de la misma gravedad
                "prioridad": 3 if a["estado"] == "critico" else 2,
                "motivo": i.get("descripcion") or "Intervención programada",
                "costo": float(costo if costo is not None else tipo.get("costo_referencia", 0)),
            })
    if tipos is not None:
        lista = [c for c in lista if c["tipo_codigo"] in set(tipos)]
    return lista


def _simular(cliente, d: SimulacionIn) -> dict:
    if d.institucion_id not in datos.instituciones(cliente):
        raise HTTPException(status_code=422, detail="La institución no existe")
    return escenarios.simular(candidatas(cliente, d.institucion_id, d.incluir_programadas, d.tipos), d.monto, d.criterio)


@router.post("/simular")
def simular(d: SimulacionIn, perfil: Perfil = Depends(revisor_actual)):
    """Simula sin guardar nada."""
    return _simular(db.cliente_de_usuario(perfil.sesion.token), d)


@router.get("", response_model=list[EscenarioOut])
def listar(institucion_id: str | None = None, perfil: Perfil = Depends(revisor_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    consulta = cliente.table("escenarios_presupuestales").select("*")
    if institucion_id:
        consulta = consulta.eq("institucion_id", institucion_id)
    filas = consulta.order("creado_en", desc=True).execute().data
    return [{**f, "id": str(f["id"])} for f in filas]


@router.get("/{escenario_id}", response_model=EscenarioOut)
def detalle(escenario_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    filas = cliente.table("escenarios_presupuestales").select("*").eq("id", str(escenario_id)).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Escenario no encontrado")
    return {**filas[0], "id": str(filas[0]["id"])}


@router.post("", response_model=EscenarioOut, status_code=201)
def guardar(d: EscenarioCrear, perfil: Perfil = Depends(admin_actual)):
    """Guarda el escenario con el resultado calculado en este momento."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    resultado = _simular(cliente, d)
    fila = {
        "institucion_id": d.institucion_id,
        "nombre": d.nombre,
        "monto": d.monto,
        "criterio": d.criterio,
        "incluir_programadas": d.incluir_programadas,
        "tipos": d.tipos,
        "resultado": resultado,
    }
    creado = cliente.table("escenarios_presupuestales").insert(fila).execute().data[0]
    return {**creado, "id": str(creado["id"])}


@router.delete("/{escenario_id}", status_code=204)
def borrar(escenario_id: UUID, perfil: Perfil = Depends(admin_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    filas = cliente.table("escenarios_presupuestales").select("id").eq("id", str(escenario_id)).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Escenario no encontrado")
    cliente.table("escenarios_presupuestales").delete().eq("id", str(escenario_id)).execute()
