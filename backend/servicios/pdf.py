"""PDF escrito a mano, sin librerías: páginas carta con las fuentes estándar Helvetica (todo lector
de PDF las trae) en WinAnsiEncoding (cp1252: tildes, ñ, ¿ ¡ y °). Lo usan el certificado de
servicio social, el informe anual del PRAE y las fichas de las guías de clase.

`Pagina` dibuja en coordenadas fijas; `Documento` además va bajando por la página y abre una nueva
cuando se acaba el espacio, con pie de página numerado.
"""
from datetime import date

import segno

ANCHO, ALTO = 612, 792  # carta, en puntos
MARGEN = 60
MARGEN_INFERIOR = 72
VERDE = (0.086, 0.396, 0.204)  # #166534
TINTA = (0.075, 0.149, 0.110)  # #13261C
GRIS = (0.353, 0.384, 0.345)  # #5A6258
LINEA = (0.91, 0.894, 0.847)  # #E8E4D8
FONDO = (0.953, 0.969, 0.929)  # #F3F7ED
BLANCO = (1, 1, 1)

MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
         "octubre", "noviembre", "diciembre")


def fecha_larga(d: date) -> str:
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def fecha_corta(d: date) -> str:
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


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
    """Parte el texto en líneas que caben en el ancho; respeta los saltos de línea del texto."""
    lineas: list[str] = []
    for bloque in str(texto).splitlines() or [""]:
        actual = ""
        for palabra in bloque.split():
            prueba = f"{actual} {palabra}".strip()
            if actual and _ancho_aprox(prueba, tamano, negrita) > ancho:
                lineas.append(actual)
                actual = palabra
            else:
                actual = prueba
        lineas.append(actual)
    while lineas and not lineas[-1]:
        lineas.pop()
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


class Pagina:
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


def documento_pdf(paginas: list[bytes], titulo: str) -> bytes:
    """Arma el archivo: catálogo, árbol de páginas, las dos fuentes, una página y su contenido por
    cada elemento de `paginas`, e información del documento."""
    n = len(paginas)
    primera_pagina = 5  # 1 catálogo, 2 páginas, 3 y 4 fuentes
    kids = " ".join(f"{primera_pagina + 2 * i} 0 R" for i in range(n))
    objetos = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]
    for i, contenido in enumerate(paginas):
        objetos.append((
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {ANCHO} {ALTO}] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {primera_pagina + 2 * i + 1} 0 R >>"
        ).encode())
        objetos.append(f"<< /Length {len(contenido)} >>\nstream\n".encode() + contenido + b"\nendstream")
    objetos.append(b"<< /Title (" + _escapar(titulo) + b") /Producer (Arbolado Escolar) >>")

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


