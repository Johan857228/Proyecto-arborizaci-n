"""Informe del arbolado para descargar en PDF o Excel, y los datos del módulo de Análisis.

Todo sale de las mismas tablas de la plantilla de Power BI (servicios/informe_powerbi.py), así que
las cifras coinciden con Reportes, con Power BI y entre los dos archivos:

- El estado de cada árbol es el de su última inspección que no fue anulada.
- Biomasa, carbono y CO2 usan el método de cálculo de esa inspección.
- Sin datos personales: ni nombres de estudiantes o docentes, ni notas de texto libre. Las
  inspecciones solo dicen de qué curso era quien las hizo.
"""
import io
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date

import xlsxwriter

from servicios import pdf
from servicios.informe_powerbi import COLOR_ESTADO, MESES, Fuente, modelo
from servicios.pdf import BLANCO, FONDO, GRIS, LINEA, MARGEN, TINTA, VERDE, Documento, fecha_corta, fecha_larga, rgb

ESTADOS = ("Sano", "En riesgo", "Crítico")
COLOR_PENDIENTE = "#F59E0B"
COLOR_CONFIRMADA = "#166534"
MAX_CATEGORIAS = 8
MAX_ZONAS = 10
HOJA_DATOS = "Datos de gráficos"


# =================================== Tablas legibles ===================================
@dataclass
class Tablas:
    """Las filas de la plantilla de Power BI como diccionarios, con el código del árbol pegado a
    cada inspección, intervención y hallazgo (en vez de los identificadores internos)."""

    arboles: list[dict]
    inspecciones: list[dict]
    intervenciones: list[dict]
    hallazgos: list[dict]
    sedes: dict[str, str]                       # institucion_id → nombre corto
    columnas: dict[str, list] = field(default_factory=dict)  # tabla → columnas visibles de Power BI


def _filas(tabla) -> list[dict]:
    nombres = [c.nombre for c in tabla.columnas]
    return [dict(zip(nombres, fila)) for fila in tabla.filas]


def tablas(f: Fuente) -> Tablas:
    por_nombre = {t.nombre: t for t in modelo(f)[0]}
    arboles = _filas(por_nombre["Árboles"])
    sedes = {fila["institucion_id"]: fila["Sede"] for fila in _filas(por_nombre["Instituciones"])}
    por_arbol = {a["arbol_id"]: a for a in arboles}
    for a in arboles:
        a["Sede"] = sedes.get(a["institucion_id"], a["institucion_id"])

    def del_arbol(fila: dict) -> dict:
        a = por_arbol.get(fila["arbol_id"], {})
        return {"Código": a.get("Código"), "Especie": a.get("Especie"), "Zona": a.get("Zona"), "Sede": a.get("Sede"), **fila}

    inspecciones = [del_arbol(i) for i in _filas(por_nombre["Inspecciones"])]
    por_inspeccion = {i["inspeccion_id"]: i for i in inspecciones}
    hallazgos = []
    for h in _filas(por_nombre["Hallazgos"]):
        i = por_inspeccion.get(h["inspeccion_id"], {})
        hallazgos.append({
            "arbol_id": i.get("arbol_id"), "Código": i.get("Código"), "Especie": i.get("Especie"),
            "Fecha": i.get("Fecha"), "Revisión": i.get("Revisión"), **h,
        })
    intervenciones = [del_arbol(v) for v in _filas(por_nombre["Intervenciones"])]
    columnas = {
        nombre: [c for c in por_nombre[nombre].columnas if not c.oculta]
        for nombre in ("Árboles", "Inspecciones", "Intervenciones", "Hallazgos")
    }
    return Tablas(arboles, inspecciones, intervenciones, hallazgos, sedes, columnas)


# ======================================= Resumen =======================================
@dataclass
class Resumen:
    alcance: str
    generado: date
    varias_sedes: bool
    total: int
    por_estado: list[tuple[str, int]]
    prioritarios: int
    sin_revisita: int
    especies: int
    pct_nativas: float | None
    co2_t: float
    biomasa_t: float
    carbono_t: float
    copa_m2: float
    dap_prom: float | None
    altura_prom: float | None
    copa_prom: float | None
    inspecciones: int
    confirmadas: int
    pendientes: int
    anuladas: int
    inspeccionados: int
    intervenciones: int
    ejecutadas: int
    programadas: int
    vencidas: int
    canceladas: int
    costo_ejecutado: float
    costo_programado: float
    exitosas: int
    top_especies: list[tuple[str, int]]
    zonas: list[tuple[str, dict[str, int]]]
    etapas: list[tuple[str, int]]
    clases_dap: list[tuple[str, int]]
    por_mes: list[tuple[str, int, int]]          # etiqueta, confirmadas, pendientes
    hallazgos: list[tuple[str, int]]
    tipos_intervencion: list[tuple[str, int]]
    sedes: list[dict]

    def cuantos(self, estado: str) -> int:
        return dict(self.por_estado).get(estado, 0)

    @property
    def pct_riesgo(self) -> float | None:
        return _pct(self.cuantos("En riesgo") + self.cuantos("Crítico"), self.total)

    @property
    def pct_revisadas(self) -> float | None:
        return _pct(self.confirmadas + self.anuladas, self.inspecciones)

    @property
    def cobertura(self) -> float | None:
        return _pct(self.inspeccionados, self.total)


def _pct(parte: float, total: float) -> float | None:
    return None if not total else parte * 100 / total


def _suma(filas: list[dict], campo: str) -> float:
    return sum(float(f[campo]) for f in filas if f.get(campo) is not None)


def _promedio(filas: list[dict], campo: str) -> float | None:
    valores = [float(f[campo]) for f in filas if f.get(campo) is not None]
    return sum(valores) / len(valores) if valores else None


def _top(contador: Counter, maximo: int = MAX_CATEGORIAS, otros: str = "Otras") -> list[tuple[str, int]]:
    ordenados = sorted(contador.items(), key=lambda kv: (-kv[1], kv[0]))
    if len(ordenados) <= maximo:
        return ordenados
    resto = sum(n for _, n in ordenados[maximo - 1:])
    return ordenados[:maximo - 1] + [(otros, resto)]


def _ordenado(filas: list[dict], campo: str, orden: str) -> list[tuple[str, int]]:
    """Conteo por una columna que tiene su propio orden (etapa, clase de DAP)."""
    conteo: Counter = Counter()
    posicion: dict[str, int] = {}
    for fila in filas:
        if fila.get(campo):
            conteo[fila[campo]] += 1
            posicion[fila[campo]] = fila.get(orden) or 99
    return sorted(conteo.items(), key=lambda kv: posicion[kv[0]])


def _meses(hasta: date, cantidad: int = 12) -> list[tuple[int, int]]:
    anio, mes = hasta.year, hasta.month
    salida = []
    for _ in range(cantidad):
        salida.append((anio, mes))
        mes -= 1
        if mes == 0:
            anio, mes = anio - 1, 12
    return list(reversed(salida))


