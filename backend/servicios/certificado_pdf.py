"""PDF del certificado de servicio social, escrito a mano (como el Shapefile de la exportación):
una página carta con las fuentes estándar Helvetica, que todo lector de PDF trae, y el código QR
de verificación dibujado con cuadros. El QR lo calcula `segno` (Python puro, sin dependencias).

El texto va en WinAnsiEncoding (cp1252), que cubre las tildes, la ñ, ¿ ¡ y °.
"""
from datetime import date

import segno

ANCHO, ALTO = 612, 792  # carta, en puntos
MARGEN = 60
VERDE = (0.086, 0.396, 0.204)  # #166534
TINTA = (0.075, 0.149, 0.110)  # #13261C
GRIS = (0.353, 0.384, 0.345)  # #5A6258
LINEA = (0.91, 0.894, 0.847)  # #E8E4D8
BLANCO = (1, 1, 1)

MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
         "octubre", "noviembre", "diciembre")


def fecha_larga(d: date) -> str:
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def horas_texto(horas: float) -> str:
    return f"{horas:.0f}" if float(horas).is_integer() else f"{horas:.1f}".replace(".", ",")


def codigo_legible(codigo: str) -> str:
    return f"{codigo[:4]}-{codigo[4:8]}-{codigo[8:]}"


def _ancho_aprox(texto: str, tamano: float, negrita: bool = False) -> float:
    """Ancho aproximado en Helvetica (para partir líneas sin pasarse del margen)."""
    total = 0.0
    for c in texto:
        if c == " ":
            total += 0.278
        elif c in "iljtfrI.,;:'!|()[]-":
            total += 0.30
        elif c in "mwMW":
            total += 0.85
        elif c.isupper():
            total += 0.70
        elif c.isdigit():
            total += 0.556
        else:
            total += 0.54
    return total * tamano * (1.06 if negrita else 1)


def partir(texto: str, tamano: float, ancho: float, negrita: bool = False) -> list[str]:
    lineas, actual = [], ""
    for palabra in texto.split():
        prueba = f"{actual} {palabra}".strip()
        if actual and _ancho_aprox(prueba, tamano, negrita) > ancho:
            lineas.append(actual)
            actual = palabra
        else:
            actual = prueba
    if actual:
        lineas.append(actual)
    return lineas


def partir_url(url: str, tamano: float, ancho: float) -> list[str]:
    """Una dirección larga en trozos que caben en el ancho, sin agregarle espacios."""
    trozos, actual = [], ""
    for c in url:
        if actual and _ancho_aprox(actual + c, tamano) > ancho:
            trozos.append(actual)
            actual = c
        else:
            actual += c
    return trozos + [actual] if actual else trozos


def _escapar(texto: str) -> bytes:
    crudo = texto.encode("cp1252", errors="replace")
    return crudo.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def _color(rgb: tuple[float, float, float], operador: str) -> bytes:
    return f"{rgb[0]:.3f} {rgb[1]:.3f} {rgb[2]:.3f} {operador}\n".encode()


class _Pagina:
    def __init__(self):
        self.ops: list[bytes] = []

    def texto(self, x: float, y: float, tamano: float, contenido: str, negrita: bool = False, color=TINTA):
        fuente = "F2" if negrita else "F1"
        self.ops.append(_color(color, "rg"))
        self.ops.append(f"BT /{fuente} {tamano} Tf {x:.1f} {y:.1f} Td (".encode() + _escapar(contenido) + b") Tj ET\n")

    def parrafo(self, x: float, y: float, tamano: float, contenido: str, ancho: float, interlineado: float | None = None,
                negrita: bool = False, color=TINTA) -> float:
        """Escribe el texto partido en líneas y devuelve la `y` donde terminó."""
        salto = interlineado or tamano * 1.4
        for linea in partir(contenido, tamano, ancho, negrita):
            self.texto(x, y, tamano, linea, negrita, color)
            y -= salto
        return y

    def rectangulo(self, x: float, y: float, ancho: float, alto: float, color):
        self.ops.append(_color(color, "rg"))
        self.ops.append(f"{x:.2f} {y:.2f} {ancho:.2f} {alto:.2f} re f\n".encode())

    def linea(self, x1: float, y1: float, x2: float, y2: float, color=LINEA, grosor: float = 0.8):
        self.ops.append(_color(color, "RG"))
        self.ops.append(f"{grosor} w {x1:.1f} {y1:.1f} m {x2:.1f} {y2:.1f} l S\n".encode())

    def qr(self, x: float, y: float, lado: float, contenido: str):
        """QR con cuatro módulos de margen blanco, como pide la norma para que lo lean las cámaras."""
        matriz = segno.make(contenido, error="m").matrix
        n = len(matriz)
        modulo = lado / (n + 8)
        self.rectangulo(x, y, lado, lado, BLANCO)
        self.ops.append(_color(TINTA, "rg"))
        for fila, valores in enumerate(matriz):
            yf = y + lado - (fila + 4 + 1) * modulo
            col = 0
            while col < n:  # cuadros oscuros seguidos de una fila en un solo rectángulo
                if valores[col]:
                    inicio = col
                    while col < n and valores[col]:
                        col += 1
                    self.ops.append(f"{x + (inicio + 4) * modulo:.2f} {yf:.2f} {(col - inicio) * modulo:.2f} {modulo:.2f} re\n".encode())
                else:
                    col += 1
        self.ops.append(b"f\n")

    def contenido(self) -> bytes:
        return b"".join(self.ops)


