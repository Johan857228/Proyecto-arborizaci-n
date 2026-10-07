"""Cálculos ambientales de cada observación.

Fórmulas de la planeación del backend (pendientes de validar con el equipo de A. Datos):
    DAP        = CAP / π
    Área copa  = π · (Dc / 2)²
    Biomasa    = 0,0673 · (ρ · D² · H)^0,976        Chave et al. (2014), pantropical
    Carbono    = Biomasa · 0,47                       IPCC (2006)
    CO₂        = Carbono · 44/12
    O₂         = CO₂ · 32/44

Unidades: D en cm, H en m, ρ (densidad de la madera) en g/cm³; resultados en kg y m².
"""

import math
from dataclasses import dataclass

VERSION_FORMULAS = "chave2014-ipcc2006-v1"

# Densidad provisional mientras el catálogo de especies no tenga la de cada una.
# Cuando se usa, el resultado queda marcado con densidad_estimada = True.
DENSIDAD_POR_DEFECTO = 0.6
FRACCION_CARBONO = 0.47
# La ecuación de Chave se ajustó con árboles de DAP >= 5 cm; por debajo no se aplica.
DAP_MINIMO_BIOMASA_CM = 5.0


def dap_desde_cap(cap_cm: float) -> float:
    return round(cap_cm / math.pi, 2)


def area_copa_m2(diametro_copa_m: float) -> float:
    return round(math.pi * (diametro_copa_m / 2) ** 2, 2)


def biomasa_aerea_kg(dap_cm: float, altura_m: float, densidad: float) -> float:
    return 0.0673 * (densidad * dap_cm**2 * altura_m) ** 0.976


def carbono_kg(biomasa: float) -> float:
    return biomasa * FRACCION_CARBONO


def co2_kg(carbono: float) -> float:
    return carbono * 44 / 12


def o2_kg(co2: float) -> float:
    return co2 * 32 / 44


@dataclass(frozen=True)
class ResultadoCalculos:
    dap_cm: float | None
    area_copa_m2: float
    biomasa_kg: float | None
    carbono_kg: float | None
    co2_kg: float | None
    o2_kg: float | None
    densidad_usada: float | None
    densidad_estimada: bool
    version: str = VERSION_FORMULAS


def calcular(
    *, dap_cm: float | None, cap_cm: float | None, altura_m: float, copa_m: float, densidad: float | None
) -> ResultadoCalculos:
    """Calcula todo lo que se pueda con los datos de una observación.

    Sin DAP (plántulas o árboles de menos de 1,30 m) o con DAP menor a 5 cm, la
    biomasa y lo que se deriva de ella quedan en None.
    """
    if dap_cm is None and cap_cm is not None:
        dap_cm = dap_desde_cap(cap_cm)
    area = area_copa_m2(copa_m)
    if dap_cm is None or dap_cm < DAP_MINIMO_BIOMASA_CM:
        return ResultadoCalculos(dap_cm, area, None, None, None, None, None, False)

    estimada = densidad is None
    densidad_usada = DENSIDAD_POR_DEFECTO if estimada else densidad
    biomasa = biomasa_aerea_kg(dap_cm, altura_m, densidad_usada)
    carbono = carbono_kg(biomasa)
    co2 = co2_kg(carbono)
    return ResultadoCalculos(
        dap_cm=dap_cm,
        area_copa_m2=area,
        biomasa_kg=round(biomasa, 2),
        carbono_kg=round(carbono, 2),
        co2_kg=round(co2, 2),
        o2_kg=round(o2_kg(co2), 2),
        densidad_usada=densidad_usada,
        densidad_estimada=estimada,
    )