def resumen(t: Tablas, f: Fuente) -> Resumen:
    arboles = t.arboles
    hoy = f.generado.date()
    estados = Counter(a["Estado"] for a in arboles)
    clasificadas = [a for a in arboles if a.get("Origen") in ("Nativa", "Exótica")]
    validas = [i for i in t.inspecciones if i.get("Revisión") != "Anulada"]
    revision = Counter(i.get("Revisión") for i in t.inspecciones)

    por_mes = []
    conteo_mes: dict[tuple[int, int], Counter] = defaultdict(Counter)
    for i in validas:
        if i.get("Fecha"):
            conteo_mes[(i["Fecha"].year, i["Fecha"].month)][i.get("Revisión")] += 1
    for anio, mes in _meses(hoy):
        c = conteo_mes.get((anio, mes), Counter())
        por_mes.append((f"{MESES[mes - 1]} {str(anio)[2:]}", c.get("Confirmada", 0), c.get("Pendiente", 0)))

    zonas: dict[str, Counter] = defaultdict(Counter)
    for a in arboles:
        zonas[a.get("Zona") or "Sin zona"][a["Estado"]] += 1
    zonas_ordenadas = sorted(zonas.items(), key=lambda kv: (-sum(kv[1].values()), kv[0]))
    if len(zonas_ordenadas) > MAX_ZONAS:
        resto: Counter = Counter()
        for _, c in zonas_ordenadas[MAX_ZONAS - 1:]:
            resto.update(c)
        zonas_ordenadas = zonas_ordenadas[:MAX_ZONAS - 1] + [("Otras zonas", resto)]

    estado_intervencion = Counter(v.get("Estado") for v in t.intervenciones)
    ejecutadas = [v for v in t.intervenciones if v.get("Estado") == "Ejecutada"]
    programadas = [v for v in t.intervenciones if v.get("Estado") == "Programada"]

    sedes = []
    if len({a["institucion_id"] for a in arboles}) > 1:
        for iid, nombre in sorted(t.sedes.items(), key=lambda kv: kv[1]):
            propias = [a for a in arboles if a["institucion_id"] == iid]
            if not propias:
                continue
            c = Counter(a["Estado"] for a in propias)
            ids = {a["arbol_id"] for a in propias}
            sedes.append({
                "Sede": nombre, "Árboles": len(propias), "Sanos": c.get("Sano", 0), "En riesgo": c.get("En riesgo", 0),
                "Críticos": c.get("Crítico", 0), "Prioritarios": sum(a.get("Prioritario") == "Sí" for a in propias),
                "CO2 almacenado (t)": round(_suma(propias, "CO2 almacenado (kg)") / 1000, 2),
                "Inspecciones": sum(i["arbol_id"] in ids for i in validas),
            })

    return Resumen(
        alcance=f.alcance,
        generado=hoy,
        varias_sedes=bool(sedes),
        total=len(arboles),
        por_estado=[(e, estados.get(e, 0)) for e in ESTADOS],
        prioritarios=sum(a.get("Prioritario") == "Sí" for a in arboles),
        sin_revisita=sum(a.get("Revisita pendiente") == "Sí" for a in arboles),
        especies=len({a["Especie"] for a in arboles if a.get("Especie")}),
        pct_nativas=_pct(sum(a["Origen"] == "Nativa" for a in clasificadas), len(clasificadas)),
        co2_t=_suma(arboles, "CO2 almacenado (kg)") / 1000,
        biomasa_t=_suma(arboles, "Biomasa (kg)") / 1000,
        carbono_t=_suma(arboles, "Carbono (kg)") / 1000,
        copa_m2=_suma(arboles, "Área de copa (m2)"),
        dap_prom=_promedio(arboles, "DAP (cm)"),
        altura_prom=_promedio(arboles, "Altura (m)"),
        copa_prom=_promedio(arboles, "Copa (m)"),
        inspecciones=len(t.inspecciones),
        confirmadas=revision.get("Confirmada", 0),
        pendientes=revision.get("Pendiente", 0),
        anuladas=revision.get("Anulada", 0),
        inspeccionados=len({i["arbol_id"] for i in validas}),
        intervenciones=len(t.intervenciones),
        ejecutadas=len(ejecutadas),
        programadas=len(programadas),
        vencidas=sum(v.get("Vencida") == "Sí" for v in t.intervenciones),
        canceladas=estado_intervencion.get("Cancelada", 0),
        costo_ejecutado=_suma(ejecutadas, "Costo real (COP)"),
        costo_programado=_suma(programadas, "Costo estimado (COP)"),
        exitosas=sum(v.get("Resultado") == "Exitosa" for v in ejecutadas),
        top_especies=_top(Counter(a["Especie"] or "Sin especie" for a in arboles)),
        zonas=[(zona, dict(c)) for zona, c in zonas_ordenadas],
        etapas=_ordenado(arboles, "Etapa", "Etapa orden"),
        clases_dap=_ordenado(arboles, "Clase de DAP", "Clase de DAP orden"),
        por_mes=por_mes,
        hallazgos=_top(Counter(h["Hallazgo"] for h in t.hallazgos if h.get("Revisión") != "Anulada"), otros="Otros"),
        tipos_intervencion=_top(Counter(v.get("Tipo") or "Sin tipo" for v in t.intervenciones), otros="Otros"),
        sedes=sedes,
    )


# ===================================== Formatos =====================================
def numero(valor: float | None, decimales: int = 0) -> str:
    """Cifra con punto de miles y coma decimal, como se escribe en Colombia."""
    if valor is None:
        return "—"
    texto = f"{valor:,.{decimales}f}"
    return texto.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def porcentaje(valor: float | None) -> str:
    return "—" if valor is None else f"{numero(valor, 1)} %"


def pesos(valor: float | None) -> str:
    return "—" if valor is None else f"$ {numero(valor)}"


def _fecha(valor) -> str:
    return fecha_corta(valor) if isinstance(valor, date) else "—"


def _plural(n: int, singular: str, plural: str) -> str:
    return f"{numero(n)} {singular if n == 1 else plural}"


def lectura_estado(r: Resumen) -> str:
    """Dos o tres frases que explican el estado del arbolado con las cifras del informe."""
    if not r.total:
        return "Todavía no hay árboles registrados en este alcance."
    sanos, riesgo, criticos = (r.cuantos(e) for e in ESTADOS)
    partes = [f"De los {_plural(r.total, 'árbol registrado', 'árboles registrados')}, {numero(sanos)} "
              f"{'está sano' if sanos == 1 else 'están sanos'} ({porcentaje(_pct(sanos, r.total))}), "
              f"{numero(riesgo)} en riesgo y {numero(criticos)} {'crítico' if criticos == 1 else 'críticos'}."]
    if r.prioritarios:
        partes.append(f"{_plural(r.prioritarios, 'árbol necesita', 'árboles necesitan')} atención prioritaria porque "
                      f"{'está crítico o interfiere' if r.prioritarios == 1 else 'están críticos o interfieren'} "
                      "con redes o construcciones.")
    if r.sin_revisita:
        partes.append(f"{_plural(r.sin_revisita, 'árbol lleva', 'árboles llevan')} más tiempo del previsto sin una "
                      "inspección válida.")
    return " ".join(partes)


