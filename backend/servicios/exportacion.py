"""Exportación abierta: inventario, inspecciones e intervenciones en CSV, GeoJSON y Shapefile.

Pensado para que la institución se lleve sus datos cuando quiera y para entregarlos a la
Secretaría, la alcaldía o la autoridad ambiental (Ley 2476 de 2025, art. 16 par. 2):

- Coordenadas en WGS84 (EPSG:4326), como las toma el GPS del teléfono.
- Cada sede con su código DANE y su código DIVIPOLA, para cruzar con el SIMAT.
- Sin datos personales: no van nombres de estudiantes ni de responsables, ni notas de texto
  libre (pueden traer nombres). Cada fila se identifica con el código del árbol.
"""
import csv
import io
import json
import struct
import zipfile
from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True)
class Campo:
    nombre: str
    shp: str          # nombre en el Shapefile (máximo 10 caracteres)
    tipo: str         # texto, numero o fecha
    descripcion: str
    unidad: str = ""
    largo: int = 80   # ancho del campo en el Shapefile
    decimales: int = 0


CAMPOS_ARBOLES: list[Campo] = [
    Campo("codigo", "CODIGO", "texto", "Código único del árbol en su institución", largo=20),
    Campo("institucion", "INSTITUC", "texto", "Nombre de la institución o sede"),
    Campo("codigo_dane_sede", "COD_DANE", "texto", "Código DANE de la sede (12 dígitos)", largo=12),
    Campo("divipola", "DIVIPOLA", "texto", "Código DIVIPOLA del municipio (5 dígitos)", largo=5),
    Campo("municipio", "MUNICIPIO", "texto", "Municipio", largo=60),
    Campo("zona", "ZONA", "texto", "Zona dentro de la sede", largo=60),
    Campo("zona_otra", "ZONA_OTRA", "texto", "Descripción de la zona cuando es Otra"),
    Campo("especie_id", "ESP_ID", "numero", "Identificador de la especie en el catálogo", largo=6),
    Campo("especie_comun", "ESP_COMUN", "texto", "Nombre común de la especie"),
    Campo("especie_cientifica", "ESP_CIENT", "texto", "Nombre científico de la especie", largo=100),
    Campo("lat", "LAT", "numero", "Latitud (WGS84)", "grados", 12, 7),
    Campo("lng", "LON", "numero", "Longitud (WGS84)", "grados", 12, 7),
    Campo("dap_cm", "DAP_CM", "numero", "Diámetro del tronco a la altura del pecho", "cm", 8, 2),
    Campo("altura_m", "ALTURA_M", "numero", "Altura total", "m", 8, 2),
    Campo("copa_m", "COPA_M", "numero", "Diámetro de la copa", "m", 8, 2),
    Campo("etapa", "ETAPA", "texto", "Etapa de desarrollo (Plántula, Juvenil, Adulto, Senescente)", largo=20),
    Campo("interferencia", "INTERFER", "texto", "Interferencia con infraestructura", largo=60),
    Campo("interferencia_otra", "INTERF_OTR", "texto", "Descripción de la interferencia cuando es Otra"),
    Campo("estado", "ESTADO", "texto", "Estado según la última inspección válida (sano, riesgo, critico)", largo=10),
    Campo("puntaje_riesgo", "PUNT_RIESG", "numero", "Puntaje de riesgo del método de cálculo", largo=8, decimales=2),
    Campo("n_inspecciones", "N_INSPEC", "numero", "Número de inspecciones del árbol", largo=6),
    Campo("ultima_inspeccion", "ULT_INSPEC", "fecha", "Fecha de la última inspección (AAAA-MM-DD)", largo=10),
    Campo("ultima_revision", "ULT_REVIS", "texto", "Revisión docente de la última inspección (pendiente, confirmada, anulada)", largo=12),
    Campo("registrado_en", "REGISTRO", "fecha", "Fecha de registro del árbol (AAAA-MM-DD)", largo=10),
]

