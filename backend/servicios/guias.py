"""Guías de clase con los árboles del propio colegio y su ficha de trabajo en PDF.

Las de Ciencias Naturales se apoyan cada una en un desempeño de los DBA de Ciencias Naturales
del MEN (versión 1); las de Matemáticas, en el pensamiento aleatorio de los Estándares Básicos de
Competencias en Matemáticas (MEN, 2006). La educación ambiental no es una asignatura aparte
(Ley 115, art. 14, parágrafo 1): por eso hay guías de varias áreas.

Están pensadas para que las guíe el docente: con el celular restringido en el aula basta el
teléfono del docente y la ficha impresa, que trae los datos reales del colegio. La ruta de campo
nunca incluye árboles con alerta de caída, riesgo alto o en estado crítico.
"""
import random
import statistics
from collections import Counter
from datetime import date

import calculos
from servicios.pdf import Documento, fecha_larga

AREAS = {"ciencias": "Ciencias Naturales", "matematicas": "Matemáticas"}
ETAPAS = ("Plántula", "Juvenil", "Adulto", "Senescente")
ESTADOS = {"sano": "Sano", "riesgo": "En riesgo", "critico": "Crítico"}
ORIGENES = {"nativa": "Nativa", "exotica": "Exótica"}
CELULAR = "Basta el celular del docente: muestra la app al grupo y los estudiantes trabajan con la ficha impresa."
SEGURIDAD = ("La ruta de la ficha no incluye árboles con alerta de caída, riesgo alto o en estado crítico. "
             "No trepar, no tocar hongos ni insectos y lavarse las manos al volver.")
TAM_MUESTRA = {"mediciones": 20, "carbono": 12}
RUTA = 8

