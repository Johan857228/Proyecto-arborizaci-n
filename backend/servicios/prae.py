"""Proyecto Ambiental Escolar (PRAE): estado del expediente y su informe anual en PDF.

Todo establecimiento educativo tiene un PRAE sobre un diagnóstico ambiental local, y el consejo
directivo y la Secretaría de Educación lo evalúan al menos una vez al año (Decreto 1743 de 1994,
compilado en el Decreto 1075 de 2015). El tema lo elige el colegio (residuos, agua, energía,
arbolado…); los datos del arbolado de la app entran al informe como indicadores.
"""
from datetime import date

from servicios.pdf import Documento, fecha_corta, fecha_larga

TEMAS = {
    "arbolado": "Arbolado escolar",
    "residuos": "Residuos sólidos",
    "agua": "Agua",
    "energia": "Energía",
    "biodiversidad": "Biodiversidad",
    "otro": "Otro",
}
ESTADOS_ACCION = {"pendiente": "Pendiente", "en_curso": "En curso", "cumplida": "Cumplida", "cancelada": "Cancelada"}
INSTANCIAS = {
    "consejo_directivo": "Consejo directivo",
    "secretaria": "Secretaría de Educación",
    "comite": "Comité ambiental escolar",
    "otra": "Otra instancia",
}
ESTADOS = {
    "formulacion": "En formulación",
    "en_ejecucion": "En ejecución",
    "evaluacion_parcial": "Evaluación parcial",
    "evaluado": "Evaluado",
}
# Las dos evaluaciones que pide la norma cada año.
EVALUACIONES_OBLIGATORIAS = ("consejo_directivo", "secretaria")


def estado(acciones: list[dict], evaluaciones: list[dict]) -> str:
    instancias = {e["instancia"] for e in evaluaciones}
    if set(EVALUACIONES_OBLIGATORIAS) <= instancias:
        return "evaluado"
    if instancias & set(EVALUACIONES_OBLIGATORIAS):
        return "evaluacion_parcial"
    return "en_ejecucion" if acciones else "formulacion"


def resumen_acciones(acciones: list[dict]) -> dict:
    conteo = {e: sum(1 for a in acciones if a["estado"] == e) for e in ESTADOS_ACCION}
    vigentes = len(acciones) - conteo["cancelada"]
    return {
        "total": len(acciones),
        **conteo,
        "pct_cumplidas": round(100 * conteo["cumplida"] / vigentes, 1) if vigentes else None,
    }


def tema_texto(prae: dict) -> str:
    if prae["tema"] == "otro" and prae.get("tema_otro"):
        return prae["tema_otro"]
    return TEMAS[prae["tema"]]


