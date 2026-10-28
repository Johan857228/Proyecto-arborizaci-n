"""Documento de Word (.docx) escrito a mano, sin librerías: un ZIP con el XML mínimo de Office Open
XML (ECMA-376). Lo usa el informe anual de la Secretaría para que se pueda seguir editando en
Word, LibreOffice o Google Docs.

Solo lo necesario: títulos, párrafos (con negrita, cursiva o gris), tablas con encabezado y saltos
de página. Letra Arial 11 y página carta con márgenes de 2,5 cm.
"""
import io
import zipfile
from xml.sax.saxutils import escape

_TIPOS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>"""

_RELACIONES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>"""

_RELACIONES_DOC = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

_ESTILOS = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{_W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="166534"/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="166534"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>"""


def _texto(contenido: str, negrita: bool = False, cursiva: bool = False, gris: bool = False, tamano: int | None = None) -> str:
    propiedades = "".join([
        "<w:b/>" if negrita else "", "<w:i/>" if cursiva else "", '<w:color w:val="5A6258"/>' if gris else "",
        f'<w:sz w:val="{tamano * 2}"/>' if tamano else "",
    ])
    rpr = f"<w:rPr>{propiedades}</w:rPr>" if propiedades else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(contenido)}</w:t></w:r>'


class Docx:
    def __init__(self, titulo: str):
        self.titulo = titulo
        self.cuerpo: list[str] = []

    def titulo_principal(self, texto: str):
        self.cuerpo.append(f'<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>{_texto(texto)}</w:p>')

    def encabezado(self, texto: str, nivel: int = 1):
        self.cuerpo.append(f'<w:p><w:pPr><w:pStyle w:val="Heading{nivel}"/></w:pPr>{_texto(texto)}</w:p>')

    def parrafo(self, texto: str, negrita: bool = False, cursiva: bool = False, gris: bool = False, tamano: int | None = None):
        # Cada línea del texto es un párrafo: así se conservan los saltos que escribió la persona.
        for linea in (texto or "").split("\n") or [""]:
            self.cuerpo.append(f"<w:p>{_texto(linea, negrita, cursiva, gris, tamano)}</w:p>")

    def tabla(self, encabezados: list[str], filas: list[list[str]], anchos: list[float]):
        """`anchos` en fracciones del ancho útil (16,6 cm)."""
        total = 9360  # ancho útil en vigésimos de punto
        columnas = [int(a * total) for a in anchos]
        rejilla = "".join(f'<w:gridCol w:w="{c}"/>' for c in columnas)

        def celda(valor: str, ancho: int, encabezado: bool) -> str:
            sombra = '<w:shd w:val="clear" w:color="auto" w:fill="F3F7ED"/>' if encabezado else ""
            return (f'<w:tc><w:tcPr><w:tcW w:w="{ancho}" w:type="dxa"/>{sombra}</w:tcPr>'
                    f'<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>{_texto(str(valor), negrita=encabezado, tamano=9)}</w:p></w:tc>')

        def fila(valores: list[str], encabezado: bool = False) -> str:
            repetir = '<w:trPr><w:tblHeader/></w:trPr>' if encabezado else ""
            return f"<w:tr>{repetir}{''.join(celda(v, c, encabezado) for v, c in zip(valores, columnas))}</w:tr>"

        bordes = "".join(f'<w:{b} w:val="single" w:sz="4" w:space="0" w:color="E8E4D8"/>' for b in ("top", "left", "bottom", "right", "insideH", "insideV"))
        self.cuerpo.append(
            f'<w:tbl><w:tblPr><w:tblW w:w="{total}" w:type="dxa"/><w:tblBorders>{bordes}</w:tblBorders>'
            f'<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
            f"<w:tblGrid>{rejilla}</w:tblGrid>{fila(encabezados, True)}{''.join(fila(f) for f in filas)}</w:tbl>"
        )
        self.cuerpo.append("<w:p/>")

    def salto_de_pagina(self):
        self.cuerpo.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

    def bytes(self) -> bytes:
        documento = (
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="{_W}"><w:body>'
            + "".join(self.cuerpo)
            + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
              '<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
            + "</w:body></w:document>"
        )
        propiedades = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + escape(self.titulo) + "</dc:title>"
            "<dc:creator>Arbolado Escolar</dc:creator></cp:coreProperties>"
        )
        salida = io.BytesIO()
        with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", _TIPOS)
            z.writestr("_rels/.rels", _RELACIONES)
            z.writestr("word/_rels/document.xml.rels", _RELACIONES_DOC)
            z.writestr("word/document.xml", documento)
            z.writestr("word/styles.xml", _ESTILOS)
            z.writestr("docProps/core.xml", propiedades)
        return salida.getvalue()
