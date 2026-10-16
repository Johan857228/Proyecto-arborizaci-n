"""Cursos, sus zonas asignadas y su avance (cobertura y productividad)."""
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

import datos
import db
from auth import Perfil, perfil_actual
from comun import hoy, validar_periodo
from schemas import ZONAS, Zona
from servicios import indicadores

router = APIRouter(tags=["Cursos"])


class CursoBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=60)
    anio: int = Field(ge=2000, le=2100)
    docente_id: UUID | None = None

    @field_validator("nombre")
    @classmethod
    def _limpiar(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Escribe el nombre del curso")
        return v


class CursoCrear(CursoBase):
    institucion_id: str
    zonas: list[Zona] = Field(default_factory=list)


class CursoEditar(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=60)
    anio: int | None = Field(default=None, ge=2000, le=2100)
    docente_id: UUID | None = None
    activo: bool | None = None

    @field_validator("nombre")
    @classmethod
    def _limpiar(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Escribe el nombre del curso")
        return v


class ZonasIn(BaseModel):
    zonas: list[Zona]


class Integrante(BaseModel):
    usuario_id: str
    nombre: str
    rol: str


class CursoOut(BaseModel):
    id: str
    institucion_id: str
    nombre: str
    anio: int
    docente_id: str | None = None
    docente_nombre: str | None = None
    activo: bool
    creado_en: datetime
    zonas: list[str]
    integrantes: int
    puede_gestionar: bool


class CursoDetalle(CursoOut):
    miembros: list[Integrante]


def _armar(curso: dict, perfiles: dict[str, dict], perfil: Perfil) -> dict:
    miembros = sorted(
        (p for p in perfiles.values() if p.get("curso_id") == curso["id"]), key=lambda p: p["nombre"].lower()
    )
    docente = perfiles.get(str(curso.get("docente_id") or ""))
    return {
        **curso,
        "docente_id": str(curso["docente_id"]) if curso.get("docente_id") else None,
        "docente_nombre": docente["nombre"] if docente else None,
        "integrantes": len(miembros),
        "puede_gestionar": perfil.gestiona(curso["institucion_id"]),
        "miembros": [{"usuario_id": p["usuario_id"], "nombre": p["nombre"], "rol": p["rol"]} for p in miembros],
    }


def _curso(cliente, curso_id: str) -> dict:
    cursos = datos.cursos(cliente)
    if curso_id not in cursos:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    return cursos[curso_id]


def _validar_docente(cliente, docente_id: UUID | None, institucion_id: str):
    if docente_id is None:
        return
    filas = (
        cliente.table("perfiles_publicos")
        .select("usuario_id, rol, institucion_id, activo")
        .eq("usuario_id", str(docente_id))
        .execute()
        .data
    )
    if not filas or filas[0]["rol"] not in ("docente", "administrador") or not filas[0]["activo"]:
        raise HTTPException(status_code=422, detail="El docente indicado no existe o no tiene rol de docente")
    if filas[0]["rol"] == "docente" and filas[0]["institucion_id"] != institucion_id:
        raise HTTPException(status_code=422, detail="El docente pertenece a otra institución")


def _exigir_gestion(perfil: Perfil, institucion_id: str):
    if not perfil.gestiona(institucion_id):
        raise HTTPException(status_code=403, detail="Solo el administrador o un docente de la institución gestiona sus cursos")


@router.get("/cursos", response_model=list[CursoOut])
def listar(institucion_id: str | None = None, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    perfiles = datos.perfiles_publicos(cliente)
    cursos = datos.cursos(cliente, institucion_id).values()
    return sorted(
        (_armar(c, perfiles, perfil) for c in cursos), key=lambda c: (-c["anio"], c["nombre"].lower())
    )


@router.get("/cursos/{curso_id}", response_model=CursoDetalle)
def detalle(curso_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    return _armar(_curso(cliente, str(curso_id)), datos.perfiles_publicos(cliente), perfil)


@router.post("/cursos", response_model=CursoDetalle, status_code=201)
def crear(d: CursoCrear, perfil: Perfil = Depends(perfil_actual)):
    _exigir_gestion(perfil, d.institucion_id)
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    if d.institucion_id not in datos.instituciones(cliente):
        raise HTTPException(status_code=422, detail="La institución no existe")
    _validar_docente(cliente, d.docente_id, d.institucion_id)
    fila = {
        "institucion_id": d.institucion_id,
        "nombre": d.nombre,
        "anio": d.anio,
        "docente_id": str(d.docente_id) if d.docente_id else None,
    }
    creado = cliente.table("cursos").insert(fila).execute().data[0]
    zonas = sorted(set(d.zonas))
    if zonas:
        try:
            cliente.table("curso_zonas").insert([{"curso_id": creado["id"], "zona": z} for z in zonas]).execute()
        except Exception:
            db.get_admin().table("cursos").delete().eq("id", creado["id"]).execute()
            raise
    return _armar({**creado, "zonas": zonas}, datos.perfiles_publicos(cliente), perfil)


@router.patch("/cursos/{curso_id}", response_model=CursoDetalle)
def editar(curso_id: UUID, d: CursoEditar, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    curso = _curso(cliente, str(curso_id))
    _exigir_gestion(perfil, curso["institucion_id"])
    cambios = d.model_dump(mode="json", exclude_unset=True)
    if not cambios:
        raise HTTPException(status_code=422, detail="No hay cambios para guardar")
    if "nombre" in cambios and cambios["nombre"] is None:
        raise HTTPException(status_code=422, detail="Escribe el nombre del curso")
    if "anio" in cambios and cambios["anio"] is None:
        raise HTTPException(status_code=422, detail="Indica el año del curso")
    if "activo" in cambios and cambios["activo"] is None:
        raise HTTPException(status_code=422, detail="Indica si el curso está activo")
    if cambios.get("docente_id"):
        _validar_docente(cliente, UUID(cambios["docente_id"]), curso["institucion_id"])
    filas = cliente.table("cursos").update(cambios).eq("id", str(curso_id)).execute().data
    if not filas:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este curso")
    return _armar({**filas[0], "zonas": curso["zonas"]}, datos.perfiles_publicos(cliente), perfil)


@router.put("/cursos/{curso_id}/zonas", response_model=CursoDetalle)
def asignar_zonas(curso_id: UUID, d: ZonasIn, perfil: Perfil = Depends(perfil_actual)):
    """Reemplaza las zonas asignadas al curso."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    curso = _curso(cliente, str(curso_id))
    _exigir_gestion(perfil, curso["institucion_id"])
    nuevas = sorted(set(d.zonas))
    actuales = set(curso["zonas"])
    quitar = sorted(actuales - set(nuevas))
    agregar = [z for z in nuevas if z not in actuales]
    if quitar:
        cliente.table("curso_zonas").delete().eq("curso_id", str(curso_id)).in_("zona", quitar).execute()
    if agregar:
        cliente.table("curso_zonas").insert([{"curso_id": str(curso_id), "zona": z} for z in agregar]).execute()
    return _armar({**curso, "zonas": nuevas}, datos.perfiles_publicos(cliente), perfil)


@router.delete("/cursos/{curso_id}", status_code=204)
def borrar(curso_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    """Borra el curso; sus integrantes quedan sin curso (no se borra ningún registro)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    curso = _curso(cliente, str(curso_id))
    _exigir_gestion(perfil, curso["institucion_id"])
    cliente.table("cursos").delete().eq("id", str(curso_id)).execute()


@router.get("/cursos/{curso_id}/avance")
def avance(
    curso_id: UUID,
    desde: date | None = None,
    hasta: date | None = None,
    perfil: Perfil = Depends(perfil_actual),
):
    """Cobertura de las zonas asignadas (árboles con inspección válida en el periodo) y
    productividad de sus integrantes. Sin fechas: la ventana de revisita de la institución."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    curso = _curso(cliente, str(curso_id))
    parametros = datos.parametros_institucion(cliente, curso["institucion_id"])
    if desde is None and hasta is None:
        hasta = hoy()
        desde = date.fromordinal(hasta.toordinal() - parametros.dias_revisita + 1)
    desde, hasta = validar_periodo(desde, hasta)

    perfiles = datos.perfiles_publicos(cliente)
    integrantes = sorted(
        (p for p in perfiles.values() if p.get("curso_id") == curso["id"]), key=lambda p: p["nombre"].lower()
    )
    arboles = datos.arboles(cliente, curso["institucion_id"])
    base = indicadores.Datos(
        arboles=arboles,
        inspecciones=datos.inspecciones(cliente),
        perfiles=perfiles,
    )
    resultado = indicadores.avance_curso(base, curso, curso["zonas"], integrantes, desde, hasta)
    return {
        "curso": {"id": curso["id"], "nombre": curso["nombre"], "anio": curso["anio"], "zonas": curso["zonas"]},
        "zonas_disponibles": list(ZONAS),
        **resultado,
    }