def _plural(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def _numero(valor) -> str:
    if valor is None:
        return "—"
    if isinstance(valor, float):
        return f"{valor:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{valor:,}".replace(",", ".")


def _fecha(valor) -> date | None:
    if not valor:
        return None
    return valor if isinstance(valor, date) else date.fromisoformat(str(valor)[:10])


def informe_pdf(prae: dict, institucion: dict, acciones: list[dict], evidencias: list[dict], evaluaciones: list[dict],
                indicadores: dict, generado: date) -> bytes:
    """Informe anual del PRAE para el consejo directivo y la Secretaría de Educación."""
    nombre_inst = institucion.get("nombre") or "Institución educativa"
    doc = Documento(f"PRAE {prae['anio']} · {nombre_inst} · Generado el {fecha_corta(generado)} con Arbolado Escolar")
    sede = " · ".join(x for x in (
        f"Código DANE {institucion['codigo_dane']}" if institucion.get("codigo_dane") else None,
        institucion.get("municipio"),
    ) if x)
    doc.portada(f"INFORME ANUAL DEL PROYECTO AMBIENTAL ESCOLAR (PRAE) {prae['anio']}", " · ".join(x for x in (nombre_inst, sede) if x))

    doc.parrafo(prae["titulo"], tamano=15, negrita=True)
    resumen = resumen_acciones(acciones)
    doc.parrafo(
        f"Tema: {tema_texto(prae)} · Estado: {ESTADOS[estado(acciones, evaluaciones)]} · "
        f"{_plural(resumen['total'], 'acción', 'acciones')} en el plan ({_numero(resumen['pct_cumplidas']) + ' % cumplidas' if resumen['pct_cumplidas'] is not None else 'sin acciones vigentes'}) · "
        f"{_plural(len(evidencias), 'evidencia', 'evidencias')} · {_plural(len(evaluaciones), 'evaluación', 'evaluaciones')}",
        tamano=9.5,
    )

    doc.seccion("1. Problema ambiental y diagnóstico")
    doc.campo("Problema ambiental", prae.get("problema"))
    doc.campo("Diagnóstico ambiental local", prae.get("diagnostico"))

    doc.seccion("2. Objetivos")
    doc.campo("Objetivo general", prae.get("objetivo_general"))
    especificos = [o for o in prae.get("objetivos_especificos") or [] if o]
    if especificos:
        doc.etiqueta("Objetivos específicos")
        doc.lista(especificos)
    doc.campo("Comité ambiental y responsables", prae.get("comite"))

    doc.seccion("3. Plan de acción")
    if acciones:
        filas = []
        for a in acciones:
            inicio, fin = _fecha(a.get("fecha_inicio")), _fecha(a.get("fecha_fin"))
            fechas = " a ".join(fecha_corta(f) for f in (inicio, fin) if f) or "—"
            detalle = a["titulo"] + (f". Indicador: {a['indicador']}" if a.get("indicador") else "") + (f". Meta: {a['meta']}" if a.get("meta") else "")
            filas.append([detalle, a.get("responsable") or "—", fechas, ESTADOS_ACCION[a["estado"]]])
        doc.tabla(["Acción, indicador y meta", "Responsable", "Fechas", "Estado"], filas, [0.47, 0.2, 0.2, 0.13])
    else:
        doc.parrafo("Aún no hay acciones en el plan.", color=(0.353, 0.384, 0.345))

    doc.seccion("4. Evidencias")
    if evidencias:
        titulos = {a["id"]: a["titulo"] for a in acciones}
        filas = [
            [fecha_corta(_fecha(e["fecha"])), {"foto": "Foto", "enlace": "Enlace", "nota": "Nota"}[e["tipo"]],
             e["titulo"] + (f" — {e['descripcion']}" if e.get("descripcion") else ""),
             titulos.get(e.get("accion_id"), "—")]
            for e in evidencias
        ]
        doc.tabla(["Fecha", "Tipo", "Evidencia", "Acción"], filas, [0.14, 0.1, 0.5, 0.26])
        doc.parrafo("Las fotos y los enlaces están en el expediente digital del PRAE en la app.", tamano=9, color=(0.353, 0.384, 0.345))
    else:
        doc.parrafo("Aún no hay evidencias registradas.", color=(0.353, 0.384, 0.345))

    doc.seccion("5. Indicadores del arbolado escolar (datos de la app)")
    a = indicadores.get("arbolado") or {}
    estados_ = a.get("por_estado") or {}
    filas = [
        ["Árboles en el inventario", _numero(a.get("total_arboles"))],
        ["Árboles registrados en el año", _numero(a.get("registrados_periodo"))],
        ["Estado: sanos / en riesgo / críticos", f"{_numero(estados_.get('sano', 0))} / {_numero(estados_.get('riesgo', 0))} / {_numero(estados_.get('critico', 0))}"],
        ["Inspecciones en el año (confirmadas)", f"{_numero(a.get('inspecciones_periodo'))} ({_numero(a.get('confirmadas'))})"],
        ["Árboles inspeccionados en el año (cobertura)", f"{_numero(a.get('arboles_inspeccionados_periodo'))} ({_numero(a.get('cobertura_pct'))} %)"],
        ["Personas que inspeccionaron", _numero(a.get("participantes"))],
        ["Intervenciones ejecutadas", _numero(a.get("intervenciones_ejecutadas"))],
        ["CO2 almacenado estimado (kg)", _numero(a.get("co2_kg"))],
    ]
    alertas = indicadores.get("alertas")
    if alertas:
        filas.append(["Alertas de riesgo de caída del año (atendidas / abiertas)", f"{_numero(alertas['atendidas'])} / {_numero(alertas['abiertas'])}"])
    servicio = indicadores.get("servicio_social")
    if servicio:
        filas.append(["Servicio social: estudiantes (completaron la meta)", f"{_numero(servicio['estudiantes'])} ({_numero(servicio['completaron'])})"])
        filas.append(["Servicio social: horas aprobadas", _numero(servicio["horas_aprobadas"])])
    siembras = indicadores.get("siembras")
    if siembras:
        nativas = f" · {_numero(siembras['pct_nativas'])} % nativas" if siembras.get("pct_nativas") is not None else ""
        filas.append(["Siembras del año: jornadas y plántulas", f"{_numero(siembras['jornadas'])} y {_numero(siembras['sembradas'])}{nativas}"])
        if siembras.get("supervivencia_pct") is not None:
            filas.append(["Supervivencia de esas plántulas (con control)", f"{_numero(siembras['supervivencia_pct'])} % de {_numero(siembras['evaluadas'])}"])
    pedagogia = indicadores.get("pedagogia")
    if pedagogia:
        filas.append(["Clases con las guías de la app (guías distintas)", f"{_numero(pedagogia['clases'])} ({_numero(pedagogia['guias'])})"])
        filas.append(["Estudiantes en esas clases (suma de asistentes)", _numero(pedagogia["asistentes"])])
    doc.tabla(["Indicador", "Valor"], filas, [0.72, 0.28])
    doc.parrafo("Estimación aproximada del CO2 con las medidas registradas; confirmar las fórmulas con el docente.", tamano=8.5, color=(0.353, 0.384, 0.345))

    doc.seccion("6. Evaluación")
    if evaluaciones:
        for e in evaluaciones:
            encabezado = f"{INSTANCIAS[e['instancia']]} · {fecha_larga(_fecha(e['fecha']))}"
            if e.get("acta"):
                encabezado += f" · Acta {e['acta']}"
            if e.get("cumplimiento_pct") is not None:
                encabezado += f" · Cumplimiento {e['cumplimiento_pct']} %"
            doc.parrafo(encabezado, tamano=11, negrita=True)
            for etiqueta, clave in (("Logros", "logros"), ("Dificultades", "dificultades"), ("Recomendaciones", "recomendaciones"), ("Participantes", "participantes")):
                if e.get(clave):
                    doc.parrafo(f"{etiqueta}: {e[clave]}", sangria=10)
    faltan = [INSTANCIAS[i] for i in EVALUACIONES_OBLIGATORIAS if i not in {e["instancia"] for e in evaluaciones}]
    if faltan:
        doc.parrafo(
            f"Falta registrar la evaluación de: {' y '.join(faltan)}. El PRAE se evalúa al menos una vez al año con el "
            "consejo directivo y la Secretaría de Educación (Decreto 1743 de 1994, compilado en el Decreto 1075 de 2015).",
            tamano=10, color=(0.706, 0.325, 0.035),
        )

    # El cierre y las firmas van juntos en la misma página.
    doc.espacio(130)
    doc.parrafo(f"Presentado al consejo directivo y a la Secretaría de Educación como informe del PRAE {prae['anio']}.", tamano=10)
    doc.firmas(["Rector(a)", "Coordinador(a) del PRAE"])
    return doc.pdf(f"Informe PRAE {prae['anio']} · {nombre_inst}")