CAMPOS_INSPECCIONES: list[Campo] = [
    Campo("codigo_arbol", "CODIGO", "texto", "Código del árbol inspeccionado", largo=20),
    Campo("institucion", "INSTITUC", "texto", "Nombre de la institución o sede"),
    Campo("codigo_dane_sede", "COD_DANE", "texto", "Código DANE de la sede", largo=12),
    Campo("fecha", "FECHA", "fecha", "Fecha y hora de la inspección (ISO 8601, hora de Colombia)", largo=25),
    Campo("origen", "ORIGEN", "texto", "registro (primera inspección) o seguimiento", largo=12),
    Campo("lat", "LAT", "numero", "Latitud tomada en la visita (WGS84)", "grados", 12, 7),
    Campo("lng", "LON", "numero", "Longitud tomada en la visita (WGS84)", "grados", 12, 7),
    Campo("precision_gps_m", "PREC_GPS", "numero", "Precisión del GPS", "m", 8, 1),
    Campo("dap_cm", "DAP_CM", "numero", "Diámetro del tronco a la altura del pecho", "cm", 8, 2),
    Campo("altura_m", "ALTURA_M", "numero", "Altura total", "m", 8, 2),
    Campo("copa_m", "COPA_M", "numero", "Diámetro de la copa", "m", 8, 2),
    Campo("etapa", "ETAPA", "texto", "Etapa de desarrollo", largo=20),
    Campo("interferencia", "INTERFER", "texto", "Interferencia con infraestructura", largo=60),
    Campo("calificacion", "ESTADO", "texto", "Calificación de la inspección (sano, riesgo, critico)", largo=10),
    Campo("puntaje_riesgo", "PUNT_RIESG", "numero", "Puntaje de riesgo", largo=8, decimales=2),
    Campo("estado_revision", "REVISION", "texto", "Revisión docente (pendiente, confirmada, anulada)", largo=12),
    Campo("revisado_en", "REVISADO", "fecha", "Fecha de la revisión docente", largo=25),
    Campo("hallazgos", "HALLAZGOS", "texto", "Códigos de los hallazgos fitosanitarios, separados por ;", largo=200),
    Campo("insectos", "INSECTOS", "texto", "Agente biótico FB-01: insectos (tipo)", largo=40),
    Campo("insectos_sev", "INSECT_SEV", "numero", "Severidad de insectos (0 a 4)", largo=2),
    Campo("enfermedad", "ENFERMEDAD", "texto", "Agente biótico FB-02: enfermedad (tipo)", largo=40),
    Campo("enfermedad_sev", "ENFERM_SEV", "numero", "Severidad de la enfermedad (0 a 4)", largo=2),
    Campo("muestra_lab", "MUESTRA", "texto", "FB-03: se tomó muestra de laboratorio (si o no)", largo=2),
    Campo("hemiparasitas", "HEMIPARAS", "texto", "FB-04: hemiparásitas", largo=40),
    Campo("pct_hemiparasitas", "PCT_HEMIP", "numero", "Porcentaje de copa con hemiparásitas", "%", 6, 1),
    Campo("bejucos", "BEJUCOS", "numero", "FB-05: severidad de bejucos (0 a 4)", largo=2),
    Campo("epifitas", "EPIFITAS", "texto", "FB-06: epífitas observadas, separadas por ;", largo=120),
]

CAMPOS_INTERVENCIONES: list[Campo] = [
    Campo("codigo_arbol", "CODIGO", "texto", "Código del árbol intervenido", largo=20),
    Campo("institucion", "INSTITUC", "texto", "Nombre de la institución o sede"),
    Campo("codigo_dane_sede", "COD_DANE", "texto", "Código DANE de la sede", largo=12),
    Campo("tipo", "TIPO", "texto", "Código del tipo de intervención (poda, riego, tratamiento…)", largo=40),
    Campo("estado", "ESTADO", "texto", "programada, ejecutada o cancelada", largo=12),
    Campo("fecha_programada", "F_PROGRAM", "fecha", "Fecha programada (AAAA-MM-DD)", largo=10),
    Campo("fecha_ejecucion", "F_EJECUC", "fecha", "Fecha de ejecución (AAAA-MM-DD)", largo=10),
    Campo("costo_estimado", "COSTO_EST", "numero", "Costo estimado", "COP", 14, 2),
    Campo("costo_real", "COSTO_REAL", "numero", "Costo real", "COP", 14, 2),
    Campo("resultado", "RESULTADO", "texto", "exitosa, parcial o sin_efecto", largo=12),
]

CONJUNTOS: dict[str, tuple[str, list[Campo]]] = {
    "arboles": ("Inventario de árboles (uno por fila, con su estado actual)", CAMPOS_ARBOLES),
    "inspecciones": ("Historial de inspecciones (una visita por fila)", CAMPOS_INSPECCIONES),
    "intervenciones": ("Mantenimiento realizado, programado o cancelado", CAMPOS_INTERVENCIONES),
}