# ======================================== PDF ========================================
def _hex(color: str):
    return rgb(color)


VERDE_CLARO = rgb("#BBF7D0")
AMBAR = rgb(COLOR_PENDIENTE)
TRAMO = rgb("#EEF2E8")


def _encabezado(doc: Documento, r: Resumen) -> None:
    p = doc.p
    alto = 132
    p.rectangulo(0, pdf.ALTO - alto, pdf.ANCHO, alto, VERDE)
    p.rectangulo(0, pdf.ALTO - alto, pdf.ANCHO, 4, rgb("#1BAF7A"))
    p.texto(MARGEN, pdf.ALTO - 42, 8.5, "INFORME DEL ARBOLADO ESCOLAR", negrita=True, color=VERDE_CLARO)
    y = p.parrafo(MARGEN, pdf.ALTO - 70, 21, r.alcance, doc.ancho, interlineado=24, negrita=True, color=BLANCO)
    p.texto(MARGEN, max(y - 2, pdf.ALTO - alto + 18), 10,
            f"Corte al {fecha_larga(r.generado)} · {_plural(r.total, 'árbol registrado', 'árboles registrados')}",
            color=BLANCO)
    doc.y = pdf.ALTO - alto - 28


def _tarjetas(doc: Documento, items: list[tuple[str, str, tuple]], por_fila: int = 4) -> None:
    separacion = 10
    ancho = (doc.ancho - separacion * (por_fila - 1)) / por_fila
    for inicio in range(0, len(items), por_fila):
        fila = items[inicio:inicio + por_fila]
        etiquetas = [pdf.partir(etiqueta, 8, ancho - 24)[:2] for _v, etiqueta, _a in fila]
        alto = 56 + 10 * (max(len(e) for e in etiquetas) - 1)
        doc.espacio(alto + separacion)
        arriba = doc.y
        for n, ((valor, _etiqueta, acento), lineas) in enumerate(zip(fila, etiquetas)):
            x = MARGEN + n * (ancho + separacion)
            doc.p.redondeado(x, arriba - alto, ancho, alto, 8, FONDO)
            doc.p.redondeado(x + 12, arriba - 13, 20, 3, 1.5, acento)
            doc.p.texto(x + 12, arriba - 34, 17, pdf.recortar(valor, 17, ancho - 24, True), negrita=True)
            for i, linea in enumerate(lineas):
                doc.p.texto(x + 12, arriba - 47 - 10 * i, 8, linea, color=GRIS)
        doc.y = arriba - alto - separacion
    doc.y -= 4


def _seccion(doc: Documento, titulo: str, cuerpo: float) -> None:
    """Título de sección que no queda solo al final de una página: si no cabe con al menos `cuerpo`
    puntos de su contenido, empieza en la página siguiente."""
    doc.espacio(min(cuerpo, 260) + 60)
    doc.seccion(titulo)


def _alto_barras(items) -> float:
    return 18 * min(len(items), 6) + 24


def _nota(doc: Documento, texto: str) -> None:
    doc.parrafo(texto, tamano=8.5, color=GRIS)


def _dona_estado(doc: Documento, r: Resumen) -> None:
    alto = 150
    doc.espacio(alto)
    arriba = doc.y
    p = doc.p
    cx, cy, radio, grosor = MARGEN + 68, arriba - 74, 64, 20
    if r.total:
        angulo = 0.0
        partes = [(e, n) for e, n in r.por_estado if n]
        hueco = 1.2 if len(partes) > 1 else 0
        for estado, n in partes:
            barrido = 360 * n / r.total
            p.porcion_dona(cx, cy, radio, grosor, angulo + hueco / 2, angulo + barrido - hueco / 2, _hex(COLOR_ESTADO[estado]))
            angulo += barrido
    else:
        p.porcion_dona(cx, cy, radio, grosor, 0, 359.9, LINEA)
    p.texto_centrado(cx, cy + 1, 20, numero(r.total), negrita=True)
    p.texto_centrado(cx, cy - 13, 8, "árboles", color=GRIS)

    x = MARGEN + 162
    y = arriba - 26
    for estado, n in r.por_estado:
        p.redondeado(x, y - 1, 10, 10, 2.5, _hex(COLOR_ESTADO[estado]))
        p.texto(x + 17, y, 10.5, estado)
        p.texto_derecha(x + 170, y, 10.5, numero(n), negrita=True)
        p.texto_derecha(x + 232, y, 10, porcentaje(_pct(n, r.total)), color=GRIS)
        y -= 21
    p.parrafo(x, y - 8, 9.5, lectura_estado(r), doc.ancho - 162, interlineado=13.5)
    doc.y = arriba - alto


def _barras(doc: Documento, items: list[tuple[str, float]], color=VERDE, formato=numero, ancho_etiqueta: float = 150) -> None:
    if not items:
        _nota(doc, "Sin datos para mostrar.")
        return
    maximo = max(n for _, n in items) or 1
    x0 = MARGEN + ancho_etiqueta
    largo = doc.ancho - ancho_etiqueta - 56
    for nombre, n in items:
        doc.espacio(18)
        y = doc.y - 12
        doc.p.texto(MARGEN, y, 9.5, pdf.recortar(nombre, 9.5, ancho_etiqueta - 10))
        doc.p.redondeado(x0, y - 2, largo, 10, 5, TRAMO)
        if n:
            doc.p.redondeado(x0, y - 2, max(largo * n / maximo, 10), 10, 5, color)
        doc.p.texto_derecha(MARGEN + doc.ancho, y, 9.5, formato(n), negrita=True)
        doc.y -= 18
    doc.y -= 16


def _leyenda(doc: Documento, items: list[tuple[str, tuple]]) -> None:
    doc.espacio(18)
    x = MARGEN
    for nombre, color in items:
        doc.p.redondeado(x, doc.y - 10, 9, 9, 2, color)
        doc.p.texto(x + 14, doc.y - 9, 9, nombre, color=GRIS)
        x += 28 + pdf._ancho_aprox(nombre, 9)
    doc.y -= 20


def _barras_apiladas(doc: Documento, items: list[tuple[str, dict[str, int]]]) -> None:
    if not items:
        _nota(doc, "Sin datos para mostrar.")
        return
    _leyenda(doc, [(e, _hex(COLOR_ESTADO[e])) for e in ESTADOS])
    maximo = max(sum(c.values()) for _, c in items) or 1
    ancho_etiqueta = 150
    x0 = MARGEN + ancho_etiqueta
    largo = doc.ancho - ancho_etiqueta - 56
    for nombre, conteo in items:
        doc.espacio(18)
        y = doc.y - 12
        doc.p.texto(MARGEN, y, 9.5, pdf.recortar(nombre, 9.5, ancho_etiqueta - 10))
        doc.p.redondeado(x0, y - 2, largo, 10, 5, TRAMO)
        x = x0
        for estado in ESTADOS:
            n = conteo.get(estado, 0)
            if n:
                ancho = largo * n / maximo
                doc.p.rectangulo(x, y - 2, ancho, 10, _hex(COLOR_ESTADO[estado]))
                x += ancho
        doc.p.texto_derecha(MARGEN + doc.ancho, y, 9.5, numero(sum(conteo.values())), negrita=True)
        doc.y -= 18
    doc.y -= 16


