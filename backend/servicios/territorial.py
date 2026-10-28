"""Tablero territorial e informe anual de la Secretaría (migración 014).

Semáforo de cada colegio según su PRAE del año:
- verde: evaluado por el consejo directivo y por la Secretaría de Educación;
- amarillo: el PRAE existe pero le falta alguna de esas evaluaciones;
- rojo: no hay PRAE del año en la app.

El informe junta lo que piden la Ley 2173 de 2021 (art. 12, parágrafo: avances de los PRAE con
las acciones de reforestación y de cambio climático) y la Ley 1549 de 2012 (seguimiento de la
educación ambiental). Las cifras salen de la app; los textos los escribe la Secretaría. El formato
oficial del MEN está por confirmar, por eso el informe también sale en Word para ajustarlo.
"""
from datetime import date

from servicios.docx import Docx
from servicios.pdf import GRIS, Documento, fecha_larga
from servicios.prae import ESTADOS as ESTADOS_PRAE
from servicios.prae import INSTANCIAS, TEMAS

SEMAFOROS = {"verde": "PRAE evaluado", "amarillo": "Falta evaluación", "rojo": "Sin PRAE"}
TIPOS = {"secretaria_educacion": "Secretaría de Educación", "autoridad_ambiental": "Autoridad ambiental",
         "gobernacion": "Gobernación", "alcaldia": "Alcaldía", "otro": "Otro"}
SECCIONES = {
    "presentacion": "Presentación",
    "reforestacion": "Acciones pedagógicas de reforestación",
    "cambio_climatico": "Acciones frente al cambio climático",
    "logros": "Logros",
    "dificultades": "Dificultades",
    "proyecciones": "Proyecciones para el próximo año",
}


def semaforo(prae: dict | None) -> str:
    if not prae:
        return "rojo"
    return "verde" if prae.get("estado") == "evaluado" else "amarillo"


def _num(valor, decimales: int = 0) -> str:
    if valor is None:
        return "—"
    texto = f"{valor:,.{decimales}f}"
    return texto.replace(",", "§").replace(".", ",").replace("§", ".")


def _v(n: int, singular: str, plural: str) -> str:
    return singular if n == 1 else plural


def _pct(valor) -> str:
    return "—" if valor is None else f"{_num(valor, 1).removesuffix(',0')} %"


def totales(filas: list[dict]) -> dict:
    """Sumas del territorio. Los porcentajes se recalculan con las cifras, no se promedian."""
    s = [f["siembras"] for f in filas if f.get("siembras")]
    sembradas = sum(x["sembradas"] for x in s)
    nativas = sum(x["nativas"] for x in s)
    clasificadas = sum(x.get("clasificadas", 0) for x in s)
    evaluadas = sum(x["evaluadas"] for x in s)
    vivas = sum(x["vivas"] for x in s)
    servicio = [f["servicio_social"] for f in filas if f.get("servicio_social")]
    clases = [f["clases"] for f in filas if f.get("clases")]
    return {
        "instituciones": len(filas),
        "semaforo": {k: sum(1 for f in filas if f["semaforo"] == k) for k in SEMAFOROS},
        "arboles": sum((f.get("arboles") or {}).get("total", 0) for f in filas),
        "jornadas": sum(x["jornadas"] for x in s),
        "sembradas": sembradas,
        "pct_nativas": round(100 * nativas / clasificadas, 1) if clasificadas else None,
        "supervivencia_pct": round(100 * vivas / evaluadas, 1) if evaluadas else None,
        "clases": sum(c["clases"] for c in clases),
        "estudiantes_en_clases": sum(c["asistentes"] for c in clases),
        "inspectores": sum(f.get("inspectores") or 0 for f in filas),
        "asistentes_siembras": sum(x.get("asistentes", 0) for x in s),
        "estudiantes_servicio": sum(x["estudiantes"] for x in servicio),
        "horas_servicio": round(sum(x["horas_aprobadas"] for x in servicio), 1),
    }


