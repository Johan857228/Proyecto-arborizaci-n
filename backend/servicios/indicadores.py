"""Indicadores de inventario, riesgo, cobertura, productividad e intervenciones.

Todo se calcula en memoria a partir del historial de inspecciones, así se puede
responder "cómo estaba el inventario al final de un periodo" y no solo "cómo está hoy":
el estado de un árbol en una fecha es su última inspección no anulada hasta esa fecha.
"""
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import calculos
from comun import a_fecha, a_fecha_hora, ahora, fin_del_dia, inicio_del_dia
from servicios.calificacion import Metodo, calcular_ambientales

ESTADOS = ("sano", "riesgo", "critico")
SEVERIDAD = {"critico": 3, "riesgo": 2, "sano": 1}


@dataclass
class Datos:
    """Lo que hace falta para calcular indicadores, ya cargado de la base de datos."""

    arboles: list[dict]                                   # filas de arboles_resumen
    inspecciones: list[dict]                              # todas las inspecciones de esos árboles
    observaciones: dict[str, list[str]] = field(default_factory=dict)   # inspeccion_id → códigos
    catalogo: dict[str, dict] = field(default_factory=dict)             # código → {grupo, etiqueta}
    intervenciones: list[dict] = field(default_factory=list)
    metodos: dict[str, Metodo] = field(default_factory=dict)
    metodo_defecto: Metodo | None = None
    perfiles: dict[str, dict] = field(default_factory=dict)             # usuario_id → perfil público
    cursos: dict[str, dict] = field(default_factory=dict)               # curso_id → curso

    def __post_init__(self):
        ids = {a["id"] for a in self.arboles}
        self.inspecciones = [i for i in self.inspecciones if i["arbol_id"] in ids]
        self._por_arbol: dict[str, list[dict]] = defaultdict(list)
        for i in self.inspecciones:
            i["_fecha"] = a_fecha_hora(i["fecha"])
            self._por_arbol[i["arbol_id"]].append(i)
        for lista in self._por_arbol.values():
            lista.sort(key=lambda i: (i["_fecha"], str(i["id"])))
        self.intervenciones = [i for i in self.intervenciones if i["arbol_id"] in ids]

    def inspecciones_de(self, arbol_id: str) -> list[dict]:
        return self._por_arbol.get(arbol_id, [])

    def metodo_de(self, inspeccion: dict | None) -> Metodo:
        if inspeccion and inspeccion.get("metodo_id") in self.metodos:
            return self.metodos[inspeccion["metodo_id"]]
        return self.metodo_defecto or Metodo(id=None, version=0, nombre="Por defecto")


@dataclass
class EstadoArbol:
    """Cómo estaba un árbol en una fecha de corte."""

    arbol: dict
    inspeccion: dict | None

    def valor(self, campo: str):
        if self.inspeccion is not None:
            return self.inspeccion[campo]
        return self.arbol.get(campo)

    @property
    def estado(self) -> str:
        if self.inspeccion is not None:
            return self.inspeccion["calificacion"]
        return calculos.estado_por_observaciones(int(self.arbol.get("n_observaciones") or 0))


def estados_al_corte(datos: Datos, corte: datetime) -> dict[str, EstadoArbol]:
    resultado = {}
    for arbol in datos.arboles:
        registrado = a_fecha_hora(arbol.get("registrado_en"))
        if registrado is not None and registrado > corte:
            continue
        vigente = None
        for i in datos.inspecciones_de(arbol["id"]):
            if i["_fecha"] > corte:
                break
            if i["estado_revision"] != "anulada":
                vigente = i
        resultado[arbol["id"]] = EstadoArbol(arbol, vigente)
    return resultado


def _en(momento: datetime | None, inicio: datetime, fin: datetime) -> bool:
    return momento is not None and inicio <= momento <= fin


def _en_dias(dia: date | None, desde: date, hasta: date) -> bool:
    return dia is not None and desde <= dia <= hasta


def _pct(parte: float, total: float) -> float | None:
    return round(parte * 100 / total, 1) if total else None


def _conteo(contador: Counter, clave: str = "nombre") -> list[dict]:
    return [{clave: k, "total": v} for k, v in sorted(contador.items(), key=lambda kv: (-kv[1], str(kv[0])))]


