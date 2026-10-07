"""Calificación fitosanitaria (semáforo)."""

from collections.abc import Collection

from app.domain.enums import EstadoSanitario

# Regla provisional que usa el prototipo del frontend, mientras llegan los criterios
# oficiales. Si se cambia, se cambia también este identificador: queda guardado en
# cada observación para saber con qué regla se calificó.
REGLA_VIGENTE = "provisional-conteo"


def calificar(hallazgos: Collection[str]) -> EstadoSanitario:
    """Sin hallazgos: sano. De 1 a 3: en riesgo. 4 o más: crítico."""
    cantidad = len(set(hallazgos))
    if cantidad == 0:
        return EstadoSanitario.SANO
    if cantidad <= 3:
        return EstadoSanitario.EN_RIESGO
    return EstadoSanitario.CRITICO
