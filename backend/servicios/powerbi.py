"""Plantillas de Power BI (.pbit) armadas en el servidor, con los datos adentro.

Un .pbit es un ZIP (paquete OPC) con el modelo tabular en JSON (DataModelSchema), el informe
(Report/Layout) y unos archivos de versión, todos en UTF-16 LE sin BOM. No guarda datos: al
abrirlo, Power BI Desktop corre la consulta de Power Query de cada tabla. Aquí cada consulta trae
sus propias filas en el texto (JSON comprimido con Deflate y en Base64, igual que "Especificar
datos"), así que la plantilla abre con doble clic, sin internet ni credenciales, y muestra el
informe ya armado.

Este módulo es genérico: tablas, medidas, relaciones, páginas y empaquetado. Lo que va en el
informe del arbolado está en servicios/informe_powerbi.py.

Todo lo que Power BI rechazaría al abrir se revisa aquí antes de armar el archivo (nombres
repetidos, campos que no existen, llaves repetidas del lado "uno" de una relación, valores que no
corresponden al tipo de la columna), porque en Power BI esos errores aparecen como un aviso
genérico y el informe queda a medias.
"""
import base64
import hashlib
import io
import json
import math
import re
import uuid
import zipfile
import zlib
from dataclasses import dataclass, field
from datetime import date, datetime

# Tipo de cada columna: (tipo en Power Query, tipo en el modelo).
TIPOS = {
    "texto": ("type text", "string"),
    "entero": ("Int64.Type", "int64"),
    "decimal": ("type number", "double"),
    "fecha": ("type date", "dateTime"),
}
FORMATO_FECHA = "dd/mm/yyyy"
ANCHO_PAGINA, ALTO_PAGINA = 1280, 720

# Versiones del formato. Son las de Power BI Desktop de abril de 2026 (2.153): las versiones
# posteriores abren el archivo y lo actualizan solas, y así también sirve en equipos sin la última.
VERSION_PAQUETE = "1.28"
VERSION_INFORME = "5.72"
VERSION_TEMA = {"visual": "2.8.0", "report": "3.2.0", "page": "2.3.1"}
NIVEL_COMPATIBILIDAD = 1550

_ESPACIO = uuid.UUID("6f0c1c52-5d0e-4a8e-9a57-2f3f3c1b9e41")
_CAMPO = re.compile(r"^(?P<tabla>[^\[\]]+)\[(?P<campo>[^\[\]]+)\]$")


class PlantillaInvalida(ValueError):
    """La plantilla tiene algo que Power BI no abriría."""


def _guid(*partes: str) -> str:
    """Identificador estable: el mismo modelo genera siempre el mismo archivo."""
    return str(uuid.uuid5(_ESPACIO, "/".join(partes)))


def _hex20(*partes: str) -> str:
    return hashlib.sha1("/".join(partes).encode("utf-8")).hexdigest()[:20]


# =================================== Modelo ===================================
@dataclass
class Columna:
    nombre: str
    tipo: str = "texto"
    formato: str | None = None
    oculta: bool = False
    resumir: str = "none"            # none, sum, average, min, max, count, distinctCount
    categoria: str | None = None     # Latitude, Longitude, WebUrl…
    ordenar_por: str | None = None   # otra columna de la misma tabla
    descripcion: str | None = None


@dataclass
class Medida:
    nombre: str
    expresion: str
    formato: str | None = None
    descripcion: str | None = None


@dataclass
class Tabla:
    nombre: str
    columnas: list[Columna]
    filas: list[list]
    medidas: list[Medida] = field(default_factory=list)
    # No hay opción de "marcar como tabla de fechas": con la columna de fecha como llave, Power BI
    # Desktop 2.159 rechaza la plantilla al cargarla ("referencia cíclica durante la evaluación").
    descripcion: str | None = None

    def columna(self, nombre: str) -> Columna | None:
        return next((c for c in self.columnas if c.nombre == nombre), None)

    def indice(self, nombre: str) -> int:
        return next(i for i, c in enumerate(self.columnas) if c.nombre == nombre)


@dataclass
class Relacion:
    """Relación de muchos a uno: cada fila de `tabla_muchos` apunta a una de `tabla_uno`."""

    tabla_muchos: str
    columna_muchos: str
    tabla_uno: str
    columna_uno: str


