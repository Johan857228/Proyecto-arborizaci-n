"""Qué tan bien acierta la IA con la especie y cuánto cuesta cada foto.

La especie real de cada análisis es:
- en las pruebas, la que indicó el administrador al subir la foto de una especie conocida;
- en el campo, la especie del árbol que se guardó con esa sugerencia, solo cuando un docente ya
  confirmó la inspección de registro. Mientras está pendiente no cuenta (la persona pudo aceptar
  la sugerencia sin saber si era correcta) y si la anularon, tampoco.

Un análisis que no sugirió especie cuenta como fallo en el acierto general. Cada porcentaje va con
su intervalo de confianza del 95 % (Wilson), que con pocas fotos es ancho: por eso se avisa
cuando la muestra tiene menos de MUESTRA_MINIMA casos.
"""
from collections import Counter, defaultdict
from math import sqrt
from statistics import median

from servicios.fuentes_oficiales import bosque_seco_del_cesar

Z95 = 1.96
MUESTRA_MINIMA = 30
CONFIANZAS = ("alta", "media", "baja")


def wilson(aciertos: int, n: int, z: float = Z95) -> list[float] | None:
    """Intervalo de confianza del 95 % para una proporción, en porcentaje."""
    if n <= 0:
        return None
    p = aciertos / n
    base = 1 + z * z / n
    centro = (p + z * z / (2 * n)) / base
    margen = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / base
    return [round(max(0.0, centro - margen) * 100, 1), round(min(1.0, centro + margen) * 100, 1)]


def tasa(aciertos: int, n: int) -> dict:
    return {"n": n, "aciertos": aciertos, "pct": round(100 * aciertos / n, 1) if n else None, "ic95": wilson(aciertos, n)}


def _tasa_de(casos: list[dict]) -> dict:
    return tasa(sum(c["acierto"] for c in casos), len(casos))


def casos_evaluables(analisis: list[dict], especie_arbol: dict[str, int | None],
                     revision: dict[str, str]) -> tuple[list[dict], dict]:
    """Cada análisis con su especie real. Devuelve los casos y cuántos quedaron por fuera y por qué."""
    casos, fuera = [], Counter()
    for a in analisis:
        if a.get("tipo") == "prueba":
            real = a.get("especie_real_id")
        elif not a.get("arbol_id"):
            fuera["sin_arbol"] += 1
            continue
        else:
            estado = revision.get(str(a["arbol_id"]))
            if estado != "confirmada":
                fuera["anulados" if estado == "anulada" else "por_revisar"] += 1
                continue
            real = especie_arbol.get(str(a["arbol_id"]))
        if real is None:
            fuera["sin_especie"] += 1
            continue
        sugerida = a.get("especie_sugerida_id")
        casos.append({"tipo": a.get("tipo") or "campo", "real": int(real), "sugerida": sugerida,
                      "confianza": a.get("confianza"), "acierto": sugerida is not None and int(sugerida) == int(real)})
    return casos, {k: fuera.get(k, 0) for k in ("sin_arbol", "por_revisar", "anulados", "sin_especie")}


def costos(analisis: list[dict], trm: float | None = None) -> dict:
    """Costo total y por foto. Los análisis sin precio conocido (otro modelo) no entran en los promedios."""
    con_precio = [a for a in analisis if a.get("costo_usd") is not None]
    total = sum(float(a["costo_usd"]) for a in con_precio)
    fotos = sum(int(a.get("fotos") or 1) for a in con_precio)
    duraciones = [a["duracion_ms"] for a in analisis if a.get("duracion_ms") is not None]
    por_modelo: dict[str, dict] = defaultdict(lambda: {"analisis": 0, "total_usd": 0.0})
    for a in analisis:
        fila = por_modelo[a.get("modelo") or "desconocido"]
        fila["analisis"] += 1
        fila["total_usd"] += float(a.get("costo_usd") or 0)
    por_foto = total / fotos if fotos else None
    n = len(con_precio)
    return {
        "analisis": len(analisis),
        "fotos": sum(int(a.get("fotos") or 1) for a in analisis),
        "sin_precio": len(analisis) - n,
        "total_usd": round(total, 4),
        "por_analisis_usd": round(total / n, 5) if n else None,
        "por_foto_usd": round(por_foto, 5) if por_foto is not None else None,
        "trm": trm,
        "por_foto_cop": round(por_foto * trm) if por_foto is not None and trm else None,
        "total_cop": round(total * trm) if trm else None,
        "tokens_entrada_promedio": round(sum(a.get("tokens_entrada") or 0 for a in con_precio) / n) if n else None,
        "tokens_salida_promedio": round(sum(a.get("tokens_salida") or 0 for a in con_precio) / n) if n else None,
        "duracion_mediana_s": round(median(duraciones) / 1000, 1) if duraciones else None,
        "por_modelo": sorted(({"modelo": m, "analisis": v["analisis"], "total_usd": round(v["total_usd"], 4)}
                              for m, v in por_modelo.items()), key=lambda x: -x["analisis"]),
    }


def resumen(analisis: list[dict], especie_arbol: dict[str, int | None], revision: dict[str, str],
            especies: dict[int, dict], fichas: dict[int, dict], origenes: dict[int, str | None],
            trm: float | None = None) -> dict:
    """Precisión general, por confianza, por origen, del bosque seco del Cesar y por especie, más el costo."""
    casos, fuera = casos_evaluables(analisis, especie_arbol, revision)
    con_sugerencia = [c for c in casos if c["sugerida"] is not None]

    def nombre(especie_id) -> str:
        return (especies.get(int(especie_id)) or {}).get("nombre_comun") or f"Especie {especie_id}"

    del_bosque = [c for c in casos if bosque_seco_del_cesar(fichas.get(c["real"]))]
    por_especie = defaultdict(list)
    for c in casos:
        por_especie[c["real"]].append(c)
    confusiones = Counter((c["real"], c["sugerida"]) for c in con_sugerencia if not c["acierto"])

    return {
        "general": _tasa_de(casos),
        "muestra_pequena": len(casos) < MUESTRA_MINIMA,
        "muestra_minima": MUESTRA_MINIMA,
        "cobertura": tasa(len(con_sugerencia), len(casos)),
        "al_sugerir": _tasa_de(con_sugerencia),
        "por_tipo": {t: _tasa_de([c for c in casos if c["tipo"] == t]) for t in ("campo", "prueba")},
        "por_confianza": {k: _tasa_de([c for c in con_sugerencia if c["confianza"] == k]) for k in CONFIANZAS},
        "por_origen": {k: _tasa_de([c for c in casos if origenes.get(c["real"]) == k]) for k in ("nativa", "exotica")},
        "bosque_seco_cesar": {**_tasa_de(del_bosque), "especies": len({c["real"] for c in del_bosque})},
        "por_especie": sorted(
            ({"especie_id": e, "nombre_comun": nombre(e),
              "nombre_cientifico": (especies.get(e) or {}).get("nombre_cientifico"),
              "origen": origenes.get(e), "bosque_seco_cesar": bosque_seco_del_cesar(fichas.get(e)),
              **_tasa_de(lista)} for e, lista in por_especie.items()),
            key=lambda x: (-x["n"], x["nombre_comun"])),
        "confusiones": [{"real": nombre(r), "sugerida": nombre(s), "veces": v} for (r, s), v in confusiones.most_common(8)],
        "fuera": fuera,
        "costo": costos(analisis, trm),
    }
