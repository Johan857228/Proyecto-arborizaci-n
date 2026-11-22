"""Zonas de cada sede (patio, cancha, entrada...), que define la propia institución.

Hasta la migración 016 eran cinco fijas para todos los colegios. Ahora cada institución tiene las
suyas: las crea, renombra o borra un docente de esa institución o el administrador. "Otra" no es una
zona guardada: siempre está disponible y lleva el nombre en zona_otra.

Sin la migración 016 todo sigue funcionando con las zonas de siempre, pero no se pueden editar.
"""
from collections import Counter
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel

import datos
import db
from auth import Perfil, perfil_actual
from comun import traer_todo
from schemas import ZONA_OTRA, ZONAS_POR_DEFECTO, Zona

router = APIRouter(tags=["Zonas"])

TABLA = "zonas"
MAX_ZONAS = 30
SIN_MIGRACION = "Para editar las zonas aplica la migración backend/sql/016_zonas_y_bajas.sql"


class ZonaIn(BaseModel):
    nombre: Zona


class ZonaOut(BaseModel):
    id: str | None = None
    nombre: str
    orden: int = 0
    arboles: int = 0
    cursos: int = 0


class ZonasOut(BaseModel):
    institucion_id: str
    # False si falta la migración 016: se muestran las de siempre y no se pueden cambiar.
    editable: bool
    puede_editar: bool
    zonas: list[ZonaOut]


def es_tabla_faltante(error: APIError) -> bool:
    return str(getattr(error, "code", "") or "") in ("42P01", "PGRST205")


def _filas(cliente, institucion_id: str) -> list[dict] | None:
    """Zonas guardadas de la institución, en orden. None si falta la tabla (migración 016)."""
    try:
        return (
            cliente.table(TABLA).select("id, nombre, orden").eq("institucion_id", institucion_id)
            .order("orden").order("nombre").execute().data
        )
    except APIError as error:
        if es_tabla_faltante(error):
            return None
        raise


def _asegurar(institucion_id: str) -> list[dict] | None:
    """Las zonas de la institución; si es nueva y aún no tiene, se le crean las de siempre."""
    admin = db.get_admin()
    filas = _filas(admin, institucion_id)
    if filas is None or filas:
        return filas
    admin.table(TABLA).insert(
        [{"institucion_id": institucion_id, "nombre": nombre, "orden": i} for i, nombre in enumerate(ZONAS_POR_DEFECTO, 1)]
    ).execute()
    return _filas(admin, institucion_id)


def nombres_de_zonas(institucion_id: str) -> list[str]:
    """Nombres de las zonas de la institución (sin "Otra")."""
    filas = _asegurar(institucion_id)
    return list(ZONAS_POR_DEFECTO) if filas is None else [f["nombre"] for f in filas]


def zona_valida(institucion_id: str, zona: str) -> bool:
    return zona == ZONA_OTRA or zona in nombres_de_zonas(institucion_id)


def _respuesta(cliente, perfil: Perfil, institucion_id: str) -> dict:
    filas = _asegurar(institucion_id)
    arboles = Counter(
        f.get("zona") for f in traer_todo(cliente, "arboles_resumen", "id, zona", filtros=[("eq", ("institucion_id", institucion_id))])
    )
    cursos = Counter(zona for curso in datos.cursos(cliente, institucion_id).values() for zona in curso.get("zonas", []))
    editable = filas is not None
    lista = filas if editable else [{"id": None, "nombre": n, "orden": i} for i, n in enumerate(ZONAS_POR_DEFECTO, 1)]
    return {
        "institucion_id": institucion_id,
        "editable": editable,
        "puede_editar": editable and perfil.gestiona(institucion_id),
        "zonas": [
            {"id": str(f["id"]) if f.get("id") else None, "nombre": f["nombre"], "orden": f.get("orden") or 0,
             "arboles": arboles.get(f["nombre"], 0), "cursos": cursos.get(f["nombre"], 0)}
            for f in lista
        ],
    }


def _exigir_gestion(perfil: Perfil, institucion_id: str) -> None:
    if not perfil.gestiona(institucion_id):
        raise HTTPException(status_code=403, detail="Solo un docente de esta institución o un administrador puede cambiar sus zonas")


def _zona(zona_id: UUID) -> dict:
    try:
        filas = db.get_admin().table(TABLA).select("id, institucion_id, nombre, orden").eq("id", str(zona_id)).execute().data
    except APIError as error:
        if es_tabla_faltante(error):
            raise HTTPException(status_code=503, detail=SIN_MIGRACION)
        raise
    if not filas:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    return filas[0]


def _repetida(nombre: str, existentes: list[dict], salvo: str | None = None) -> bool:
    clave = nombre.strip().lower()
    return clave == ZONA_OTRA.lower() or any(f["nombre"].strip().lower() == clave and str(f["id"]) != salvo for f in existentes)


