"""Puntajes y gamificación: progreso propio y rankings individuales o por curso."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query

import datos
import db
from auth import Perfil, perfil_actual
from comun import a_fecha_hora, fin_del_dia, hoy, inicio_del_dia, validar_periodo
from servicios import gamificacion

router = APIRouter(prefix="/gamificacion", tags=["Gamificación"])


def _puntos_por_arbol(cliente, arboles: list[dict]) -> dict[str, gamificacion.PuntosInstitucion]:
    metodos = datos.metodos(cliente)
    parametros = datos.parametros(cliente, metodos)
    return {
        a["id"]: datos.parametros_de(parametros, a["institucion_id"], metodos).puntos()
        for a in arboles
    }


@router.get("/mi-progreso")
def mi_progreso(perfil: Perfil = Depends(perfil_actual)):
    """Puntos, nivel, racha semanal, logros y posición en el ranking de la institución."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arboles = datos.arboles(cliente)
    inspecciones = datos.inspecciones(cliente)
    mias = [str(i["id"]) for i in inspecciones if i.get("inspector_id") == perfil.usuario_id]
    observaciones = datos.observaciones_por_inspeccion(cliente, mias) if mias else {}
    puntos = _puntos_por_arbol(cliente, arboles)
    progreso = gamificacion.progreso_usuario(perfil.usuario_id, inspecciones, observaciones, puntos, hoy())

    posicion = None
    if perfil.institucion_id:
        companeros = {
            uid: p for uid, p in datos.perfiles_publicos(cliente).items()
            if p["institucion_id"] == perfil.institucion_id and p["activo"] and p["rol"] == perfil.rol
        }
        ranking = gamificacion.ranking_individual(inspecciones, companeros, puntos)
        posicion = next(({"posicion": f["posicion"], "de": len(ranking)} for f in ranking if f["id"] == perfil.usuario_id), None)
    return {"usuario_id": perfil.usuario_id, "nombre": perfil.nombre, "posicion_institucion": posicion, **progreso}


@router.get("/ranking")
def ranking(
    tipo: Literal["individual", "curso"] = "individual",
    institucion_id: str | None = None,
    curso_id: str | None = None,
    rol: Literal["estudiante", "docente", "todos"] = "estudiante",
    desde: date | None = None,
    hasta: date | None = None,
    limite: int = Query(20, ge=1, le=200),
    perfil: Perfil = Depends(perfil_actual),
):
    """Ranking por puntos. Por defecto solo estudiantes activos y todo el historial; con
    desde/hasta solo cuentan las inspecciones de ese periodo."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arboles = datos.arboles(cliente)
    inspecciones = datos.inspecciones(cliente)
    if desde or hasta:
        desde, hasta = validar_periodo(desde, hasta)
        inicio, fin = inicio_del_dia(desde), fin_del_dia(hasta)
        inspecciones = [i for i in inspecciones if inicio <= a_fecha_hora(i["fecha"]) <= fin]
    puntos = _puntos_por_arbol(cliente, arboles)

    perfiles = {
        uid: p for uid, p in datos.perfiles_publicos(cliente).items()
        if p["activo"]
        and (rol == "todos" or p["rol"] == rol)
        and (institucion_id is None or p["institucion_id"] == institucion_id)
        and (curso_id is None or p["curso_id"] == curso_id)
    }
    individual = gamificacion.ranking_individual(inspecciones, perfiles, puntos)
    if tipo == "curso":
        cursos = {cid: c for cid, c in datos.cursos(cliente, institucion_id).items() if c["activo"]}
        filas = gamificacion.ranking_cursos(individual, cursos)
        mio = next((f for f in filas if f["id"] == perfil.curso_id), None)
    else:
        cursos = datos.cursos(cliente)
        for f in individual:
            f["curso_nombre"] = cursos.get(f.get("curso_id") or "", {}).get("nombre")
        filas = individual
        mio = next((f for f in filas if f["id"] == perfil.usuario_id), None)
    return {
        "tipo": tipo,
        "periodo": {"desde": desde.isoformat() if desde else None, "hasta": hasta.isoformat() if hasta else None},
        "total": len(filas),
        "filas": filas[:limite],
        "mi_posicion": mio,
    }
