"""Informe de Power BI del arbolado: modelo de datos y páginas de la plantilla que se descarga.

Las cifras salen de los mismos cálculos de Reportes (servicios/indicadores.py), así que el total
de árboles, el estado, el CO2 y la cobertura coinciden con lo que muestra la app:

- El estado de cada árbol es el de su última inspección no anulada.
- Biomasa, carbono y CO2 usan el método de cálculo de esa inspección.
- Cobertura = árboles con alguna inspección no anulada en el periodo ÷ total de árboles.

Sin datos personales, igual que la exportación abierta: ni nombres de estudiantes o docentes, ni
notas de texto libre. Las inspecciones solo dicen de qué curso era quien las hizo.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import calculos
from comun import ZONA_HORARIA, a_fecha, fecha_local
from servicios import indicadores
from servicios.calificacion import calcular_ambientales
from servicios.mapa import EXOTICA, NATIVA, origen_de
from servicios.powerbi import Columna, Informe, Medida, Relacion, Tabla, plantilla

ESTADO = {"sano": ("Sano", 1), "riesgo": ("En riesgo", 2), "critico": ("Crítico", 3)}
COLOR_ESTADO = {"Sano": "#1BAF7A", "En riesgo": "#EDA100", "Crítico": "#D7263D"}
REVISION = {"pendiente": "Pendiente", "confirmada": "Confirmada", "anulada": "Anulada"}
COLOR_REVISION = {"Confirmada": "#166534", "Pendiente": "#F59E0B", "Anulada": "#9CA39A"}
VISITA = {"registro": "Registro", "seguimiento": "Seguimiento"}
ESTADO_INTERVENCION = {"programada": "Programada", "ejecutada": "Ejecutada", "cancelada": "Cancelada"}
COLOR_INTERVENCION = {"Ejecutada": "#166534", "Programada": "#0369A1", "Cancelada": "#9CA39A"}
RESULTADO = {"exitosa": "Exitosa", "parcial": "Parcial", "sin_efecto": "Sin efecto"}
COLOR_RESULTADO = {"Exitosa": "#1BAF7A", "Parcial": "#EDA100", "Sin efecto": "#D7263D"}
ORIGEN = {NATIVA: "Nativa", EXOTICA: "Exótica"}
ETAPAS = {"Plántula": 1, "Juvenil": 2, "Adulto": 3, "Senescente": 4}
CLASES_DAP = [(10, "Menos de 10 cm"), (20, "10 a 20 cm"), (30, "20 a 30 cm"), (45, "30 a 45 cm"), (60, "45 a 60 cm")]
CLASE_DAP_MAYOR = "60 cm o más"
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

TINTA, GRIS = "#13261C", "#5A6258"
TEMA = {
    "name": "ArboladoEscolar",
    "dataColors": ["#166534", "#0369A1", "#F59E0B", "#B4532A", "#6B8E23", "#0F8C8C", "#8E5BB5", "#C2475B",
                   "#5A6258", "#B4DA55", "#1BAF7A", "#7C2D12"],
    "foreground": TINTA,
    "foregroundNeutralSecondary": GRIS,
    "foregroundNeutralTertiary": "#9CA39A",
    "background": "#FFFFFF",
    "backgroundLight": "#F6F4EC",
    "backgroundNeutral": "#E8E4D8",
    "tableAccent": "#166534",
    "good": "#1BAF7A",
    "neutral": "#EDA100",
    "bad": "#D7263D",
    "maximum": "#166534",
    "center": "#B4DA55",
    "minimum": "#E5F1E4",
    "textClasses": {
        "callout": {"fontSize": 26, "fontFace": "Segoe UI Semibold", "color": "#166534"},
        "title": {"fontSize": 12, "fontFace": "Segoe UI Semibold", "color": TINTA},
        "header": {"fontSize": 12, "fontFace": "Segoe UI Semibold", "color": TINTA},
        "label": {"fontSize": 10, "fontFace": "Segoe UI", "color": TINTA},
    },
    "visualStyles": {
        "page": {"*": {"background": [{"color": {"solid": {"color": "#F6F4EC"}}, "transparency": 0}]}},
        "*": {"*": {
            "background": [{"show": True, "color": {"solid": {"color": "#FFFFFF"}}, "transparency": 0}],
            "border": [{"show": True, "color": {"solid": {"color": "#E8E4D8"}}, "radius": 8}],
        }},
        "textbox": {"*": {"background": [{"show": False}], "border": [{"show": False}]}},
    },
}

TITULO = {"fontSize": "18pt", "fontFamily": "Segoe UI Semibold", "color": TINTA}
SUBTITULO = {"fontSize": "10pt", "color": GRIS}
PARRAFO = {"fontSize": "11pt", "color": TINTA}
APARTADO = {"fontSize": "12pt", "fontFamily": "Segoe UI Semibold", "color": "#166534"}


@dataclass
class Fuente:
    """Todo lo que entra a la plantilla, ya leído de la base."""

    datos: indicadores.Datos
    instituciones: dict[str, dict]          # id → nombre, nombre_corto, codigo_dane, municipio
    origenes: dict[str, str | None]         # especie_id → origen guardado por el administrador
    tipos_intervencion: dict[str, dict]     # código → fila con su nombre
    dias_revisita: dict[str, int]           # institución → días para volver a inspeccionar
    alcance: str                            # nombre de la institución o "Todas las instituciones"
    generado: datetime
    institucion_id: str | None = None       # la elegida; None = todas


def _si(valor: bool) -> str:
    return "Sí" if valor else "No"


def _num(valor) -> float | None:
    return None if valor is None else float(valor)


def _entero(valor) -> int | None:
    """Severidades de 0 a 4. Lo que no sea un entero (datos viejos con sí/no) queda vacío para que
    una sola inspección rara no impida descargar la plantilla."""
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    return None


def _clase_dap(dap: float | None) -> tuple[str | None, int | None]:
    if dap is None:
        return None, None
    for orden, (limite, etiqueta) in enumerate(CLASES_DAP, start=1):
        if dap < limite:
            return etiqueta, orden
    return CLASE_DAP_MAYOR, len(CLASES_DAP) + 1


def _primera_mayuscula(texto: str | None) -> str | None:
    return texto[:1].upper() + texto[1:] if texto else texto


# ==================================== Tablas ====================================
def _arboles(f: Fuente) -> Tabla:
    datos, hoy = f.datos, f.generado.date()
    estados = indicadores.estados_al_corte(datos, f.generado)
    filas = []
    for a in sorted(datos.arboles, key=lambda a: str(a.get("codigo") or "")):
        e = estados.get(a["id"]) or indicadores.EstadoArbol(a, None)
        dap, altura, copa = _num(e.valor("dap_cm")), _num(e.valor("altura_m")), _num(e.valor("copa_m"))
        ambientales = (
            calcular_ambientales(datos.metodo_de(e.inspeccion), dap, altura, a.get("nombre_comun"))
            if dap is not None and altura is not None else {}
        )
        estado, orden_estado = ESTADO.get(e.estado, (e.estado, 9))
        interferencia = e.valor("interferencia")
        etapa = e.valor("etapa")
        clase, orden_clase = _clase_dap(dap)
        ultima = fecha_local(e.inspeccion["fecha"]) if e.inspeccion else None
        dias = f.dias_revisita.get(str(a.get("institucion_id")), 180)
        pendiente = e.inspeccion is None or e.inspeccion["_fecha"] < f.generado - timedelta(days=dias)
        origen = origen_de(a.get("nombre_cientifico"), f.origenes.get(str(a.get("especie_id"))))
        filas.append([
            str(a["id"]), str(a.get("institucion_id") or ""), a.get("codigo"), a.get("zona"),
            a.get("nombre_comun"), a.get("nombre_cientifico"), ORIGEN.get(origen, "Sin dato"),
            etapa, ETAPAS.get(etapa, 9) if etapa else None, interferencia, estado, orden_estado,
            _num(e.inspeccion["puntaje_riesgo"]) if e.inspeccion and e.inspeccion.get("puntaje_riesgo") is not None else None,
            dap, altura, copa, clase, orden_clase,
            calculos.area_copa_m2(copa) if copa is not None else None,
            ambientales.get("biomasa_total_kg"), ambientales.get("carbono_kg"), ambientales.get("co2_kg"),
            _num(a.get("lat")), _num(a.get("lng")),
            len(datos.inspecciones_de(a["id"])), ultima, (hoy - ultima).days if ultima else None,
            REVISION.get(a.get("ultima_revision"), a.get("ultima_revision")), _si(pendiente),
            _si(e.estado == "critico" or bool(interferencia and interferencia != "Ninguna")),
            fecha_local(a.get("registrado_en")),
        ])
    columnas = [
        Columna("arbol_id", oculta=True),
        Columna("institucion_id", oculta=True),
        Columna("Código", descripcion="Código único del árbol en su institución"),
        Columna("Zona"),
        Columna("Especie", descripcion="Nombre común"),
        Columna("Nombre científico"),
        Columna("Origen", descripcion="Nativa o exótica en Colombia; Sin dato si la especie no está clasificada"),
        Columna("Etapa", ordenar_por="Etapa orden"),
        Columna("Etapa orden", "entero", oculta=True),
        Columna("Interferencia", descripcion="Interferencia con infraestructura según la última inspección válida"),
        Columna("Estado", ordenar_por="Estado orden", descripcion="Según la última inspección que no fue anulada"),
        Columna("Estado orden", "entero", oculta=True),
        Columna("Puntaje de riesgo", "decimal", "#,0.00", resumir="average"),
        Columna("DAP (cm)", "decimal", "#,0.0", resumir="average", descripcion="Diámetro del tronco a la altura del pecho"),
        Columna("Altura (m)", "decimal", "#,0.0", resumir="average"),
        Columna("Copa (m)", "decimal", "#,0.0", resumir="average", descripcion="Diámetro de la copa"),
        Columna("Clase de DAP", ordenar_por="Clase de DAP orden"),
        Columna("Clase de DAP orden", "entero", oculta=True),
        Columna("Área de copa (m2)", "decimal", "#,0.0", resumir="sum"),
        Columna("Biomasa (kg)", "decimal", "#,0.0", resumir="sum", descripcion="Biomasa aérea y de raíces estimada"),
        Columna("Carbono (kg)", "decimal", "#,0.0", resumir="sum"),
        Columna("CO2 almacenado (kg)", "decimal", "#,0.0", resumir="sum",
                descripcion="CO2 equivalente al carbono guardado en la madera; no es captura anual"),
        Columna("Latitud", "decimal", "0.0000000", categoria="Latitude"),
        Columna("Longitud", "decimal", "0.0000000", categoria="Longitude"),
        Columna("N.º de inspecciones", "entero", resumir="sum"),
        Columna("Última inspección válida", "fecha"),
        Columna("Días desde la última inspección", "entero", resumir="average"),
        Columna("Última revisión", descripcion="Revisión docente de la última inspección"),
        Columna("Revisita pendiente", descripcion="Sí si pasó la ventana de revisita de la institución sin una inspección válida"),
        Columna("Prioritario", descripcion="Sí si está crítico o interfiere con infraestructura"),
        Columna("Fecha de registro", "fecha"),
    ]

    def contar(condicion: str) -> str:
        return f"CALCULATE(COUNTROWS('Árboles'), {condicion}) + 0"

    medidas = [
        Medida("Total de árboles", "COUNTROWS('Árboles')", "#,0"),
        Medida("Árboles sanos", contar("'Árboles'[Estado] = \"Sano\""), "#,0"),
        Medida("Árboles en riesgo", contar("'Árboles'[Estado] = \"En riesgo\""), "#,0"),
        Medida("Árboles críticos", contar("'Árboles'[Estado] = \"Crítico\""), "#,0"),
        Medida("% en riesgo o crítico", "DIVIDE([Árboles en riesgo] + [Árboles críticos], [Total de árboles])", "0.0%"),
        Medida("Árboles prioritarios", contar("'Árboles'[Prioritario] = \"Sí\""), "#,0",
               "Críticos o con interferencia con infraestructura"),
        Medida("Sin inspección reciente", contar("'Árboles'[Revisita pendiente] = \"Sí\""), "#,0",
               "Árboles sin una inspección válida dentro de la ventana de revisita"),
        Medida("Especies", "DISTINCTCOUNT('Árboles'[Especie])", "#,0"),
        Medida("% de nativas",
               "DIVIDE(CALCULATE(COUNTROWS('Árboles'), 'Árboles'[Origen] = \"Nativa\"), "
               "CALCULATE(COUNTROWS('Árboles'), 'Árboles'[Origen] <> \"Sin dato\"))",
               "0.0%", "Entre los árboles de especies clasificadas como nativas o exóticas"),
        Medida("CO2 almacenado (t)", "DIVIDE(SUM('Árboles'[CO2 almacenado (kg)]), 1000)", "#,0.00",
               "Estimación del CO2 guardado en la madera; no es captura anual"),
        Medida("Biomasa (t)", "DIVIDE(SUM('Árboles'[Biomasa (kg)]), 1000)", "#,0.00"),
        Medida("Área de copa total (m2)", "SUM('Árboles'[Área de copa (m2)])", "#,0"),
        Medida("DAP promedio (cm)", "AVERAGE('Árboles'[DAP (cm)])", "#,0.0"),
        Medida("Altura promedio (m)", "AVERAGE('Árboles'[Altura (m)])", "#,0.0"),
        Medida("Copa promedio (m)", "AVERAGE('Árboles'[Copa (m)])", "#,0.0"),
        Medida("Puntaje de riesgo promedio", "AVERAGE('Árboles'[Puntaje de riesgo])", "#,0.00"),
    ]
    return Tabla("Árboles", columnas, filas, medidas, "Un árbol por fila, con su estado actual")


def _curso(datos: indicadores.Datos, inspector_id: str | None) -> str:
    curso_id = datos.perfiles.get(inspector_id or "", {}).get("curso_id")
    curso = datos.cursos.get(curso_id) if curso_id else None
    return curso["nombre"] if curso else "Sin curso"


def _inspecciones(f: Fuente) -> Tabla:
    datos = f.datos
    filas = []
    for i in sorted(datos.inspecciones, key=lambda i: (i["_fecha"], str(i["id"]))):
        calificacion, orden = ESTADO.get(i.get("calificacion"), (i.get("calificacion"), 9))
        revisado = i.get("revisado_en")
        horas = None
        if revisado and i.get("estado_revision") != "pendiente":
            horas = round((datetime.fromisoformat(str(revisado).replace("Z", "+00:00")) - i["_fecha"]).total_seconds() / 3600, 1)
        filas.append([
            str(i["id"]), str(i["arbol_id"]), fecha_local(i["fecha"]), VISITA.get(i.get("origen"), i.get("origen")),
            calificacion, orden, _num(i.get("puntaje_riesgo")), REVISION.get(i.get("estado_revision"), i.get("estado_revision")),
            _num(i.get("dap_cm")), _num(i.get("altura_m")), _num(i.get("copa_m")), i.get("etapa"), i.get("interferencia"),
            _num(i.get("precision_gps_m")), len(datos.observaciones.get(str(i["id"]), [])),
            _curso(datos, i.get("inspector_id")),
            _entero(i.get("insectos_sev")), _entero(i.get("enfermedad_sev")), _entero(i.get("bejucos")),
            _num(i.get("pct_hemiparasitas")), horas,
        ])
    columnas = [
        Columna("inspeccion_id", oculta=True),
        Columna("arbol_id", oculta=True),
        Columna("Fecha", "fecha", descripcion="Día de la visita (hora de Colombia)"),
        Columna("Tipo de visita", descripcion="Registro (primera inspección) o seguimiento"),
        Columna("Calificación", ordenar_por="Calificación orden"),
        Columna("Calificación orden", "entero", oculta=True),
        Columna("Puntaje de riesgo", "decimal", "#,0.00", resumir="average"),
        Columna("Revisión", descripcion="Revisión docente: pendiente, confirmada o anulada"),
        Columna("DAP (cm)", "decimal", "#,0.0", resumir="average"),
        Columna("Altura (m)", "decimal", "#,0.0", resumir="average"),
        Columna("Copa (m)", "decimal", "#,0.0", resumir="average"),
        Columna("Etapa"),
        Columna("Interferencia"),
        Columna("Precisión GPS (m)", "decimal", "#,0.0", resumir="average"),
        Columna("N.º de hallazgos", "entero", resumir="sum"),
        Columna("Curso", descripcion="Curso de quien hizo la inspección"),
        Columna("Insectos (severidad)", "entero", resumir="average", descripcion="FB-01, de 0 a 4"),
        Columna("Enfermedad (severidad)", "entero", resumir="average", descripcion="FB-02, de 0 a 4"),
        Columna("Bejucos (severidad)", "entero", resumir="average", descripcion="FB-05, de 0 a 4"),
        Columna("Hemiparásitas (% de copa)", "decimal", "#,0.0", resumir="average", descripcion="FB-04"),
        Columna("Horas hasta la revisión", "decimal", "#,0.0", resumir="average"),
    ]

    def contar(condicion: str) -> str:
        return f"CALCULATE(COUNTROWS('Inspecciones'), {condicion}) + 0"

    medidas = [
        Medida("Total de inspecciones", "COUNTROWS('Inspecciones')", "#,0"),
        Medida("Inspecciones confirmadas", contar("'Inspecciones'[Revisión] = \"Confirmada\""), "#,0"),
        Medida("Inspecciones pendientes", contar("'Inspecciones'[Revisión] = \"Pendiente\""), "#,0"),
        Medida("Inspecciones anuladas", contar("'Inspecciones'[Revisión] = \"Anulada\""), "#,0"),
        Medida("% revisadas", "DIVIDE([Inspecciones confirmadas] + [Inspecciones anuladas], [Total de inspecciones])", "0.0%"),
        Medida("Árboles inspeccionados",
               "CALCULATE(DISTINCTCOUNT('Inspecciones'[arbol_id]), 'Inspecciones'[Revisión] <> \"Anulada\") + 0", "#,0",
               "Árboles con al menos una inspección no anulada en el periodo elegido"),
        Medida("Cobertura de inspección", "DIVIDE([Árboles inspeccionados], [Total de árboles])", "0.0%",
               "Árboles inspeccionados ÷ total de árboles"),
        Medida("Horas promedio hasta la revisión", "AVERAGE('Inspecciones'[Horas hasta la revisión])", "#,0.0"),
    ]
    return Tabla("Inspecciones", columnas, filas, medidas, "Una visita por fila, también las anuladas")


def _hallazgos(f: Fuente) -> Tabla:
    datos = f.datos
    filas = []
    for i in sorted(datos.inspecciones, key=lambda i: (i["_fecha"], str(i["id"]))):
        for codigo in sorted(datos.observaciones.get(str(i["id"]), [])):
            ficha = datos.catalogo.get(codigo, {})
            filas.append([str(i["id"]), codigo, ficha.get("etiqueta") or codigo, _primera_mayuscula(ficha.get("grupo")) or "Sin grupo"])
    columnas = [
        Columna("inspeccion_id", oculta=True),
        Columna("Código del hallazgo"),
        Columna("Hallazgo"),
        Columna("Grupo", descripcion="Parte del árbol o tipo de hallazgo"),
    ]
    medidas = [Medida("Total de hallazgos", "COUNTROWS('Hallazgos')", "#,0")]
    return Tabla("Hallazgos", columnas, filas, medidas, "Un hallazgo fitosanitario de una inspección por fila")


def _intervenciones(f: Fuente) -> Tabla:
    hoy = f.generado.date()
    filas = []
    for v in sorted(f.datos.intervenciones, key=lambda v: (str(v.get("creado_en") or ""), str(v.get("id") or ""))):
        programada, ejecutada = a_fecha(v.get("fecha_programada")), a_fecha(v.get("fecha_ejecucion"))
        tipo = f.tipos_intervencion.get(v.get("tipo_codigo"), {}).get("nombre") or v.get("tipo_codigo")
        vencida = v.get("estado") == "programada" and programada is not None and programada < hoy
        filas.append([
            str(v["arbol_id"]), tipo, ESTADO_INTERVENCION.get(v.get("estado"), v.get("estado")), programada, ejecutada,
            ejecutada or programada, _num(v.get("costo_estimado")), _num(v.get("costo_real")),
            RESULTADO.get(v.get("resultado"), v.get("resultado")), _si(vencida),
        ])
    columnas = [
        Columna("arbol_id", oculta=True),
        Columna("Tipo"),
        Columna("Estado"),
        Columna("Fecha programada", "fecha"),
        Columna("Fecha de ejecución", "fecha"),
        Columna("Fecha", "fecha", descripcion="Fecha de ejecución, o la programada si aún no se ejecuta"),
        Columna("Costo estimado (COP)", "decimal", "$ #,0", resumir="sum"),
        Columna("Costo real (COP)", "decimal", "$ #,0", resumir="sum"),
        Columna("Resultado"),
        Columna("Vencida", descripcion="Sí si está programada para una fecha que ya pasó"),
    ]

    def contar(condicion: str) -> str:
        return f"CALCULATE(COUNTROWS('Intervenciones'), {condicion}) + 0"

    medidas = [
        Medida("Total de intervenciones", "COUNTROWS('Intervenciones')", "#,0"),
        Medida("Intervenciones ejecutadas", contar("'Intervenciones'[Estado] = \"Ejecutada\""), "#,0"),
        Medida("Intervenciones programadas", contar("'Intervenciones'[Estado] = \"Programada\""), "#,0"),
        Medida("Programadas vencidas", contar("'Intervenciones'[Vencida] = \"Sí\""), "#,0"),
        Medida("Costo ejecutado",
               "CALCULATE(SUM('Intervenciones'[Costo real (COP)]), 'Intervenciones'[Estado] = \"Ejecutada\") + 0", "$ #,0"),
        Medida("Costo programado",
               "CALCULATE(SUM('Intervenciones'[Costo estimado (COP)]), 'Intervenciones'[Estado] = \"Programada\") + 0", "$ #,0"),
        Medida("Eficacia de las intervenciones",
               "DIVIDE(CALCULATE(COUNTROWS('Intervenciones'), 'Intervenciones'[Resultado] = \"Exitosa\"), [Intervenciones ejecutadas])",
               "0.0%", "Ejecutadas con resultado exitoso ÷ ejecutadas"),
    ]
    return Tabla("Intervenciones", columnas, filas, medidas, "Mantenimiento programado, ejecutado o cancelado")


def _instituciones(f: Fuente) -> Tabla:
    ids = {str(a.get("institucion_id")) for a in f.datos.arboles if a.get("institucion_id")}
    if f.institucion_id:
        ids.add(f.institucion_id)
    filas = []
    for i in sorted(ids):
        inst = f.instituciones.get(i, {})
        filas.append([i, inst.get("nombre") or i, inst.get("nombre_corto") or inst.get("nombre") or i,
                      inst.get("codigo_dane"), inst.get("municipio")])
    columnas = [
        Columna("institucion_id", oculta=True),
        Columna("Institución"),
        Columna("Sede", descripcion="Nombre corto de la institución"),
        Columna("Código DANE", descripcion="Código DANE de la sede (12 dígitos)"),
        Columna("Municipio"),
    ]
    return Tabla("Instituciones", columnas, filas, descripcion="Instituciones o sedes incluidas")


def _calendario(f: Fuente, tablas: list[Tabla]) -> Tabla:
    """Un día por fila, del primer mes con datos hasta el mes actual (o la última fecha programada)."""
    fechas = [f.generado.date()]
    for t in tablas:
        for c in t.columnas:
            if c.tipo == "fecha":
                i = t.indice(c.nombre)
                fechas += [fila[i] for fila in t.filas if fila[i] is not None]
    inicio = min(fechas).replace(day=1)
    ultimo = max(fechas)
    fin = (ultimo.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    filas = []
    dia = inicio
    while dia <= fin:
        filas.append([dia, dia.year, f"T{(dia.month - 1) // 3 + 1}", f"{MESES[dia.month - 1]} {dia.year}", dia.year * 100 + dia.month])
        dia += timedelta(days=1)
    columnas = [
        Columna("Fecha", "fecha"),
        Columna("Año", "entero"),
        Columna("Trimestre"),
        Columna("Mes", ordenar_por="Clave del mes"),
        Columna("Clave del mes", "entero", oculta=True),
    ]
    return Tabla("Calendario", columnas, filas, descripcion="Días para filtrar inspecciones e intervenciones")


def modelo(f: Fuente) -> tuple[list[Tabla], list[Relacion]]:
    datos = [_instituciones(f), _arboles(f), _inspecciones(f), _hallazgos(f), _intervenciones(f)]
    tablas = datos + [_calendario(f, datos)]
    relaciones = [
        Relacion("Árboles", "institucion_id", "Instituciones", "institucion_id"),
        Relacion("Inspecciones", "arbol_id", "Árboles", "arbol_id"),
        Relacion("Intervenciones", "arbol_id", "Árboles", "arbol_id"),
        Relacion("Hallazgos", "inspeccion_id", "Inspecciones", "inspeccion_id"),
        Relacion("Inspecciones", "Fecha", "Calendario", "Fecha"),
        Relacion("Intervenciones", "Fecha", "Calendario", "Fecha"),
    ]
    return tablas, relaciones


# ==================================== Páginas ====================================
MARGEN, ANCHO, FILA_TARJETAS, ALTO_TARJETA, CUERPO = 16, 1248, 76, 92, 180


def _tarjetas(p, medidas: list[str]) -> None:
    hueco = 12
    ancho = (ANCHO - hueco * (len(medidas) - 1)) / len(medidas)
    for n, medida in enumerate(medidas):
        p.tarjeta((MARGEN + n * (ancho + hueco), FILA_TARJETAS, ancho, ALTO_TARJETA), medida)


def _encabezado(p, titulo: str, texto: str, varias_sedes: bool, fechas: bool = False) -> None:
    derecha = MARGEN + ANCHO
    ancho_titulo = 820 if not fechas else 600
    p.texto((MARGEN, 4, ancho_titulo, 66), [(titulo, TITULO), (texto, SUBTITULO)])
    if fechas:
        ancho = 400 if varias_sedes else 600
        x = derecha - ancho - (220 if varias_sedes else 0)
        p.segmentador((x, 6, ancho, 62), "Calendario[Fecha]", modo="Between", titulo="Periodo")
    if varias_sedes:
        p.segmentador((derecha - 208, 6, 208, 62), "Instituciones[Sede]", titulo="Sede")


def paginas(informe: Informe, f: Fuente, varias_sedes: bool) -> None:
    corte = f.generado.astimezone(ZONA_HORARIA)
    al_dia = f"{f.alcance} · datos al {corte:%d/%m/%Y}"

    p = informe.pagina("Resumen")
    _encabezado(p, "Resumen del arbolado", al_dia, varias_sedes)
    _tarjetas(p, ["Árboles[Total de árboles]", "Árboles[% en riesgo o crítico]", "Árboles[CO2 almacenado (t)]",
                  "Árboles[Especies]", "Árboles[% de nativas]"])
    p.dona((16, CUERPO, 400, 524), "Estado de los árboles", "Árboles[Estado]", "Árboles[Total de árboles]", colores=COLOR_ESTADO)
    p.barras((428, CUERPO, 412, 524), "Árboles por especie", "Árboles[Especie]", "Árboles[Total de árboles]")
    p.barras((852, CUERPO, 412, 256), "Árboles por zona", "Árboles[Zona]", "Árboles[Total de árboles]")
    p.barras((852, 448, 412, 256), "Árboles por etapa", "Árboles[Etapa]", "Árboles[Total de árboles]",
             horizontal=False, ordenar_por_categoria=True)

    p = informe.pagina("Riesgo")
    _encabezado(p, "Riesgo y prioridades", "Estado según la última inspección válida de cada árbol", varias_sedes)
    _tarjetas(p, ["Árboles[Árboles críticos]", "Árboles[Árboles en riesgo]", "Árboles[Árboles prioritarios]",
                  "Árboles[Sin inspección reciente]", "Árboles[Puntaje de riesgo promedio]"])
    p.barras((16, CUERPO, 400, 256), "Estado por zona", "Árboles[Zona]", "Árboles[Total de árboles]",
             serie="Árboles[Estado]", colores=COLOR_ESTADO)
    p.barras((16, 448, 400, 256), "Interferencia con infraestructura", "Árboles[Interferencia]", "Árboles[Total de árboles]",
             filtros=[p.filtro("Árboles[Interferencia]", ["Ninguna"], excluir=True)])
    p.barras((428, CUERPO, 400, 524), "Hallazgos más frecuentes", "Hallazgos[Hallazgo]", "Hallazgos[Total de hallazgos]",
             filtros=[p.filtro("Inspecciones[Revisión]", ["Anulada"], excluir=True)])
    p.tabla((840, CUERPO, 424, 524), "Árboles prioritarios",
            ["Árboles[Código]", "Árboles[Especie]", "Árboles[Estado]", "Árboles[Puntaje de riesgo]"],
            orden=("Árboles[Puntaje de riesgo]", True), filtros=[p.filtro("Árboles[Prioritario]", ["Sí"])])

    p = informe.pagina("Inspecciones")
    _encabezado(p, "Inspecciones", "Visitas de campo y revisión docente", varias_sedes, fechas=True)
    _tarjetas(p, ["Inspecciones[Total de inspecciones]", "Inspecciones[Árboles inspeccionados]",
                  "Inspecciones[Cobertura de inspección]", "Inspecciones[% revisadas]", "Inspecciones[Inspecciones pendientes]"])
    p.barras((16, CUERPO, 820, 256), "Inspecciones por mes y calificación", "Calendario[Mes]", "Inspecciones[Total de inspecciones]",
             serie="Inspecciones[Calificación]", horizontal=False, ordenar_por_categoria=True, colores=COLOR_ESTADO)
    p.dona((848, CUERPO, 416, 256), "Revisión docente", "Inspecciones[Revisión]", "Inspecciones[Total de inspecciones]",
           colores=COLOR_REVISION)
    p.barras((16, 448, 620, 256), "Inspecciones por curso (sin anuladas)", "Inspecciones[Curso]", "Inspecciones[Total de inspecciones]",
             filtros=[p.filtro("Inspecciones[Revisión]", ["Anulada"], excluir=True)])
    p.barras((648, 448, 616, 256), "Hallazgos por grupo", "Hallazgos[Grupo]", "Hallazgos[Total de hallazgos]",
             filtros=[p.filtro("Inspecciones[Revisión]", ["Anulada"], excluir=True)])

    p = informe.pagina("Intervenciones")
    _encabezado(p, "Intervenciones", "Mantenimiento programado y ejecutado, con su costo", varias_sedes, fechas=True)
    _tarjetas(p, ["Intervenciones[Intervenciones ejecutadas]", "Intervenciones[Costo ejecutado]",
                  "Intervenciones[Intervenciones programadas]", "Intervenciones[Programadas vencidas]",
                  "Intervenciones[Eficacia de las intervenciones]"])
    p.barras((16, CUERPO, 620, 300), "Intervenciones por tipo", "Intervenciones[Tipo]", "Intervenciones[Total de intervenciones]",
             serie="Intervenciones[Estado]", colores=COLOR_INTERVENCION)
    p.dona((648, CUERPO, 616, 300), "Resultado de las ejecutadas", "Intervenciones[Resultado]",
           "Intervenciones[Total de intervenciones]", colores=COLOR_RESULTADO,
           filtros=[p.filtro("Intervenciones[Estado]", ["Ejecutada"])])
    p.tabla((16, 492, 1248, 212), "Detalle",
            ["Árboles[Código]", "Intervenciones[Tipo]", "Intervenciones[Estado]", "Intervenciones[Fecha programada]",
             "Intervenciones[Fecha de ejecución]", "Intervenciones[Costo estimado (COP)]", "Intervenciones[Costo real (COP)]",
             "Intervenciones[Resultado]"],
            orden=("Intervenciones[Fecha programada]", True))

    p = informe.pagina("Medidas y carbono")
    _encabezado(p, "Medidas y carbono",
                "Medidas actuales de cada árbol. El CO2 es lo que guarda la madera, no lo que se captura cada año.", varias_sedes)
    _tarjetas(p, ["Árboles[DAP promedio (cm)]", "Árboles[Altura promedio (m)]", "Árboles[Copa promedio (m)]",
                  "Árboles[Biomasa (t)]", "Árboles[Área de copa total (m2)]"])
    p.barras((16, CUERPO, 500, 256), "Árboles por clase de DAP", "Árboles[Clase de DAP]", "Árboles[Total de árboles]",
             horizontal=False, ordenar_por_categoria=True)
    p.tabla((16, 448, 500, 256), "Por especie",
            ["Árboles[Especie]", "Árboles[Total de árboles]", "Árboles[DAP promedio (cm)]", "Árboles[CO2 almacenado (t)]"],
            orden=("Árboles[Total de árboles]", True))
    p.dispersion((528, CUERPO, 736, 524), "DAP y altura de cada árbol", "Árboles[Código]",
                 "Árboles[DAP promedio (cm)]", "Árboles[Altura promedio (m)]", serie="Árboles[Especie]")

    p = informe.pagina("Inventario")
    _encabezado(p, "Inventario", "Un árbol por fila con su estado actual", varias_sedes)
    campos = ["Árboles[Código]"] + (["Instituciones[Sede]"] if varias_sedes else []) + [
        "Árboles[Zona]", "Árboles[Especie]", "Árboles[Origen]", "Árboles[Etapa]", "Árboles[Estado]", "Árboles[DAP (cm)]",
        "Árboles[Altura (m)]", "Árboles[Copa (m)]", "Árboles[CO2 almacenado (kg)]", "Árboles[Última inspección válida]",
        "Árboles[Última revisión]",
    ]
    p.tabla((16, FILA_TARJETAS, ANCHO, 628), "Árboles", campos, orden=("Árboles[Código]", False))

    p = informe.pagina("Notas")
    generado = corte.strftime("%d/%m/%Y a las %H:%M")
    p.texto((MARGEN, 16, ANCHO, 688), [
        ("Notas sobre estos datos", TITULO),
        (f"Alcance: {f.alcance}. Datos de la app Arbolado Escolar del {generado} (hora de Colombia).", PARRAFO),
        ("", PARRAFO),
        ("Cómo se calcula", APARTADO),
        ("El estado de cada árbol es el de su última inspección que no fue anulada; las pendientes de revisión docente "
         "también cuentan. Son prioritarios los árboles críticos y los que interfieren con infraestructura.", PARRAFO),
        ("La cobertura de inspección es el número de árboles con al menos una inspección no anulada en el periodo, "
         "dividido entre el total de árboles.", PARRAFO),
        ("Biomasa, carbono y CO2 son estimaciones con la ecuación de Chave et al. (2014) y la densidad de madera del "
         "método de cálculo de la institución. El CO2 es el que guarda la madera, no el que se captura cada año.", PARRAFO),
        ("", PARRAFO),
        ("Privacidad", APARTADO),
        ("No incluye datos personales: ni nombres de estudiantes o docentes ni notas de texto libre (Ley 1581 de 2012). "
         "Las inspecciones solo indican el curso de quien las hizo.", PARRAFO),
        ("", PARRAFO),
        ("Para trabajar con el archivo", APARTADO),
        ("Esta plantilla trae los datos del momento en que se descargó. Para tenerlos al día, descárgala de nuevo desde "
         "Reportes o Exportar datos en la app.", PARRAFO),
        ("Para guardar el informe usa Archivo > Guardar como; Power BI lo guarda como .pbix. Las tablas, medidas y "
         "relaciones están en la vista de modelo, y cada columna tiene su descripción.", PARRAFO),
        ("Latitud y Longitud ya están marcadas como coordenadas, por si quieres agregar un mapa.", PARRAFO),
    ])


def generar(f: Fuente) -> bytes:
    """El .pbit listo para descargar."""
    tablas, relaciones = modelo(f)
    instituciones = next(t for t in tablas if t.nombre == "Instituciones")
    informe = Informe(tablas, TEMA)
    paginas(informe, f, varias_sedes=len(instituciones.filas) > 1)
    return plantilla(tablas, relaciones, informe)