# ==================================== Filas ========================================
def _fecha(valor) -> str | None:
    if not valor:
        return None
    return str(valor)[:10]


def _lista(valor) -> str | None:
    if valor is None:
        return None
    if isinstance(valor, (list, tuple)):
        return ";".join(str(v) for v in valor) or None
    return str(valor)


def _sede(institucion_id: str | None, instituciones: dict[str, dict]) -> dict:
    inst = instituciones.get(institucion_id or "", {})
    return {
        "institucion": inst.get("nombre") or inst.get("nombre_corto"),
        "codigo_dane_sede": inst.get("codigo_dane"),
        "divipola": inst.get("divipola"),
        "municipio": inst.get("municipio"),
    }


def filas_arboles(arboles: list[dict], instituciones: dict[str, dict]) -> list[dict]:
    filas = []
    for a in sorted(arboles, key=lambda a: str(a.get("codigo") or "")):
        filas.append({
            "codigo": a.get("codigo"),
            **_sede(a.get("institucion_id"), instituciones),
            "zona": a.get("zona"),
            "zona_otra": a.get("zona_otra"),
            "especie_id": a.get("especie_id"),
            "especie_comun": a.get("nombre_comun"),
            "especie_cientifica": a.get("nombre_cientifico"),
            "lat": a.get("lat"),
            "lng": a.get("lng"),
            "dap_cm": a.get("dap_cm"),
            "altura_m": a.get("altura_m"),
            "copa_m": a.get("copa_m"),
            "etapa": a.get("etapa"),
            "interferencia": a.get("interferencia"),
            "interferencia_otra": a.get("interferencia_otra"),
            "estado": a.get("estado"),
            "puntaje_riesgo": a.get("puntaje_riesgo"),
            "n_inspecciones": a.get("n_inspecciones"),
            "ultima_inspeccion": _fecha(a.get("ultima_inspeccion_en")),
            "ultima_revision": a.get("ultima_revision"),
            "registrado_en": _fecha(a.get("registrado_en")),
        })
    return filas


def filas_inspecciones(
    inspecciones: list[dict], arboles: dict[str, dict], observaciones: dict[str, list[str]], instituciones: dict[str, dict]
) -> list[dict]:
    filas = []
    for i in sorted(inspecciones, key=lambda i: (str(arboles.get(str(i["arbol_id"]), {}).get("codigo") or ""), str(i.get("fecha")))):
        arbol = arboles.get(str(i["arbol_id"]))
        if not arbol:
            continue
        filas.append({
            "codigo_arbol": arbol.get("codigo"),
            "institucion": _sede(arbol.get("institucion_id"), instituciones)["institucion"],
            "codigo_dane_sede": _sede(arbol.get("institucion_id"), instituciones)["codigo_dane_sede"],
            "fecha": str(i.get("fecha") or "") or None,
            "origen": i.get("origen"),
            "lat": i.get("lat"),
            "lng": i.get("lng"),
            "precision_gps_m": i.get("precision_gps_m"),
            "dap_cm": i.get("dap_cm"),
            "altura_m": i.get("altura_m"),
            "copa_m": i.get("copa_m"),
            "etapa": i.get("etapa"),
            "interferencia": i.get("interferencia"),
            "calificacion": i.get("calificacion"),
            "puntaje_riesgo": i.get("puntaje_riesgo"),
            "estado_revision": i.get("estado_revision"),
            "revisado_en": str(i.get("revisado_en") or "") or None,
            "hallazgos": _lista(sorted(observaciones.get(str(i["id"]), []))),
            "insectos": i.get("insectos"),
            "insectos_sev": i.get("insectos_sev"),
            "enfermedad": i.get("enfermedad"),
            "enfermedad_sev": i.get("enfermedad_sev"),
            "muestra_lab": None if i.get("muestra_lab") is None else ("si" if i.get("muestra_lab") else "no"),
            "hemiparasitas": i.get("hemiparasitas"),
            "pct_hemiparasitas": i.get("pct_hemiparasitas"),
            "bejucos": i.get("bejucos"),
            "epifitas": _lista(i.get("epifitas")),
        })
    return filas


