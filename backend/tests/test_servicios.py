"""Pruebas de la lógica de los módulos (sin base de datos)."""
from datetime import date, datetime, timedelta, timezone

import pytest

from comun import ZONA_HORARIA
from servicios import escenarios, gamificacion, indicadores, presupuesto
from servicios.calificacion import Metodo, calificacion, evaluar, puntaje
from servicios.recomendaciones import recomendar

V1 = Metodo(id="m1", version=1, nombre="Conteo")


# ------------------------------- Método de cálculo -------------------------------
@pytest.mark.parametrize("n,esperado", [(0, "sano"), (1, "riesgo"), (3, "riesgo"), (4, "critico"), (9, "critico")])
def test_version_1_equivale_al_semaforo_provisional(n, esperado):
    hallazgos = [(f"c{i}", "follaje") for i in range(n)]
    assert evaluar(V1, hallazgos, "Ninguna") == (n, esperado)


def test_pesos_por_grupo_codigo_e_interferencia():
    m = Metodo(id="m2", version=2, nombre="Pesado", peso_plagas=3, peso_interferencia=1.5,
               pesos_observacion={"t_micelio": 5}, umbral_riesgo=2, umbral_critico=6)
    assert puntaje(m, [("p_termitas", "plagas"), ("t_micelio", "tronco")], "Cables eléctricos") == 9.5
    assert puntaje(m, [("f_manchas", "follaje")], "Ninguna") == 1
    assert calificacion(m, 1) == "sano" and calificacion(m, 2) == "riesgo" and calificacion(m, 6) == "critico"


def test_metodo_desde_fila_convierte_numeros():
    m = Metodo.desde_fila({"id": "x", "version": 3, "nombre": "N", "peso_raiz": "2.50", "umbral_riesgo": 1,
                           "umbral_critico": "4", "pesos_observacion": {"r_cortes": "1.5"}, "factor_raiz": None})
    assert m.peso_raiz == 2.5 and m.umbral_critico == 4.0 and m.pesos_observacion == {"r_cortes": 1.5}
    assert m.factor_raiz == 0.24  # sin valor se usa la constante de calculos.py


# ---------------------------------- Recomendaciones ----------------------------------
def test_recomendaciones_por_hallazgos_interferencia_y_estado():
    arbol = {"estado": "critico", "interferencia": "Cables eléctricos", "etapa": "Senescente",
             "ultima_inspeccion_en": "2026-10-10T15:00:00+00:00"}
    tipos = {r["tipo_codigo"]: r for r in recomendar(arbol, {"plagas", "raiz"}, [])}
    assert set(tipos) == {"control_plagas", "evaluacion_riesgo", "poda_despeje", "tala_reposicion"}
    assert tipos["control_plagas"]["prioridad"] == 3  # en un árbol crítico las plagas son prioridad alta
    assert "Calificación crítica" in tipos["evaluacion_riesgo"]["motivo"]


def test_recomendacion_desaparece_si_ya_esta_atendida():
    arbol = {"estado": "riesgo", "interferencia": "Ninguna", "etapa": "Adulto", "ultima_inspeccion_en": "2026-10-10T15:00:00+00:00"}
    antes = [{"tipo_codigo": "control_plagas", "estado": "ejecutada", "fecha_ejecucion": "2026-10-01"}]
    despues = [{"tipo_codigo": "control_plagas", "estado": "ejecutada", "fecha_ejecucion": "2026-10-11"}]
    programada = [{"tipo_codigo": "control_plagas", "estado": "programada", "fecha_programada": "2026-12-01"}]
    assert [r["tipo_codigo"] for r in recomendar(arbol, {"plagas"}, antes)] == ["control_plagas"]
    assert recomendar(arbol, {"plagas"}, despues) == []
    assert recomendar(arbol, {"plagas"}, programada) == []


def test_arbol_sano_joven_recibe_mantenimiento_de_baja_prioridad():
    r = recomendar({"estado": "sano", "interferencia": "Ninguna", "etapa": "Juvenil"}, set(), [])
    assert [(x["tipo_codigo"], x["prioridad_nombre"]) for x in r] == [("poda_formacion", "baja")]


# ------------------------------------ Indicadores ------------------------------------
def _arbol(i, zona="Patio central", registrado="2026-02-01T12:00:00+00:00", **extra):
    return {"id": f"a{i}", "codigo": f"IE001-000{i}", "institucion_id": "sj", "zona": zona, "nombre_comun": "Mango",
            "registrado_en": registrado, "dap_cm": 30, "altura_m": 8, "copa_m": 4, "etapa": "Adulto",
            "interferencia": "Ninguna", "n_observaciones": 0, **extra}


