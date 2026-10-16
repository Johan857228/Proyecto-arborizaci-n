"""Intervenciones y mantenimiento: acciones programadas o realizadas, su costo y resultado,
y las recomendaciones que salen del estado actual de cada árbol."""
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

import datos
import db
from auth import Perfil, admin_actual, perfil_actual, revisor_actual
from comun import hoy, resumen_por_id
from schemas import Estado
from servicios.recomendaciones import recomendar

router = APIRouter(tags=["Intervenciones"])

EstadoIntervencion = Literal["programada", "ejecutada", "cancelada"]
Resultado = Literal["exitosa", "parcial", "sin_efecto"]


# ==================================== Modelos ====================================
class TipoIntervencion(BaseModel):
    codigo: str
    nombre: str
    descripcion: str | None = None
    costo_referencia: float
    orden: int


class TipoIntervencionEditar(BaseModel):
    nombre: str | None = Field(default=None, min_length=3, max_length=80)
    descripcion: str | None = Field(default=None, max_length=300)
    costo_referencia: float | None = Field(default=None, ge=0, le=1_000_000_000)


def _texto(v: str | None) -> str | None:
    v = v.strip() if v else v
    return v or None


class _CamposIntervencion(BaseModel):
    responsable: str | None = Field(default=None, min_length=2, max_length=120)
    descripcion: str | None = Field(default=None, max_length=1000)
    fecha_programada: date | None = None
    fecha_ejecucion: date | None = None
    costo_estimado: float | None = Field(default=None, ge=0, le=1_000_000_000)
    costo_real: float | None = Field(default=None, ge=0, le=1_000_000_000)
    resultado: Resultado | None = None
    resultado_detalle: str | None = Field(default=None, max_length=1000)

    @field_validator("responsable", "descripcion", "resultado_detalle")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)


class IntervencionCrear(_CamposIntervencion):
    arbol_id: UUID
    inspeccion_id: UUID | None = None
    tipo_codigo: str = Field(min_length=3, max_length=40)
    estado: Literal["programada", "ejecutada"]
    responsable: str = Field(min_length=2, max_length=120)

    @model_validator(mode="after")
    def _reglas(self):
        validar_estado(self.estado, self.fecha_programada, self.fecha_ejecucion, self.costo_real, self.resultado)
        if not self.responsable:
            raise ValueError("Indica quién es el responsable")
        return self


class IntervencionEditar(_CamposIntervencion):
    estado: EstadoIntervencion | None = None


class IntervencionOut(BaseModel):
    id: str
    arbol_id: str
    codigo: str | None = None
    nombre_comun: str | None = None
    zona: str | None = None
    institucion_id: str | None = None
    inspeccion_id: str | None = None
    tipo_codigo: str
    tipo_nombre: str | None = None
    estado: EstadoIntervencion
    descripcion: str | None = None
    responsable: str
    fecha_programada: date | None = None
    fecha_ejecucion: date | None = None
    costo_estimado: float | None = None
    costo_real: float | None = None
    resultado: Resultado | None = None
    resultado_detalle: str | None = None
    registrado_por: str | None = None
    creado_en: datetime
    actualizado_en: datetime


class Recomendacion(BaseModel):
    arbol_id: str
    codigo: str
    nombre_comun: str
    zona: str
    institucion_id: str
    estado: Estado
    puntaje_riesgo: float | None = None
    tipo_codigo: str
    tipo_nombre: str
    prioridad: int
    prioridad_nombre: str
    motivo: str
    costo_referencia: float


def validar_estado(estado, fecha_programada, fecha_ejecucion, costo_real, resultado):
    if estado == "programada" and fecha_programada is None:
        raise ValueError("Una intervención programada necesita fecha_programada")
    if estado == "ejecutada":
        faltan = [
            nombre
            for nombre, valor in (("fecha_ejecucion", fecha_ejecucion), ("costo_real", costo_real), ("resultado", resultado))
            if valor is None
        ]
        if faltan:
            raise ValueError(f"Para registrar una intervención ejecutada faltan: {', '.join(faltan)}")
        if fecha_ejecucion > hoy():
            raise ValueError("La fecha de ejecución no puede ser futura")


# ==================================== Lógica =====================================
def armar(intervenciones: list[dict], arboles: dict[str, dict], tipos: dict[str, dict]) -> list[dict]:
    resultado = []
    for i in intervenciones:
        arbol = arboles.get(i["arbol_id"], {})
        resultado.append({
            **i,
            "id": str(i["id"]),
            "inspeccion_id": str(i["inspeccion_id"]) if i.get("inspeccion_id") else None,
            "codigo": arbol.get("codigo"),
            "nombre_comun": arbol.get("nombre_comun"),
            "zona": arbol.get("zona"),
            "institucion_id": arbol.get("institucion_id"),
            "tipo_nombre": tipos.get(i["tipo_codigo"], {}).get("nombre"),
        })
    return resultado