def _valor(columna: Columna, valor, tabla: str):
    """El valor tal como va en el JSON de la consulta, ya revisado contra el tipo de la columna."""
    if valor is None:
        return None
    lugar = f"{tabla}[{columna.nombre}]"
    if columna.tipo == "texto":
        return str(valor)
    if columna.tipo == "entero":
        if isinstance(valor, bool) or not isinstance(valor, int):
            if isinstance(valor, float) and valor.is_integer():
                return int(valor)
            raise PlantillaInvalida(f"{lugar} espera un entero y recibió {valor!r}")
        return valor
    if columna.tipo == "decimal":
        if isinstance(valor, bool):
            raise PlantillaInvalida(f"{lugar} espera un número y recibió {valor!r}")
        try:
            numero = float(valor)
        except (TypeError, ValueError):
            raise PlantillaInvalida(f"{lugar} espera un número y recibió {valor!r}") from None
        if not math.isfinite(numero):
            raise PlantillaInvalida(f"{lugar} recibió {valor!r}, que Power BI no puede cargar")
        return numero
    if columna.tipo == "fecha":
        if isinstance(valor, datetime):
            return valor.date().isoformat()
        if isinstance(valor, date):
            return valor.isoformat()
        try:
            return date.fromisoformat(str(valor)[:10]).isoformat()
        except ValueError:
            raise PlantillaInvalida(f"{lugar} espera una fecha y recibió {valor!r}") from None
    raise PlantillaInvalida(f"{lugar}: tipo desconocido {columna.tipo!r}")


def _filas_json(tabla: Tabla) -> list[list]:
    ancho = len(tabla.columnas)
    filas = []
    for n, fila in enumerate(tabla.filas, start=1):
        if len(fila) != ancho:
            raise PlantillaInvalida(f"La fila {n} de {tabla.nombre} tiene {len(fila)} valores y la tabla {ancho} columnas")
        filas.append([_valor(c, v, tabla.nombre) for c, v in zip(tabla.columnas, fila)])
    return filas


def _texto_m(texto: str) -> str:
    return '"' + texto.replace('"', '""') + '"'