def _insp(i, arbol, fecha, calificacion="sano", estado="confirmada", inspector="u1", origen="seguimiento", **extra):
    return {"id": f"i{i}", "arbol_id": arbol, "inspector_id": inspector, "fecha": fecha, "origen": origen,
            "dap_cm": 30, "altura_m": 8, "copa_m": 4, "etapa": "Adulto", "interferencia": "Ninguna",
            "calificacion": calificacion, "puntaje_riesgo": 0, "estado_revision": estado, "revisado_en": None,
            "metodo_id": "m1", "precision_gps_m": None, **extra}


def test_estado_a_una_fecha_usa_la_ultima_inspeccion_no_anulada():
    datos = indicadores.Datos(
        arboles=[_arbol(1)],
        inspecciones=[
            _insp(1, "a1", "2026-02-01T12:00:00+00:00", "sano", origen="registro"),
            _insp(2, "a1", "2026-05-01T12:00:00+00:00", "critico"),
            _insp(3, "a1", "2026-06-01T12:00:00+00:00", "sano", estado="anulada"),
        ],
        metodos={"m1": V1},
    )
    marzo = indicadores.estados_al_corte(datos, datetime(2026, 3, 1, tzinfo=timezone.utc))
    julio = indicadores.estados_al_corte(datos, datetime(2026, 7, 1, tzinfo=timezone.utc))
    assert marzo["a1"].estado == "sano" and julio["a1"].estado == "critico"
    enero = indicadores.estados_al_corte(datos, datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert enero == {}  # todavía no estaba registrado


def test_reporte_completo_de_indicadores():
    datos = indicadores.Datos(
        arboles=[_arbol(1), _arbol(2, zona="Zona deportiva", interferencia="Cables eléctricos")],
        inspecciones=[
            _insp(1, "a1", "2026-03-01T12:00:00+00:00", origen="registro"),
            _insp(2, "a2", "2026-03-02T12:00:00+00:00", "critico", estado="pendiente", inspector="u2", origen="registro",
                  interferencia="Cables eléctricos", puntaje_riesgo=5),
            _insp(3, "a1", "2026-04-02T12:00:00+00:00", estado="anulada", revisado_en="2026-04-03T12:00:00+00:00"),
        ],
        observaciones={"i2": ["p_termitas", "f_manchas"]},
        catalogo={"p_termitas": {"grupo": "plagas", "etiqueta": "Termitas"}, "f_manchas": {"grupo": "follaje", "etiqueta": "Manchas"}},
        intervenciones=[
            {"id": "x1", "arbol_id": "a2", "estado": "ejecutada", "tipo_codigo": "poda_despeje", "fecha_ejecucion": "2026-04-10",
             "costo_real": 200000, "resultado": "exitosa"},
            {"id": "x2", "arbol_id": "a2", "estado": "programada", "tipo_codigo": "control_plagas", "fecha_programada": "2026-03-01",
             "costo_estimado": 120000},
        ],
        metodos={"m1": V1},
        perfiles={"u1": {"nombre": "Ana", "curso_id": "c1"}, "u2": {"nombre": "Beto", "curso_id": None}},
        cursos={"c1": {"nombre": "10-A"}},
    )
    r = indicadores.calcular(datos, date(2026, 1, 1), date(2026, 12, 31), dias_revisita=180)
    assert r["inventario"]["total_arboles"] == 2 and r["inventario"]["registrados_periodo"] == 2
    assert r["inventario"]["area_copa_total_m2"] == pytest.approx(2 * 3.1416 * 4, abs=0.01)
    assert r["riesgo"]["por_estado"] == {"sano": 1, "riesgo": 0, "critico": 1}
    assert r["riesgo"]["arboles_prioritarios"][0]["codigo"] == "IE001-0002"
    assert {h["codigo"] for h in r["riesgo"]["hallazgos_frecuentes"]} == {"p_termitas", "f_manchas"}
    assert r["cobertura"]["arboles_inspeccionados_periodo"] == 2 and r["cobertura"]["cobertura_pct"] == 100
    assert r["cobertura"]["revision"] == {"confirmadas": 1, "anuladas": 1, "pendientes": 1,
                                           "pct_revisadas": 66.7, "pct_confirmadas_de_revisadas": 50.0}
    assert r["productividad"]["inspecciones_periodo"] == 3 and r["productividad"]["horas_promedio_revision"] == 24.0
    assert [c["nombre"] for c in r["productividad"]["por_curso"]] == ["10-A", "Sin curso"]
    assert r["intervenciones"]["costo_ejecutado_periodo"] == 200000 and r["intervenciones"]["eficacia_pct"] == 100.0
    assert r["intervenciones"]["programadas"] == 1


def test_avance_de_curso_por_zona_y_productividad():
    datos = indicadores.Datos(
        arboles=[_arbol(1), _arbol(2), _arbol(3, zona="Entrada principal")],
        inspecciones=[
            _insp(1, "a1", "2026-09-01T12:00:00+00:00", inspector="u1"),
            _insp(2, "a2", "2026-09-02T12:00:00+00:00", inspector="u1", estado="anulada"),
        ],
    )
    curso = {"id": "c1", "institucion_id": "sj"}
    r = indicadores.avance_curso(datos, curso, ["Patio central"], [{"usuario_id": "u1", "nombre": "Ana"}],
                                 date(2026, 8, 1), date(2026, 9, 30))
    assert r["cobertura"]["arboles_asignados"] == 2 and r["cobertura"]["arboles_inspeccionados"] == 1
    assert r["cobertura"]["pendientes"][0]["codigo"] == "IE001-0002"
    assert r["productividad"]["inspecciones"] == 1 and r["productividad"]["anuladas"] == 1


@pytest.mark.parametrize(
    "indicador,valor_meta,hoy,estado",
    [
        ("arboles_registrados", 2, date(2026, 6, 1), "cumplida"),
        ("arboles_registrados", 4, date(2026, 6, 1), "en_curso"),
        ("arboles_registrados", 4, date(2027, 1, 5), "no_cumplida"),
        ("arboles_criticos", 2, date(2026, 6, 1), "en_curso"),      # menor es mejor: se decide al cierre
        ("arboles_criticos", 2, date(2027, 1, 5), "cumplida"),
        ("arboles_registrados", 1, date(2025, 6, 1), "por_iniciar"),
    ],
)
def test_estado_de_las_metas(indicador, valor_meta, hoy, estado):
    reporte = {"inventario": {"registrados_periodo": 2}, "riesgo": {"por_estado": {"critico": 1}}}
    meta = {"indicador": indicador, "valor_meta": valor_meta, "fecha_inicio": "2026-01-01", "fecha_fin": "2026-12-31"}
    assert indicadores.evaluar_meta(meta, reporte, hoy)["estado"] == estado


# ------------------------------------ Gamificación ------------------------------------
def test_niveles():
    assert gamificacion.nivel(0)["nombre"] == "Semilla"
    n = gamificacion.nivel(100)
    assert n["nombre"] == "Brote" and n["faltan"] == 50 and n["progreso_pct"] == 50.0
    assert gamificacion.nivel(5000)["siguiente"] is None


def test_racha_semanal():
    hoy = date(2026, 10, 15)  # jueves
    lunes = [datetime(2026, 10, 12, 15, tzinfo=ZONA_HORARIA) - timedelta(weeks=k) for k in (0, 1, 2, 4)]
    r = gamificacion.rachas([f.isoformat() for f in lunes], hoy)
    assert r == {"actual": 3, "mejor": 3, "semanas_activas": 4}
    vieja = gamificacion.rachas([(datetime(2026, 9, 1, tzinfo=ZONA_HORARIA)).isoformat()], hoy)
    assert vieja["actual"] == 0 and vieja["mejor"] == 1


def test_puntos_solo_por_inspecciones_confirmadas():
    puntos = {"a1": gamificacion.PuntosInstitucion(10, 15)}
    insp = [
        _insp(1, "a1", "2026-10-12T15:00:00+00:00", origen="registro"),
        _insp(2, "a1", "2026-10-13T15:00:00+00:00"),
        _insp(3, "a1", "2026-10-14T15:00:00+00:00", estado="pendiente"),
        _insp(4, "a1", "2026-10-14T16:00:00+00:00", estado="anulada"),
    ]
    p = gamificacion.progreso_usuario("u1", insp, {"i2": ["f_manchas"]}, puntos, date(2026, 10, 15))
    assert p["puntos"] == 35
    assert p["resumen"] == {"inspecciones": 3, "confirmadas": 2, "pendientes": 1, "anuladas": 1, "arboles_registrados": 1}
    logros = {l["codigo"]: l for l in p["logros"]}
    assert logros["primer_registro"]["obtenido"] and not logros["explorador"]["obtenido"]
    assert logros["explorador"]["progreso"] == 2 and logros["impecable"]["progreso"] == 0


def test_rankings_con_empates():
    puntos = {"a1": gamificacion.PuntosInstitucion(10, 0)}
    insp = [_insp(1, "a1", "x", inspector="u1"), _insp(2, "a1", "x", inspector="u2"), _insp(3, "a1", "x", inspector="u3"),
            _insp(4, "a1", "x", inspector="u3")]
    perfiles = {"u1": {"nombre": "Ana", "curso_id": "c1"}, "u2": {"nombre": "Beto", "curso_id": "c1"},
                "u3": {"nombre": "Caro", "curso_id": "c2"}, "u4": {"nombre": "Dani", "curso_id": None}}
    ind = gamificacion.ranking_individual(insp, perfiles, puntos)
    assert [(f["nombre"], f["posicion"]) for f in ind] == [("Caro", 1), ("Ana", 2), ("Beto", 2), ("Dani", 4)]
    cursos = gamificacion.ranking_cursos(ind, {"c1": {"nombre": "10-A"}, "c2": {"nombre": "10-B"}})
    assert [(c["nombre"], c["puntos"], c["promedio_por_integrante"]) for c in cursos] == [("10-A", 20, 10.0), ("10-B", 20, 20.0)]


# ------------------------------------ Presupuesto ------------------------------------
def test_resumen_de_presupuesto():
    p = {"fecha_inicio": "2026-01-01", "fecha_fin": "2026-12-31", "monto_asignado": 1_000_000}
    intervenciones = [
        {"estado": "ejecutada", "tipo_codigo": "poda_sanitaria", "fecha_ejecucion": "2026-03-10", "costo_real": 150000},
        {"estado": "ejecutada", "tipo_codigo": "poda_sanitaria", "fecha_ejecucion": "2025-12-31", "costo_real": 999},
        {"estado": "programada", "tipo_codigo": "control_plagas", "fecha_programada": "2026-11-01", "costo_estimado": None},
        {"estado": "cancelada", "tipo_codigo": "otra", "fecha_programada": "2026-11-01", "costo_estimado": 5},
    ]
    recomendaciones = [{"tipo_codigo": "evaluacion_riesgo"}]
    costos = {"control_plagas": 120000, "evaluacion_riesgo": 180000}
    r = presupuesto.resumen(p, intervenciones, recomendaciones, costos, date(2026, 7, 2))
    assert r["ejecutado"] == 150000 and r["comprometido"] == 120000 and r["recomendado_sin_programar"] == 180000
    assert r["disponible"] == 730000 and r["proyeccion_total"] == 450000 and r["saldo_proyectado"] == 550000
    assert r["dias_transcurridos"] == 183 and r["proyeccion_ritmo_actual"] == pytest.approx(150000 / 183 * 365, abs=0.01)
    assert r["por_mes"] == [{"mes": "2026-03", "ejecutado": 150000}]
    cerrado = presupuesto.resumen(p, intervenciones, recomendaciones, costos, date(2027, 2, 1))
    assert cerrado["recomendado_sin_programar"] == 0 and not cerrado["vigente"]


def test_periodos_que_se_cruzan():
    assert presupuesto.se_cruzan(date(2026, 1, 1), date(2026, 6, 30), date(2026, 6, 30), date(2026, 12, 31))
    assert not presupuesto.se_cruzan(date(2026, 1, 1), date(2026, 6, 29), date(2026, 6, 30), date(2026, 12, 31))


# ------------------------------------ Escenarios ------------------------------------
def _cand(arbol, tipo, costo, prioridad=2, estado="riesgo", puntaje=1):
    return {"arbol_id": arbol, "codigo": arbol, "tipo_codigo": tipo, "costo": costo, "prioridad": prioridad,
            "estado": estado, "puntaje_riesgo": puntaje}


def test_escenario_por_riesgo_y_por_cantidad():
    candidatas = [
        _cand("a1", "evaluacion_riesgo", 180000, 3, "critico", 6),
        _cand("a2", "control_plagas", 120000, 2),
        _cand("a3", "riego", 40000, 1, "sano", 0),
        _cand("a4", "poda", 90000, 2),
    ]
    riesgo = escenarios.simular(candidatas, 300000, "riesgo")
    # primero la crítica; entre las de prioridad media va primero la más barata
    assert [c["arbol_id"] for c in riesgo["incluidas"]] == ["a1", "a4"]
    assert riesgo["saldo"] == 30000 and riesgo["criticos_atendidos"] == 1
    assert [c["arbol_id"] for c in riesgo["excluidas"]] == ["a2", "a3"] and riesgo["faltante"] == 130000
    cantidad = escenarios.simular(candidatas, 300000, "cantidad")
    assert [c["arbol_id"] for c in cantidad["incluidas"]] == ["a3", "a4", "a2"]
    assert cantidad["criticos_sin_atender"] == 1