def _nombre(datos: Datos, usuario_id: str | None) -> str:
    perfil = datos.perfiles.get(usuario_id or "")
    return perfil["nombre"] if perfil else "Usuario sin perfil"


def calcular(datos: Datos, desde: date, hasta: date, dias_revisita: int = 180) -> dict:
    inicio, fin = inicio_del_dia(desde), fin_del_dia(hasta)
    corte = min(fin, ahora())
    estados = estados_al_corte(datos, corte)

    return {
        "periodo": {"desde": desde.isoformat(), "hasta": hasta.isoformat(), "corte": corte.isoformat()},
        "inventario": _inventario(datos, estados, inicio, fin),
        "riesgo": _riesgo(datos, estados),
        "cobertura": _cobertura(datos, estados, inicio, fin, corte, dias_revisita),
        "productividad": _productividad(datos, inicio, fin),
        "intervenciones": _intervenciones(datos, desde, hasta),
    }


def _inventario(datos: Datos, estados: dict[str, EstadoArbol], inicio: datetime, fin: datetime) -> dict:
    especies, zonas, etapas = Counter(), Counter(), Counter()
    area = 0.0
    ambientales = {"biomasa_total_kg": 0.0, "carbono_kg": 0.0, "co2_kg": 0.0, "o2_kg": 0.0}
    for e in estados.values():
        especies[e.arbol["nombre_comun"]] += 1
        zonas[e.arbol["zona"]] += 1
        etapas[e.valor("etapa")] += 1
        area += calculos.area_copa_m2(float(e.valor("copa_m")))
        valores = calcular_ambientales(
            datos.metodo_de(e.inspeccion), float(e.valor("dap_cm")), float(e.valor("altura_m")), e.arbol["nombre_comun"]
        )
        for clave in ambientales:
            ambientales[clave] += valores[clave]
    registrados = sum(1 for e in estados.values() if _en(a_fecha_hora(e.arbol.get("registrado_en")), inicio, fin))
    return {
        "total_arboles": len(estados),
        "registrados_periodo": registrados,
        "por_especie": _conteo(especies),
        "por_zona": _conteo(zonas),
        "por_etapa": _conteo(etapas),
        "area_copa_total_m2": round(area, 2),
        "totales_ambientales": {k: round(v, 2) for k, v in ambientales.items()},
    }


