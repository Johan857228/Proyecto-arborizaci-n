"""Reportes y análisis: indicadores de inventario, riesgo, cobertura, productividad e intervenciones."""
from datetime import date

from fastapi import APIRouter, Depends

import datos
import db
from auth import Perfil, perfil_actual
from comun import hoy, validar_periodo
from servicios import indicadores

router = APIRouter(prefix="/reportes", tags=["Reportes"])


def cargar_datos(cliente, institucion_id: str | None) -> tuple[indicadores.Datos, int]:
    """Todo lo necesario para los indicadores de una institución (o de todas) y su ventana
    de revisita en días."""
    metodos = datos.metodos(cliente)
    base = indicadores.Datos(
        arboles=datos.arboles(cliente, institucion_id),
        inspecciones=datos.inspecciones(cliente),
        observaciones=datos.observaciones_por_inspeccion(cliente),
        catalogo=datos.catalogo_observaciones(cliente),
        intervenciones=datos.intervenciones(cliente),
        metodos=metodos,
        metodo_defecto=datos.metodo_por_defecto(metodos),
        perfiles=datos.perfiles_publicos(cliente),
        cursos=datos.cursos(cliente, institucion_id),
    )
    dias = 180
    if institucion_id:
        dias = datos.parametros_de(datos.parametros(cliente, metodos), institucion_id, metodos).dias_revisita
    return base, dias


@router.get("/indicadores")
def reporte(
    institucion_id: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    perfil: Perfil = Depends(perfil_actual),
):
    """Indicadores del periodo. Sin fechas: desde el 1 de enero del año en curso hasta hoy.
    El inventario y el riesgo se calculan como estaban al cierre del periodo."""
    if desde is None and hasta is None:
        hasta = hoy()
        desde = date(hasta.year, 1, 1)
    desde, hasta = validar_periodo(desde, hasta)
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    base, dias = cargar_datos(cliente, institucion_id)
    return {"institucion_id": institucion_id, **indicadores.calcular(base, desde, hasta, dias)}
