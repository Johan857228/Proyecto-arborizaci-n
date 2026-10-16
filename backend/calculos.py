"""Cálculos ambientales y de estado fitosanitario.

IMPORTANTE: son ESTIMACIONES. Las constantes de abajo se pueden cambiar en un solo
lugar. Confirma con tu docente cuáles fórmulas pide la asignación y, si te dan otras,
solo hay que modificar la función `biomasa_aerea_kg` y las constantes.

Cadena de cálculo:
    1. Biomasa aérea (kg)   ← ecuación alométrica pantropical (Chave et al., 2014)
    2. Biomasa raíz (kg)    ← biomasa aérea × FACTOR_RAIZ
    3. Biomasa total (kg)   ← aérea + raíz
    4. Carbono (kg)         ← biomasa total × FRACCION_CARBONO
    5. CO₂ equivalente (kg) ← carbono × 44/12
    6. O₂ (kg)              ← CO₂ × 32/44   (relación estequiométrica de la fotosíntesis)
"""
import math

# ----------------------------- Constantes ajustables -----------------------------
# Densidad de la madera (g/cm³) cuando no se conoce la de la especie.
DENSIDAD_POR_DEFECTO = 0.6

# Densidad por especie (g/cm³), clave = nombre común tal como está en la tabla `especies`.
# Se deja vacío a propósito: complétalo con la Global Wood Density Database si tu
# docente lo pide. Ejemplo:  "Samán": 0.55
DENSIDADES: dict[str, float] = {}

# Relación biomasa de raíces / biomasa aérea (valores típicos entre 0.2 y 0.3).
FACTOR_RAIZ = 0.24

# Fracción de carbono de la biomasa seca (0.5 es la más usada; IPCC propone 0.47).
FRACCION_CARBONO = 0.47

RAZON_CO2_CARBONO = 44 / 12   # masa molecular CO₂ / masa atómica C
RAZON_O2_CO2 = 32 / 44        # masa molecular O₂ / masa molecular CO₂

METODO = (
    "Biomasa aérea: AGB = 0.0673 × (ρ × DAP² × H)^0.976 (Chave et al., 2014; DAP en cm, "
    "H en m, ρ en g/cm³). Raíces = aérea × {raiz}. Carbono = biomasa × {c}. "
    "CO2 = C × 44/12. O2 = CO2 × 32/44."
).format(raiz=FACTOR_RAIZ, c=FRACCION_CARBONO)

ADVERTENCIA = "Estimación aproximada. Confirmar las fórmulas con el docente."


# ----------------------------------- Funciones -----------------------------------
def densidad_madera(nombre_comun: str | None, por_defecto: float | None = None) -> float:
    return DENSIDADES.get(nombre_comun or "", DENSIDAD_POR_DEFECTO if por_defecto is None else por_defecto)


def biomasa_aerea_kg(dap_cm: float, altura_m: float, densidad: float) -> float:
    """Ecuación pantropical de Chave et al. (2014)."""
    return 0.0673 * (densidad * dap_cm**2 * altura_m) ** 0.976


def calcular(
    dap_cm: float,
    altura_m: float,
    nombre_comun: str | None = None,
    *,
    densidad_defecto: float | None = None,
    factor_raiz: float | None = None,
    fraccion_carbono: float | None = None,
) -> dict:
    """Devuelve todas las magnitudes (kg) redondeadas a 2 decimales.

    Las tres constantes opcionales vienen de la versión del método de cálculo
    (tabla metodos_calculo); si no se envían se usan las de este archivo.
    """
    rho = densidad_madera(nombre_comun, densidad_defecto)
    aerea = biomasa_aerea_kg(dap_cm, altura_m, rho)
    raiz = aerea * (FACTOR_RAIZ if factor_raiz is None else factor_raiz)
    total = aerea + raiz
    carbono = total * (FRACCION_CARBONO if fraccion_carbono is None else fraccion_carbono)
    co2 = carbono * RAZON_CO2_CARBONO
    o2 = co2 * RAZON_O2_CO2
    return {
        "densidad_madera": rho,
        "biomasa_aerea_kg": round(aerea, 2),
        "biomasa_raiz_kg": round(raiz, 2),
        "biomasa_total_kg": round(total, 2),
        "carbono_kg": round(carbono, 2),
        "co2_kg": round(co2, 2),
        "o2_kg": round(o2, 2),
    }


def area_copa_m2(copa_m: float) -> float:
    """Área de la copa vista desde arriba, como un círculo de diámetro copa_m."""
    return round(math.pi * (copa_m / 2) ** 2, 2)


def estado_por_observaciones(n_observaciones: int) -> str:
    """Semáforo provisional (igual que la vista `arboles_resumen` en Supabase).

    0 observaciones = sano, 1 a 3 = riesgo, 4 o más = crítico.
    """
    if n_observaciones <= 0:
        return "sano"
    if n_observaciones <= 3:
        return "riesgo"
    return "critico"
