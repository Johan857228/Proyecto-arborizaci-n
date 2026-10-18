"""Mapa con capas: todo lo que dibuja el visor en una sola respuesta (sedes, árboles con su
estado, riesgo de caída, especie, origen, siembra reciente y alerta abierta) y el origen de
cada especie, que corrige el administrador (migración 011). Reglas: servicios/mapa.py.

El docente y el estudiante ven su institución; el administrador, la que elija o todas. Los
árboles se leen con el token de quien pide, así que el RLS sigue mandando.
"""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

import datos
import db
from auth import Perfil, admin_actual, perfil_actual
from comun import ahora, es_columna_faltante, hoy
from routers import riesgo
from schemas import CategoriaRiesgo, Estado
from servicios import mapa as reglas

router = APIRouter(tags=["Mapa"])

Origen = Literal["nativa", "exotica"]
EstadoAlerta = Literal["por_confirmar", "confirmada"]


# ===================================== Modelos =====================================
class ArbolMapa(BaseModel):
    id: str
    codigo: str | None = None
    institucion_id: str | None = None
    lat: float
    lng: float
    especie_id: int | None = None
    nombre_comun: str
    nombre_cientifico: str | None = None
    origen: Origen | None = None
    estado: Estado | None = None
    riesgo: CategoriaRiesgo | None = Field(default=None, description="Categoría del último tamizaje de riesgo de caída")
    alerta: EstadoAlerta | None = Field(default=None, description="Estado de la alerta de caída abierta, si la hay")
    etapa: str | None = None
    siembra: bool = Field(description="Plántula registrada en los últimos 12 meses")
    zona: str | None = None
    registrado_en: str


class SedeMapa(BaseModel):
    id: str
    nombre: str | None = None
    nombre_corto: str | None = None
    prefijo: str | None = None
    lat: float | None = None
    lng: float | None = None
    arboles: int
    alertas: int


class EspecieMapa(BaseModel):
    especie_id: int | None = None
    nombre_comun: str
    nombre_cientifico: str | None = None
    origen: Origen | None = None
    origen_sugerido: Origen | None = Field(default=None, description="Lo que dice la lista del backend")
    total: int


class Limites(BaseModel):
    sur: float
    oeste: float
    norte: float
    este: float


class ResumenMapa(BaseModel):
    total: int
    por_estado: dict[str, int]
    por_riesgo: dict[str, int]
    por_origen: dict[str, int]
    pct_nativas: float | None = Field(default=None, description="Entre los árboles de especie clasificada")
    siembras: int
    alertas: int
    especies: int


class MapaOut(BaseModel):
    generado_en: datetime
    institucion_id: str | None = None
    arboles: list[ArbolMapa]
    sedes: list[SedeMapa]
    especies: list[EspecieMapa]
    resumen: ResumenMapa
    limites: Limites | None = None
    origen_editable: bool = Field(description="True si quien pide puede clasificar especies (administrador con la migración 011)")


class OrigenIn(BaseModel):
    origen: Origen | None = Field(description="Vacío para volver a la lista del backend")


class EspecieOrigenOut(BaseModel):
    id: int
    nombre_comun: str
    nombre_cientifico: str | None = None
    origen: Origen | None = None
    origen_guardado: Origen | None = None
    origen_sugerido: Origen | None = None


# ==================================== Consultas ====================================
def origenes_guardados() -> tuple[dict[str, str | None], bool]:
    """Origen guardado de cada especie y si la columna existe (migración 011)."""
    try:
        filas = db.get_admin().table("especies").select("id, origen").execute().data
    except APIError as error:
        if es_columna_faltante(error):
            return {}, False
        raise
    return {str(f["id"]): f.get("origen") for f in filas}, True


def _sedes(institucion_id: str | None) -> list[dict]:
    consulta = db.get_admin().table("instituciones").select("id, nombre, nombre_corto, prefijo, lat, lng")
    if institucion_id:
        consulta = consulta.eq("id", institucion_id)
    return consulta.order("prefijo").execute().data


# ==================================== Rutas ====================================
@router.get("/mapa", response_model=MapaOut)
def ver_mapa(
    institucion_id: str | None = Query(None, max_length=64, description="Solo administradores; vacío = todas"),
    perfil: Perfil = Depends(perfil_actual),
):
    """Capas del mapa. Docentes y estudiantes ven su institución; el administrador, la que elija."""
    if not perfil.es_admin:
        if not perfil.institucion_id:
            raise HTTPException(status_code=422, detail="Tu cuenta no tiene institución asignada")
        institucion_id = perfil.institucion_id
    sedes = _sedes(institucion_id)
    if institucion_id and not sedes:
        raise HTTPException(status_code=404, detail="Institución no encontrada")

    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arboles = datos.arboles(cliente, institucion_id)
    visibles = {str(a["id"]) for a in arboles}
    riesgos = riesgo.categorias_actuales(sorted(visibles))
    alertas = {k: v for k, v in riesgo.alertas_abiertas(institucion_id).items() if k in visibles}
    guardados, con_columna = origenes_guardados()
    return {
        "generado_en": ahora(),
        "institucion_id": institucion_id,
        **reglas.capas(arboles, sedes, riesgos, alertas, guardados, hoy()),
        "origen_editable": perfil.es_admin and con_columna,
    }


@router.patch("/especies/{especie_id}", response_model=EspecieOrigenOut)
def clasificar_especie(especie_id: int, d: OrigenIn, perfil: Perfil = Depends(admin_actual)):
    """Guarda si la especie es nativa o exótica en Colombia (solo administradores)."""
    try:
        filas = db.get_admin().table("especies").update({"origen": d.origen}).eq("id", especie_id).execute().data
    except APIError as error:
        if es_columna_faltante(error):
            raise HTTPException(status_code=409, detail="Falta aplicar la migración 011 (origen de las especies) en Supabase")
        raise
    if not filas:
        raise HTTPException(status_code=404, detail="Especie no encontrada")
    e = filas[0]
    return {
        "id": e["id"], "nombre_comun": e["nombre_comun"], "nombre_cientifico": e.get("nombre_cientifico"),
        "origen": reglas.origen_de(e.get("nombre_cientifico"), e.get("origen")),
        "origen_guardado": e.get("origen"), "origen_sugerido": reglas.origen_sugerido(e.get("nombre_cientifico")),
    }