def _cursos_de(cliente, institucion_id: str) -> list[str]:
    return list(datos.cursos(cliente, institucion_id))


@router.get("/instituciones/{institucion_id}/zonas", response_model=ZonasOut)
def listar(institucion_id: str, perfil: Perfil = Depends(perfil_actual)):
    """Zonas de la institución con cuántos árboles y cursos tiene cada una."""
    return _respuesta(db.cliente_de_usuario(perfil.sesion.token), perfil, institucion_id)


@router.post("/instituciones/{institucion_id}/zonas", response_model=ZonasOut, status_code=201)
def crear(institucion_id: str, d: ZonaIn, perfil: Perfil = Depends(perfil_actual)):
    _exigir_gestion(perfil, institucion_id)
    filas = _asegurar(institucion_id)
    if filas is None:
        raise HTTPException(status_code=503, detail=SIN_MIGRACION)
    if _repetida(d.nombre, filas):
        raise HTTPException(status_code=409, detail=f"Ya existe la zona «{d.nombre}»")
    if len(filas) >= MAX_ZONAS:
        raise HTTPException(status_code=409, detail=f"Una institución puede tener hasta {MAX_ZONAS} zonas")
    orden = max((f.get("orden") or 0 for f in filas), default=0) + 1
    db.get_admin().table(TABLA).insert({"institucion_id": institucion_id, "nombre": d.nombre, "orden": orden}).execute()
    return _respuesta(db.cliente_de_usuario(perfil.sesion.token), perfil, institucion_id)


@router.patch("/zonas/{zona_id}", response_model=ZonasOut)
def renombrar(zona_id: UUID, d: ZonaIn, perfil: Perfil = Depends(perfil_actual)):
    """Cambia el nombre de la zona; sus árboles y los cursos que la tienen asignada pasan al nombre nuevo."""
    zona = _zona(zona_id)
    institucion_id = zona["institucion_id"]
    _exigir_gestion(perfil, institucion_id)
    anterior = zona["nombre"]
    if d.nombre == anterior:
        return _respuesta(db.cliente_de_usuario(perfil.sesion.token), perfil, institucion_id)
    if _repetida(d.nombre, _filas(db.get_admin(), institucion_id) or [], salvo=str(zona["id"])):
        raise HTTPException(status_code=409, detail=f"Ya existe la zona «{d.nombre}»")

    admin = db.get_admin()
    admin.table(TABLA).update({"nombre": d.nombre}).eq("id", str(zona_id)).execute()
    admin.table("arboles").update({"zona": d.nombre}).eq("institucion_id", institucion_id).eq("zona", anterior).execute()
    cursos = _cursos_de(db.cliente_de_usuario(perfil.sesion.token), institucion_id)
    if cursos:
        admin.table("curso_zonas").update({"zona": d.nombre}).in_("curso_id", cursos).eq("zona", anterior).execute()
    return _respuesta(db.cliente_de_usuario(perfil.sesion.token), perfil, institucion_id)


@router.delete("/zonas/{zona_id}", response_model=ZonasOut)
def borrar(
    zona_id: UUID,
    mover_a: str | None = Query(None, max_length=60, description="Zona a la que pasan sus árboles, si tiene"),
    perfil: Perfil = Depends(perfil_actual),
):
    """Borra una zona. Si tiene árboles, hay que decir a qué otra zona pasan (`mover_a`). Los cursos
    que la tenían asignada la pierden."""
    zona = _zona(zona_id)
    institucion_id = zona["institucion_id"]
    _exigir_gestion(perfil, institucion_id)
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    admin = db.get_admin()
    con_arboles = traer_todo(
        cliente, "arboles_resumen", "id", filtros=[("eq", ("institucion_id", institucion_id)), ("eq", ("zona", zona["nombre"]))]
    )
    if con_arboles:
        n = len(con_arboles)
        otras = [nombre for nombre in nombres_de_zonas(institucion_id) if nombre != zona["nombre"]]
        if not mover_a:
            raise HTTPException(
                status_code=409,
                detail=f"«{zona['nombre']}» tiene {n} {'árbol' if n == 1 else 'árboles'}: elige a qué zona pasarlos antes de borrarla.",
            )
        if mover_a not in otras:
            raise HTTPException(status_code=422, detail=f"«{mover_a}» no es otra zona de esta institución")
        admin.table("arboles").update({"zona": mover_a}).eq("institucion_id", institucion_id).eq("zona", zona["nombre"]).execute()
    cursos = _cursos_de(cliente, institucion_id)
    if cursos:
        admin.table("curso_zonas").delete().in_("curso_id", cursos).eq("zona", zona["nombre"]).execute()
    admin.table(TABLA).delete().eq("id", str(zona_id)).execute()
    return _respuesta(cliente, perfil, institucion_id)
