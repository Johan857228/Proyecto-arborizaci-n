"""Código de los árboles: prefijo de la institución + consecutivo de 4 cifras (IE001-0001)."""


def codigo_arbol(prefijo: str, consecutivo: int) -> str:
    if consecutivo < 1:
        raise ValueError("El consecutivo empieza en 1.")
    return f"{prefijo}-{consecutivo:04d}"