def _documento(contenido: bytes, titulo: str) -> bytes:
    objetos = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {ANCHO} {ALTO}] "
         "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>").encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        f"<< /Length {len(contenido)} >>\nstream\n".encode() + contenido + b"\nendstream",
        b"<< /Title (" + _escapar(titulo) + b") /Producer (Arbolado Escolar) >>",
    ]
    salida = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    posiciones = []
    for numero, cuerpo in enumerate(objetos, start=1):
        posiciones.append(len(salida))
        salida += f"{numero} 0 obj\n".encode() + cuerpo + b"\nendobj\n"
    inicio_xref = len(salida)
    salida += f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n".encode()
    for posicion in posiciones:
        salida += f"{posicion:010d} 00000 n \n".encode()
    salida += (f"trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R /Info {len(objetos)} 0 R >>\n"
               f"startxref\n{inicio_xref}\n%%EOF\n").encode()
    return bytes(salida)


def certificado_pdf(d: dict, url_verificacion: str) -> bytes:
    """d: institucion, codigo_dane, municipio, estudiante, curso, horas, meta, detalle (lista de
    (actividad, horas)), inicio, fin, firmante, cargo, emitido (fechas como date) y codigo."""
    p = _Pagina()
    ancho_util = ANCHO - 2 * MARGEN

    # Franja superior
    p.rectangulo(0, ALTO - 96, ANCHO, 96, VERDE)
    p.texto(MARGEN, ALTO - 44, 15, "CERTIFICADO DE SERVICIO SOCIAL ESTUDIANTIL OBLIGATORIO", negrita=True, color=BLANCO)
    p.texto(MARGEN, ALTO - 66, 10, "Resolución 4210 de 1996 del Ministerio de Educación Nacional", color=BLANCO)

    y = ALTO - 140
    y = p.parrafo(MARGEN, y, 15, d["institucion"], ancho_util, negrita=True)
    sede = " · ".join(x for x in (
        f"Código DANE de la sede: {d['codigo_dane']}" if d.get("codigo_dane") else None,
        d.get("municipio"),
    ) if x)
    if sede:
        p.texto(MARGEN, y + 4, 10, sede, color=GRIS)
        y -= 14

    y -= 26
    p.texto(MARGEN, y, 11, "Certifica que", color=GRIS)
    y -= 32
    y = p.parrafo(MARGEN, y, 22, d["estudiante"], ancho_util, negrita=True, interlineado=26)
    if d.get("curso"):
        p.texto(MARGEN, y + 6, 11, f"Curso {d['curso']}", color=GRIS)
        y -= 16

    y -= 18
    texto = (
        f"prestó {horas_texto(d['horas'])} horas de servicio social estudiantil obligatorio en el proyecto "
        f"ambiental de arbolado escolar de la institución, entre el {fecha_larga(d['inicio'])} y el "
        f"{fecha_larga(d['fin'])}, con actividades verificadas por los docentes. La intensidad mínima "
        f"exigida es de {horas_texto(d['meta'])} horas (Resolución 4210 de 1996, art. 6)."
    )
    y = p.parrafo(MARGEN, y, 11.5, texto, ancho_util, interlineado=17)

    # Horas por actividad
    y -= 14
    p.texto(MARGEN, y, 11, "Horas por actividad", negrita=True)
    y -= 10
    for actividad, horas in d["detalle"]:
        y -= 18
        p.linea(MARGEN, y + 13, ANCHO - MARGEN, y + 13)
        p.texto(MARGEN, y, 10.5, actividad)
        p.texto(ANCHO - MARGEN - 50, y, 10.5, f"{horas_texto(horas)} h", negrita=True)
    p.linea(MARGEN, y - 6, ANCHO - MARGEN, y - 6)

    # Firma
    y_firma = 250
    p.linea(MARGEN, y_firma + 18, MARGEN + 230, y_firma + 18, color=GRIS, grosor=0.6)
    p.texto(MARGEN, y_firma + 4, 9, "Firmado electrónicamente por", color=GRIS)
    p.texto(MARGEN, y_firma - 12, 12, d["firmante"], negrita=True)
    p.texto(MARGEN, y_firma - 27, 10, d["cargo"], color=GRIS)
    p.texto(MARGEN, y_firma - 44, 10, f"Fecha de emisión: {fecha_larga(d['emitido'])}", color=GRIS)

    # Verificación
    lado = 118
    p.qr(MARGEN - 6, 70, lado, url_verificacion)
    x = MARGEN + lado + 10
    p.texto(x, 172, 12, "Verifica este certificado", negrita=True)
    p.texto(x, 155, 10, f"Código: {codigo_legible(d['codigo'])}")
    yv = 139
    for trozo in partir_url(url_verificacion, 8.5, ANCHO - MARGEN - x):
        p.texto(x, yv, 8.5, trozo, color=VERDE)
        yv -= 11
    p.parrafo(
        x, yv - 6, 8.5,
        "Escanea el código o abre la dirección para comprobar que el certificado es válido. Documento "
        "preparado con Arbolado Escolar a partir de la bitácora validada por docentes; lo expide la "
        "institución educativa.",
        ANCHO - MARGEN - x, interlineado=11, color=GRIS,
    )
    return _documento(p.contenido(), f"Certificado de servicio social {codigo_legible(d['codigo'])}")