def _columnas_mes(doc: Documento, items: list[tuple[str, int, int]]) -> None:
    _leyenda(doc, [("Confirmadas", _hex(COLOR_CONFIRMADA)), ("Pendientes de revisión", AMBAR)])
    alto = 128
    doc.espacio(alto)
    arriba = doc.y
    base = arriba - alto + 18
    area = alto - 40
    maximo = max((c + p for _, c, p in items), default=0) or 1
    columna = doc.ancho / len(items)
    barra = columna * 0.56
    doc.p.linea(MARGEN, base, MARGEN + doc.ancho, base, color=LINEA, grosor=0.8)
    for n, (etiqueta, confirmadas, pendientes) in enumerate(items):
        x = MARGEN + n * columna + (columna - barra) / 2
        alto_c = area * confirmadas / maximo
        alto_p = area * pendientes / maximo
        if confirmadas:
            doc.p.rectangulo(x, base, barra, alto_c, _hex(COLOR_CONFIRMADA))
        if pendientes:
            doc.p.rectangulo(x, base + alto_c, barra, alto_p, AMBAR)
        total = confirmadas + pendientes
        if total:
            doc.p.texto_centrado(x + barra / 2, base + alto_c + alto_p + 4, 8, numero(total), negrita=True)
        doc.p.texto_centrado(x + barra / 2, base - 11, 7.5, etiqueta, color=GRIS)
    doc.y = arriba - alto - 12


# Para texto sobre blanco se usan tonos más oscuros que los de los gráficos (se leen mejor).
TEXTO_ESTADO = {"Sano": rgb("#15803D"), "En riesgo": rgb("#B45309"), "Crítico": rgb("#BE123C")}


def _color_estado(_columna: int, valor) -> tuple | None:
    return TEXTO_ESTADO.get(valor)


def _texto(valor, decimales: int | None = None) -> str:
    if valor is None or valor == "":
        return "—"
    if isinstance(valor, date):
        return fecha_corta(valor)
    if decimales is not None and isinstance(valor, (int, float)):
        return numero(valor, decimales)
    return str(valor)


def generar_pdf(f: Fuente) -> bytes:
    t = tablas(f)
    r = resumen(t, f)
    doc = Documento(f"Arbolado Escolar · {r.alcance} · corte al {fecha_corta(r.generado)}")
    _encabezado(doc, r)

    _tarjetas(doc, [
        (numero(r.total), "Árboles registrados", VERDE),
        (numero(r.especies), "Especies", rgb("#0369A1")),
        (f"{numero(r.co2_t, 1)} t", "CO2 almacenado", rgb("#1BAF7A")),
        (numero(r.prioritarios), "Árboles prioritarios", rgb(COLOR_ESTADO["Crítico"])),
        (numero(r.inspecciones), "Inspecciones", VERDE),
        (porcentaje(r.pct_revisadas), "Inspecciones revisadas", rgb("#0369A1")),
        (numero(r.ejecutadas), "Intervenciones ejecutadas", rgb("#1BAF7A")),
        (numero(r.sin_revisita), "Sin inspección reciente", AMBAR),
    ])

    _seccion(doc, "Estado del arbolado", 150)
    _dona_estado(doc, r)

    _seccion(doc, "Especies más registradas", _alto_barras(r.top_especies))
    _barras(doc, r.top_especies)
    if r.pct_nativas is not None:
        _nota(doc, f"{porcentaje(r.pct_nativas)} de los árboles con especie clasificada son nativos de Colombia.")

    _seccion(doc, "Estado por zona", _alto_barras(r.zonas) + 20)
    _barras_apiladas(doc, r.zonas)

    if r.varias_sedes:
        doc.seccion("Por institución")
        doc.tabla(
            ["Sede", "Árboles", "Sanos", "En riesgo", "Críticos", "CO2 (t)"],
            [[s["Sede"], numero(s["Árboles"]), numero(s["Sanos"]), numero(s["En riesgo"]), numero(s["Críticos"]),
              numero(s["CO2 almacenado (t)"], 1)] for s in r.sedes],
            [0.35, 0.13, 0.13, 0.13, 0.13, 0.13], derecha={1, 2, 3, 4, 5},
        )

    _seccion(doc, "Medidas y carbono", 140)
    _tarjetas(doc, [
        (f"{numero(r.dap_prom, 1)} cm", "DAP promedio", VERDE),
        (f"{numero(r.altura_prom, 1)} m", "Altura promedio", VERDE),
        (f"{numero(r.copa_prom, 1)} m", "Copa promedio", VERDE),
        (f"{numero(r.copa_m2)} m²", "Área de copa total", rgb("#1BAF7A")),
        (f"{numero(r.biomasa_t, 1)} t", "Biomasa", rgb("#B45309")),
        (f"{numero(r.carbono_t, 1)} t", "Carbono", rgb("#57534E")),
        (f"{numero(r.co2_t, 1)} t", "CO2 almacenado", rgb("#1BAF7A")),
        (porcentaje(r.cobertura), "Árboles con inspección válida", rgb("#0369A1")),
    ])
    _nota(doc, "El CO2 es lo que el árbol ha guardado en su madera durante su vida, calculado con el método de la "
               "última inspección válida. No es lo que captura en un año.")
    doc.etiqueta("Árboles por clase de diámetro (DAP)")
    _barras(doc, r.clases_dap, color=rgb("#0369A1"))
    if r.etapas:
        doc.etiqueta("Árboles por etapa de desarrollo")
        _barras(doc, r.etapas, color=rgb("#1BAF7A"))

    _seccion(doc, "Inspecciones de los últimos 12 meses", 170)
    _columnas_mes(doc, r.por_mes)
    _nota(doc, f"En total hay {_plural(r.inspecciones, 'inspección', 'inspecciones')}: {numero(r.confirmadas)} "
               f"confirmadas, {numero(r.pendientes)} pendientes de revisión y {numero(r.anuladas)} anuladas. Las "
               "anuladas no cuentan para el estado de los árboles.")
    if r.hallazgos:
        doc.etiqueta("Hallazgos más frecuentes")
        _barras(doc, r.hallazgos, color=AMBAR, ancho_etiqueta=210)

    _seccion(doc, "Intervenciones", 90)
    _tarjetas(doc, [
        (numero(r.ejecutadas), "Ejecutadas", rgb("#1BAF7A")),
        (numero(r.programadas), "Programadas", rgb("#0369A1")),
        (numero(r.vencidas), "Programadas vencidas", rgb(COLOR_ESTADO["Crítico"])),
        (porcentaje(_pct(r.exitosas, r.ejecutadas)), "Ejecutadas con éxito", VERDE),
    ])
    _nota(doc, f"Costo ejecutado: {pesos(r.costo_ejecutado)}. Costo de lo que está programado: {pesos(r.costo_programado)}.")
    pendientes = sorted(
        (v for v in t.intervenciones if v.get("Estado") == "Programada"),
        key=lambda v: (v.get("Fecha programada") or date.max, str(v.get("Código") or "")),
    )
    if pendientes:
        doc.etiqueta("Intervenciones programadas")
        doc.tabla(
            ["Árbol", "Especie", "Tipo", "Fecha", "Costo estimado", "Vencida"],
            [[_texto(v.get("Código")), _texto(v.get("Especie")), _texto(v.get("Tipo")), _fecha(v.get("Fecha programada")),
              pesos(v.get("Costo estimado (COP)")), v.get("Vencida") or "No"] for v in pendientes[:40]],
            [0.16, 0.2, 0.22, 0.13, 0.17, 0.12], derecha={4},
            color_celda=lambda n, valor: TEXTO_ESTADO["Crítico"] if n == 5 and valor == "Sí" else None,
        )
        if len(pendientes) > 40:
            _nota(doc, f"Y {numero(len(pendientes) - 40)} más en el archivo de Excel.")

    prioritarios = sorted(
        (a for a in t.arboles if a.get("Prioritario") == "Sí"),
        key=lambda a: (-(a.get("Estado orden") or 0), -(a.get("Puntaje de riesgo") or 0), str(a.get("Código") or "")),
    )
    doc.seccion("Árboles prioritarios")
    if prioritarios:
        _nota(doc, "Críticos o con interferencia con redes eléctricas, tuberías o construcciones.")
        doc.tabla(
            ["Árbol", "Especie", "Zona", "Estado", "Interferencia", "Puntaje"],
            [[_texto(a.get("Código")), _texto(a.get("Especie")), _texto(a.get("Zona")), _texto(a.get("Estado")),
              _texto(a.get("Interferencia")), _texto(a.get("Puntaje de riesgo"), 2)] for a in prioritarios],
            [0.15, 0.2, 0.2, 0.12, 0.21, 0.12], derecha={5}, color_celda=_color_estado,
        )
    else:
        _nota(doc, "No hay árboles críticos ni con interferencia con infraestructura.")

    doc.nueva_pagina()
    doc.seccion("Inventario completo")
    if t.arboles:
        doc.tabla(
            ["Árbol", "Especie", "Zona", "Estado", "DAP (cm)", "Altura (m)", "CO2 (kg)", "Última insp."],
            [[_texto(a.get("Código")), _texto(a.get("Especie")), _texto(a.get("Zona")), _texto(a.get("Estado")),
              _texto(a.get("DAP (cm)"), 1), _texto(a.get("Altura (m)"), 1), _texto(a.get("CO2 almacenado (kg)"), 0),
              _fecha(a.get("Última inspección válida"))] for a in t.arboles],
            [0.14, 0.18, 0.17, 0.11, 0.1, 0.1, 0.1, 0.1], tamano=8.5, derecha={4, 5, 6}, color_celda=_color_estado,
        )
    else:
        _nota(doc, "Todavía no hay árboles registrados.")

    doc.seccion("Cómo se calcularon las cifras")
    doc.lista([
        "El estado de cada árbol es el de su última inspección que no fue anulada por un docente.",
        "Biomasa, carbono y CO2 se estiman con el DAP y la altura de esa inspección y el método de cálculo vigente "
        "en la institución.",
        "Un árbol queda sin inspección reciente cuando pasa la ventana de revisita de su institución sin una "
        "inspección válida.",
        "Las cifras son las mismas de Reportes y de la plantilla de Power BI descargadas el mismo día.",
        "El informe no trae datos personales: ni nombres de estudiantes o docentes, ni notas de texto libre "
        "(Ley 1581 de 2012).",
    ], tamano=9.5)
    return doc.pdf(f"Informe del arbolado · {r.alcance}")


