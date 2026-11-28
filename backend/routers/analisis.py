"""Datos del módulo de Análisis: el tablero interactivo de la app, con las mismas tablas y cálculos
de la plantilla de Power BI y del informe en PDF o Excel.

GET /analisis devuelve una fila por árbol, inspección, intervención y hallazgo, ya calculadas
(estado de la última inspección válida, CO2, revisita pendiente…). La app filtra, cruza y grafica
en el teléfono o el navegador, y vuelve a pedir los datos cada pocos segundos mientras la pantalla
está abierta, así que lo que se registra aparece solo.

Sin datos personales, igual que la exportación: ni nombres ni notas de texto libre; de cada
inspección solo se dice el curso de quien la hizo. Los permisos son los de Reportes (los decide RLS
con el token de quien consulta).
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db
from auth import Perfil, perfil_actual
from comun import ahora
from routers.exportar import fuente_informe, instituciones_con_dane
from servicios import informe_arbolado

router = APIRouter(tags=["Análisis"])


class ArbolAnalisis(BaseModel):
    id: str
    sede_id: str
    sede: str | None = None
    codigo: str | None = None
    zona: str | None = None
    especie: str | None = None
    nombre_cientifico: str | None = None
    origen: str
    etapa: str | None = None
    interferencia: str | None = None
    estado: str
    puntaje: float | None = None
    dap: float | None = None
    altura: float | None = None
    copa: float | None = None
    clase_dap: str | None = None
    clase_dap_orden: int | None = None
    area_copa: float | None = None
    biomasa_kg: float | None = None
    carbono_kg: float | None = None
    co2_kg: float | None = None
    lat: float | None = None
    lng: float | None = None
    n_inspecciones: int
    ultima_inspeccion: date | None = None
    dias_desde: int | None = None
    revisita_pendiente: bool
    prioritario: bool
    registrado: date | None = None


class InspeccionAnalisis(BaseModel):
    arbol_id: str
    fecha: date | None = None
    tipo: str | None = None
    calificacion: str | None = None
    puntaje: float | None = None
    revision: str | None = None
    curso: str
    hallazgos: int
    horas_revision: float | None = None


class IntervencionAnalisis(BaseModel):
    arbol_id: str
    tipo: str | None = None
    estado: str | None = None
    fecha: date | None = None
    fecha_programada: date | None = None
    fecha_ejecucion: date | None = None
    costo_estimado: float | None = None
    costo_real: float | None = None
    resultado: str | None = None
    vencida: bool


class HallazgoAnalisis(BaseModel):
    arbol_id: str
    fecha: date | None = None
    hallazgo: str
    grupo: str
    anulada: bool


class SedeAnalisis(BaseModel):
    id: str
    nombre: str


class AnalisisOut(BaseModel):
    generado_en: str
    alcance: str
    institucion_id: str | None = None
    sedes: list[SedeAnalisis]
    arboles: list[ArbolAnalisis]
    inspecciones: list[InspeccionAnalisis]
    intervenciones: list[IntervencionAnalisis]
    hallazgos: list[HallazgoAnalisis]


def armar(t: informe_arbolado.Tablas) -> dict:
    arboles = [{
        "id": a["arbol_id"], "sede_id": a["institucion_id"], "sede": a.get("Sede"), "codigo": a.get("Código"),
        "zona": a.get("Zona"), "especie": a.get("Especie"), "nombre_cientifico": a.get("Nombre científico"),
        "origen": a.get("Origen") or "Sin dato", "etapa": a.get("Etapa"), "interferencia": a.get("Interferencia"),
        "estado": a.get("Estado"), "puntaje": a.get("Puntaje de riesgo"), "dap": a.get("DAP (cm)"),
        "altura": a.get("Altura (m)"), "copa": a.get("Copa (m)"), "clase_dap": a.get("Clase de DAP"),
        "clase_dap_orden": a.get("Clase de DAP orden"), "area_copa": a.get("Área de copa (m2)"),
        "biomasa_kg": a.get("Biomasa (kg)"), "carbono_kg": a.get("Carbono (kg)"), "co2_kg": a.get("CO2 almacenado (kg)"),
        "lat": a.get("Latitud"), "lng": a.get("Longitud"), "n_inspecciones": a.get("N.º de inspecciones") or 0,
        "ultima_inspeccion": a.get("Última inspección válida"), "dias_desde": a.get("Días desde la última inspección"),
        "revisita_pendiente": a.get("Revisita pendiente") == "Sí", "prioritario": a.get("Prioritario") == "Sí",
        "registrado": a.get("Fecha de registro"),
    } for a in t.arboles]
    inspecciones = [{
        "arbol_id": i["arbol_id"], "fecha": i.get("Fecha"), "tipo": i.get("Tipo de visita"),
        "calificacion": i.get("Calificación"), "puntaje": i.get("Puntaje de riesgo"), "revision": i.get("Revisión"),
        "curso": i.get("Curso") or "Sin curso", "hallazgos": i.get("N.º de hallazgos") or 0,
        "horas_revision": i.get("Horas hasta la revisión"),
    } for i in t.inspecciones]
    intervenciones = [{
        "arbol_id": v["arbol_id"], "tipo": v.get("Tipo"), "estado": v.get("Estado"), "fecha": v.get("Fecha"),
        "fecha_programada": v.get("Fecha programada"), "fecha_ejecucion": v.get("Fecha de ejecución"),
        "costo_estimado": v.get("Costo estimado (COP)"), "costo_real": v.get("Costo real (COP)"),
        "resultado": v.get("Resultado"), "vencida": v.get("Vencida") == "Sí",
    } for v in t.intervenciones]
    hallazgos = [{
        "arbol_id": h["arbol_id"], "fecha": h.get("Fecha"), "hallazgo": h.get("Hallazgo") or h.get("Código del hallazgo"),
        "grupo": h.get("Grupo") or "Sin grupo", "anulada": h.get("Revisión") == "Anulada",
    } for h in t.hallazgos if h.get("arbol_id")]
    sedes = sorted(({"id": iid, "nombre": nombre} for iid, nombre in t.sedes.items()), key=lambda s: s["nombre"])
    return {"sedes": sedes, "arboles": arboles, "inspecciones": inspecciones, "intervenciones": intervenciones,
            "hallazgos": hallazgos}


@router.get("/analisis", response_model=AnalisisOut)
def analisis(institucion_id: str | None = None, perfil: Perfil = Depends(perfil_actual)):
    """Filas calculadas para el tablero de Análisis (todo el historial; el periodo se elige en la app)."""
    instituciones = instituciones_con_dane()
    if institucion_id and institucion_id not in instituciones:
        raise HTTPException(status_code=404, detail="Institución no encontrada")
    generado = ahora()
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    fuente = fuente_informe(cliente, institucion_id, instituciones, generado)
    return {
        "generado_en": generado.isoformat(),
        "alcance": fuente.alcance,
        "institucion_id": institucion_id,
        **armar(informe_arbolado.tablas(fuente)),
    }
