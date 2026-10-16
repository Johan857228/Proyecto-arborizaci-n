"""Puntos, niveles, rachas, logros y rankings.

Los puntos se derivan del historial (no se guardan aparte), así nunca se descuadran:
    - cada inspección confirmada suma `puntos_inspeccion` de la institución del árbol;
    - si además es la inspección de registro de un árbol nuevo, suma `puntos_arbol_nuevo`.
Las inspecciones pendientes o anuladas no suman puntos.

Racha: semanas seguidas (lunes a domingo, hora de Colombia) con al menos una inspección
no anulada. La racha actual sigue viva si la última semana activa es esta o la anterior.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

from comun import ZONA_HORARIA, a_fecha_hora

NIVELES = [
    (0, "Semilla"),
    (50, "Brote"),
    (150, "Plántula"),
    (300, "Árbol joven"),
    (600, "Árbol adulto"),
    (1000, "Guardián del bosque"),
]

# código: (nombre, descripción, métrica, meta)
LOGROS = [
    ("primer_registro", "Primer árbol", "Registra tu primer árbol.", "arboles_registrados", 1),
    ("explorador", "Explorador", "Logra 10 inspecciones confirmadas.", "confirmadas", 10),
    ("guardian", "Guardián", "Logra 50 inspecciones confirmadas.", "confirmadas", 50),
    ("ojo_clinico", "Ojo clínico", "5 inspecciones confirmadas con al menos un hallazgo.", "confirmadas_con_hallazgos", 5),
    ("constancia", "Constancia", "Inspecciona durante 4 semanas seguidas.", "mejor_racha", 4),
    ("precision", "Buena señal", "10 inspecciones con precisión GPS de 10 m o menos.", "inspecciones_precisas", 10),
    ("impecable", "Impecable", "10 inspecciones revisadas sin ninguna anulada.", "revisadas_sin_anular", 10),
]


@dataclass
class PuntosInstitucion:
    puntos_inspeccion: int = 10
    puntos_arbol_nuevo: int = 15


def semana(dia: date) -> date:
    """Lunes de la semana de ese día."""
    return dia - timedelta(days=dia.weekday())


def nivel(puntos: int) -> dict:
    actual = NIVELES[0]
    siguiente = None
    for i, (minimo, nombre) in enumerate(NIVELES):
        if puntos >= minimo:
            actual = (minimo, nombre)
            siguiente = NIVELES[i + 1] if i + 1 < len(NIVELES) else None
    progreso = 100.0
    if siguiente:
        progreso = round((puntos - actual[0]) * 100 / (siguiente[0] - actual[0]), 1)
    return {
        "nombre": actual[1],
        "minimo": actual[0],
        "siguiente": siguiente[1] if siguiente else None,
        "puntos_siguiente": siguiente[0] if siguiente else None,
        "faltan": siguiente[0] - puntos if siguiente else 0,
        "progreso_pct": progreso,
    }


def puntos_de(inspeccion: dict, puntos: PuntosInstitucion) -> int:
    if inspeccion["estado_revision"] != "confirmada":
        return 0
    total = puntos.puntos_inspeccion
    if inspeccion["origen"] == "registro":
        total += puntos.puntos_arbol_nuevo
    return total


def rachas(fechas: list, hoy: date) -> dict:
    semanas = sorted({semana(a_fecha_hora(f).astimezone(ZONA_HORARIA).date()) for f in fechas})
    mejor = actual_run = 0
    anterior = None
    for s in semanas:
        actual_run = actual_run + 1 if anterior is not None and s - anterior == timedelta(days=7) else 1
        mejor = max(mejor, actual_run)
        anterior = s
    esta = semana(hoy)
    viva = bool(semanas) and semanas[-1] >= esta - timedelta(days=7)
    return {"actual": actual_run if viva else 0, "mejor": mejor, "semanas_activas": len(semanas)}


def progreso_usuario(
    usuario_id: str,
    inspecciones: list[dict],
    observaciones: dict[str, list[str]],
    puntos_por_arbol: dict[str, PuntosInstitucion],
    hoy: date,
) -> dict:
    """inspecciones: todas las del sistema (se filtran las del usuario).
    puntos_por_arbol: arbol_id → valores de puntos de su institución."""
    mias = [i for i in inspecciones if i.get("inspector_id") == usuario_id]
    validas = [i for i in mias if i["estado_revision"] != "anulada"]
    confirmadas = [i for i in mias if i["estado_revision"] == "confirmada"]
    revisadas = [i for i in mias if i["estado_revision"] != "pendiente"]
    anuladas = [i for i in mias if i["estado_revision"] == "anulada"]
    total = sum(puntos_de(i, puntos_por_arbol.get(i["arbol_id"], PuntosInstitucion())) for i in confirmadas)
    racha = rachas([i["fecha"] for i in validas], hoy)
    metricas = {
        "arboles_registrados": sum(1 for i in validas if i["origen"] == "registro"),
        "confirmadas": len(confirmadas),
        "confirmadas_con_hallazgos": sum(1 for i in confirmadas if observaciones.get(i["id"])),
        "mejor_racha": racha["mejor"],
        "inspecciones_precisas": sum(
            1 for i in validas if i.get("precision_gps_m") is not None and float(i["precision_gps_m"]) <= 10
        ),
        "revisadas_sin_anular": len(revisadas) if not anuladas else 0,
    }
    logros = [
        {
            "codigo": codigo,
            "nombre": nombre,
            "descripcion": descripcion,
            "obtenido": metricas[metrica] >= meta,
            "progreso": min(metricas[metrica], meta),
            "meta": meta,
        }
        for codigo, nombre, descripcion, metrica, meta in LOGROS
    ]
    return {
        "puntos": total,
        "nivel": nivel(total),
        "racha": racha,
        "logros": logros,
        "resumen": {
            "inspecciones": len(validas),
            "confirmadas": len(confirmadas),
            "pendientes": sum(1 for i in mias if i["estado_revision"] == "pendiente"),
            "anuladas": len(anuladas),
            "arboles_registrados": metricas["arboles_registrados"],
        },
    }


def ranking_individual(
    inspecciones: list[dict], perfiles: dict[str, dict], puntos_por_arbol: dict[str, PuntosInstitucion]
) -> list[dict]:
    puntos = defaultdict(int)
    confirmadas = defaultdict(int)
    for i in inspecciones:
        uid = i.get("inspector_id")
        if uid in perfiles and i["estado_revision"] == "confirmada":
            puntos[uid] += puntos_de(i, puntos_por_arbol.get(i["arbol_id"], PuntosInstitucion()))
            confirmadas[uid] += 1
    filas = [
        {
            "id": uid,
            "nombre": p["nombre"],
            "curso_id": p.get("curso_id"),
            "puntos": puntos.get(uid, 0),
            "inspecciones_confirmadas": confirmadas.get(uid, 0),
            "nivel": nivel(puntos.get(uid, 0))["nombre"],
        }
        for uid, p in perfiles.items()
    ]
    return _posiciones(filas)


def ranking_cursos(individual: list[dict], cursos: dict[str, dict]) -> list[dict]:
    por_curso: dict[str, dict] = {
        cid: {"id": cid, "nombre": c["nombre"], "puntos": 0, "integrantes": 0, "inspecciones_confirmadas": 0}
        for cid, c in cursos.items()
    }
    for fila in individual:
        curso = por_curso.get(fila.get("curso_id") or "")
        if curso:
            curso["puntos"] += fila["puntos"]
            curso["integrantes"] += 1
            curso["inspecciones_confirmadas"] += fila["inspecciones_confirmadas"]
    for c in por_curso.values():
        c["promedio_por_integrante"] = round(c["puntos"] / c["integrantes"], 1) if c["integrantes"] else 0.0
    return _posiciones(list(por_curso.values()))


def _posiciones(filas: list[dict]) -> list[dict]:
    """Orden por puntos; empates comparten posición (1, 2, 2, 4)."""
    filas.sort(key=lambda f: (-f["puntos"], f["nombre"].lower()))
    anterior = None
    for indice, fila in enumerate(filas):
        if anterior is None or fila["puntos"] != anterior["puntos"]:
            fila["posicion"] = indice + 1
        else:
            fila["posicion"] = anterior["posicion"]
        anterior = fila
    return filas