# ======================================= Excel =======================================
def _formato_excel(columna) -> str | None:
    if columna.tipo == "fecha":
        return "dd/mm/yyyy"
    if columna.tipo == "entero":
        return "#,##0"
    if columna.tipo == "decimal":
        if columna.formato and columna.formato.startswith("$"):
            return '"$" #,##0'
        if columna.formato:
            return columna.formato.replace("#,0", "#,##0")
        return "#,##0.00"
    return None


class _Libro:
    """Libro de Excel con los estilos del informe (verde de la app, tablas con filtro y encabezado fijo)."""

    def __init__(self, r: Resumen):
        self.salida = io.BytesIO()
        self.wb = xlsxwriter.Workbook(self.salida, {
            "in_memory": True,
            "strings_to_formulas": False,   # un texto que empiece con "=" no se vuelve fórmula
            "strings_to_urls": False,
            "strings_to_numbers": False,
            "default_date_format": "dd/mm/yyyy",
        })
        self.wb.set_properties({
            "title": f"Informe del arbolado · {r.alcance}",
            "subject": "Inventario, estado, riesgo, inspecciones e intervenciones",
            "author": "Arbolado Escolar",
            "company": r.alcance,
            "comments": f"Corte al {fecha_corta(r.generado)}. Sin datos personales.",
        })
        self.r = r
        w = self.wb
        self.titulo = w.add_format({"bold": True, "font_size": 18, "font_color": "#FFFFFF", "bg_color": "#166534",
                                    "valign": "vcenter", "indent": 1})
        self.subtitulo = w.add_format({"font_size": 10, "font_color": "#DCFCE7", "bg_color": "#166534", "valign": "top",
                                       "indent": 1})
        self.franja = w.add_format({"bg_color": "#1BAF7A"})
        self.seccion = w.add_format({"bold": True, "font_size": 13, "font_color": "#166534", "bottom": 2,
                                     "bottom_color": "#BBF7D0"})
        self.valor = w.add_format({"bold": True, "font_size": 20, "font_color": "#13261C", "bg_color": "#F3F7ED",
                                   "valign": "bottom", "indent": 1})
        self.etiqueta = w.add_format({"font_size": 9, "font_color": "#5A6258", "bg_color": "#F3F7ED", "valign": "top",
                                      "indent": 1})
        self.texto = w.add_format({"font_size": 10, "font_color": "#13261C", "text_wrap": True, "valign": "top"})
        self.nota = w.add_format({"font_size": 9, "italic": True, "font_color": "#5A6258", "text_wrap": True,
                                  "valign": "top"})
        self.encabezado = w.add_format({"bold": True, "font_color": "#FFFFFF", "bg_color": "#166534", "text_wrap": True,
                                        "valign": "vcenter", "border": 1, "border_color": "#14532D"})
        self.colores = {
            "Crítico": w.add_format({"bg_color": "#FDE2E4", "font_color": "#9F1239"}),
            "En riesgo": w.add_format({"bg_color": "#FEF3C7", "font_color": "#92400E"}),
            "Sano": w.add_format({"bg_color": "#DCFCE7", "font_color": "#166534"}),
            "Sí": w.add_format({"bg_color": "#FDE2E4", "font_color": "#9F1239"}),
            "Anulada": w.add_format({"font_color": "#9CA39A", "italic": True}),
            "Pendiente": w.add_format({"bg_color": "#FEF3C7", "font_color": "#92400E"}),
        }
        self._formatos: dict[str, object] = {}
        # Tablas que alimentan los gráficos. Se escriben al final en su propia hoja (la última); los
        # gráficos solo guardan el nombre de esa hoja y las filas, así que pueden crearse antes.
        self.series: list[tuple[int, str, list[str], list[list]]] = []
        self.fila_datos = 0

    def formato(self, num_format: str | None):
        if not num_format:
            return None
        if num_format not in self._formatos:
            self._formatos[num_format] = self.wb.add_format({"num_format": num_format})
        return self._formatos[num_format]

    def cabecera(self, ws, titulo: str, subtitulo: str, columnas: int) -> None:
        ws.set_row(0, 34)
        ws.set_row(1, 22)
        ws.merge_range(0, 0, 0, max(columnas - 1, 1), titulo, self.titulo)
        ws.merge_range(1, 0, 1, max(columnas - 1, 1), subtitulo, self.subtitulo)
        ws.set_row(2, 4, self.franja)

    def tabla(self, nombre: str, titulo: str, nota: str, columnas: list[tuple[str, str | None]], filas: list[list],
              anchos: list[float] | None = None) -> None:
        """Hoja con una tabla de Excel: filtros, filas en bandas, encabezado fijo y formatos por columna.
        `columnas` = [(nombre, formato numérico)]."""
        ws = self.wb.add_worksheet(nombre)
        n = len(columnas)
        self.cabecera(ws, titulo, nota, n)
        ws.freeze_panes(4, 1)
        primera = 3
        ultima = primera + max(len(filas), 1)
        sin_tildes = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode()
        ws.add_table(primera, 0, ultima, n - 1, {
            "name": "".join(c for c in sin_tildes.title() if c.isalnum()) or "Tabla",
            "style": "Table Style Light 9",
            "data": [[None if v == "" else v for v in fila] for fila in filas] or [[None] * n],
            "columns": [{"header": c, "header_format": self.encabezado, "format": self.formato(fmt)} for c, fmt in columnas],
        })
        ws.set_row(primera, 32)
        for i, (c, fmt) in enumerate(columnas):
            if anchos:
                ancho = anchos[i]
            else:
                largos = [len(str(c))] + [len(_texto(fila[i])) for fila in filas[:400]]
                ancho = min(max(max(largos) + 2, 9), 42)
                # Lo que Excel muestra con formato es más largo que el valor (coordenadas, pesos, fechas).
                if fmt and "0.0000" in fmt:
                    ancho = max(ancho, 13)
                elif fmt and ("$" in fmt or "yyyy" in fmt):
                    ancho = max(ancho, 12)
            ws.set_column(i, i, ancho)
        for i, (c, _fmt) in enumerate(columnas):
            for clave in ("Estado", "Calificación", "Prioritario", "Revisita pendiente", "Vencida", "Revisión"):
                if c != clave or not filas:
                    continue
                for valor, formato in self.colores.items():
                    ws.conditional_format(primera + 1, i, ultima, i, {
                        "type": "cell", "criteria": "==", "value": f'"{valor}"', "format": formato})
            if c in ("CO2 almacenado (kg)", "Puntaje de riesgo") and filas:
                ws.conditional_format(primera + 1, i, ultima, i, {
                    "type": "data_bar", "bar_color": "#86EFAC" if c.startswith("CO2") else "#FCA5A5",
                    "bar_solid": True, "bar_no_border": True})
        ws.set_landscape()
        ws.set_paper(1)
        ws.fit_to_pages(1, 0)
        ws.repeat_rows(primera)
        ws.set_footer(f"&L&8Arbolado Escolar · {self.r.alcance}&R&8Página &P de &N")

    def serie(self, titulo: str, encabezados: list[str], filas: list[list]) -> tuple[int, int]:
        """Reserva lugar para una tabla pequeña en la hoja de datos de los gráficos y devuelve
        (primera, última) fila con datos."""
        primera = self.fila_datos + 2
        ultima = primera + len(filas) - 1
        self.series.append((self.fila_datos, titulo, encabezados, filas))
        self.fila_datos = max(ultima, primera) + 3
        return primera, ultima

    def cerrar(self) -> bytes:
        ws = self.wb.add_worksheet(HOJA_DATOS)
        ws.set_column(0, 0, 40)
        ws.set_column(1, 4, 14)
        for fila, titulo, encabezados, filas in self.series:
            ws.write_string(fila, 0, titulo, self.seccion)
            ws.write_row(fila + 1, 0, encabezados, self.encabezado)
            for i, valores in enumerate(filas):
                ws.write_row(fila + 2 + i, 0, valores)
        self.wb.close()
        return self.salida.getvalue()


