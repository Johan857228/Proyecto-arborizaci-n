"""Siembras con seguimiento de supervivencia (migración 013).

Cada plántula tiene controles a los 3, 6, 12 y 24 meses de sembrada: los 2 años de mantenimiento
que pide la Resolución 1491 de 2025 para las siembras de la Ley 2173. Un control se puede hacer
desde 15 días antes de la fecha del hito y queda vencido 30 días después.

Supervivencia por hito (cohorte): entre las plántulas cuyo hito ya llegó y de las que se sabe
cómo estaban a esa edad, cuántas seguían vivas. Una plántula que murió a los 6 meses cuenta como
muerta a los 12 y a los 24 aunque nadie la vuelva a controlar; una sin control en ese hito, y que
no se sabe si murió antes, queda como pendiente y no entra en la tasa.
"""
import calendar
from collections import defaultdict
from datetime import date, timedelta

HITOS = (3, 6, 12, 24)
VIVA = {"viva_buena", "viva_regular"}
ESTADOS = {"viva_buena": "Viva y sana", "viva_regular": "Viva, con problemas", "muerta": "Muerta", "no_encontrada": "No se encontró"}
DIAS_ANTES = 15
DIAS_TOLERANCIA = 30


def _fecha(valor) -> date | None:
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str) and len(valor) >= 10:
        return date.fromisoformat(valor[:10])
    return None


def sumar_meses(fecha: date, meses: int) -> date:
    """31 de enero + 1 mes = 28 (o 29) de febrero."""
    mes = fecha.month - 1 + meses
    anio, mes = fecha.year + mes // 12, mes % 12 + 1
    return date(anio, mes, min(fecha.day, calendar.monthrange(anio, mes)[1]))


def vencimiento(siembra: dict, hito: int) -> date:
    return sumar_meses(_fecha(siembra["fecha"]), hito)


def _ordenados(controles: list[dict]) -> list[dict]:
    return sorted(controles, key=lambda c: (str(c["fecha"]), str(c.get("creado_en") or "")))


def estado_actual(controles: list[dict]) -> str:
    """viva, muerta o sin_control según el último control."""
    if not controles:
        return "sin_control"
    return "viva" if _ordenados(controles)[-1]["estado"] in VIVA else "muerta"


def murio_hasta(siembra: dict, controles: list[dict], hito: int) -> bool:
    """Algún control hasta la fecha del hito (o de un hito anterior) dice que no estaba viva."""
    limite = vencimiento(siembra, hito) + timedelta(days=DIAS_TOLERANCIA)
    return any(
        c["estado"] not in VIVA and ((c.get("hito_meses") or 0) <= hito if c.get("hito_meses") else _fecha(c["fecha"]) <= limite)
        for c in controles
    )


def siguiente_control(siembra: dict, controles: list[dict], hoy: date) -> dict | None:
    """El próximo hito sin control y si está próximo, pendiente (su ventana está abierta) o
    vencido. None si ya se hicieron todos o si la plántula murió."""
    if estado_actual(controles) == "muerta":
        return None
    hechos = {c.get("hito_meses") for c in controles}
    for hito in HITOS:
        if hito in hechos:
            continue
        fecha = vencimiento(siembra, hito)
        if hoy < fecha - timedelta(days=DIAS_ANTES):
            estado = "proximo"
        elif hoy <= fecha + timedelta(days=DIAS_TOLERANCIA):
            estado = "pendiente"
        else:
            estado = "vencido"
        return {"hito_meses": hito, "fecha": fecha, "estado": estado}
    return None


def _tasa(vivas: int, conocidas: int) -> float | None:
    return round(100 * vivas / conocidas, 1) if conocidas else None


def resumen(siembras: list[dict], controles: dict[str, list[dict]], origenes: dict[str, str | None], hoy: date) -> dict:
    """Totales de un grupo de plántulas (una jornada, una sede o todo).

    controles: siembra_id -> controles. origenes: siembra_id -> 'nativa' | 'exotica' | None."""
    vivas = muertas = evaluadas = pendientes = vencidos = completas = 0
    por_hito = {h: {"hito_meses": h, "debidas": 0, "conocidas": 0, "vivas": 0, "pendientes": 0} for h in HITOS}
    for s in siembras:
        propios = controles.get(str(s["id"]), [])
        actual = estado_actual(propios)
        if actual != "sin_control":
            evaluadas += 1
            vivas += actual == "viva"
            muertas += actual == "muerta"
        siguiente = siguiente_control(s, propios, hoy)
        if siguiente and siguiente["estado"] == "pendiente":
            pendientes += 1
        elif siguiente and siguiente["estado"] == "vencido":
            vencidos += 1
        por_fecha = {c.get("hito_meses"): c for c in propios if c.get("hito_meses")}
        if 24 in por_fecha and por_fecha[24]["estado"] in VIVA:
            completas += 1
        for h in HITOS:
            if vencimiento(s, h) > hoy:
                continue
            grupo = por_hito[h]
            grupo["debidas"] += 1
            if murio_hasta(s, propios, h):
                grupo["conocidas"] += 1
            elif h in por_fecha and por_fecha[h]["estado"] in VIVA:
                grupo["conocidas"] += 1
                grupo["vivas"] += 1
            else:
                grupo["pendientes"] += 1
    nativas = sum(1 for s in siembras if origenes.get(str(s["id"])) == "nativa")
    clasificadas = sum(1 for s in siembras if origenes.get(str(s["id"])) in ("nativa", "exotica"))
    return {
        "sembradas": len(siembras),
        "nativas": nativas,
        "pct_nativas": _tasa(nativas, clasificadas),
        "evaluadas": evaluadas,
        "vivas": vivas,
        "muertas": muertas,
        "supervivencia_pct": _tasa(vivas, evaluadas),
        "controles_pendientes": pendientes,
        "controles_vencidos": vencidos,
        "completaron_2_anios": completas,
        "por_hito": [{**g, "supervivencia_pct": _tasa(g["vivas"], g["conocidas"])} for g in por_hito.values()],
    }


def agrupar(siembras: list[dict], clave: str) -> dict[str, list[dict]]:
    grupos: dict[str, list[dict]] = defaultdict(list)
    for s in siembras:
        grupos[str(s[clave])].append(s)
    return grupos


def proximos(siembras: list[dict], controles: dict[str, list[dict]], hoy: date, limite: int = 30) -> list[dict]:
    """Controles por hacer (pendientes y vencidos), los más atrasados primero."""
    lista = []
    for s in siembras:
        sig = siguiente_control(s, controles.get(str(s["id"]), []), hoy)
        if sig and sig["estado"] in ("pendiente", "vencido"):
            lista.append({"siembra_id": str(s["id"]), "jornada_id": str(s["jornada_id"]), **sig})
    lista.sort(key=lambda x: x["fecha"])
    return lista[:limite]
