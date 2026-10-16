"""Método de cálculo: puntaje de riesgo, calificación (semáforo) y constantes ambientales.

Cada versión del método vive en la tabla `metodos_calculo` y no se modifica: cada
inspección guarda la versión con la que se calificó, así el historial se puede explicar.

    puntaje = suma de los pesos de los hallazgos marcados
              (peso propio del código en pesos_observacion, o el peso de su grupo)
            + peso_interferencia, si el árbol interfiere con alguna infraestructura

    calificación = crítico  si puntaje >= umbral_critico
                   riesgo   si puntaje >= umbral_riesgo
                   sano     en otro caso
"""
from dataclasses import dataclass, field

import calculos

GRUPOS = ("follaje", "tronco", "raiz", "plagas")
SIN_INTERFERENCIA = "Ninguna"


@dataclass(frozen=True)
class Metodo:
    id: str | None
    version: int
    nombre: str
    peso_follaje: float = 1.0
    peso_tronco: float = 1.0
    peso_raiz: float = 1.0
    peso_plagas: float = 1.0
    peso_interferencia: float = 0.0
    pesos_observacion: dict[str, float] = field(default_factory=dict)
    umbral_riesgo: float = 1.0
    umbral_critico: float = 4.0
    densidad_madera_defecto: float = calculos.DENSIDAD_POR_DEFECTO
    factor_raiz: float = calculos.FACTOR_RAIZ
    fraccion_carbono: float = calculos.FRACCION_CARBONO
    descripcion: str | None = None

    @classmethod
    def desde_fila(cls, fila: dict) -> "Metodo":
        def num(clave: str, defecto: float) -> float:
            valor = fila.get(clave)
            return defecto if valor is None else float(valor)

        pesos = fila.get("pesos_observacion") or {}
        return cls(
            id=str(fila["id"]) if fila.get("id") is not None else None,
            version=int(fila.get("version") or 0),
            nombre=fila.get("nombre") or "",
            descripcion=fila.get("descripcion"),
            peso_follaje=num("peso_follaje", 1.0),
            peso_tronco=num("peso_tronco", 1.0),
            peso_raiz=num("peso_raiz", 1.0),
            peso_plagas=num("peso_plagas", 1.0),
            peso_interferencia=num("peso_interferencia", 0.0),
            pesos_observacion={str(k): float(v) for k, v in pesos.items()},
            umbral_riesgo=num("umbral_riesgo", 1.0),
            umbral_critico=num("umbral_critico", 4.0),
            densidad_madera_defecto=num("densidad_madera_defecto", calculos.DENSIDAD_POR_DEFECTO),
            factor_raiz=num("factor_raiz", calculos.FACTOR_RAIZ),
            fraccion_carbono=num("fraccion_carbono", calculos.FRACCION_CARBONO),
        )

    def peso_grupo(self, grupo: str) -> float:
        return {
            "follaje": self.peso_follaje,
            "tronco": self.peso_tronco,
            "raiz": self.peso_raiz,
            "plagas": self.peso_plagas,
        }.get(grupo, 0.0)


# Equivale al semáforo provisional del prototipo (versión 1 de la migración 001).
METODO_PROVISIONAL = Metodo(id=None, version=0, nombre="Conteo de hallazgos")


def puntaje(metodo: Metodo, hallazgos: list[tuple[str, str]], interferencia: str) -> float:
    """hallazgos: lista de (código, grupo) marcados en la inspección."""
    total = 0.0
    for codigo, grupo in hallazgos:
        total += metodo.pesos_observacion.get(codigo, metodo.peso_grupo(grupo))
    if interferencia and interferencia != SIN_INTERFERENCIA:
        total += metodo.peso_interferencia
    return round(total, 2)


def calificacion(metodo: Metodo, valor: float) -> str:
    if valor >= metodo.umbral_critico:
        return "critico"
    if valor >= metodo.umbral_riesgo:
        return "riesgo"
    return "sano"


def evaluar(metodo: Metodo, hallazgos: list[tuple[str, str]], interferencia: str) -> tuple[float, str]:
    valor = puntaje(metodo, hallazgos, interferencia)
    return valor, calificacion(metodo, valor)


def calcular_ambientales(metodo: Metodo, dap_cm: float, altura_m: float, nombre_comun: str | None) -> dict:
    return calculos.calcular(
        dap_cm,
        altura_m,
        nombre_comun,
        densidad_defecto=metodo.densidad_madera_defecto,
        factor_raiz=metodo.factor_raiz,
        fraccion_carbono=metodo.fraccion_carbono,
    )


def descripcion_metodo(metodo: Metodo) -> str:
    return (
        f"Versión {metodo.version}: biomasa aérea AGB = 0.0673 × (ρ × DAP² × H)^0.976 (Chave et al., 2014), "
        f"ρ por defecto {metodo.densidad_madera_defecto} g/cm³; raíces = aérea × {metodo.factor_raiz}; "
        f"carbono = biomasa × {metodo.fraccion_carbono}; CO2 = C × 44/12; O2 = CO2 × 32/44."
    )