def _estado_prae(f: dict) -> str:
    p = f.get("prae")
    if not p:
        return "Sin PRAE"
    texto = ESTADOS_PRAE.get(p["estado"], p["estado"])
    if p.get("evaluaciones_faltantes"):
        texto += " (falta " + " y ".join(INSTANCIAS[i].lower() for i in p["evaluaciones_faltantes"]) + ")"
    return texto


def _tema(f: dict) -> str:
    p = f.get("prae")
    if not p:
        return "—"
    return p.get("tema_otro") or TEMAS.get(p.get("tema"), p.get("tema") or "—")


def contenido(territorio: dict, anio: int, filas: list[dict], t: dict, secciones: dict[str, str]) -> list[tuple]:
    """El informe como una lista de bloques, la misma para el PDF y para Word:
    ("titulo", texto) · ("parrafo", texto) · ("nota", texto) · ("tabla", encabezados, filas, anchos) · ("texto_libre", clave)."""
    sem = t["semaforo"]
    n = t["instituciones"]
    bloques: list[tuple] = [
        ("titulo", "1. Presentación"), ("texto_libre", "presentacion"),
        ("titulo", "2. Estado de los PRAE"),
        ("parrafo", f"De los {n} colegios del territorio, {sem['verde']} {_v(sem['verde'], 'tiene', 'tienen')} el PRAE {anio} evaluado por el "
                    f"consejo directivo y la Secretaría de Educación, {sem['amarillo']} lo {_v(sem['amarillo'], 'tiene', 'tienen')} sin evaluación "
                    f"completa y {sem['rojo']} no lo {_v(sem['rojo'], 'ha', 'han')} registrado en la app."),
        ("tabla", ["Colegio", "Código DANE", "Municipio", "PRAE", "Tema", "Cumplido"],
         [[f["nombre"], f.get("codigo_dane") or "—", f.get("municipio") or "—", _estado_prae(f), _tema(f),
           _pct((f.get("prae") or {}).get("pct_cumplidas"))] for f in filas],
         [0.23, 0.17, 0.12, 0.22, 0.14, 0.12]),
        ("titulo", "3. Acciones pedagógicas de reforestación"),
        ("parrafo", f"En {anio} se registraron {_num(t['jornadas'])} jornadas de siembra con {_num(t['sembradas'])} plántulas georreferenciadas"
                    + (f" ({_pct(t['pct_nativas'])} de especies nativas)" if t["pct_nativas"] is not None else "")
                    + (f". De las que ya tienen control de supervivencia, sigue viva el {_pct(t['supervivencia_pct'])}." if t["supervivencia_pct"] is not None else ".")),
        ("tabla", ["Colegio", "Jornadas", "Plántulas", "Nativas", "Supervivencia"],
         [[f["nombre"], _num((f.get("siembras") or {}).get("jornadas")), _num((f.get("siembras") or {}).get("sembradas")),
           _pct((f.get("siembras") or {}).get("pct_nativas")), _pct((f.get("siembras") or {}).get("supervivencia_pct"))] for f in filas],
         [0.4, 0.15, 0.15, 0.15, 0.15]),
        ("texto_libre", "reforestacion"),
        ("titulo", "4. Acciones frente al cambio climático"),
        ("parrafo", f"Los colegios dictaron {_num(t['clases'])} clases con las guías de Arbolado Escolar (ciclo del carbono, calentamiento global, "
                    f"ecosistemas y datos del arbolado), con {_num(t['estudiantes_en_clases'])} asistencias de estudiantes, y tienen "
                    f"{_num(t['arboles'])} árboles inventariados y monitoreados."),
        ("texto_libre", "cambio_climatico"),
        ("titulo", "5. Participación"),
        ("tabla", ["Indicador", "Valor"], [
            ["Personas que inspeccionaron árboles en el año", _num(t["inspectores"])],
            ["Asistentes a jornadas de siembra", _num(t["asistentes_siembras"])],
            ["Asistencias de estudiantes a clases con guías", _num(t["estudiantes_en_clases"])],
            ["Estudiantes de 10.° y 11.° en servicio social", _num(t["estudiantes_servicio"])],
            ["Horas de servicio social aprobadas", _num(t["horas_servicio"], 1).removesuffix(",0")],
        ], [0.7, 0.3]),
        ("titulo", "6. Logros, dificultades y proyecciones"),
        ("subtitulo", SECCIONES["logros"]), ("texto_libre", "logros"),
        ("subtitulo", SECCIONES["dificultades"]), ("texto_libre", "dificultades"),
        ("subtitulo", SECCIONES["proyecciones"]), ("texto_libre", "proyecciones"),
        ("nota", "Cifras de la app Arbolado Escolar. La Secretaría las verifica y completa antes de enviar el informe; "
                 "el formato que pide el MEN está por confirmar."),
    ]
    return bloques