def filas_intervenciones(intervenciones: list[dict], arboles: dict[str, dict], instituciones: dict[str, dict]) -> list[dict]:
    filas = []
    for v in sorted(intervenciones, key=lambda v: (str(arboles.get(str(v["arbol_id"]), {}).get("codigo") or ""), str(v.get("creado_en")))):
        arbol = arboles.get(str(v["arbol_id"]))
        if not arbol:
            continue
        sede = _sede(arbol.get("institucion_id"), instituciones)
        filas.append({
            "codigo_arbol": arbol.get("codigo"),
            "institucion": sede["institucion"],
            "codigo_dane_sede": sede["codigo_dane_sede"],
            "tipo": v.get("tipo_codigo"),
            "estado": v.get("estado"),
            "fecha_programada": _fecha(v.get("fecha_programada")),
            "fecha_ejecucion": _fecha(v.get("fecha_ejecucion")),
            "costo_estimado": v.get("costo_estimado"),
            "costo_real": v.get("costo_real"),
            "resultado": v.get("resultado"),
        })
    return filas


# ==================================== Formatos =====================================
def _texto(valor) -> str:
    if valor is None:
        return ""
    if isinstance(valor, bool):
        return "si" if valor else "no"
    if isinstance(valor, float):
        return str(int(valor)) if valor.is_integer() else repr(valor)
    return str(valor)


def a_csv(filas: list[dict], campos: list[Campo]) -> bytes:
    """CSV separado por comas, UTF-8 con BOM (Excel reconoce las tildes) y punto decimal."""
    salida = io.StringIO()
    escritor = csv.writer(salida, lineterminator="\r\n")
    escritor.writerow([c.nombre for c in campos])
    for fila in filas:
        escritor.writerow([_texto(fila.get(c.nombre)) for c in campos])
    return salida.getvalue().encode("utf-8-sig")


def a_geojson(filas: list[dict], campos: list[Campo]) -> bytes:
    """FeatureCollection de puntos (RFC 7946: coordenadas [longitud, latitud] en WGS84)."""
    propiedades = [c.nombre for c in campos if c.nombre not in ("lat", "lng")]
    entidades = []
    for f in filas:
        if f.get("lat") is None or f.get("lng") is None:
            continue
        entidades.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(f["lng"]), float(f["lat"])]},
            "properties": {p: f.get(p) for p in propiedades},
        })
    return json.dumps({"type": "FeatureCollection", "features": entidades}, ensure_ascii=False, default=str).encode("utf-8")


PRJ_WGS84 = (
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],'
    'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
)


def _recortar_utf8(texto: str, largo: int) -> bytes:
    """Bytes UTF-8 de máximo `largo`, sin partir un carácter."""
    datos = texto.encode("utf-8")
    if len(datos) <= largo:
        return datos
    datos = datos[:largo]
    while datos:
        try:
            datos.decode("utf-8")
            return datos
        except UnicodeDecodeError:
            datos = datos[:-1]
    return datos


def _dbf(filas: list[dict], campos: list[Campo], hoy: date) -> bytes:
    largo_registro = 1 + sum(c.largo for c in campos)
    largo_cabecera = 32 + 32 * len(campos) + 1
    cabecera = struct.pack(
        "<BBBBIHH20x", 0x03, hoy.year - 1900, hoy.month, hoy.day, len(filas), largo_cabecera, largo_registro
    )
    descriptores = b""
    for c in campos:
        tipo = b"N" if c.tipo == "numero" else b"C"
        descriptores += struct.pack("<11sc4xBB14x", c.shp.encode("ascii"), tipo, c.largo, c.decimales if tipo == b"N" else 0)
    registros = bytearray()
    for f in filas:
        registros += b" "
        for c in campos:
            valor = f.get(c.nombre)
            if c.tipo == "numero":
                if valor is None or valor == "":
                    texto = b""
                else:
                    numero = float(valor)
                    texto = (f"{numero:.{c.decimales}f}" if c.decimales else str(int(round(numero)))).encode("ascii")
                registros += texto[:c.largo].rjust(c.largo, b" ")
            else:
                registros += _recortar_utf8(_texto(valor), c.largo).ljust(c.largo, b" ")
    return cabecera + descriptores + bytes([0x0D]) + bytes(registros) + bytes([0x1A])