GUIAS: tuple[dict, ...] = (
    {
        "id": "ciclo-de-vida",
        "titulo": "¿Cómo cambian los árboles a lo largo de su vida?",
        "area": "ciencias",
        "grados": [2],
        "referente": "DBA de Ciencias Naturales, grado 2.°, DBA 4: explica los cambios físicos que ocurren en el ciclo de vida de las plantas y los animales de su entorno; una de sus evidencias es representarlos con dibujos (germinación, floración, frutos).",
        "duracion_min": 55,
        "proposito": "Que los estudiantes reconozcan las etapas de vida de los árboles del colegio y relacionen cada etapa con cambios físicos visibles: tamaño, grosor del tronco, flores y frutos.",
        "materiales": ["Ficha impresa (una por grupo)", "Lápices de colores", "Una semilla o un fruto de un árbol del colegio, si hay", "El celular del docente con la app"],
        "momentos": [
            {"titulo": "Exploración (10 min)", "pasos": [
                "Muestre una semilla o un fruto y pregunte: ¿de dónde salió?, ¿qué pasa si la sembramos?",
                "Presente las cuatro etapas que usa la app: plántula, juvenil, adulto y senescente (árbol viejo).",
            ]},
            {"titulo": "Recorrido (20 min)", "pasos": [
                "Salgan en grupos a los árboles de la ruta de la ficha.",
                "En cada árbol comparen el grosor del tronco con su brazo, busquen flores, frutos u hojas nuevas y marquen la etapa que creen que tiene.",
                "El docente muestra en el celular la etapa registrada en la app para comparar.",
            ]},
            {"titulo": "Cierre (25 min)", "pasos": [
                "Cada grupo dibuja el ciclo de vida de un árbol del colegio: semilla, plántula, juvenil y adulto con flores y frutos.",
                "Socialicen con la tabla de la ficha: ¿en qué etapa está la mayoría de los árboles del colegio?",
            ]},
        ],
        "preguntas": [
            "¿Qué etapa tiene más árboles en nuestro colegio?",
            "¿Qué necesita una plántula para llegar a ser un árbol adulto?",
            "¿Viste flores o frutos? ¿En qué árbol?",
            "Dibuja el ciclo de vida de un árbol del colegio.",
        ],
        "evidencia": "Dibujo del ciclo de vida con al menos cuatro etapas y una frase sobre lo que cambia en cada una.",
        "datos": "etapas",
    },
    {
        "id": "factores-abioticos",
        "titulo": "Sol, agua y suelo: ¿por qué unos árboles están mejor que otros?",
        "area": "ciencias",
        "grados": [3],
        "referente": "DBA de Ciencias Naturales, grado 3.°, DBA 5: explica la influencia de los factores abióticos (luz, temperatura, suelo y aire) en el desarrollo de la flora y la fauna de un ecosistema propio de su región.",
        "duracion_min": 55,
        "proposito": "Relacionar el estado de los árboles del colegio con las condiciones de cada zona: sombra o sol pleno, piso duro o tierra, agua disponible.",
        "materiales": ["Ficha impresa", "Un vaso con agua por grupo", "Termómetro, si hay", "El celular del docente con la app"],
        "momentos": [
            {"titulo": "Pregunta inicial (10 min)", "pasos": [
                "Pregunte qué necesitan los árboles para vivir y anote las respuestas (luz, agua, aire, suelo).",
                "Explique que esas condiciones sin vida se llaman factores abióticos.",
            ]},
            {"titulo": "Observación por zonas (25 min)", "pasos": [
                "Repartan las zonas del colegio entre los grupos. En cada una anoten si hay sol todo el día, si el piso es de tierra, pasto o cemento, y si el agua de un vaso se absorbe o se encharca.",
                "Toquen el suelo al sol y a la sombra y comparen la temperatura (o mídanla con el termómetro).",
                "Observen las hojas de dos árboles de la zona: ¿verdes, amarillas, secas?",
            ]},
            {"titulo": "Análisis con los datos (20 min)", "pasos": [
                "Con la tabla de la ficha comparen cuántos árboles sanos, en riesgo y críticos hay en cada zona.",
                "Discutan si la zona con más árboles en riesgo tiene menos sombra, menos tierra o menos agua.",
            ]},
        ],
        "preguntas": [
            "¿Qué zona tiene más árboles sanos?",
            "¿Qué diferencia encontraste entre el suelo al sol y el suelo a la sombra?",
            "¿Qué factor abiótico crees que afecta más a los árboles de tu colegio? ¿Por qué?",
            "Propón una acción para mejorar la zona con más árboles en riesgo.",
        ],
        "evidencia": "Tabla de observación por zona completa y una explicación de qué factor abiótico influye en el estado de los árboles.",
        "datos": "zonas",
    },
    {
        "id": "arbol-ecosistema",
        "titulo": "Un árbol es un ecosistema: ¿cómo lo conservamos?",
        "area": "ciencias",
        "grados": [4],
        "referente": "DBA de Ciencias Naturales, grado 4.°, DBA 7: comprende que existen distintos tipos de ecosistemas y que sus características físicas permiten que habiten en ellos diferentes seres vivos; una de sus evidencias es plantear estrategias para su conservación.",
        "duracion_min": 55,
        "proposito": "Descubrir que la sombra, la humedad y el suelo bajo un árbol permiten que vivan allí otros seres (aves, insectos, plantas pequeñas), distinguir especies nativas y exóticas y proponer estrategias de conservación para el colegio.",
        "materiales": ["Ficha impresa", "Lupa, si hay", "El celular del docente con la app"],
        "momentos": [
            {"titulo": "Exploración (10 min)", "pasos": [
                "Pregunte quiénes viven en un árbol o lo usan y anote las ideas.",
                "Explique la diferencia entre una especie nativa (originaria de Colombia) y una exótica (traída de otro lugar) con la tabla de la ficha.",
            ]},
            {"titulo": "Observación (25 min)", "pasos": [
                "Cada grupo elige un árbol nativo y uno exótico de la ruta y observa cada uno cinco minutos, en silencio.",
                "Anotan los seres vivos que ven o sus rastros: nidos, aves, hormigas, telarañas, hojas mordidas, musgo. Solo mirar, sin tocar.",
            ]},
            {"titulo": "Conservación (20 min)", "pasos": [
                "Comparen en cuál árbol encontraron más vida.",
                "Cada grupo propone una estrategia de conservación para el colegio (sembrar nativas, no clavar avisos en los troncos, regar en sequía…) y la presenta.",
            ]},
        ],
        "preguntas": [
            "Según la tabla, ¿cuántas especies nativas y cuántas exóticas tiene el colegio?",
            "¿Qué seres vivos encontraste en los árboles que observaste?",
            "¿Por qué es importante sembrar especies nativas?",
            "Escribe una estrategia para conservar los árboles del colegio.",
        ],
        "evidencia": "Registro de los seres vivos observados en dos árboles y una estrategia de conservación argumentada.",
        "datos": "especies",
    },
    {
        "id": "clave-dicotomica",
        "titulo": "Clave dicotómica de los árboles del colegio",
        "area": "ciencias",
        "grados": [6],
        "referente": "DBA de Ciencias Naturales, grado 6.°, DBA 5: comprende la clasificación de los organismos en grupos taxonómicos; una de sus evidencias es clasificar organismos de su entorno con gráficos, tablas y claves taxonómicas simples.",
        "duracion_min": 55,
        "proposito": "Construir una clave dicotómica sencilla con las hojas de las especies más comunes del colegio y organizar la información en tablas y gráficos.",
        "materiales": ["Ficha impresa", "Hojas caídas de 4 o 5 especies del colegio (recogidas del suelo, sin arrancar)", "Regla", "El celular del docente con la app"],
        "momentos": [
            {"titulo": "Exploración (10 min)", "pasos": [
                "Muestre dos hojas de especies distintas y pida diferencias: forma, borde, tamaño, simple o compuesta.",
                "Explique qué es una clave dicotómica: preguntas de dos opciones que llevan al nombre de la especie.",
            ]},
            {"titulo": "Construcción (25 min)", "pasos": [
                "Cada grupo recoge del suelo hojas de las especies de la tabla.",
                "Separan las hojas con preguntas de dos opciones (¿simple o compuesta?, ¿borde liso o dentado?) hasta llegar a cada especie.",
                "Escriben la clave en la ficha y la prueban con las hojas de otro grupo.",
            ]},
            {"titulo": "Tablas y gráficos (20 min)", "pasos": [
                "Con la tabla de la ficha hagan una gráfica de barras del número de árboles de cada especie.",
                "Comparen nombre común y nombre científico: ¿por qué los científicos usan un nombre en latín?",
            ]},
        ],
        "preguntas": [
            "Escribe tu clave dicotómica con al menos tres preguntas.",
            "¿Qué característica de la hoja fue más útil para separar las especies?",
            "¿Cuál es la especie más común del colegio? ¿Es nativa o exótica?",
            "¿Para qué sirve el nombre científico?",
        ],
        "evidencia": "Clave dicotómica que otro grupo puede usar para identificar al menos cuatro especies y una gráfica de barras de las especies del colegio.",
        "datos": "especies",
    },
    {
        "id": "carbono",
        "titulo": "¿Cuánto carbono guardan nuestros árboles?",
        "area": "ciencias",
        "grados": [7],
        "referente": "DBA de Ciencias Naturales, grado 7.°, DBA 4: comprende la relación entre los ciclos del carbono, el nitrógeno y el agua; entre sus evidencias están explicar la fotosíntesis y predecir el efecto de la tala masiva de bosques en la atmósfera.",
        "duracion_min": 55,
        "proposito": "Relacionar la fotosíntesis con el carbono que se guarda en la madera, usar las estimaciones de CO2 de los árboles del colegio y predecir qué pasaría con ese carbono si se talaran.",
        "materiales": ["Ficha impresa", "Cinta métrica", "Calculadora", "El celular del docente con la app"],
        "momentos": [
            {"titulo": "Exploración (10 min)", "pasos": [
                "Pregunte de dónde sale la madera de un árbol. La mayor parte no sale del suelo: sale del CO2 del aire, por la fotosíntesis.",
                "Dibuje en el tablero el ciclo del carbono: fotosíntesis, respiración, descomposición y quema.",
            ]},
            {"titulo": "Medición (20 min)", "pasos": [
                "En grupos midan la circunferencia del tronco a 1,30 m del suelo de un árbol de la tabla y calculen el DAP: circunferencia ÷ 3,1416.",
                "Comparen su medida con el DAP de la ficha. ¿Por qué pueden ser distintas?",
            ]},
            {"titulo": "Análisis y predicción (25 min)", "pasos": [
                "Sumen el CO2 estimado de los árboles de la ficha y ubiquen el que más guarda.",
                "Discutan: si se talan los árboles más grandes y la madera se quema o se pudre, ¿a dónde va ese carbono?, ¿cuántos años tardaría una plántula en guardar lo mismo?",
            ]},
        ],
        "preguntas": [
            "Escribe con palabras la ecuación de la fotosíntesis.",
            "¿Qué árbol de la ficha guarda más CO2? ¿Por qué crees que es ese?",
            "¿Qué le pasa al carbono de un árbol cuando se tala y se quema?",
            "Predice qué pasaría en la atmósfera si se talaran los bosques de tu región.",
        ],
        "evidencia": "Suma del CO2 de la muestra y un párrafo que explique, con el ciclo del carbono, el efecto de la tala.",
        "datos": "carbono",
    },
    {
        "id": "talar-o-cuidar",
        "titulo": "Investigación: ¿talar o cuidar? Calentamiento global y los árboles del colegio",
        "area": "ciencias",
        "grados": [11],
        "referente": "DBA de Ciencias Naturales, grado 11.°, DBA 5: analiza cuestiones ambientales como el calentamiento global y la tala de bosques desde una visión sistémica; una de sus evidencias es diseñar investigaciones que promuevan el reconocimiento de las especies del entorno para evitar su tala.",
        "duracion_min": 60,
        "proposito": "Diseñar una investigación corta con datos reales del colegio para proponer alternativas a la tala de árboles en riesgo, con el carbono almacenado y la seguridad de la comunidad como criterios.",
        "materiales": ["Ficha impresa", "Calculadora", "El celular del docente con la app (inventario, alertas y mapa)"],
        "momentos": [
            {"titulo": "Planteamiento (15 min)", "pasos": [
                "Presente el caso: un árbol del colegio tiene riesgo de caída. ¿Siempre hay que talarlo?",
                "Repase la relación entre tala, emisiones de CO2 y calentamiento global, y que talar un árbol urbano requiere permiso de la autoridad ambiental y reposición.",
            ]},
            {"titulo": "Diseño de la investigación (25 min)", "pasos": [
                "En grupos formulen una pregunta (por ejemplo: ¿qué especies del colegio guardan más carbono por árbol?, ¿qué intervenciones evitarían talar los árboles en riesgo?).",
                "Definan qué datos usarán de la ficha y de la app, cómo los analizarán y qué esperan encontrar (hipótesis).",
            ]},
            {"titulo": "Análisis y propuesta (20 min)", "pasos": [
                "Analicen los datos y presenten una conclusión con evidencia.",
                "Redacten una propuesta para el PRAE: qué árbol cuidar, con qué intervención y qué especie nativa sembrar si hay reposición.",
            ]},
        ],
        "preguntas": [
            "Escribe la pregunta de investigación de tu grupo y tu hipótesis.",
            "¿Qué datos usaste y qué muestran?",
            "¿Qué se pierde, en carbono y en servicios ambientales, si se tala el árbol que más CO2 guarda?",
            "Propón una alternativa a la tala y justifícala.",
        ],
        "evidencia": "Diseño de investigación (pregunta, hipótesis, datos y análisis) y una propuesta argumentada para el PRAE.",
        "saber11": "Trabaja la indagación que evalúa la prueba Saber 11 de Ciencias Naturales: formular preguntas, escoger datos e interpretarlos.",
        "datos": "carbono",
    },
    {
        "id": "contar-arboles",
        "titulo": "Contamos los árboles: tablas y gráficas de barras",
        "area": "matematicas",
        "grados": [3, 4, 5],
        "referente": "Estándares Básicos de Competencias en Matemáticas (MEN, 2006), pensamiento aleatorio, grados 1.° a 5.°: recolectar y organizar datos en tablas, representarlos en gráficas de barras e identificar la moda.",
        "duracion_min": 55,
        "proposito": "Organizar los árboles del colegio por especie en una tabla de conteo, construir una gráfica de barras y leer cuál especie es la moda.",
        "materiales": ["Ficha impresa", "Regla y colores", "Hoja cuadriculada"],
        "momentos": [
            {"titulo": "Exploración (10 min)", "pasos": [
                "Pregunte qué árbol creen que hay más en el colegio y anote las apuestas.",
                "Muestre cómo se cuenta con palitos, de cinco en cinco.",
            ]},
            {"titulo": "Conteo en el patio (20 min)", "pasos": [
                "Cada grupo cuenta los árboles de una zona y anota la especie; el docente la confirma con la app.",
                "Al volver juntan los conteos y los comparan con la tabla de la ficha, que trae todos los árboles registrados.",
            ]},
            {"titulo": "Gráfica (25 min)", "pasos": [
                "Construyen una gráfica de barras con la tabla: una barra por especie, tan alta como su número de árboles.",
                "Leen la gráfica: ¿cuál es la moda?, ¿cuántos árboles más tiene la primera especie que la segunda?",
            ]},
        ],
        "preguntas": [
            "¿Cuál es la especie con más árboles (la moda)?",
            "¿Cuántos árboles hay en total?",
            "¿Cuántos árboles más hay de la primera especie que de la segunda?",
            "¿Acertaste tu apuesta inicial?",
        ],
        "evidencia": "Tabla de conteo y gráfica de barras rotulada (título, ejes y valores) con la moda señalada.",
        "datos": "conteo",
    },
    {
        "id": "medidas-dap",
        "titulo": "Medimos el DAP: frecuencias, media, mediana y moda",
        "area": "matematicas",
        "grados": [6, 7],
        "referente": "Estándares Básicos de Competencias en Matemáticas (MEN, 2006), pensamiento aleatorio, grados 6.° y 7.°: organizar datos en tablas de frecuencias y describirlos con la media, la mediana, la moda y el rango.",
        "duracion_min": 55,
        "proposito": "Medir el diámetro de algunos árboles, organizar el DAP de una muestra del colegio en una tabla de frecuencias y calcular la media, la mediana, la moda y el rango.",
        "materiales": ["Ficha impresa", "Cinta métrica (o una cuerda y un metro)", "Calculadora"],
        "momentos": [
            {"titulo": "Medición (20 min)", "pasos": [
                "Explique qué es el DAP: el diámetro del tronco a 1,30 m del suelo, a la altura del pecho de un adulto.",
                "En grupos midan la circunferencia de dos árboles de la tabla y calculen DAP = circunferencia ÷ 3,1416. Comparen con el valor registrado.",
            ]},
            {"titulo": "Organización (15 min)", "pasos": [
                "Ordenen de menor a mayor los valores de DAP de la ficha.",
                "Hagan una tabla de frecuencias con intervalos iguales (por ejemplo, de 10 en 10 cm).",
            ]},
            {"titulo": "Medidas (20 min)", "pasos": [
                "Calculen la media (suma ÷ cantidad), la mediana (el valor del centro), el intervalo modal (el de más árboles) y el rango (mayor - menor).",
                "Comparen con el laboratorio de datos de la app, que hace las mismas cuentas con todos los árboles del colegio.",
            ]},
        ],
        "preguntas": [
            "¿Cuál es la media del DAP de la muestra?",
            "¿Cuál es la mediana? ¿Se parece a la media? ¿Por qué podrían ser distintas?",
            "¿En qué intervalo está la moda?",
            "¿Cuál es el rango y qué nos dice de los árboles del colegio?",
        ],
        "evidencia": "Tabla de frecuencias y cálculo correcto de la media, la mediana, la moda y el rango del DAP de la muestra.",
        "datos": "mediciones",
        "laboratorio": {"variable": "dap_cm", "vista": "medidas"},
    },
    {
        "id": "histograma-dispersion",
        "titulo": "¿Los árboles más gruesos son más altos? Histogramas y dispersión",
        "area": "matematicas",
        "grados": [8, 9],
        "referente": "Estándares Básicos de Competencias en Matemáticas (MEN, 2006), pensamiento aleatorio, grados 8.° y 9.°: representar datos en histogramas y diagramas de dispersión e interpretar tendencias entre dos variables.",
        "duracion_min": 55,
        "proposito": "Construir un histograma de las alturas y un diagrama de dispersión DAP-altura con datos reales del colegio, y describir la relación entre las dos variables.",
        "materiales": ["Ficha impresa", "Hoja milimetrada", "Regla", "Escuadra de 45° y cinta métrica (opcional, para medir alturas)"],
        "momentos": [
            {"titulo": "Medición de altura (15 min, opcional)", "pasos": [
                "Método de los 45°: un estudiante se aleja del árbol hasta ver la punta de la copa por el borde de la escuadra, a la altura del ojo. La altura es la distancia al tronco más la altura de sus ojos.",
                "Comparen con la altura registrada en la app.",
            ]},
            {"titulo": "Histograma (20 min)", "pasos": [
                "Agrupen las alturas de la ficha en intervalos iguales y dibujen el histograma (barras pegadas).",
                "Describan la forma: ¿dónde se concentran los datos?, ¿hay valores muy alejados?",
            ]},
            {"titulo": "Dispersión (20 min)", "pasos": [
                "Ubiquen cada árbol como un punto: DAP en el eje horizontal y altura en el vertical.",
                "Tracen a ojo la línea que mejor sigue los puntos y describan la tendencia: ¿al aumentar el DAP aumenta la altura?",
            ]},
        ],
        "preguntas": [
            "¿En qué intervalo de altura hay más árboles?",
            "¿La relación entre DAP y altura es creciente, decreciente o no hay relación?",
            "¿Algún árbol se sale de la tendencia? ¿De qué especie es y por qué crees que pasa?",
            "Compara tu gráfica con la del laboratorio de datos de la app.",
        ],
        "evidencia": "Histograma y diagrama de dispersión rotulados, con una descripción escrita de la tendencia.",
        "datos": "mediciones",
        "laboratorio": {"variable": "altura_m", "vista": "dispersion"},
    },
    {
        "id": "regresion-altura",
        "titulo": "Estimar la altura con el DAP: correlación y regresión",
        "area": "matematicas",
        "grados": [10, 11],
        "referente": "Estándares Básicos de Competencias en Matemáticas (MEN, 2006), pensamiento aleatorio, grados 10.° y 11.°: usar medidas de dispersión como la desviación estándar y analizar la relación entre dos variables con correlación y modelos lineales.",
        "duracion_min": 60,
        "proposito": "Calcular la desviación estándar del DAP y de la altura, el coeficiente de correlación y la recta de regresión, y usar el modelo para estimar la altura de un árbol a partir de su DAP.",
        "materiales": ["Ficha impresa", "Calculadora científica u hoja de cálculo", "El celular del docente con el laboratorio de datos"],
        "momentos": [
            {"titulo": "Dispersión (15 min)", "pasos": [
                "Calculen la media y la desviación estándar del DAP y de la altura de la muestra. ¿Cuál varía más en proporción a su media?",
            ]},
            {"titulo": "Correlación y recta (25 min)", "pasos": [
                "Hagan el diagrama de dispersión y calculen el coeficiente de correlación r (con la calculadora o la hoja de cálculo).",
                "Obtengan la recta de regresión altura = a + b × DAP e interpreten la pendiente b: cuántos metros aumenta la altura por cada centímetro de DAP.",
            ]},
            {"titulo": "Uso del modelo (20 min)", "pasos": [
                "Midan el DAP de un árbol que no esté en la muestra, estimen su altura con la recta y compárenla con la registrada.",
                "Discutan los límites del modelo: especies distintas, árboles podados, valores fuera del rango de la muestra.",
            ]},
        ],
        "preguntas": [
            "¿Cuál es la desviación estándar del DAP? ¿Qué significa?",
            "¿Cuánto vale r? ¿La relación es fuerte, moderada o débil?",
            "Escribe la recta de regresión e interpreta la pendiente.",
            "Estima la altura de un árbol con DAP de 40 cm. ¿Qué tan confiable es esa estimación?",
        ],
        "evidencia": "Cálculos de dispersión, correlación y regresión con una interpretación escrita del modelo y de sus límites.",
        "saber11": "Usa la lectura e interpretación de datos y gráficas que también evalúa la prueba Saber 11 de Matemáticas.",
        "datos": "mediciones",
        "laboratorio": {"variable": "dap_cm", "vista": "dispersion"},
    },
)
POR_ID = {g["id"]: g for g in GUIAS}
DESCRIPCION_DATOS = {
    "etapas": "Árboles del colegio por etapa y una ruta de observación",
    "zonas": "Estado de los árboles por zona y una ruta de observación",
    "especies": "Especies del colegio con su origen y número de árboles",
    "conteo": "Número de árboles de cada especie",
    "carbono": "Muestra de árboles con su DAP, altura y CO2 estimado",
    "mediciones": "Muestra de árboles con su DAP, altura y copa",
}