def _texto_libre(secciones: dict[str, str], clave: str) -> str | None:
    texto = (secciones or {}).get(clave)
    return texto.strip() if isinstance(texto, str) and texto.strip() else None


def informe_pdf(territorio: dict, anio: int, filas: list[dict], t: dict, secciones: dict[str, str], generado: date) -> bytes:
    doc = Documento(f"Arbolado Escolar · Informe anual de los PRAE {anio} · {territorio['nombre']}")
    doc.portada(f"Informe anual de los PRAE {anio}", f"{territorio['nombre']} · {fecha_larga(generado)}")
    for bloque in contenido(territorio, anio, filas, t, secciones):
        tipo = bloque[0]
        if tipo == "titulo":
            doc.seccion(bloque[1])
        elif tipo == "subtitulo":
            doc.etiqueta(bloque[1])
        elif tipo == "parrafo":
            doc.parrafo(bloque[1])
        elif tipo == "nota":
            doc.parrafo(bloque[1], tamano=8.5, color=GRIS)
        elif tipo == "tabla":
            doc.tabla(bloque[1], bloque[2], bloque[3], tamano=8.5)
        elif tipo == "texto_libre":
            texto = _texto_libre(secciones, bloque[1])
            for linea in (texto or "Sin diligenciar.").split("\n"):
                doc.parrafo(linea, color=GRIS if not texto else (0.075, 0.149, 0.110))
    doc.firmas(["Secretario(a) de Educación", "Responsable de educación ambiental"])
    return doc.pdf(f"Informe anual de los PRAE {anio}")


def informe_docx(territorio: dict, anio: int, filas: list[dict], t: dict, secciones: dict[str, str], generado: date) -> bytes:
    doc = Docx(f"Informe anual de los PRAE {anio}")
    doc.titulo_principal(f"Informe anual de los PRAE {anio}")
    doc.parrafo(f"{territorio['nombre']} · {fecha_larga(generado)}", gris=True)
    for bloque in contenido(territorio, anio, filas, t, secciones):
        tipo = bloque[0]
        if tipo == "titulo":
            doc.encabezado(bloque[1], 1)
        elif tipo == "subtitulo":
            doc.encabezado(bloque[1], 2)
        elif tipo == "parrafo":
            doc.parrafo(bloque[1])
        elif tipo == "nota":
            doc.parrafo(bloque[1], cursiva=True, gris=True, tamano=9)
        elif tipo == "tabla":
            doc.tabla(bloque[1], bloque[2], bloque[3])
        elif tipo == "texto_libre":
            texto = _texto_libre(secciones, bloque[1])
            doc.parrafo(texto or f"[Escriba aquí: {SECCIONES[bloque[1]].lower()}]", cursiva=not texto, gris=not texto)
    doc.parrafo("")
    doc.parrafo("_______________________________          _______________________________")
    doc.parrafo("Secretario(a) de Educación                      Responsable de educación ambiental", gris=True)
    return doc.bytes()
