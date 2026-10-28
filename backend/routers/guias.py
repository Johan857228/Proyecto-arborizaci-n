"""Guías de clase y laboratorio de datos.

- Guías (servicios/guias.py): las ve cualquier usuario; la ficha en PDF con los datos del colegio
  y la bitácora de clases dictadas (migración 012) son de docentes y administradores.
- Laboratorio: las medidas de los árboles de la institución, sin datos de personas, para que la
  app calcule tablas de frecuencias, histogramas, medidas y la dispersión DAP-altura.
"""
import random
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator

import datos
import db
from auth import Perfil, perfil_actual, revisor_actual
from comun import BUCKET_FOTOS, ahora, hoy, traer_todo
from routers import riesgo
from routers.mapa import origenes_guardados
from servicios import guias as reglas
from servicios import mapa as reglas_mapa

router = APIRouter(tags=["Guías de clase"])

Area = Literal["ciencias", "matematicas"]
VIGENCIA_ENLACE_S = 600


def _falta_migracion(error: APIError) -> bool:
    return str(getattr(error, "code", "") or "") in ("PGRST205", "42P01")


# ===================================== Modelos =====================================
class Momento(BaseModel):
    titulo: str
    pasos: list[str]


class EnlaceLaboratorio(BaseModel):
    variable: Literal["dap_cm", "altura_m", "copa_m"]
    vista: Literal["tabla", "histograma", "medidas", "dispersion"]


class GuiaResumen(BaseModel):
    id: str
    titulo: str
    area: Area
    grados: list[int]
    referente: str
    duracion_min: int
    datos: str = Field(description="Qué datos del colegio trae la ficha")
    laboratorio: EnlaceLaboratorio | None = None
    aplicaciones: int = Field(default=0, description="Clases dictadas con la guía en la institución")


class ClaseOut(BaseModel):
    id: str
    guia_id: str
    guia_titulo: str
    institucion_id: str
    curso_id: str | None = None
    curso_nombre: str | None = None
    docente_nombre: str | None = None
    fecha: date
    asistentes: int | None = None
    notas: str | None = None
    puede_borrar: bool = False


class GuiaOut(GuiaResumen):
    proposito: str
    materiales: list[str]
    momentos: list[Momento]
    preguntas: list[str]
    evidencia: str
    saber11: str | None = None
    celular: str
    seguridad: str
    clases: list[ClaseOut] = Field(default_factory=list, description="Últimas clases dictadas con la guía en la institución")


class ClaseIn(BaseModel):
    guia_id: str = Field(min_length=2, max_length=60)
    fecha: date
    curso_id: UUID | None = None
    asistentes: int | None = Field(default=None, ge=1, le=80)
    notas: str | None = Field(default=None, max_length=1000)
    institucion_id: str | None = Field(default=None, max_length=64, description="Solo administradores")

    @field_validator("notas", mode="before")
    @classmethod
    def _limpiar(cls, v):
        if isinstance(v, str):
            v = v.strip()
        return v or None


class FichaIn(BaseModel):
    curso_id: UUID | None = None
    semilla: int | None = Field(default=None, ge=1, le=999_999, description="Repite la misma muestra de árboles")
    institucion_id: str | None = Field(default=None, max_length=64, description="Solo administradores")


class FichaOut(BaseModel):
    url: str
    nombre: str
    vence_en_segundos: int
    semilla: int


class DatoLaboratorio(BaseModel):
    id: str
    codigo: str | None = None
    institucion_id: str | None = None
    especie: str
    nombre_cientifico: str | None = None
    zona: str | None = None
    etapa: str | None = None
    estado: str | None = None
    dap_cm: float
    altura_m: float
    copa_m: float | None = None


class LaboratorioOut(BaseModel):
    institucion_id: str | None = None
    generado_en: datetime
    arboles: list[DatoLaboratorio]


# ==================================== Consultas ====================================
def _guia(guia_id: str) -> dict:
    guia = reglas.POR_ID.get(guia_id)
    if not guia:
        raise HTTPException(status_code=404, detail="Guía no encontrada")
    return guia


def _institucion(perfil: Perfil, institucion_id: str | None, obligatoria: bool = False) -> str | None:
    """El administrador elige; los demás trabajan con la suya."""
    elegida = (institucion_id or perfil.institucion_id) if perfil.es_admin else perfil.institucion_id
    if not elegida and (obligatoria or not perfil.es_admin):
        raise HTTPException(status_code=422, detail="Elige una institución" if perfil.es_admin else "Tu cuenta no tiene institución asignada")
    if elegida and not db.get_admin().table("instituciones").select("id").eq("id", elegida).execute().data:
        raise HTTPException(status_code=404, detail="Institución no encontrada")
    return elegida