def recomendaciones_de(cliente, arboles: list[dict], intervenciones: list[dict] | None = None) -> list[dict]:
    """Recomendaciones vigentes de los árboles dados, con su costo de referencia."""
    if not arboles:
        return []
    tipos = datos.tipos_intervencion(cliente)
    ultimas = [str(a["ultima_inspeccion_id"]) for a in arboles if a.get("ultima_inspeccion_id")]
    observaciones = datos.observaciones_por_inspeccion(cliente, ultimas) if ultimas else {}
    catalogo = datos.catalogo_observaciones(cliente)
    if intervenciones is None:
        intervenciones = datos.intervenciones(cliente)
    por_arbol: dict[str, list[dict]] = {}
    for i in intervenciones:
        por_arbol.setdefault(i["arbol_id"], []).append(i)

    resultado = []
    for a in arboles:
        codigos = observaciones.get(str(a.get("ultima_inspeccion_id")), [])
        grupos = {catalogo[c]["grupo"] for c in codigos if c in catalogo}
        for r in recomendar(a, grupos, por_arbol.get(a["id"], [])):
            tipo = tipos.get(r["tipo_codigo"])
            if tipo is None:
                continue
            resultado.append({
                "arbol_id": a["id"],
                "codigo": a["codigo"],
                "nombre_comun": a["nombre_comun"],
                "zona": a["zona"],
                "institucion_id": a["institucion_id"],
                "estado": a["estado"],
                "puntaje_riesgo": a.get("puntaje_riesgo"),
                "tipo_codigo": r["tipo_codigo"],
                "tipo_nombre": tipo["nombre"],
                "prioridad": r["prioridad"],
                "prioridad_nombre": r["prioridad_nombre"],
                "motivo": r["motivo"],
                "costo_referencia": float(tipo["costo_referencia"]),
            })
    resultado.sort(key=lambda r: (-r["prioridad"], r["codigo"], r["tipo_codigo"]))
    return resultado