def expresion_m(tabla: Tabla) -> list[str]:
    """Consulta de Power Query que devuelve la tabla con sus filas incrustadas."""
    datos = json.dumps(_filas_json(tabla), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compresor = zlib.compressobj(9, zlib.DEFLATED, -15)  # Deflate sin cabecera, como Compression.Deflate
    b64 = base64.b64encode(compresor.compress(datos) + compresor.flush()).decode("ascii")
    trozos = [b64[i:i + 120] for i in range(0, len(b64), 120)]
    lineas = ["let", "    Datos = Json.Document(Binary.Decompress(Binary.FromText(Text.Combine({"]
    lineas += [f'        "{t}"' + ("," if i < len(trozos) - 1 else "") for i, t in enumerate(trozos)]
    lineas.append("    }), BinaryEncoding.Base64), Compression.Deflate), 65001),")
    nombres = ", ".join(_texto_m(c.nombre) for c in tabla.columnas)
    lineas.append(f"    Tabla = Table.FromRows(Datos, {{{nombres}}}),")
    tipos = ", ".join(f"{{{_texto_m(c.nombre)}, {TIPOS[c.tipo][0]}}}" for c in tabla.columnas)
    # Cultura fija: las fechas van como AAAA-MM-DD y los decimales con punto.
    lineas.append(f'    Tipos = Table.TransformColumnTypes(Tabla, {{{tipos}}}, "en-US")')
    lineas += ["in", "    Tipos"]
    return lineas


def _validar_modelo(tablas: list[Tabla], relaciones: list[Relacion]) -> None:
    nombres = [t.nombre for t in tablas]
    if len(set(nombres)) != len(nombres):
        raise PlantillaInvalida("Hay dos tablas con el mismo nombre")
    columnas_modelo: set[str] = set()
    medidas_modelo: set[str] = set()
    for t in tablas:
        if not t.columnas:
            raise PlantillaInvalida(f"La tabla {t.nombre} no tiene columnas")
        propias = [c.nombre for c in t.columnas]
        if len(set(propias)) != len(propias):
            raise PlantillaInvalida(f"La tabla {t.nombre} repite una columna")
        for c in t.columnas:
            if c.tipo not in TIPOS:
                raise PlantillaInvalida(f"{t.nombre}[{c.nombre}]: tipo desconocido {c.tipo!r}")
            if "[" in c.nombre or "]" in c.nombre:
                raise PlantillaInvalida(f"{t.nombre}[{c.nombre}]: el nombre no puede llevar corchetes")
            if c.ordenar_por:
                otra = t.columna(c.ordenar_por)
                if otra is None or otra is c:
                    raise PlantillaInvalida(f"{t.nombre}[{c.nombre}] se ordena por una columna que no existe")
                # Power BI exige que cada valor tenga un solo valor de orden.
                i, j = t.indice(c.nombre), t.indice(c.ordenar_por)
                pares: dict = {}
                for fila in t.filas:
                    if pares.setdefault(fila[i], fila[j]) != fila[j]:
                        raise PlantillaInvalida(f"{t.nombre}[{c.nombre}] = {fila[i]!r} tiene dos valores de orden")
        columnas_modelo.update(propias)
        for m in t.medidas:
            if m.nombre in medidas_modelo:
                raise PlantillaInvalida(f"La medida {m.nombre!r} está repetida")
            medidas_modelo.add(m.nombre)
    if choque := medidas_modelo & columnas_modelo:
        raise PlantillaInvalida(f"Medidas con el nombre de una columna: {sorted(choque)}")
    por_nombre = {t.nombre: t for t in tablas}
    for r in relaciones:
        muchos, uno = por_nombre.get(r.tabla_muchos), por_nombre.get(r.tabla_uno)
        if muchos is None or uno is None:
            raise PlantillaInvalida(f"Relación con una tabla que no existe: {r}")
        c_muchos, c_uno = muchos.columna(r.columna_muchos), uno.columna(r.columna_uno)
        if c_muchos is None or c_uno is None:
            raise PlantillaInvalida(f"Relación con una columna que no existe: {r}")
        if c_muchos.tipo != c_uno.tipo:
            raise PlantillaInvalida(f"Relación entre columnas de distinto tipo: {r}")
        llaves = [_valor(c_uno, f[uno.indice(c_uno.nombre)], uno.nombre) for f in uno.filas]
        if None in llaves or len(set(llaves)) != len(llaves):
            raise PlantillaInvalida(f"{uno.nombre}[{c_uno.nombre}] tiene llaves vacías o repetidas")


def _columna_tmsl(tabla: Tabla, c: Columna) -> dict:
    salida = {
        "name": c.nombre,
        "dataType": TIPOS[c.tipo][1],
        "sourceColumn": c.nombre,
        "lineageTag": _guid(tabla.nombre, "columna", c.nombre),
        "summarizeBy": c.resumir,
    }
    formato = c.formato or (FORMATO_FECHA if c.tipo == "fecha" else "0" if c.tipo == "entero" else None)
    if formato:
        salida["formatString"] = formato
    if c.oculta:
        salida["isHidden"] = True
    if c.categoria:
        salida["dataCategory"] = c.categoria
    if c.ordenar_por:
        salida["sortByColumn"] = c.ordenar_por
    if c.descripcion:
        salida["description"] = c.descripcion
    anotaciones = [{"name": "SummarizationSetBy", "value": "Automatic"}]
    if c.tipo == "fecha":
        anotaciones.append({"name": "UnderlyingDateTimeDataType", "value": "Date"})
    salida["annotations"] = anotaciones
    return salida


def esquema(tablas: list[Tabla], relaciones: list[Relacion], cultura: str = "es-CO") -> dict:
    """DataModelSchema: el modelo tabular en TMSL."""
    _validar_modelo(tablas, relaciones)
    salida = []
    for t in tablas:
        tabla = {"name": t.nombre, "lineageTag": _guid(t.nombre)}
        if t.descripcion:
            tabla["description"] = t.descripcion
        tabla["columns"] = [_columna_tmsl(t, c) for c in t.columnas]
        tabla["partitions"] = [{"name": t.nombre, "mode": "import", "source": {"type": "m", "expression": expresion_m(t)}}]
        if t.medidas:
            tabla["measures"] = [
                {
                    "name": m.nombre,
                    "expression": m.expresion,
                    **({"formatString": m.formato} if m.formato else {}),
                    **({"description": m.descripcion} if m.descripcion else {}),
                    "lineageTag": _guid(t.nombre, "medida", m.nombre),
                }
                for m in t.medidas
            ]
        tabla["annotations"] = [{"name": "PBI_ResultType", "value": "Table"}]
        salida.append(tabla)
    return {
        "name": _guid("modelo", *(t.nombre for t in tablas)),
        "compatibilityLevel": NIVEL_COMPATIBILIDAD,
        "model": {
            "culture": cultura,
            "dataAccessOptions": {"legacyRedirects": True, "returnErrorValuesAsNull": True},
            "defaultPowerBIDataSourceVersion": "powerBI_V3",
            "sourceQueryCulture": cultura,
            "tables": salida,
            "relationships": [
                {
                    "name": _guid("relacion", r.tabla_muchos, r.columna_muchos, r.tabla_uno, r.columna_uno),
                    "fromTable": r.tabla_muchos,
                    "fromColumn": r.columna_muchos,
                    "toTable": r.tabla_uno,
                    "toColumn": r.columna_uno,
                }
                for r in relaciones
            ],
            "annotations": [
                {"name": "PBI_QueryOrder", "value": json.dumps([t.nombre for t in tablas], ensure_ascii=False)},
                # Sin tablas de fechas automáticas: el modelo ya trae su calendario.
                {"name": "__PBI_TimeIntelligenceEnabled", "value": "0"},
            ],
        },
    }


# =================================== Informe ===================================
def _literal(valor) -> str:
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, int):
        return f"{valor}L"
    if isinstance(valor, float):
        return f"{int(valor)}D" if valor.is_integer() else f"{valor!r}D"
    return "'" + str(valor).replace("'", "''") + "'"