def a_shapefile(filas: list[dict], campos: list[Campo], nombre: str, hoy: date) -> bytes:
    """Shapefile de puntos (WGS84) en un ZIP: .shp, .shx, .dbf, .prj y .cpg (UTF-8)."""
    puntos = [f for f in filas if f.get("lat") is not None and f.get("lng") is not None]
    xs = [float(f["lng"]) for f in puntos] or [0.0]
    ys = [float(f["lat"]) for f in puntos] or [0.0]
    caja = (min(xs), min(ys), max(xs), max(ys))

    def cabecera(largo_bytes: int) -> bytes:
        return struct.pack(">7i", 9994, 0, 0, 0, 0, 0, largo_bytes // 2) + struct.pack("<2i4d4d", 1000, 1, *caja, 0.0, 0.0, 0.0, 0.0)

    registros_shp = bytearray()
    indice = bytearray()
    desplazamiento = 50  # en palabras de 16 bits: la cabecera mide 100 bytes
    for numero, f in enumerate(puntos, start=1):
        contenido = struct.pack("<i2d", 1, float(f["lng"]), float(f["lat"]))
        registros_shp += struct.pack(">2i", numero, len(contenido) // 2) + contenido
        indice += struct.pack(">2i", desplazamiento, len(contenido) // 2)
        desplazamiento += (8 + len(contenido)) // 2
    shp = cabecera(100 + len(registros_shp)) + bytes(registros_shp)
    shx = cabecera(100 + len(indice)) + bytes(indice)
    dbf = _dbf(puntos, [c for c in campos if c.nombre not in ("lat", "lng")] + [c for c in campos if c.nombre in ("lat", "lng")], hoy)

    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{nombre}.shp", shp)
        z.writestr(f"{nombre}.shx", shx)
        z.writestr(f"{nombre}.dbf", dbf)
        z.writestr(f"{nombre}.prj", PRJ_WGS84)
        z.writestr(f"{nombre}.cpg", "UTF-8")
    return salida.getvalue()


def diccionario() -> list[dict]:
    """Descripción de cada campo exportado (también va en el paquete completo)."""
    return [
        {
            "conjunto": clave,
            "campo": c.nombre,
            "nombre_shapefile": c.shp,
            "tipo": c.tipo,
            "unidad": c.unidad,
            "descripcion": c.descripcion,
        }
        for clave, (_desc, campos) in CONJUNTOS.items()
        for c in campos
    ]


def a_csv_diccionario() -> bytes:
    campos = ["conjunto", "campo", "nombre_shapefile", "tipo", "unidad", "descripcion"]
    salida = io.StringIO()
    escritor = csv.writer(salida, lineterminator="\r\n")
    escritor.writerow(campos)
    for fila in diccionario():
        escritor.writerow([fila[c] for c in campos])
    return salida.getvalue().encode("utf-8-sig")


def leeme(alcance: str, generado: datetime, cuentas: dict[str, int]) -> str:
    lineas = [
        "Arbolado Escolar - Exportación de datos",
        "",
        f"Alcance: {alcance}",
        f"Generado: {generado.isoformat(timespec='minutes')} (hora de Colombia)",
        "",
        "Archivos:",
        f"- arboles.csv y arboles.geojson: inventario ({cuentas.get('arboles', 0)} árboles), uno por fila.",
        "- arboles_shp/: el mismo inventario como Shapefile de puntos (abrir arboles.shp en QGIS o ArcGIS).",
        f"- inspecciones.csv: historial de visitas ({cuentas.get('inspecciones', 0)} inspecciones).",
        f"- intervenciones.csv: mantenimiento ({cuentas.get('intervenciones', 0)} intervenciones).",
        "- diccionario.csv: qué significa cada columna, su tipo y su unidad.",
        "",
        "Notas:",
        "- Coordenadas en WGS84 (EPSG:4326), tomadas con el GPS del teléfono.",
        "- CSV separado por comas, UTF-8 y punto decimal.",
        "- No incluye datos personales (nombres de estudiantes, responsables ni notas de texto libre),",
        "  según la Ley 1581 de 2012. Cada fila se identifica con el código del árbol.",
        "- El estado de cada árbol sale de su última inspección válida; las inspecciones pendientes",
        "  de revisión docente se marcan en la columna estado_revision.",
        "- Biomasa, carbono y CO2 son estimaciones; las fórmulas están en la configuración del método.",
    ]
    return "\r\n".join(lineas) + "\r\n"
