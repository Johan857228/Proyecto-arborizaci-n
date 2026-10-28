"""PDF del certificado de servicio social: una página carta con el código QR de verificación.
Las piezas del PDF (fuentes, texto, QR) están en servicios/pdf.py."""
from servicios.pdf import ANCHO, ALTO, BLANCO, GRIS, MARGEN, TINTA, VERDE, Pagina, documento_pdf, fecha_larga, partir_url

__all__ = ["certificado_pdf", "codigo_legible", "fecha_larga", "horas_texto"]


def horas_texto(horas: float) -> str:
    return f"{horas:.0f}" if float(horas).is_integer() else f"{horas:.1f}".replace(".", ",")


def codigo_legible(codigo: str) -> str:
    return f"{codigo[:4]}-{codigo[4:8]}-{codigo[8:]}"


def certificado_pdf(d: dict, url_verificacion: str) -> bytes:
    """d: institucion, codigo_dane, municipio, estudiante, curso, horas, meta, detalle (lista de
    (actividad, horas)), inicio, fin, firmante, cargo, emitido (fechas como date) y codigo."""
    p = Pagina()
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
    return documento_pdf([p.contenido()], f"Certificado de servicio social {codigo_legible(d['codigo'])}")