def _grafico(libro: _Libro, tipo: str, titulo: str, subtipo: str | None = None):
    ch = libro.wb.add_chart({"type": tipo, **({"subtype": subtipo} if subtipo else {})})
    ch.set_title({"name": titulo, "name_font": {"size": 12, "bold": True, "color": "#13261C"}, "overlay": False})
    ch.set_chartarea({"border": {"color": "#E8E4D8"}, "fill": {"color": "#FFFFFF"}})
    ch.set_plotarea({"border": {"none": True}})
    ch.set_legend({"position": "bottom", "font": {"size": 9, "color": "#5A6258"}})
    return ch


def _ejes_barras(ch, valores: bool = False) -> None:
    """Barras horizontales: en XlsxWriter el eje Y es el de las categorías (vertical) y el X el de
    los valores. Las categorías van de arriba hacia abajo, en el orden de la tabla."""
    ch.set_y_axis({"reverse": True, "num_font": {"size": 9, "color": "#13261C"}, "line": {"color": "#E8E4D8"},
                   "major_gridlines": {"visible": False}})
    if valores:
        ch.set_x_axis({"major_gridlines": {"visible": True, "line": {"color": "#EEF2E8"}}, "num_font": {"size": 8, "color": "#5A6258"},
                       "line": {"none": True}, "min": 0})
    else:
        ch.set_x_axis({"visible": False, "major_gridlines": {"visible": False}, "min": 0})


def _ref(libro: _Libro, primera: int, ultima: int, columna: int) -> list:
    return [HOJA_DATOS, primera, columna, ultima, columna]