def _expr(valor) -> dict:
    return {"expr": {"Literal": {"Value": _literal(valor)}}}


def _color(color: str) -> dict:
    return {"solid": {"color": _expr(color)}}


@dataclass
class _Campo:
    tabla: str
    nombre: str
    es_medida: bool

    @property
    def ref(self) -> str:
        return f"{self.tabla}.{self.nombre}"

    def expresion(self, fuente: str | None = None, entidad: bool = False) -> dict:
        origen = {"Entity": self.tabla} if entidad else {"Source": fuente}
        return {"Measure" if self.es_medida else "Column": {"Expression": {"SourceRef": origen}, "Property": self.nombre}}


class Informe:
    """Páginas del informe. Los campos se escriben como en DAX: "Árboles[Especie]"."""

    def __init__(self, tablas: list[Tabla], tema: dict):
        self.tablas = {t.nombre: t for t in tablas}
        self.tema = tema
        self.paginas: list[Pagina] = []

    def campo(self, texto: str) -> _Campo:
        coincide = _CAMPO.match(texto)
        if not coincide:
            raise PlantillaInvalida(f"Campo mal escrito: {texto!r} (se espera Tabla[Campo])")
        tabla = self.tablas.get(coincide["tabla"])
        if tabla is None:
            raise PlantillaInvalida(f"El informe usa la tabla {coincide['tabla']!r}, que no está en el modelo")
        nombre = coincide["campo"]
        if tabla.columna(nombre):
            return _Campo(tabla.nombre, nombre, False)
        if any(m.nombre == nombre for m in tabla.medidas):
            return _Campo(tabla.nombre, nombre, True)
        raise PlantillaInvalida(f"El informe usa {texto}, que no existe en el modelo")

    def pagina(self, nombre: str) -> "Pagina":
        pagina = Pagina(self, nombre, len(self.paginas))
        self.paginas.append(pagina)
        return pagina

    def layout(self) -> dict:
        nombre_tema = self.tema["name"]
        config = {
            "version": VERSION_INFORME,
            "themeCollection": {"customTheme": {"name": f"{nombre_tema}.json", "version": VERSION_TEMA, "type": 1}},
            "activeSectionIndex": 0,
            "defaultDrillFilterOtherVisuals": True,
            "linguisticSchemaSyncVersion": 0,
            "settings": {
                "useNewFilterPaneExperience": True,
                "allowChangeFilterTypes": True,
                "useStylableVisualContainerHeader": True,
                "queryLimitOption": 6,
                "useEnhancedTooltips": True,
                "exportDataMode": 1,
                "useDefaultAggregateDisplayName": True,
            },
            "objects": {"section": [{"properties": {"verticalAlignment": _expr("Top")}}]},
        }
        return {
            "id": 0,
            "resourcePackages": [{
                "resourcePackage": {
                    "name": "RegisteredResources",
                    "type": 1,
                    "items": [{"type": 201, "path": f"{nombre_tema}.json", "name": f"{nombre_tema}.json"}],
                    "disabled": False,
                }
            }],
            "sections": [p.seccion() for p in self.paginas],
            "config": json.dumps(config, ensure_ascii=False, separators=(",", ":")),
            "layoutOptimization": 0,
        }


