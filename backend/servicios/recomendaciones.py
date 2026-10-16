"""Recomendaciones de intervención a partir del estado actual de cada árbol.

Se calculan con la última inspección no anulada: grupos de hallazgos, interferencia,
calificación y etapa. Una recomendación desaparece cuando ya existe una intervención
del mismo tipo programada, o ejecutada después de esa inspección.

Prioridad: 3 = alta, 2 = media, 1 = baja.
"""
from comun import a_fecha, fecha_local

ALTA, MEDIA, BAJA = 3, 2, 1
NOMBRES_PRIORIDAD = {ALTA: "alta", MEDIA: "media", BAJA: "baja"}

# (condición, tipo de intervención, prioridad normal, prioridad si el árbol está crítico, motivo)
REGLAS_GRUPO = {
    "plagas": ("control_plagas", MEDIA, ALTA, "Presenta plagas"),
    "follaje": ("tratamiento_fitosanitario", MEDIA, MEDIA, "Síntomas en el follaje"),
    "tronco": ("poda_sanitaria", MEDIA, ALTA, "Daños en tronco o ramas"),
    "raiz": ("evaluacion_riesgo", ALTA, ALTA, "Problemas en la raíz que afectan su estabilidad"),
}
REGLAS_INTERFERENCIA = {
    "Cables eléctricos": ("poda_despeje", ALTA, "Interfiere con cables eléctricos"),
    "Levantamiento de pisos": ("manejo_raices", MEDIA, "Levanta el piso"),
    "Afectación de muros": ("manejo_raices", MEDIA, "Afecta muros"),
    "Otra infraestructura": ("evaluacion_riesgo", MEDIA, "Interfiere con otra infraestructura"),
}


def recomendar(arbol: dict, grupos: set[str], intervenciones: list[dict]) -> list[dict]:
    """arbol: fila de arboles_resumen. grupos: grupos de hallazgos de su última inspección.
    intervenciones: intervenciones registradas para ese árbol."""
    estado = arbol.get("estado")
    critico = estado == "critico"
    propuestas: dict[str, dict] = {}

    def proponer(tipo: str, prioridad: int, motivo: str):
        actual = propuestas.get(tipo)
        if actual is None:
            propuestas[tipo] = {"tipo_codigo": tipo, "prioridad": prioridad, "motivos": [motivo]}
        else:
            actual["prioridad"] = max(actual["prioridad"], prioridad)
            if motivo not in actual["motivos"]:
                actual["motivos"].append(motivo)

    for grupo in sorted(grupos):
        regla = REGLAS_GRUPO.get(grupo)
        if regla:
            tipo, normal, si_critico, motivo = regla
            proponer(tipo, si_critico if critico else normal, motivo)

    regla = REGLAS_INTERFERENCIA.get(arbol.get("interferencia") or "")
    if regla:
        tipo, prioridad, motivo = regla
        proponer(tipo, prioridad, motivo)

    if critico:
        proponer("evaluacion_riesgo", ALTA, "Calificación crítica")
        if arbol.get("etapa") == "Senescente":
            proponer("tala_reposicion", ALTA, "Árbol senescente en estado crítico")
    elif estado == "sano" and not grupos:
        if arbol.get("etapa") == "Plántula":
            proponer("riego_fertilizacion", BAJA, "Mantenimiento de plántula")
        elif arbol.get("etapa") == "Juvenil":
            proponer("poda_formacion", BAJA, "Formación de árbol joven")

    atendidas = _tipos_atendidos(intervenciones, arbol.get("ultima_inspeccion_en"))
    resultado = [p for tipo, p in propuestas.items() if tipo not in atendidas]
    for p in resultado:
        p["prioridad_nombre"] = NOMBRES_PRIORIDAD[p["prioridad"]]
        p["motivo"] = "; ".join(p.pop("motivos"))
    resultado.sort(key=lambda p: (-p["prioridad"], p["tipo_codigo"]))
    return resultado


def _tipos_atendidos(intervenciones: list[dict], ultima_inspeccion_en) -> set[str]:
    desde = fecha_local(ultima_inspeccion_en) if ultima_inspeccion_en else None
    tipos = set()
    for i in intervenciones:
        if i.get("estado") == "programada":
            tipos.add(i["tipo_codigo"])
        elif i.get("estado") == "ejecutada":
            ejecutada = a_fecha(i.get("fecha_ejecucion"))
            if desde is None or (ejecutada is not None and ejecutada >= desde):
                tipos.add(i["tipo_codigo"])
    return tipos