def _hoja_resumen(libro: _Libro, t: Tablas) -> None:
    r = libro.r
    ws = libro.wb.add_worksheet("Resumen")
    ws.hide_gridlines(2)
    ws.set_column(0, 0, 2)
    ws.set_column(1, 12, 12.5)
    ws.set_column(13, 13, 2)
    ws.merge_range(0, 0, 0, 13, f"Informe del arbolado · {r.alcance}", libro.titulo)
    ws.merge_range(1, 0, 1, 13, f"Corte al {fecha_larga(r.generado)} · Sin datos personales · Las cifras coinciden "
                   "con Reportes y con la plantilla de Power BI", libro.subtitulo)
    ws.set_row(0, 38)
    ws.set_row(1, 22)
    ws.set_row(2, 4, libro.franja)

    ws.merge_range(4, 1, 4, 12, "Indicadores principales", libro.seccion)
    tarjetas = [
        (r.total, "#,##0", "Árboles registrados"),
        (r.cuantos("Sano"), "#,##0", "Sanos"),
        (r.cuantos("En riesgo"), "#,##0", "En riesgo"),
        (r.cuantos("Crítico"), "#,##0", "Críticos"),
        (r.prioritarios, "#,##0", "Prioritarios (críticos o con interferencia)"),
        (r.sin_revisita, "#,##0", "Sin inspección reciente"),
        (r.especies, "#,##0", "Especies"),
        (round(r.co2_t, 2), "#,##0.0", "CO2 almacenado (toneladas)"),
        (r.inspecciones, "#,##0", "Inspecciones"),
        (None if r.pct_revisadas is None else r.pct_revisadas / 100, "0.0%", "Inspecciones revisadas"),
        (r.ejecutadas, "#,##0", "Intervenciones ejecutadas"),
        (r.vencidas, "#,##0", "Intervenciones vencidas"),
    ]
    formatos_valor: dict[str, object] = {}
    for n, (valor, fmt, etiqueta) in enumerate(tarjetas):
        fila = 6 + (n // 4) * 3
        col = 1 + (n % 4) * 3
        if fmt not in formatos_valor:
            formatos_valor[fmt] = libro.wb.add_format({
                "bold": True, "font_size": 20, "font_color": "#13261C", "bg_color": "#F3F7ED", "valign": "bottom",
                "align": "left", "indent": 1, "num_format": fmt})
        ws.set_row(fila, 30)
        ws.set_row(fila + 1, 18)
        ws.merge_range(fila, col, fila, col + 2, "", formatos_valor[fmt])
        if valor is None:
            ws.write_string(fila, col, "—", formatos_valor[fmt])
        else:
            ws.write_number(fila, col, valor, formatos_valor[fmt])
        ws.merge_range(fila + 1, col, fila + 1, col + 2, etiqueta, libro.etiqueta)

    ws.merge_range(16, 1, 16, 12, "Lectura rápida", libro.seccion)
    ws.set_row(17, 48)
    ws.merge_range(17, 1, 17, 12, lectura_estado(r), libro.texto)

    ws.merge_range(19, 1, 19, 12, "Gráficos", libro.seccion)
    graficos = _graficos(libro, t)
    for n, grafico in enumerate(graficos):
        fila = 20 + (n // 2) * 17
        col = 1 if n % 2 == 0 else 7
        ws.insert_chart(fila, col, grafico, {"x_offset": 4, "y_offset": 8, "object_position": 3})
    fila_nota = 20 + ((len(graficos) + 1) // 2) * 17 + 1
    ws.merge_range(fila_nota, 1, fila_nota, 12,
                   "Los datos de cada gráfico están en la hoja 'Datos de gráficos'. El inventario completo, las "
                   "inspecciones, las intervenciones y los hallazgos están en sus propias hojas, con filtros.",
                   libro.nota)
    ws.set_row(fila_nota, 30)
    ws.set_landscape()
    ws.set_paper(1)
    ws.fit_to_pages(1, 0)
    ws.set_footer(f"&L&8Arbolado Escolar · {r.alcance}&R&8Página &P de &N")
    ws.activate()


def _graficos(libro: _Libro, t: Tablas) -> list:
    r = libro.r
    salida = []
    tamano = {"width": 548, "height": 318}

    con_arboles = [(e, n) for e, n in r.por_estado if n]  # sin porciones vacías (evita el "0 %" encimado)
    primera, ultima = libro.serie("Estado del arbolado", ["Estado", "Árboles"], [[e, n] for e, n in con_arboles])
    if con_arboles:
        ch = _grafico(libro, "doughnut", "Estado del arbolado")
        ch.add_series({
            "name": "Árboles", "categories": _ref(libro, primera, ultima, 0), "values": _ref(libro, primera, ultima, 1),
            "points": [{"fill": {"color": COLOR_ESTADO[e]}, "border": {"color": "#FFFFFF", "width": 1.5}} for e, _n in con_arboles],
            "data_labels": {"value": True, "percentage": True, "separator": "\n", "font": {"bold": True, "color": "#FFFFFF"}},
        })
        ch.set_hole_size(55)
        ch.set_legend({"position": "right", "font": {"size": 10, "color": "#13261C"}})
        ch.set_size(tamano)
        salida.append(ch)

    primera, ultima = libro.serie("Especies más registradas", ["Especie", "Árboles"], [[e, n] for e, n in r.top_especies])
    if r.top_especies:
        ch = _grafico(libro, "bar", "Especies más registradas")
        ch.add_series({"name": "Árboles", "categories": _ref(libro, primera, ultima, 0), "values": _ref(libro, primera, ultima, 1),
                       "fill": {"color": "#166534"}, "gap": 60, "data_labels": {"value": True, "font": {"color": "#13261C"}}})
        _ejes_barras(ch)
        ch.set_legend({"none": True})
        ch.set_size(tamano)
        salida.append(ch)

    filas = [[zona] + [c.get(e, 0) for e in ESTADOS] for zona, c in r.zonas]
    primera, ultima = libro.serie("Estado por zona", ["Zona", *ESTADOS], filas)
    if filas:
        ch = _grafico(libro, "bar", "Estado por zona", "stacked")
        for n, estado in enumerate(ESTADOS, start=1):
            ch.add_series({"name": estado, "categories": _ref(libro, primera, ultima, 0), "values": _ref(libro, primera, ultima, n),
                           "fill": {"color": COLOR_ESTADO[estado]}, "gap": 55, "overlap": 100})
        _ejes_barras(ch, valores=True)
        ch.set_size(tamano)
        salida.append(ch)

    primera, ultima = libro.serie("Inspecciones por mes (sin las anuladas)", ["Mes", "Confirmadas", "Pendientes"],
                                  [[m, c, p] for m, c, p in r.por_mes])
    ch = _grafico(libro, "column", "Inspecciones de los últimos 12 meses", "stacked")
    for n, (nombre, color) in enumerate((("Confirmadas", COLOR_CONFIRMADA), ("Pendientes", COLOR_PENDIENTE)), start=1):
        ch.add_series({"name": nombre, "categories": _ref(libro, primera, ultima, 0), "values": _ref(libro, primera, ultima, n),
                       "fill": {"color": color}, "gap": 45, "overlap": 100})
    ch.set_x_axis({"num_font": {"size": 8, "color": "#5A6258"}, "line": {"color": "#E8E4D8"}})
    ch.set_y_axis({"major_gridlines": {"visible": True, "line": {"color": "#EEF2E8"}}, "num_font": {"size": 8, "color": "#5A6258"},
                   "line": {"none": True}, "min": 0})
    ch.set_size(tamano)
    salida.append(ch)

    primera, ultima = libro.serie("Árboles por clase de DAP", ["Clase de DAP", "Árboles"], [[c, n] for c, n in r.clases_dap])
    if r.clases_dap:
        ch = _grafico(libro, "column", "Árboles por clase de diámetro (DAP)")
        ch.add_series({"name": "Árboles", "categories": _ref(libro, primera, ultima, 0), "values": _ref(libro, primera, ultima, 1),
                       "fill": {"color": "#0369A1"}, "gap": 40, "data_labels": {"value": True, "font": {"color": "#13261C"}}})
        ch.set_x_axis({"num_font": {"size": 8, "color": "#5A6258"}, "line": {"color": "#E8E4D8"}})
        ch.set_y_axis({"visible": False, "major_gridlines": {"visible": False}, "min": 0})
        ch.set_legend({"none": True})
        ch.set_size(tamano)
        salida.append(ch)

    primera, ultima = libro.serie("Intervenciones por tipo", ["Tipo", "Intervenciones"], [[n, c] for n, c in r.tipos_intervencion])
    if r.tipos_intervencion:
        ch = _grafico(libro, "bar", "Intervenciones por tipo")
        ch.add_series({"name": "Intervenciones", "categories": _ref(libro, primera, ultima, 0), "values": _ref(libro, primera, ultima, 1),
                       "fill": {"color": "#1BAF7A"}, "gap": 60, "data_labels": {"value": True, "font": {"color": "#13261C"}}})
        _ejes_barras(ch)
        ch.set_legend({"none": True})
        ch.set_size(tamano)
        salida.append(ch)

    primera, ultima = libro.serie("Hallazgos más frecuentes (sin las inspecciones anuladas)", ["Hallazgo", "Veces"],
                                  [[h, n] for h, n in r.hallazgos])
    if r.hallazgos:
        ch = _grafico(libro, "bar", "Hallazgos más frecuentes")
        ch.add_series({"name": "Veces", "categories": _ref(libro, primera, ultima, 0), "values": _ref(libro, primera, ultima, 1),
                       "fill": {"color": COLOR_PENDIENTE}, "gap": 60, "data_labels": {"value": True, "font": {"color": "#13261C"}}})
        _ejes_barras(ch)
        ch.set_legend({"none": True})
        ch.set_size(tamano)
        salida.append(ch)
    return salida


def _columnas(t: Tablas, tabla: str, antes: list[str], quitar: set[str] = frozenset()) -> list:
    """Columnas visibles de la tabla de Power BI, con las del árbol al principio."""
    return [c for c in t.columnas[tabla] if c.nombre not in quitar and c.nombre not in antes]


def generar_excel(f: Fuente) -> bytes:
    t = tablas(f)
    r = resumen(t, f)
    libro = _Libro(r)
    _hoja_resumen(libro, t)

    sede = ["Sede"] if r.varias_sedes else []
    cols = _columnas(t, "Árboles", sede)
    libro.tabla(
        "Árboles", "Inventario de árboles",
        "Un árbol por fila con su estado según la última inspección válida, medidas, carbono y ubicación (WGS84).",
        [(c, None) for c in sede] + [(c.nombre, _formato_excel(c)) for c in cols],
        [[a.get(c) for c in sede] + [a.get(c.nombre) for c in cols] for a in t.arboles],
    )

    prioritarios = sorted(
        (a for a in t.arboles if a.get("Prioritario") == "Sí"),
        key=lambda a: (-(a.get("Estado orden") or 0), -(a.get("Puntaje de riesgo") or 0), str(a.get("Código") or "")),
    )
    campos_p = sede + ["Código", "Especie", "Zona", "Estado", "Interferencia", "Puntaje de riesgo", "Última inspección válida",
                       "Días desde la última inspección"]
    formato_p = {"Puntaje de riesgo": "#,##0.00", "Última inspección válida": "dd/mm/yyyy", "Días desde la última inspección": "#,##0"}
    libro.tabla(
        "Prioritarios", "Árboles prioritarios",
        "Críticos o con interferencia con redes eléctricas, tuberías o construcciones, del más urgente al menos urgente.",
        [(c, formato_p.get(c)) for c in campos_p],
        [[a.get(c) for c in campos_p] for a in prioritarios],
    )

    del_arbol = sede + ["Código", "Especie", "Zona"]
    cols = _columnas(t, "Inspecciones", del_arbol)
    libro.tabla(
        "Inspecciones", "Inspecciones",
        "Una visita por fila, también las anuladas (no cuentan para el estado). Solo dice de qué curso era quien inspeccionó.",
        [(c, None) for c in del_arbol] + [(c.nombre, _formato_excel(c)) for c in cols],
        [[i.get(c) for c in del_arbol] + [i.get(c.nombre) for c in cols] for i in t.inspecciones],
    )

    cols = _columnas(t, "Intervenciones", del_arbol, {"Fecha"})
    libro.tabla(
        "Intervenciones", "Intervenciones",
        "Mantenimiento programado, ejecutado o cancelado, con costos en pesos colombianos.",
        [(c, None) for c in del_arbol] + [(c.nombre, _formato_excel(c)) for c in cols],
        [[v.get(c) for c in del_arbol] + [v.get(c.nombre) for c in cols] for v in t.intervenciones],
    )

    campos_h = ["Código", "Especie", "Fecha", "Revisión", "Código del hallazgo", "Hallazgo", "Grupo"]
    libro.tabla(
        "Hallazgos", "Hallazgos fitosanitarios",
        "Un hallazgo de una inspección por fila. Los de inspecciones anuladas aparecen marcados.",
        [(c, "dd/mm/yyyy" if c == "Fecha" else None) for c in campos_h],
        [[h.get(c) for c in campos_h] for h in t.hallazgos],
    )

    if r.varias_sedes:
        campos_s = ["Sede", "Árboles", "Sanos", "En riesgo", "Críticos", "Prioritarios", "CO2 almacenado (t)", "Inspecciones"]
        libro.tabla(
            "Por institución", "Por institución", "Resumen de cada sede incluida en el informe.",
            [(c, None if c == "Sede" else ("#,##0.00" if c.startswith("CO2") else "#,##0")) for c in campos_s],
            [[s[c] for c in campos_s] for s in r.sedes],
        )

    notas = libro.wb.add_worksheet("Notas")
    notas.hide_gridlines(2)
    notas.set_column(0, 0, 2)
    notas.set_column(1, 1, 110)
    libro.cabecera(notas, "Cómo leer este informe", f"{r.alcance} · corte al {fecha_larga(r.generado)}", 2)
    lineas = [
        "El estado de cada árbol (sano, en riesgo o crítico) es el de su última inspección que no fue anulada por un docente.",
        "Biomasa, carbono y CO2 se estiman con el DAP y la altura de esa inspección y el método de cálculo de la institución. "
        "El CO2 es lo guardado en la madera durante la vida del árbol, no la captura de un año.",
        "Un árbol queda 'sin inspección reciente' cuando pasa la ventana de revisita de su institución sin una inspección válida.",
        "Prioritario: árbol crítico o con interferencia con redes eléctricas, tuberías o construcciones.",
        "Las cifras coinciden con Reportes y con la plantilla de Power BI descargadas el mismo día.",
        "Sin datos personales: no hay nombres de estudiantes ni de docentes ni notas de texto libre (Ley 1581 de 2012). "
        "Las inspecciones solo dicen el curso de quien las hizo.",
        "Coordenadas en WGS84 (EPSG:4326), las mismas de GPS y Google Maps.",
    ]
    for n, linea in enumerate(lineas):
        notas.set_row(4 + n, 32)
        notas.write_string(4 + n, 1, linea, libro.texto)
    return libro.cerrar()