Caja = tuple[float, float, float, float]  # x, y, ancho, alto


class Pagina:
    def __init__(self, informe: Informe, nombre: str, orden: int):
        self.informe, self.nombre, self.orden = informe, nombre, orden
        self.visuales: list[dict] = []

    # ------------------------------------------------------------ piezas comunes
    def _consulta(self, campos: list[_Campo], orden: list[tuple[_Campo, bool]] = ()) -> dict:
        fuentes: dict[str, str] = {}
        for c in campos:
            fuentes.setdefault(c.tabla, f"t{len(fuentes)}")
        consulta = {
            "Version": 2,
            "From": [{"Name": alias, "Entity": tabla, "Type": 0} for tabla, alias in fuentes.items()],
            "Select": [{**c.expresion(fuentes[c.tabla]), "Name": c.ref, "NativeReferenceName": c.nombre} for c in campos],
        }
        if orden:
            for c, _ in orden:
                if c.ref not in {x.ref for x in campos}:
                    raise PlantillaInvalida(f"{self.nombre}: se ordena por {c.ref}, que no está en el visual")
            consulta["OrderBy"] = [
                {"Direction": 2 if descendente else 1, "Expression": c.expresion(fuentes[c.tabla])} for c, descendente in orden
            ]
        return consulta

    def _filtro(self, texto: str, valores: list, excluir: bool = False) -> dict:
        c = self.informe.campo(texto)
        if c.es_medida:
            raise PlantillaInvalida(f"{self.nombre}: el filtro por {texto} debe ser una columna")
        condicion = {
            "In": {
                "Expressions": [c.expresion("f")],
                "Values": [[{"Literal": {"Value": _literal(v)}}] for v in valores],
            }
        }
        if excluir:
            condicion = {"Not": {"Expression": condicion}}
        return {
            "name": _hex20(self.nombre, "filtro", texto, str(len(self.visuales))),
            "expression": c.expresion(entidad=True),
            "filter": {"Version": 2, "From": [{"Name": "f", "Entity": c.tabla, "Type": 0}], "Where": [{"Condition": condicion}]},
            "type": "Categorical",
            "howCreated": 1,
        }

    def _colores(self, texto: str | None, colores: dict[str, str] | None) -> list[dict]:
        if not texto or not colores:
            return []
        c = self.informe.campo(texto)
        return [
            {
                "properties": {"fill": {"solid": {"color": _expr(color)}}},
                "selector": {"data": [{"scopeId": {"Comparison": {
                    "ComparisonKind": 0,
                    "Left": c.expresion(entidad=True),
                    "Right": {"Literal": {"Value": _literal(valor)}},
                }}}]},
            }
            for valor, color in colores.items()
        ]

    def _agregar(self, caja: Caja, visual: dict, filtros: list[dict] = (), titulo: str | None = None) -> None:
        x, y, ancho, alto = caja
        if x < 0 or y < 0 or x + ancho > ANCHO_PAGINA or y + alto > ALTO_PAGINA:
            raise PlantillaInvalida(f"{self.nombre}: un visual se sale de la página ({caja})")
        z = len(self.visuales) * 1000
        if titulo is not None:
            visual.setdefault("vcObjects", {})["title"] = [{"properties": {"show": _expr(True), "text": _expr(titulo)}}]
        visual["drillFilterOtherVisuals"] = True
        nombre = _hex20(self.nombre, str(len(self.visuales)), visual["visualType"])
        config = {
            "name": nombre,
            "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": z, "width": ancho, "height": alto, "tabOrder": z}}],
            "singleVisual": visual,
        }
        self.visuales.append({
            "x": x, "y": y, "z": z, "width": ancho, "height": alto,
            "config": json.dumps(config, ensure_ascii=False, separators=(",", ":")),
            "filters": json.dumps(list(filtros), ensure_ascii=False, separators=(",", ":")),
            "tabOrder": z,
        })

    # ------------------------------------------------------------ visuales
    def texto(self, caja: Caja, parrafos: list[tuple[str, dict]]) -> None:
        """Cuadro de texto. Cada párrafo: (texto, estilo), con estilo como {"fontSize": "20pt",
        "fontWeight": "bold", "color": "#13261C"}."""
        visual = {
            "visualType": "textbox",
            "objects": {"general": [{"properties": {"paragraphs": [
                {"textRuns": [{"value": texto, "textStyle": estilo}]} for texto, estilo in parrafos
            ]}}]},
        }
        self._agregar(caja, visual)

    def tarjeta(self, caja: Caja, medida: str) -> None:
        c = self.informe.campo(medida)
        visual = {
            "visualType": "card",
            "projections": {"Values": [{"queryRef": c.ref}]},
            "prototypeQuery": self._consulta([c]),
            # Unidades "Ninguna": la cifra completa ($ 1.145.000) y no "$ 1 mill.".
            "objects": {"labels": [{"properties": {"labelDisplayUnits": _expr(1.0)}}]},
        }
        self._agregar(caja, visual)

    def barras(
        self, caja: Caja, titulo: str, categoria: str, valor: str, *, serie: str | None = None, horizontal: bool = True,
        ordenar_por_categoria: bool = False, colores: dict[str, str] | None = None, filtros: list[dict] = (),
    ) -> None:
        """Barras (horizontal) o columnas. Con `serie` quedan apiladas; `colores` fija el color de
        cada valor de la serie (o de la categoría si no hay serie)."""
        cat, val = self.informe.campo(categoria), self.informe.campo(valor)
        campos = [cat] + ([self.informe.campo(serie)] if serie else []) + [val]
        tipo = ("barChart" if serie else "clusteredBarChart") if horizontal else ("columnChart" if serie else "clusteredColumnChart")
        proyecciones = {"Category": [{"queryRef": cat.ref, "active": True}], "Y": [{"queryRef": val.ref}]}
        if serie:
            proyecciones["Series"] = [{"queryRef": self.informe.campo(serie).ref}]
        orden = [(cat, False)] if ordenar_por_categoria else [(val, True)]
        visual = {"visualType": tipo, "projections": proyecciones, "prototypeQuery": self._consulta(campos, orden), "hasDefaultSort": True}
        if puntos := self._colores(serie or categoria, colores):
            visual["objects"] = {"dataPoint": puntos}
        self._agregar(caja, visual, filtros, titulo)

    def dona(self, caja: Caja, titulo: str, categoria: str, valor: str, *, colores: dict[str, str] | None = None,
             filtros: list[dict] = ()) -> None:
        cat, val = self.informe.campo(categoria), self.informe.campo(valor)
        visual = {
            "visualType": "donutChart",
            "projections": {"Category": [{"queryRef": cat.ref, "active": True}], "Y": [{"queryRef": val.ref}]},
            "prototypeQuery": self._consulta([cat, val], [(val, True)]),
            "hasDefaultSort": True,
        }
        if puntos := self._colores(categoria, colores):
            visual["objects"] = {"dataPoint": puntos}
        self._agregar(caja, visual, filtros, titulo)

    def tabla(self, caja: Caja, titulo: str, campos: list[str], *, orden: tuple[str, bool] | None = None,
              filtros: list[dict] = ()) -> None:
        """Tabla. `orden`: (campo, descendente)."""
        lista = [self.informe.campo(c) for c in campos]
        orden_q = [(self.informe.campo(orden[0]), orden[1])] if orden else []
        visual = {
            "visualType": "tableEx",
            "projections": {"Values": [{"queryRef": c.ref} for c in lista]},
            "prototypeQuery": self._consulta(lista, orden_q),
        }
        self._agregar(caja, visual, filtros, titulo)

    def dispersion(self, caja: Caja, titulo: str, detalle: str, x: str, y: str, *, serie: str | None = None) -> None:
        """Un punto por cada valor de `detalle`; `x` y `y` deben ser medidas."""
        det, cx, cy = self.informe.campo(detalle), self.informe.campo(x), self.informe.campo(y)
        if not (cx.es_medida and cy.es_medida):
            raise PlantillaInvalida(f"{self.nombre}: los ejes de la dispersión deben ser medidas")
        campos = [det] + ([self.informe.campo(serie)] if serie else []) + [cx, cy]
        proyecciones = {"Category": [{"queryRef": det.ref, "active": True}], "X": [{"queryRef": cx.ref}], "Y": [{"queryRef": cy.ref}]}
        if serie:
            proyecciones["Series"] = [{"queryRef": self.informe.campo(serie).ref}]
        visual = {"visualType": "scatterChart", "projections": proyecciones, "prototypeQuery": self._consulta(campos)}
        self._agregar(caja, visual, (), titulo)

    def segmentador(self, caja: Caja, campo: str, *, modo: str = "Dropdown", titulo: str | None = None) -> None:
        """Segmentador. modo: Dropdown, Basic (lista) o Between (rango de fechas o números)."""
        c = self.informe.campo(campo)
        if c.es_medida:
            raise PlantillaInvalida(f"{self.nombre}: el segmentador debe usar una columna")
        visual = {
            "visualType": "slicer",
            "projections": {"Values": [{"queryRef": c.ref, "active": True}]},
            "prototypeQuery": self._consulta([c]),
            "objects": {"data": [{"properties": {"mode": _expr(modo)}}]},
        }
        if titulo:
            visual["objects"]["header"] = [{"properties": {"text": _expr(titulo)}}]
        self._agregar(caja, visual)

    def filtro(self, campo: str, valores: list, *, excluir: bool = False) -> dict:
        """Filtro para pasar a un visual: solo esos valores (o todos menos esos)."""
        return self._filtro(campo, valores, excluir)

    def seccion(self) -> dict:
        return {
            "id": self.orden,
            "name": _hex20("pagina", self.nombre),
            "displayName": self.nombre,
            "filters": "[]",
            "ordinal": self.orden,
            "visualContainers": self.visuales,
            "config": "{}",
            "displayOption": 1,
            "width": ANCHO_PAGINA,
            "height": ALTO_PAGINA,
        }


