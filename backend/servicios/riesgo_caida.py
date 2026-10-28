"""Tamizaje visual del riesgo de caída de un árbol escolar.

Lo hacen estudiantes y docentes con una lista de señales que se ven a simple vista: es un
tamizaje, no un dictamen técnico. Sirve para decidir rápido qué hacer y a quién avisar. La poda
o tala de un árbol urbano necesita autorización de la autoridad ambiental, previa visita técnica
(Decreto 1076 de 2015, art. 2.2.1.1.9.3; en Valledupar, Corpocesar).

Inspirado en la evaluación básica de riesgo de árboles de la ISA (TRAQ): la categoría combina la
probabilidad de que el árbol o una de sus partes falle con qué tan seguido hay personas o bienes
debajo. La app usa las mismas reglas (frontend/src/features/riesgo/reglas.ts) para orientar
aunque no haya conexión: si cambian aquí, hay que cambiarlas allá.
"""
PROBABILIDADES = ("improbable", "posible", "probable", "inminente")
OCUPACIONES = ("rara", "ocasional", "frecuente", "constante")
CATEGORIAS = ("bajo", "medio", "alto", "inminente")
# Categorías que abren una alerta para que un docente la confirme y se avise a rectoría.
CATEGORIAS_CON_ALERTA = ("alto", "inminente")

# pregunta -> respuesta -> (probabilidad de falla que indica, motivo que se muestra)
SENALES: dict[str, dict[str, tuple[str, str]]] = {
    "inclinacion": {
        "leve": ("posible", "Inclinación leve"),
        "marcada": ("probable", "Inclinación marcada"),
        "reciente": ("inminente", "Se inclinó hace poco: suelo levantado o agrietado al pie"),
    },
    "raices": {
        "expuestas": ("posible", "Raíces expuestas"),
        "danadas": ("probable", "Raíces cortadas, rotas o podridas"),
    },
    "ramas_secas": {
        "pequenas": ("posible", "Ramas secas delgadas"),
        "grandes": ("probable", "Ramas secas gruesas"),
        "colgando": ("inminente", "Ramas rotas o colgando"),
    },
    "cavidades": {
        "pequena": ("posible", "Cavidad pequeña"),
        "grande": ("probable", "Cavidad o pudrición grande en el tronco o la base"),
    },
    "hongos": {
        "en_ramas": ("posible", "Hongos en ramas"),
        "en_tronco_o_base": ("probable", "Hongos en el tronco, la base o las raíces"),
    },
    "grietas": {
        "en_ramas": ("posible", "Grietas en ramas"),
        "en_tronco_o_union": ("probable", "Grietas en el tronco o en la unión de las ramas principales"),
        "abriendose": ("inminente", "Grieta que se abre o se mueve con el viento"),
    },
}

# Qué hay debajo o al alcance si cae -> (ocupación, cómo se nombra)
DEBAJO: dict[str, tuple[str, str]] = {
    "aulas": ("constante", "aulas o edificios"),
    "paso": ("constante", "pasillos, entradas o caminos"),
    "recreo": ("constante", "zona de recreo o de descanso"),
    "cancha": ("frecuente", "cancha o zona deportiva"),
    "parqueadero": ("frecuente", "parqueadero"),
    "via": ("frecuente", "vía o andén público"),
    "cables": ("frecuente", "cables eléctricos"),
    "poco_uso": ("ocasional", "zona verde con poco paso"),
    "cerrada": ("rara", "área cerrada, sin acceso"),
}

# Filas: probabilidad de falla. Columnas: ocupación (rara, ocasional, frecuente, constante).
MATRIZ: dict[str, tuple[str, str, str, str]] = {
    "improbable": ("bajo", "bajo", "bajo", "bajo"),
    "posible": ("bajo", "bajo", "medio", "medio"),
    "probable": ("bajo", "medio", "alto", "alto"),
    "inminente": ("medio", "alto", "inminente", "inminente"),
}

ACCIONES = {
    "inminente": "Aleja a las personas y acordona el área ahora. Avisa a rectoría y, si hay peligro inmediato, "
    "llama al 123. Pide la visita técnica urgente de la autoridad ambiental.",
    "alto": "Restringe el paso debajo del árbol, avisa a rectoría y pide la visita técnica de la autoridad "
    "ambiental en los próximos días. Programa la intervención.",
    "medio": "Programa una revisión de seguimiento en uno a tres meses y el mantenimiento que haga falta.",
    "bajo": "Seguimiento normal en la próxima ronda de inspección.",
}

# Un árbol pequeño hace menos daño si falla: la categoría baja un nivel.
PEQUENO_ALTURA_M = 3
PEQUENO_DAP_CM = 10


def evaluar_tamizaje(respuestas: dict, altura_m: float | None = None, dap_cm: float | None = None) -> dict:
    """respuestas: Tamizaje (schemas.py) como diccionario. Devuelve probabilidad, ocupación,
    categoría, motivos y la acción recomendada."""
    probabilidad = "improbable"
    motivos: list[str] = []
    for pregunta, opciones in SENALES.items():
        respuesta = respuestas.get(pregunta)
        if respuesta in opciones:
            nivel, motivo = opciones[respuesta]
            motivos.append(motivo)
            if PROBABILIDADES.index(nivel) > PROBABILIDADES.index(probabilidad):
                probabilidad = nivel

    debajo = [d for d in respuestas.get("debajo") or [] if d in DEBAJO]
    ocupacion = max((DEBAJO[d][0] for d in debajo), key=OCUPACIONES.index, default="ocasional")
    categoria = MATRIZ[probabilidad][OCUPACIONES.index(ocupacion)]
    if debajo:
        motivos.append("Debajo: " + ", ".join(DEBAJO[d][1] for d in debajo))

    pequeno = altura_m is not None and dap_cm is not None and altura_m <= PEQUENO_ALTURA_M and dap_cm <= PEQUENO_DAP_CM
    if pequeno and categoria != "bajo":
        categoria = CATEGORIAS[CATEGORIAS.index(categoria) - 1]
        motivos.append("Árbol pequeño: si falla, el daño posible es menor")

    return {
        "probabilidad": probabilidad,
        "ocupacion": ocupacion,
        "categoria": categoria,
        "motivos": motivos,
        "accion": ACCIONES[categoria],
    }


def mayor(a: str, b: str) -> str:
    """La categoría más grave de las dos."""
    return a if CATEGORIAS.index(a) >= CATEGORIAS.index(b) else b