def _clases(institucion_id: str | None, guia_id: str | None = None, limite: int = 50) -> list[dict]:
    filtros = []
    if institucion_id:
        filtros.append(("eq", ("institucion_id", institucion_id)))
    if guia_id:
        filtros.append(("eq", ("guia_id", guia_id)))
    try:
        filas = traer_todo(db.get_admin(), "clases_guia", filtros=filtros)
    except APIError as error:
        if _falta_migracion(error):
            return []
        raise
    filas.sort(key=lambda c: (str(c["fecha"]), str(c.get("creado_en") or "")), reverse=True)
    return filas[:limite] if limite else filas


def _armar_clases(filas: list[dict], perfil: Perfil) -> list[dict]:
    if not filas:
        return []
    admin = db.get_admin()
    cursos = {str(c["id"]): c["nombre"] for c in admin.table("cursos").select("id, nombre")
              .in_("id", sorted({str(f["curso_id"]) for f in filas if f.get("curso_id")}) or ["-"]).execute().data}
    docentes = {str(p["usuario_id"]): p["nombre"] for p in admin.table("perfiles").select("usuario_id, nombre")
                .in_("usuario_id", sorted({str(f["docente_id"]) for f in filas})).execute().data}
    return [
        {
            "id": str(f["id"]), "guia_id": f["guia_id"],
            "guia_titulo": reglas.POR_ID[f["guia_id"]]["titulo"] if f["guia_id"] in reglas.POR_ID else f["guia_id"],
            "institucion_id": f["institucion_id"], "curso_id": str(f["curso_id"]) if f.get("curso_id") else None,
            "curso_nombre": cursos.get(str(f.get("curso_id"))), "docente_nombre": docentes.get(str(f["docente_id"])),
            "fecha": f["fecha"], "asistentes": f.get("asistentes"), "notas": f.get("notas"),
            "puede_borrar": perfil.es_admin or str(f["docente_id"]) == perfil.usuario_id,
        }
        for f in filas
    ]


def _curso(curso_id: UUID | None, institucion_id: str) -> dict | None:
    if not curso_id:
        return None
    filas = db.get_admin().table("cursos").select("id, nombre, institucion_id").eq("id", str(curso_id)).execute().data
    if not filas or filas[0]["institucion_id"] != institucion_id:
        raise HTTPException(status_code=422, detail="Ese curso no es de la institución")
    return filas[0]


# ===================================== Guías =====================================
@router.get("/guias", response_model=list[GuiaResumen])
def listar_guias(
    area: Area | None = None,
    grado: int | None = Query(None, ge=0, le=11),
    institucion_id: str | None = Query(None, max_length=64),
    perfil: Perfil = Depends(perfil_actual),
):
    """Catálogo de guías, con cuántas veces se ha dictado cada una en la institución."""
    institucion = _institucion(perfil, institucion_id)
    usos = {}
    for c in _clases(institucion, limite=0):
        usos[c["guia_id"]] = usos.get(c["guia_id"], 0) + 1
    return [
        {**reglas.resumen(g), "aplicaciones": usos.get(g["id"], 0)}
        for g in reglas.GUIAS
        if (area is None or g["area"] == area) and (grado is None or grado in g["grados"])
    ]


@router.get("/guias/clases", response_model=list[ClaseOut])
def listar_clases(
    institucion_id: str | None = Query(None, max_length=64),
    limite: int = Query(30, ge=1, le=200),
    perfil: Perfil = Depends(perfil_actual),
):
    """Bitácora de clases dictadas con las guías, de la más reciente a la más antigua."""
    return _armar_clases(_clases(_institucion(perfil, institucion_id), limite=limite), perfil)


@router.post("/guias/clases", response_model=ClaseOut, status_code=201)
def registrar_clase(d: ClaseIn, perfil: Perfil = Depends(revisor_actual)):
    """Anota que se dictó una guía (docentes de la institución y administradores)."""
    _guia(d.guia_id)
    institucion = _institucion(perfil, d.institucion_id, obligatoria=True)
    if not perfil.gestiona(institucion):
        raise HTTPException(status_code=403, detail="Solo los docentes de la institución registran sus clases")
    if d.fecha > hoy():
        raise HTTPException(status_code=422, detail="La fecha de la clase no puede ser futura")
    curso = _curso(d.curso_id, institucion)
    fila = {
        "institucion_id": institucion, "guia_id": d.guia_id, "curso_id": str(curso["id"]) if curso else None,
        "docente_id": perfil.usuario_id, "fecha": d.fecha.isoformat(), "asistentes": d.asistentes, "notas": d.notas,
    }
    try:
        creada = db.get_admin().table("clases_guia").insert(fila).execute().data[0]
    except APIError as error:
        if _falta_migracion(error):
            raise HTTPException(status_code=409, detail="Falta aplicar la migración 012 (guías de clase) en Supabase")
        raise
    return _armar_clases([creada], perfil)[0]