def _riesgo(datos: Datos, estados: dict[str, EstadoArbol]) -> dict:
    por_estado = {e: 0 for e in ESTADOS}
    hallazgos, grupos, interferencias = Counter(), Counter(), Counter()
    puntajes = []
    prioritarios = []
    for e in estados.values():
        por_estado[e.estado] += 1
        codigos = datos.observaciones.get(e.inspeccion["id"], []) if e.inspeccion else []
        hallazgos.update(codigos)
        grupos.update({datos.catalogo[c]["grupo"] for c in codigos if c in datos.catalogo})
        interferencia = e.valor("interferencia")
        if interferencia and interferencia != "Ninguna":
            interferencias[interferencia] += 1
        puntaje = float(e.inspeccion["puntaje_riesgo"]) if e.inspeccion else None
        if puntaje is not None:
            puntajes.append(puntaje)
        if e.estado == "critico" or (interferencia and interferencia != "Ninguna"):
            prioritarios.append({
                "id": e.arbol["id"],
                "codigo": e.arbol["codigo"],
                "nombre_comun": e.arbol["nombre_comun"],
                "zona": e.arbol["zona"],
                "estado": e.estado,
                "puntaje_riesgo": puntaje,
                "interferencia": interferencia,
            })
    prioritarios.sort(key=lambda p: (-SEVERIDAD[p["estado"]], -(p["puntaje_riesgo"] or 0), p["codigo"]))
    total = len(estados)
    return {
        "por_estado": por_estado,
        "pct_riesgo_o_critico": _pct(por_estado["riesgo"] + por_estado["critico"], total),
        "puntaje_promedio": round(sum(puntajes) / len(puntajes), 2) if puntajes else None,
        "hallazgos_frecuentes": [
            {
                "codigo": codigo,
                "etiqueta": datos.catalogo.get(codigo, {}).get("etiqueta", codigo),
                "grupo": datos.catalogo.get(codigo, {}).get("grupo"),
                "total": n,
            }
            for codigo, n in sorted(hallazgos.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
        ],
        "arboles_por_grupo": _conteo(grupos, "grupo"),
        "por_interferencia": _conteo(interferencias),
        "arboles_prioritarios": prioritarios[:20],
        "total_prioritarios": len(prioritarios),
    }


def _cobertura(datos, estados, inicio, fin, corte, dias_revisita) -> dict:
    inspeccionados = set()
    revision = Counter()
    for arbol_id in estados:
        for i in datos.inspecciones_de(arbol_id):
            if _en(i["_fecha"], inicio, fin):
                revision[i["estado_revision"]] += 1
                if i["estado_revision"] != "anulada":
                    inspeccionados.add(arbol_id)
    limite = corte - timedelta(days=dias_revisita)
    sin_reciente = [
        e for e in estados.values() if e.inspeccion is None or e.inspeccion["_fecha"] < limite
    ]
    revisadas = revision["confirmada"] + revision["anulada"]
    total_inspecciones = revisadas + revision["pendiente"]
    return {
        "arboles_inspeccionados_periodo": len(inspeccionados),
        "cobertura_pct": _pct(len(inspeccionados), len(estados)),
        "dias_revisita": dias_revisita,
        "sin_inspeccion_reciente": len(sin_reciente),
        "revision": {
            "confirmadas": revision["confirmada"],
            "anuladas": revision["anulada"],
            "pendientes": revision["pendiente"],
            "pct_revisadas": _pct(revisadas, total_inspecciones),
            "pct_confirmadas_de_revisadas": _pct(revision["confirmada"], revisadas),
        },
    }


def _productividad(datos: Datos, inicio: datetime, fin: datetime) -> dict:
    del_periodo = [i for i in datos.inspecciones if _en(i["_fecha"], inicio, fin)]
    por_mes = Counter(i["_fecha"].astimezone(inicio.tzinfo).strftime("%Y-%m") for i in del_periodo)
    por_inspector: dict[str, Counter] = defaultdict(Counter)
    por_curso: dict[str | None, int] = Counter()
    horas_revision = []
    for i in del_periodo:
        quien = i.get("inspector_id")
        por_inspector[quien]["total"] += 1
        por_inspector[quien][i["estado_revision"]] += 1
        curso = datos.perfiles.get(quien or "", {}).get("curso_id")
        if i["estado_revision"] != "anulada":
            por_curso[curso] += 1
        revisado = a_fecha_hora(i.get("revisado_en"))
        if revisado is not None and i["estado_revision"] != "pendiente":
            horas_revision.append((revisado - i["_fecha"]).total_seconds() / 3600)
    inspectores = sorted(
        (
            {
                "usuario_id": uid,
                "nombre": _nombre(datos, uid),
                "total": c["total"],
                "confirmadas": c["confirmada"],
                "anuladas": c["anulada"],
            }
            for uid, c in por_inspector.items()
        ),
        key=lambda x: (-x["total"], x["nombre"]),
    )
    cursos = sorted(
        (
            {
                "curso_id": cid,
                "nombre": datos.cursos[cid]["nombre"] if cid in datos.cursos else "Sin curso",
                "total": n,
            }
            for cid, n in por_curso.items()
        ),
        key=lambda x: (-x["total"], x["nombre"]),
    )
    estados = Counter(i["estado_revision"] for i in del_periodo)
    return {
        "inspecciones_periodo": len(del_periodo),
        "confirmadas": estados["confirmada"],
        "anuladas": estados["anulada"],
        "pendientes": estados["pendiente"],
        "registros_nuevos": sum(1 for i in del_periodo if i["origen"] == "registro" and i["estado_revision"] != "anulada"),
        "por_mes": [{"mes": m, "total": por_mes[m]} for m in sorted(por_mes)],
        "por_inspector": inspectores[:10],
        "por_curso": cursos,
        "horas_promedio_revision": round(sum(horas_revision) / len(horas_revision), 1) if horas_revision else None,
    }


def _intervenciones(datos: Datos, desde: date, hasta: date) -> dict:
    ejecutadas = [
        i for i in datos.intervenciones
        if i["estado"] == "ejecutada" and _en_dias(a_fecha(i.get("fecha_ejecucion")), desde, hasta)
    ]
    programadas = [i for i in datos.intervenciones if i["estado"] == "programada"]
    vencidas = [
        i for i in programadas if (a_fecha(i.get("fecha_programada")) or hasta) < min(hasta, ahora().date())
    ]
    por_tipo: dict[str, dict] = {}
    for i in ejecutadas:
        t = por_tipo.setdefault(i["tipo_codigo"], {"tipo_codigo": i["tipo_codigo"], "total": 0, "costo": 0.0})
        t["total"] += 1
        t["costo"] += float(i.get("costo_real") or 0)
    resultados = Counter(i.get("resultado") for i in ejecutadas)
    return {
        "ejecutadas_periodo": len(ejecutadas),
        "costo_ejecutado_periodo": round(sum(float(i.get("costo_real") or 0) for i in ejecutadas), 2),
        "arboles_intervenidos": len({i["arbol_id"] for i in ejecutadas}),
        "programadas": len(programadas),
        "programadas_vencidas": len(vencidas),
        "costo_programado": round(sum(float(i.get("costo_estimado") or 0) for i in programadas), 2),
        "por_tipo": sorted(
            ({**t, "costo": round(t["costo"], 2)} for t in por_tipo.values()), key=lambda t: (-t["total"], t["tipo_codigo"])
        ),
        "por_resultado": {r: resultados.get(r, 0) for r in ("exitosa", "parcial", "sin_efecto")},
        "eficacia_pct": _pct(resultados.get("exitosa", 0), len(ejecutadas)),
    }


# ============================== Avance de un curso ===============================
def avance_curso(datos: Datos, curso: dict, zonas: list[str], integrantes: list[dict], desde: date, hasta: date) -> dict:
    inicio, fin = inicio_del_dia(desde), fin_del_dia(hasta)
    corte = min(fin, ahora())
    estados = estados_al_corte(datos, corte)
    asignados = [
        e for e in estados.values()
        if e.arbol["institucion_id"] == curso["institucion_id"] and e.arbol["zona"] in zonas
    ]

    def inspeccionado(arbol_id: str) -> bool:
        return any(
            _en(i["_fecha"], inicio, fin) and i["estado_revision"] != "anulada" for i in datos.inspecciones_de(arbol_id)
        )

    por_zona = []
    pendientes = []
    hechos = 0
    for zona in zonas:
        de_zona = [e for e in asignados if e.arbol["zona"] == zona]
        listos = [e for e in de_zona if inspeccionado(e.arbol["id"])]
        hechos += len(listos)
        por_zona.append({
            "zona": zona,
            "asignados": len(de_zona),
            "inspeccionados": len(listos),
            "cobertura_pct": _pct(len(listos), len(de_zona)),
        })
        listos_ids = {e.arbol["id"] for e in listos}
        pendientes += [e for e in de_zona if e.arbol["id"] not in listos_ids]

    ids_integrantes = {p["usuario_id"] for p in integrantes}
    propias = [
        i for i in datos.inspecciones if i.get("inspector_id") in ids_integrantes and _en(i["_fecha"], inicio, fin)
    ]
    por_integrante = []
    for p in integrantes:
        mias = [i for i in propias if i["inspector_id"] == p["usuario_id"]]
        por_integrante.append({
            "usuario_id": p["usuario_id"],
            "nombre": p["nombre"],
            "inspecciones": sum(1 for i in mias if i["estado_revision"] != "anulada"),
            "confirmadas": sum(1 for i in mias if i["estado_revision"] == "confirmada"),
            "anuladas": sum(1 for i in mias if i["estado_revision"] == "anulada"),
            "arboles_registrados": sum(
                1 for i in mias if i["origen"] == "registro" and i["estado_revision"] != "anulada"
            ),
        })
    por_integrante.sort(key=lambda x: (-x["inspecciones"], x["nombre"]))
    validas = sum(1 for i in propias if i["estado_revision"] != "anulada")
    revisadas = sum(1 for i in propias if i["estado_revision"] != "pendiente")
    return {
        "periodo": {"desde": desde.isoformat(), "hasta": hasta.isoformat()},
        "cobertura": {
            "arboles_asignados": len(asignados),
            "arboles_inspeccionados": hechos,
            "cobertura_pct": _pct(hechos, len(asignados)),
            "por_zona": por_zona,
            "pendientes": [
                {
                    "id": e.arbol["id"],
                    "codigo": e.arbol["codigo"],
                    "nombre_comun": e.arbol["nombre_comun"],
                    "zona": e.arbol["zona"],
                    "estado": e.estado,
                    "ultima_inspeccion_en": e.inspeccion["fecha"] if e.inspeccion else None,
                }
                for e in sorted(pendientes, key=lambda e: (-SEVERIDAD[e.estado], e.arbol["codigo"]))[:30]
            ],
        },
        "productividad": {
            "integrantes": len(integrantes),
            "inspecciones": validas,
            "confirmadas": sum(1 for i in propias if i["estado_revision"] == "confirmada"),
            "anuladas": sum(1 for i in propias if i["estado_revision"] == "anulada"),
            "pendientes": sum(1 for i in propias if i["estado_revision"] == "pendiente"),
            "pct_confirmadas_de_revisadas": _pct(
                sum(1 for i in propias if i["estado_revision"] == "confirmada"), revisadas
            ),
            "promedio_por_integrante": round(validas / len(integrantes), 1) if integrantes else None,
            "por_integrante": por_integrante,
        },
    }


# ================================ Metas (Fase 2) =================================
# código: (nombre, unidad, sentido, cómo se obtiene del reporte)
INDICADORES_META = {
    "arboles_registrados": ("Árboles registrados en el periodo", "árboles", "mayor",
                            lambda r: r["inventario"]["registrados_periodo"]),
    "inspecciones_confirmadas": ("Inspecciones confirmadas en el periodo", "inspecciones", "mayor",
                                 lambda r: r["cobertura"]["revision"]["confirmadas"]),
    "cobertura_inspeccion_pct": ("Árboles inspeccionados en el periodo", "%", "mayor",
                                 lambda r: r["cobertura"]["cobertura_pct"] or 0),
    "arboles_sanos_pct": ("Árboles sanos al cierre", "%", "mayor",
                          lambda r: _pct(r["riesgo"]["por_estado"]["sano"], r["inventario"]["total_arboles"]) or 0),
    "arboles_criticos": ("Árboles en estado crítico al cierre", "árboles", "menor",
                         lambda r: r["riesgo"]["por_estado"]["critico"]),
    "intervenciones_ejecutadas": ("Intervenciones ejecutadas en el periodo", "intervenciones", "mayor",
                                  lambda r: r["intervenciones"]["ejecutadas_periodo"]),
    "co2_almacenado_kg": ("CO₂ almacenado al cierre", "kg", "mayor",
                          lambda r: r["inventario"]["totales_ambientales"]["co2_kg"]),
    "cobertura_copa_m2": ("Área de copa al cierre", "m²", "mayor",
                          lambda r: r["inventario"]["area_copa_total_m2"]),
    "gasto_ejecutado": ("Gasto ejecutado en intervenciones", "COP", "menor",
                        lambda r: r["intervenciones"]["costo_ejecutado_periodo"]),
}


def evaluar_meta(meta: dict, reporte: dict, hoy: date) -> dict:
    nombre, unidad, sentido, obtener = INDICADORES_META[meta["indicador"]]
    actual = float(obtener(reporte))
    objetivo = float(meta["valor_meta"])
    if sentido == "mayor":
        cumplida = actual >= objetivo
        avance = 100.0 if objetivo == 0 else min(actual * 100 / objetivo, 100.0)
    else:
        cumplida = actual <= objetivo
        avance = 100.0 if cumplida else (objetivo * 100 / actual if actual else 0.0)
    inicio, fin = a_fecha(meta["fecha_inicio"]), a_fecha(meta["fecha_fin"])
    if hoy < inicio:
        estado = "por_iniciar"
    elif cumplida and (sentido == "mayor" or hoy > fin):
        estado = "cumplida"
    elif hoy > fin:
        estado = "no_cumplida"
    else:
        estado = "en_curso"
    return {
        "indicador_nombre": nombre,
        "unidad": unidad,
        "sentido": sentido,
        "valor_actual": round(actual, 2),
        "avance_pct": round(avance, 1),
        "estado": estado,
    }