def _intervencion(cliente, intervencion_id: str) -> dict:
    filas = cliente.table("intervenciones").select("*").eq("id", intervencion_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Intervención no encontrada")
    return filas[0]


# =================================== Endpoints ===================================
@router.get("/intervenciones/tipos", response_model=list[TipoIntervencion])
def listar_tipos(perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    return list(datos.tipos_intervencion(cliente).values())


@router.patch("/intervenciones/tipos/{codigo}", response_model=TipoIntervencion)
def editar_tipo(codigo: str, d: TipoIntervencionEditar, perfil: Perfil = Depends(admin_actual)):
    """Ajusta el nombre, la descripción o el costo de referencia (solo administrador)."""
    cambios = {k: (_texto(v) if isinstance(v, str) else v) for k, v in d.model_dump(exclude_unset=True).items()}
    if "nombre" in cambios and not cambios["nombre"]:
        raise HTTPException(status_code=422, detail="El nombre no puede quedar vacío")
    if not cambios:
        raise HTTPException(status_code=422, detail="No hay cambios para guardar")
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    filas = cliente.table("tipos_intervencion").update(cambios).eq("codigo", codigo).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Tipo de intervención no encontrado")
    return filas[0]


@router.get("/intervenciones", response_model=list[IntervencionOut])
def listar(
    institucion_id: str | None = None,
    estado: EstadoIntervencion | None = None,
    tipo_codigo: str | None = None,
    perfil: Perfil = Depends(perfil_actual),
):
    """Intervenciones con filtros, de la más reciente a la más antigua."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arboles = {a["id"]: a for a in datos.arboles(cliente, institucion_id)}
    filtros = []
    if estado:
        filtros.append(("eq", ("estado", estado)))
    if tipo_codigo:
        filtros.append(("eq", ("tipo_codigo", tipo_codigo)))
    filas = [i for i in datos.intervenciones(cliente, filtros) if i["arbol_id"] in arboles]
    filas.sort(key=lambda i: (str(i.get("fecha_ejecucion") or i.get("fecha_programada") or ""), i["creado_en"]), reverse=True)
    return armar(filas, arboles, datos.tipos_intervencion(cliente))


@router.get("/arboles/{arbol_id}/intervenciones", response_model=list[IntervencionOut])
def de_un_arbol(arbol_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arbol = resumen_por_id(cliente, str(arbol_id))
    filas = datos.intervenciones(cliente, [("eq", ("arbol_id", str(arbol_id)))])
    filas.sort(key=lambda i: i["creado_en"], reverse=True)
    return armar(filas, {arbol["id"]: arbol}, datos.tipos_intervencion(cliente))


@router.get("/arboles/{arbol_id}/recomendaciones", response_model=list[Recomendacion])
def recomendaciones_arbol(arbol_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arbol = resumen_por_id(cliente, str(arbol_id))
    intervenciones = datos.intervenciones(cliente, [("eq", ("arbol_id", str(arbol_id)))])
    return recomendaciones_de(cliente, [arbol], intervenciones)


@router.get("/intervenciones/recomendaciones", response_model=list[Recomendacion])
def recomendaciones(
    institucion_id: str | None = None,
    prioridad_minima: int = Query(1, ge=1, le=3, description="1 baja, 2 media, 3 alta"),
    perfil: Perfil = Depends(perfil_actual),
):
    """Acciones sugeridas para todos los árboles (o los de una institución)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    todas = recomendaciones_de(cliente, datos.arboles(cliente, institucion_id))
    return [r for r in todas if r["prioridad"] >= prioridad_minima]


@router.get("/intervenciones/{intervencion_id}", response_model=IntervencionOut)
def detalle(intervencion_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    intervencion = _intervencion(cliente, str(intervencion_id))
    arbol = resumen_por_id(cliente, intervencion["arbol_id"])
    return armar([intervencion], {arbol["id"]: arbol}, datos.tipos_intervencion(cliente))[0]


@router.post("/intervenciones", response_model=IntervencionOut, status_code=201)
def crear(d: IntervencionCrear, perfil: Perfil = Depends(revisor_actual)):
    """Programa una intervención o registra una ya realizada (docentes de la institución y
    administradores)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arbol = resumen_por_id(cliente, str(d.arbol_id))
    if not perfil.gestiona(arbol["institucion_id"]):
        raise HTTPException(status_code=403, detail="Solo puedes registrar intervenciones en árboles de tu institución")
    tipos = datos.tipos_intervencion(cliente)
    if d.tipo_codigo not in tipos:
        raise HTTPException(status_code=422, detail="Tipo de intervención no válido")
    if d.inspeccion_id is not None:
        insp = cliente.table("inspecciones").select("id, arbol_id").eq("id", str(d.inspeccion_id)).execute().data
        if not insp or insp[0]["arbol_id"] != arbol["id"]:
            raise HTTPException(status_code=422, detail="La inspección indicada no pertenece a este árbol")

    fila = d.model_dump(mode="json")
    if fila["estado"] == "programada" and fila["costo_estimado"] is None:
        fila["costo_estimado"] = float(tipos[d.tipo_codigo]["costo_referencia"])
    creada = cliente.table("intervenciones").insert(fila).execute().data[0]
    return armar([creada], {arbol["id"]: arbol}, tipos)[0]


@router.patch("/intervenciones/{intervencion_id}", response_model=IntervencionOut)
def editar(intervencion_id: UUID, d: IntervencionEditar, perfil: Perfil = Depends(revisor_actual)):
    """Actualiza una intervención programada: registrar su ejecución, cancelarla o corregir
    datos. Las ejecutadas o canceladas solo las corrige un administrador."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    actual = _intervencion(cliente, str(intervencion_id))
    arbol = resumen_por_id(cliente, actual["arbol_id"])
    if not perfil.gestiona(arbol["institucion_id"]):
        raise HTTPException(status_code=403, detail="Solo puedes editar intervenciones de tu institución")
    if actual["estado"] != "programada" and not perfil.es_admin:
        raise HTTPException(status_code=409, detail="Una intervención ejecutada o cancelada solo la corrige un administrador")

    cambios = d.model_dump(mode="json", exclude_unset=True)
    if not cambios:
        raise HTTPException(status_code=422, detail="No hay cambios para guardar")
    if "responsable" in cambios and not cambios["responsable"]:
        raise HTTPException(status_code=422, detail="Indica quién es el responsable")
    final = {**actual, **cambios}
    try:
        validar_estado(
            final["estado"],
            date.fromisoformat(str(final["fecha_programada"])) if final.get("fecha_programada") else None,
            date.fromisoformat(str(final["fecha_ejecucion"])) if final.get("fecha_ejecucion") else None,
            final.get("costo_real"),
            final.get("resultado"),
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))

    filas = cliente.table("intervenciones").update(cambios).eq("id", str(intervencion_id)).execute().data
    if not filas:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta intervención")
    return armar(filas, {arbol["id"]: arbol}, datos.tipos_intervencion(cliente))[0]