@router.delete("/guias/clases/{clase_id}", status_code=204)
def borrar_clase(clase_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    """Quita una clase de la bitácora: quien la registró o el administrador."""
    try:
        filas = db.get_admin().table("clases_guia").select("id, docente_id").eq("id", str(clase_id)).execute().data
    except APIError as error:
        if _falta_migracion(error):
            raise HTTPException(status_code=404, detail="Clase no encontrada")
        raise
    if not filas:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    if not perfil.es_admin and str(filas[0]["docente_id"]) != perfil.usuario_id:
        raise HTTPException(status_code=403, detail="Solo quien registró la clase puede quitarla")
    db.get_admin().table("clases_guia").delete().eq("id", str(clase_id)).execute()
    return Response(status_code=204)


@router.get("/guias/{guia_id}", response_model=GuiaOut)
def ver_guia(guia_id: str, institucion_id: str | None = Query(None, max_length=64), perfil: Perfil = Depends(perfil_actual)):
    """La guía completa y las últimas clases dictadas con ella en la institución."""
    guia = _guia(guia_id)
    institucion = _institucion(perfil, institucion_id)
    clases = _clases(institucion, guia_id, limite=0)
    return {**reglas.completa(guia), "aplicaciones": len(clases), "clases": _armar_clases(clases[:10], perfil)}


@router.post("/guias/{guia_id}/ficha", response_model=FichaOut)
def ficha(guia_id: str, d: FichaIn, perfil: Perfil = Depends(revisor_actual)):
    """Ficha de trabajo en PDF con los datos reales del colegio: guía del docente, ficha del
    estudiante para imprimir y clave de respuestas. Enlace de descarga de 10 minutos."""
    guia = _guia(guia_id)
    institucion_id = _institucion(perfil, d.institucion_id, obligatoria=True)
    curso = _curso(d.curso_id, institucion_id)
    semilla = d.semilla or random.randint(1, 999_999)
    arboles = datos.arboles(db.cliente_de_usuario(perfil.sesion.token), institucion_id)
    riesgos = riesgo.categorias_actuales([str(a["id"]) for a in arboles])
    alertas = set(riesgo.alertas_abiertas(institucion_id))
    guardados, _ = origenes_guardados()
    origenes = {
        str(a.get("especie_id")): reglas_mapa.origen_de(a.get("nombre_cientifico"), guardados.get(str(a.get("especie_id"))))
        for a in arboles
    }
    tablas, clave = reglas.tablas(guia, arboles, riesgos, alertas, origenes, semilla)
    institucion = db.get_admin().table("instituciones").select("nombre").eq("id", institucion_id).execute().data[0]
    pdf = reglas.ficha_pdf(guia, institucion["nombre"], curso["nombre"] if curso else None, tablas, clave, hoy(), semilla)

    nombre = f"ficha-{guia_id}-{hoy().isoformat()}.pdf"
    # Una ficha por persona y guía: la siguiente reemplaza a la anterior.
    ruta = f"guias/{perfil.usuario_id}/{guia_id}.pdf"
    almacen = db.get_admin().storage.from_(BUCKET_FOTOS)
    almacen.upload(ruta, pdf, {"content-type": "application/pdf", "upsert": "true"})
    firmada = almacen.create_signed_url(ruta, VIGENCIA_ENLACE_S, {"download": nombre})
    url = firmada.get("signedURL") or firmada.get("signedUrl")
    if not url:
        raise HTTPException(status_code=502, detail="No se pudo preparar la descarga. Intenta de nuevo.")
    return {"url": url, "nombre": nombre, "vence_en_segundos": VIGENCIA_ENLACE_S, "semilla": semilla}


# ================================== Laboratorio ==================================
@router.get("/laboratorio/datos", response_model=LaboratorioOut, tags=["Laboratorio de datos"])
def datos_laboratorio(institucion_id: str | None = Query(None, max_length=64), perfil: Perfil = Depends(perfil_actual)):
    """Medidas de los árboles con DAP y altura (sin datos de personas). El administrador puede
    pedir una institución o todas."""
    institucion = _institucion(perfil, institucion_id)
    arboles = datos.arboles(db.cliente_de_usuario(perfil.sesion.token), institucion)
    filas = [
        {
            "id": str(a["id"]), "codigo": a.get("codigo"), "institucion_id": a.get("institucion_id"),
            "especie": a.get("nombre_comun") or "Sin especie", "nombre_cientifico": a.get("nombre_cientifico"),
            "zona": reglas.zona(a), "etapa": a.get("etapa"), "estado": a.get("estado"),
            "dap_cm": float(a["dap_cm"]), "altura_m": float(a["altura_m"]),
            "copa_m": float(a["copa_m"]) if a.get("copa_m") is not None else None,
        }
        for a in arboles
        if reglas.con_medidas(a)
    ]
    filas.sort(key=lambda f: str(f["codigo"] or ""))
    return {"institucion_id": institucion, "generado_en": ahora(), "arboles": filas}