class Documento:
    """Texto que fluye de página en página, con secciones, párrafos, listas y tablas."""

    def __init__(self, pie: str):
        self.pie = pie
        self.paginas: list[Pagina] = []
        self.ancho = ANCHO - 2 * MARGEN
        self._nueva()

    def _nueva(self):
        self.p = Pagina()
        self.paginas.append(self.p)
        self.y = ALTO - MARGEN

    def espacio(self, alto: float):
        if self.y - alto < MARGEN_INFERIOR:
            self._nueva()

    def nueva_pagina(self):
        """Empieza en una página nueva (p. ej. la parte que se imprime para los estudiantes)."""
        self._nueva()

    def renglones(self, cantidad: int, separacion: float = 22):
        """Líneas en blanco para escribir a mano."""
        for _ in range(cantidad):
            self.espacio(separacion)
            self.y -= separacion
            self.p.linea(MARGEN, self.y + 6, ANCHO - MARGEN, self.y + 6, color=LINEA, grosor=0.7)
        self.y -= 6

    def portada(self, titulo: str, subtitulo: str):
        """Franja verde en la parte de arriba de la primera página."""
        self.p.rectangulo(0, ALTO - 96, ANCHO, 96, VERDE)
        self.p.parrafo(MARGEN, ALTO - 44, 14, titulo, self.ancho, interlineado=17, negrita=True, color=BLANCO)
        self.p.texto(MARGEN, ALTO - 78, 10, subtitulo, color=BLANCO)
        self.y = ALTO - 130

    def seccion(self, titulo: str):
        self.espacio(56)
        self.y -= 10
        self.p.texto(MARGEN, self.y, 13, titulo, negrita=True, color=VERDE)
        self.y -= 8
        self.p.linea(MARGEN, self.y, ANCHO - MARGEN, self.y)
        self.y -= 18

    def parrafo(self, texto: str, tamano: float = 10.5, negrita: bool = False, color=TINTA, sangria: float = 0):
        salto = tamano * 1.45
        for linea in partir(texto, tamano, self.ancho - sangria, negrita):
            self.espacio(salto)
            self.p.texto(MARGEN + sangria, self.y, tamano, linea, negrita, color)
            self.y -= salto
        self.y -= 4

    def etiqueta(self, texto: str):
        self.espacio(34)
        self.p.texto(MARGEN, self.y, 9, texto.upper(), negrita=True, color=GRIS)
        self.y -= 14

    def campo(self, etiqueta: str, valor: str | None):
        self.etiqueta(etiqueta)
        self.parrafo(valor or "Sin diligenciar.", color=TINTA if valor else GRIS)

    def lista(self, items: list[str], tamano: float = 10.5):
        for item in items:
            lineas = partir(item, tamano, self.ancho - 14)
            for i, linea in enumerate(lineas):
                self.espacio(tamano * 1.45)
                if i == 0:
                    self.p.texto(MARGEN, self.y, tamano, "•", color=VERDE, negrita=True)
                self.p.texto(MARGEN + 14, self.y, tamano, linea)
                self.y -= tamano * 1.45
        self.y -= 4

    def tabla(self, encabezados: list[str], filas: list[list[str]], anchos: list[float], tamano: float = 9,
              alto_minimo: float = 0):
        """`anchos` en fracciones del ancho útil. Cada celda se parte en líneas; si una fila no cabe,
        pasa a la página siguiente y repite el encabezado. `alto_minimo` deja espacio para escribir
        a mano (firmas)."""
        columnas = [a * self.ancho for a in anchos]
        salto = tamano * 1.35

        def encabezado():
            self.espacio(salto + 10)
            alto = salto + 6
            self.p.rectangulo(MARGEN, self.y - alto + salto - 2, self.ancho, alto, FONDO)
            x = MARGEN
            for titulo, ancho in zip(encabezados, columnas):
                self.p.texto(x + 4, self.y, tamano, titulo, negrita=True, color=GRIS)
                x += ancho
            self.y -= alto + 2

        encabezado()
        for fila in filas:
            celdas = [partir(str(valor), tamano, ancho - 8) or [""] for valor, ancho in zip(fila, columnas)]
            alto = max(max(len(c) for c in celdas) * salto + 6, alto_minimo)
            if self.y - alto < MARGEN_INFERIOR:
                self._nueva()
                encabezado()
            x = MARGEN
            for lineas, ancho in zip(celdas, columnas):
                y = self.y
                for linea in lineas:
                    self.p.texto(x + 4, y, tamano, linea)
                    y -= salto
                x += ancho
            self.y -= alto
            self.p.linea(MARGEN, self.y + salto - 2, ANCHO - MARGEN, self.y + salto - 2)
        self.y -= 8

    def firmas(self, cargos: list[str]):
        """Líneas para firmar (p. ej. rector y coordinador del PRAE)."""
        self.espacio(90)
        self.y -= 50
        ancho = (self.ancho - 30 * (len(cargos) - 1)) / len(cargos)
        for i, cargo in enumerate(cargos):
            x = MARGEN + i * (ancho + 30)
            self.p.linea(x, self.y, x + ancho, self.y, color=GRIS, grosor=0.6)
            self.p.texto(x, self.y - 14, 9.5, cargo, color=GRIS)
        self.y -= 30

    def pdf(self, titulo: str) -> bytes:
        total = len(self.paginas)
        for i, pagina in enumerate(self.paginas, start=1):
            pagina.linea(MARGEN, 46, ANCHO - MARGEN, 46)
            pagina.texto(MARGEN, 32, 8, self.pie, color=GRIS)
            pagina.texto(ANCHO - MARGEN - 60, 32, 8, f"Página {i} de {total}", color=GRIS)
        return documento_pdf([p.contenido() for p in self.paginas], titulo)
