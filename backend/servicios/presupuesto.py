"""Presupuesto por periodo: gasto ejecutado, comprometido y proyecciones.

    ejecutado      = costo real de las intervenciones ejecutadas dentro del periodo
    comprometido   = costo estimado de las intervenciones programadas dentro del periodo
    recomendado    = costo de referencia de las recomendaciones que aún no se programan
                     (solo cuenta si el periodo no ha terminado)
    proyección     = ejecutado + comprometido + recomendado
    ritmo lineal   = gasto diario promedio hasta hoy × días del periodo
"""
from collections import defaultdict
from datetime import date

from comun import a_fecha


def resumen(
    presupuesto: dict,
    intervenciones: list[dict],
    recomendaciones: list[dict],
    costos_referencia: dict[str, float],
    hoy: date,
) -> dict:
    """intervenciones: las de árboles de la institución del presupuesto.
    recomendaciones: recomendaciones vigentes de esos árboles (con tipo_codigo)."""
    inicio, fin = a_fecha(presupuesto["fecha_inicio"]), a_fecha(presupuesto["fecha_fin"])
    monto = float(presupuesto["monto_asignado"])

    def dentro(valor) -> bool:
        dia = a_fecha(valor)
        return dia is not None and inicio <= dia <= fin

    ejecutadas = [i for i in intervenciones if i["estado"] == "ejecutada" and dentro(i.get("fecha_ejecucion"))]
    programadas = [i for i in intervenciones if i["estado"] == "programada" and dentro(i.get("fecha_programada"))]

    def costo_programada(i: dict) -> float:
        if i.get("costo_estimado") is not None:
            return float(i["costo_estimado"])
        return float(costos_referencia.get(i["tipo_codigo"], 0))

    ejecutado = sum(float(i.get("costo_real") or 0) for i in ejecutadas)
    comprometido = sum(costo_programada(i) for i in programadas)
    vigente = hoy <= fin
    recomendado = (
        sum(float(costos_referencia.get(r["tipo_codigo"], 0)) for r in recomendaciones) if vigente else 0.0
    )

    por_tipo: dict[str, dict] = defaultdict(lambda: {"ejecutado": 0.0, "comprometido": 0.0, "ejecutadas": 0, "programadas": 0})
    for i in ejecutadas:
        por_tipo[i["tipo_codigo"]]["ejecutado"] += float(i.get("costo_real") or 0)
        por_tipo[i["tipo_codigo"]]["ejecutadas"] += 1
    for i in programadas:
        por_tipo[i["tipo_codigo"]]["comprometido"] += costo_programada(i)
        por_tipo[i["tipo_codigo"]]["programadas"] += 1

    por_mes: dict[str, float] = defaultdict(float)
    for i in ejecutadas:
        por_mes[a_fecha(i["fecha_ejecucion"]).strftime("%Y-%m")] += float(i.get("costo_real") or 0)

    dias_totales = (fin - inicio).days + 1
    if hoy < inicio:
        dias_transcurridos = 0
    else:
        dias_transcurridos = (min(hoy, fin) - inicio).days + 1
    ritmo = ejecutado / dias_transcurridos * dias_totales if dias_transcurridos else None
    proyeccion = ejecutado + comprometido + recomendado

    return {
        "monto_asignado": round(monto, 2),
        "ejecutado": round(ejecutado, 2),
        "comprometido": round(comprometido, 2),
        "recomendado_sin_programar": round(recomendado, 2),
        "disponible": round(monto - ejecutado - comprometido, 2),
        "pct_ejecutado": round(ejecutado * 100 / monto, 1) if monto else None,
        "proyeccion_total": round(proyeccion, 2),
        "saldo_proyectado": round(monto - proyeccion, 2),
        "proyeccion_ritmo_actual": round(ritmo, 2) if ritmo is not None else None,
        "dias_transcurridos": dias_transcurridos,
        "dias_totales": dias_totales,
        "vigente": vigente,
        "intervenciones_ejecutadas": len(ejecutadas),
        "intervenciones_programadas": len(programadas),
        "por_tipo": sorted(
            (
                {
                    "tipo_codigo": t,
                    "ejecutado": round(v["ejecutado"], 2),
                    "comprometido": round(v["comprometido"], 2),
                    "ejecutadas": v["ejecutadas"],
                    "programadas": v["programadas"],
                }
                for t, v in por_tipo.items()
            ),
            key=lambda x: (-(x["ejecutado"] + x["comprometido"]), x["tipo_codigo"]),
        ),
        "por_mes": [{"mes": m, "ejecutado": round(v, 2)} for m, v in sorted(por_mes.items())],
    }


def se_cruzan(a_inicio: date, a_fin: date, b_inicio: date, b_fin: date) -> bool:
    return a_inicio <= b_fin and b_inicio <= a_fin