# =================================== Paquete ===================================
def _utf16(texto: str) -> bytes:
    return texto.encode("utf-16-le")


def _json(objeto, **opciones) -> str:
    return json.dumps(objeto, ensure_ascii=False, **opciones)


def plantilla(tablas: list[Tabla], relaciones: list[Relacion], informe: Informe, *, cultura: str = "es-CO") -> bytes:
    """El archivo .pbit completo."""
    modelo = esquema(tablas, relaciones, cultura)
    nombre_tema = f"Report/StaticResources/RegisteredResources/{informe.tema['name']}.json"
    tipos = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="json" ContentType="" />'
        '<Override PartName="/Version" ContentType="" />'
        '<Override PartName="/DataModelSchema" ContentType="" />'
        '<Override PartName="/Report/Layout" ContentType="" />'
        '<Override PartName="/Settings" ContentType="application/json" />'
        '<Override PartName="/Metadata" ContentType="application/json" />'
        "</Types>"
    )
    ajustes = {
        "Version": 4,
        "ReportSettings": {},
        "QueriesSettings": {"TypeDetectionEnabled": True, "RelationshipImportEnabled": False, "Version": "2.153.777.0"},
    }
    metadatos = {"Version": 5, "AutoCreatedRelationships": [], "CreatedFrom": "Cloud", "CreatedFromRelease": "2026.04"}
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Version", _utf16(VERSION_PAQUETE))
        z.writestr("[Content_Types].xml", tipos.encode("utf-8-sig"))
        z.writestr("DataModelSchema", _utf16(_json(modelo, indent=2)))
        z.writestr("Report/Layout", _utf16(_json(informe.layout(), separators=(",", ":"))))
        z.writestr("Settings", _utf16(_json(ajustes, separators=(",", ":"))))
        z.writestr("Metadata", _utf16(_json(metadatos, separators=(",", ":"))))
        z.writestr(nombre_tema, _json(informe.tema, separators=(",", ":")).encode("utf-8"))
    return salida.getvalue()