def resumen(g: dict) -> dict:
    return {
        "id": g["id"], "titulo": g["titulo"], "area": g["area"], "grados": g["grados"], "referente": g["referente"],
        "duracion_min": g["duracion_min"], "datos": DESCRIPCION_DATOS[g["datos"]], "laboratorio": g.get("laboratorio"),
    }


def completa(g: dict) -> dict:
    return {**resumen(g), **{k: g.get(k) for k in ("proposito", "materiales", "momentos", "preguntas", "evidencia", "saber11")},
            "celular": CELULAR, "seguridad": SEGURIDAD}


# =================================== Estadística ===================================
def estadisticas(valores: list[float], poblacion: bool) -> dict | None:
    """Lo mismo que calcula el laboratorio de la app. Con todos los árboles la desviación es
    poblacional (÷ n); con una muestra, muestral (÷ n - 1)."""
    if not valores:
        return None
    desviacion = None
    if len(valores) > 1:
        desviacion = statistics.pstdev(valores) if poblacion else statistics.stdev(valores)
    return {
        "n": len(valores), "media": statistics.fmean(valores), "mediana": statistics.median(valores),
        "minimo": min(valores), "maximo": max(valores), "rango": max(valores) - min(valores), "desviacion": desviacion,
    }


def regresion(x: list[float], y: list[float]) -> dict | None:
    """Recta de mínimos cuadrados y = a + b·x y coeficiente de correlación de Pearson."""
    if len(x) < 3:
        return None
    mx, my = statistics.fmean(x), statistics.fmean(y)
    sxx = sum((v - mx) ** 2 for v in x)
    syy = sum((v - my) ** 2 for v in y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    if sxx == 0 or syy == 0:
        return None
    b = sxy / sxx
    return {"a": my - b * mx, "b": b, "r": sxy / (sxx * syy) ** 0.5}


# ===================================== Datos =====================================
def _num(valor: float | None, decimales: int = 1) -> str:
    if valor is None:
        return "—"
    texto = f"{valor:,.{decimales}f}"
    return texto.replace(",", "§").replace(".", ",").replace("§", ".")


def con_medidas(a: dict) -> bool:
    return bool(a.get("dap_cm")) and bool(a.get("altura_m"))


def seguro(a: dict, riesgos: dict[str, str], alertas: set[str]) -> bool:
    """Se puede llevar a los estudiantes: sin alerta de caída, sin riesgo alto y no crítico."""
    arbol_id = str(a["id"])
    return arbol_id not in alertas and riesgos.get(arbol_id) not in ("alto", "inminente") and a.get("estado") != "critico"


def muestra(arboles: list[dict], n: int, semilla: int) -> list[dict]:
    """Muestra aleatoria reproducible (la misma semilla da la misma muestra), ordenada por código."""
    elegidos = arboles if len(arboles) <= n else random.Random(semilla).sample(arboles, n)
    return sorted(elegidos, key=lambda a: str(a.get("codigo") or ""))


def _ruta(arboles: list[dict], riesgos, alertas, semilla: int) -> list[dict]:
    return muestra([a for a in arboles if seguro(a, riesgos, alertas)], RUTA, semilla)


def zona(a: dict) -> str:
    return a.get("zona_otra") if a.get("zona") == "Otra" and a.get("zona_otra") else (a.get("zona") or "Sin zona")


def tablas(guia: dict, arboles: list[dict], riesgos: dict[str, str], alertas: set[str],
           origenes: dict[str, str | None], semilla: int) -> tuple[list[dict], dict]:
    """Tablas de la ficha del estudiante y la clave para el docente (lo que no se imprime para
    los estudiantes). Cada tabla: titulo, encabezados, filas, anchos y nota opcional."""
    tipo = guia["datos"]
    resultado: list[dict] = []
    clave: dict = {}
    if tipo == "etapas":
        conteo = Counter(a.get("etapa") for a in arboles)
        resultado.append({"titulo": "Árboles del colegio por etapa", "encabezados": ["Etapa", "Árboles"],
                          "filas": [[e, _num(conteo.get(e, 0), 0)] for e in ETAPAS], "anchos": [0.6, 0.4]})
    elif tipo == "zonas":
        por_zona: dict[str, Counter] = {}
        for a in arboles:
            por_zona.setdefault(zona(a), Counter())[a.get("estado")] += 1
        filas = [[z, *(_num(c.get(e, 0), 0) for e in ESTADOS), _num(sum(c.values()), 0)] for z, c in sorted(por_zona.items())]
        resultado.append({"titulo": "Estado de los árboles por zona", "encabezados": ["Zona", "Sanos", "En riesgo", "Críticos", "Total"],
                          "filas": filas, "anchos": [0.36, 0.16, 0.16, 0.16, 0.16]})
    elif tipo in ("especies", "conteo"):
        conteo = Counter((a.get("nombre_comun") or "Sin especie", a.get("nombre_cientifico"), a.get("especie_id")) for a in arboles)
        orden = conteo.most_common()
        if tipo == "especies":
            filas = [[comun, cientifico or "—", ORIGENES.get(origenes.get(str(eid)) or "", "Sin clasificar"), _num(n, 0)]
                     for (comun, cientifico, eid), n in orden[:15]]
            resultado.append({"titulo": "Especies del colegio", "encabezados": ["Especie", "Nombre científico", "Origen", "Árboles"],
                              "filas": filas, "anchos": [0.3, 0.36, 0.18, 0.16],
                              "nota": f"{len(orden)} especies en total." if len(orden) > 15 else None})
        else:
            filas = [[comun, ""] for (comun, _c, _e), _n in orden[:8]]
            resto = sum(n for _k, n in orden[8:])
            if resto:
                filas.append([f"Otras {len(orden) - 8} especies", ""])
            resultado.append({"titulo": "Especies del colegio: escribe cuántos árboles contaron", "encabezados": ["Especie", "Árboles"],
                              "filas": filas, "anchos": [0.6, 0.4]})
            clave = {"conteo": [[comun, _num(n, 0)] for (comun, _c, _e), n in orden[:8]] + ([[f"Otras {len(orden) - 8} especies", _num(resto, 0)]] if resto else []),
                     "total": len(arboles), "moda": orden[0][0][0] if orden else None}
    elif tipo == "carbono":
        candidatos = [a for a in arboles if con_medidas(a) and seguro(a, riesgos, alertas)]
        elegidos = muestra(candidatos, TAM_MUESTRA["carbono"], semilla)
        co2 = {str(a["id"]): calculos.calcular(float(a["dap_cm"]), float(a["altura_m"]), a.get("nombre_comun"))["co2_kg"] for a in elegidos}
        resultado.append({
            "titulo": "Muestra de árboles del colegio", "encabezados": ["Código", "Especie", "DAP (cm)", "Altura (m)", "CO2 estimado (kg)"],
            "filas": [[a.get("codigo") or "—", a.get("nombre_comun") or "—", _num(a["dap_cm"]), _num(a["altura_m"]), _num(co2[str(a["id"])], 0)] for a in elegidos],
            "anchos": [0.16, 0.3, 0.16, 0.16, 0.22],
            "nota": "El CO2 es una estimación con fórmulas generales (Chave et al., 2014), no una medición exacta.",
        })
        total = sum(calculos.calcular(float(a["dap_cm"]), float(a["altura_m"]), a.get("nombre_comun"))["co2_kg"] for a in arboles if con_medidas(a))
        mayor = max(elegidos, key=lambda a: co2[str(a["id"])], default=None)
        clave = {"suma_muestra": sum(co2.values()), "co2_colegio": total, "arboles_colegio": len(arboles),
                 "mayor": f"{mayor.get('codigo')} ({mayor.get('nombre_comun')})" if mayor else None}
    elif tipo == "mediciones":
        candidatos = [a for a in arboles if con_medidas(a)]
        elegidos = muestra(candidatos, TAM_MUESTRA["mediciones"], semilla)
        resultado.append({
            "titulo": f"Muestra de {len(elegidos)} árboles del colegio", "encabezados": ["Código", "Especie", "DAP (cm)", "Altura (m)", "Copa (m)"],
            "filas": [[a.get("codigo") or "—", a.get("nombre_comun") or "—", _num(a["dap_cm"]), _num(a["altura_m"]), _num(a.get("copa_m"))] for a in elegidos],
            "anchos": [0.17, 0.35, 0.16, 0.16, 0.16],
        })
        poblacion = len(elegidos) == len(candidatos)
        x = [float(a["dap_cm"]) for a in elegidos]
        y = [float(a["altura_m"]) for a in elegidos]
        clave = {"poblacion": poblacion, "dap": estadisticas(x, poblacion), "altura": estadisticas(y, poblacion), "regresion": regresion(x, y)}
    if tipo in ("etapas", "zonas", "especies"):
        ruta = _ruta(arboles, riesgos, alertas, semilla)
        if tipo == "etapas":
            filas = [[a.get("codigo") or "—", a.get("nombre_comun") or "—", zona(a), "", a.get("etapa") or "—"] for a in ruta]
            encabezados, anchos = ["Código", "Especie", "Zona", "Etapa que crees", "Etapa en la app"], [0.15, 0.27, 0.22, 0.18, 0.18]
        else:
            filas = [[a.get("codigo") or "—", a.get("nombre_comun") or "—", zona(a), ORIGENES.get(origenes.get(str(a.get("especie_id"))) or "", "—")] for a in ruta]
            encabezados, anchos = ["Código", "Especie", "Zona", "Origen"], [0.18, 0.34, 0.28, 0.2]
        resultado.append({"titulo": "Ruta de observación", "encabezados": encabezados, "filas": filas, "anchos": anchos,
                          "nota": "Árboles elegidos al azar entre los que no tienen alerta de caída, riesgo alto ni estado crítico."})
    return resultado, clave


# ===================================== Ficha PDF =====================================
def _grados(grados: list[int]) -> str:
    textos = [f"{g}.°" for g in grados]
    return f"Grado {textos[0]}" if len(textos) == 1 else f"Grados {', '.join(textos[:-1])} y {textos[-1]}"


def _unir(items: list[str]) -> str:
    """['Ficha impresa', 'El celular'] -> 'Ficha impresa, el celular.' (respeta siglas como DAP)."""
    partes = [i if n == 0 or i[1:2].isupper() else i[:1].lower() + i[1:] for n, i in enumerate(items)]
    return ", ".join(partes) + "."


def _clave_pdf(doc: Documento, guia: dict, clave: dict):
    tipo = guia["datos"]
    if tipo == "mediciones":
        tipo_desv = "poblacional, ÷ n" if clave["poblacion"] else "muestral, ÷ (n - 1)"
        filas = []
        for nombre, unidad, e in (("DAP", "cm", clave["dap"]), ("Altura", "m", clave["altura"])):
            if e:
                filas.append([f"{nombre} ({unidad})", _num(e["media"]), _num(e["mediana"]), _num(e["minimo"]), _num(e["maximo"]),
                              _num(e["rango"]), _num(e["desviacion"], 2)])
        doc.tabla(["Variable", "Media", "Mediana", "Mínimo", "Máximo", "Rango", "Desv. est."], filas,
                  [0.2, 0.13, 0.14, 0.13, 0.13, 0.12, 0.15])
        doc.parrafo(f"Desviación estándar {tipo_desv}. La moda depende de los intervalos que escoja el grupo.", tamano=9)
        r = clave.get("regresion")
        if r:
            doc.parrafo(f"Recta de regresión: altura = {_num(r['a'], 2)} + {_num(r['b'], 3)} × DAP. "
                        f"Coeficiente de correlación r = {_num(r['r'], 2)}; con DAP de 40 cm la recta estima "
                        f"{_num(r['a'] + r['b'] * 40, 1)} m.")
    elif tipo == "conteo":
        doc.tabla(["Especie", "Árboles"], clave["conteo"], [0.6, 0.4])
        doc.parrafo(f"Total: {_num(clave['total'], 0)} árboles. Moda: {clave['moda'] or '—'}.")
    elif tipo == "carbono":
        doc.parrafo(f"Suma del CO2 estimado de la muestra: {_num(clave['suma_muestra'], 0)} kg. "
                    f"El árbol de la muestra que más guarda: {clave['mayor'] or '—'}.")
        doc.parrafo(f"Todo el colegio ({_num(clave['arboles_colegio'], 0)} árboles): {_num(clave['co2_colegio'], 0)} kg de CO2 "
                    "estimados, equivalentes a "
                    f"{_num(clave['co2_colegio'] / 1000, 1)} toneladas.")


def ficha_pdf(guia: dict, institucion: str, curso: str | None, tablas_: list[dict], clave: dict,
              generado: date, semilla: int) -> bytes:
    """Ficha en tres partes: guía del docente, ficha del estudiante (página aparte, para
    imprimir varias copias) y, si aplica, la clave de respuestas en su propia página."""
    doc = Documento(f"Arbolado Escolar · Ficha de trabajo · {_grados(guia['grados'])} · Muestra n.° {semilla}")
    doc.portada(guia["titulo"], f"{institucion} · {AREAS[guia['area']]} · {_grados(guia['grados'])}"
                + (f" · Curso {curso}" if curso else "") + f" · {fecha_larga(generado)}")
    doc.seccion("Para el docente")
    doc.campo("Referente", guia["referente"])
    doc.campo("Propósito", guia["proposito"])
    doc.campo(f"Duración y materiales ({guia['duracion_min']} minutos)", _unir(guia["materiales"]))
    doc.campo("Celular y seguridad", f"{CELULAR} {SEGURIDAD}")
    for momento in guia["momentos"]:
        doc.etiqueta(momento["titulo"])
        doc.lista(momento["pasos"])
    doc.campo("Evidencia de aprendizaje", guia["evidencia"])
    if guia.get("saber11"):
        doc.campo("Saber 11", guia["saber11"])

    doc.nueva_pagina()
    doc.seccion("Ficha del estudiante")
    doc.parrafo(guia["titulo"], tamano=12, negrita=True)
    doc.parrafo("Nombre: ______________________________   Curso: ________   Fecha: ______________")
    for t in tablas_:
        doc.etiqueta(t["titulo"])
        if t["filas"]:
            doc.tabla(t["encabezados"], t["filas"], t["anchos"])
        else:
            doc.parrafo("Aún no hay árboles registrados con estos datos.", color=(0.353, 0.384, 0.345))
        if t.get("nota"):
            doc.parrafo(t["nota"], tamano=8.5, color=(0.353, 0.384, 0.345))
    doc.seccion("Preguntas")
    for i, pregunta in enumerate(guia["preguntas"], start=1):
        doc.parrafo(f"{i}. {pregunta}", negrita=True)
        doc.renglones(3)

    if clave:
        doc.nueva_pagina()
        doc.seccion("Clave para el docente (no imprimir para los estudiantes)")
        _clave_pdf(doc, guia, clave)
    return doc.pdf(f"Ficha · {guia['titulo']}")
