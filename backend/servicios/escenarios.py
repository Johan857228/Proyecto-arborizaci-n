"""Escenarios presupuestales (Fase 2): qué acciones entran con un monto dado.

Candidatas: las recomendaciones vigentes (costo de referencia del tipo) y, si se pide,
las intervenciones ya programadas (su costo estimado). Se recorren en orden y cada una
entra si su costo cabe en el saldo; si no cabe, queda fuera y se sigue con la siguiente.

Criterios de orden:
    riesgo   → prioridad, gravedad del árbol y puntaje de riesgo primero; a igualdad, la más barata
    cantidad → la más barata primero (atiende más acciones con el mismo dinero)
"""
SEVERIDAD = {"critico": 3, "riesgo": 2, "sano": 1}


def ordenar(candidatas: list[dict], criterio: str) -> list[dict]:
    if criterio == "cantidad":
        clave = lambda c: (c["costo"], -c["prioridad"], -SEVERIDAD.get(c["estado"], 0), c["codigo"], c["tipo_codigo"])
    else:
        clave = lambda c: (
            -c["prioridad"], -SEVERIDAD.get(c["estado"], 0), -(c["puntaje_riesgo"] or 0), c["costo"], c["codigo"], c["tipo_codigo"]
        )
    return sorted(candidatas, key=clave)


def simular(candidatas: list[dict], monto: float, criterio: str) -> dict:
    saldo = round(float(monto), 2)
    incluidas, excluidas = [], []
    for c in ordenar(candidatas, criterio):
        if c["costo"] <= saldo:
            saldo = round(saldo - c["costo"], 2)
            incluidas.append(c)
        else:
            excluidas.append({**c, "motivo_exclusion": "El costo supera el saldo disponible"})
    total_incluido = round(sum(c["costo"] for c in incluidas), 2)
    total_candidatas = round(sum(c["costo"] for c in candidatas), 2)
    return {
        "monto": round(float(monto), 2),
        "criterio": criterio,
        "total_incluido": total_incluido,
        "saldo": saldo,
        "total_requerido": total_candidatas,
        "faltante": round(max(total_candidatas - float(monto), 0), 2),
        "acciones_incluidas": len(incluidas),
        "acciones_excluidas": len(excluidas),
        "arboles_atendidos": len({c["arbol_id"] for c in incluidas}),
        "criticos_atendidos": len({c["arbol_id"] for c in incluidas if c["estado"] == "critico"}),
        "criticos_sin_atender": len(
            {c["arbol_id"] for c in excluidas if c["estado"] == "critico"} - {c["arbol_id"] for c in incluidas}
        ),
        "incluidas": incluidas,
        "excluidas": excluidas,
    }
