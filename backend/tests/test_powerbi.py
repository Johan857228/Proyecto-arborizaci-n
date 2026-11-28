"""Plantilla de Power BI (.pbit): paquete, datos incrustados, validaciones, cifras y descarga."""
import base64
import io
import json
import re
import zipfile
import zlib
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

import db
import main
from auth import Sesion, usuario_actual
from comun import ahora
from servicios import indicadores, informe_powerbi
from servicios.calificacion import Metodo
from servicios.powerbi import Columna, Informe, Medida, PlantillaInvalida, Relacion, Tabla, expresion_m, plantilla
from tests.memoria import BaseMemoria
from tests.test_modulos_api import USUARIOS, _mundo

TEMA = {"name": "Prueba", "dataColors": ["#166534"]}


def _partes(contenido: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(contenido)) as z:
        return {n: z.read(n) for n in z.namelist()}


def _modelo(contenido: bytes) -> dict:
    return json.loads(_partes(contenido)["DataModelSchema"].decode("utf-16-le"))


def _layout(contenido: bytes) -> dict:
    return json.loads(_partes(contenido)["Report/Layout"].decode("utf-16-le"))


def _filas_de_m(lineas: list[str]) -> list[list]:
    """Las filas que trae la consulta de Power Query, decodificadas como lo hace Power BI."""
    texto = "\n".join(lineas)
    trozos = re.search(r"Text\.Combine\(\{(.*?)\}\)", texto, re.S).group(1)
    b64 = "".join(re.findall(r'"([A-Za-z0-9+/=]*)"', trozos))
    return json.loads(zlib.decompress(base64.b64decode(b64), -15).decode("utf-8"))


def _tablas_simples():
    sedes = Tabla("Sedes", [Columna("id", oculta=True), Columna("Sede")], [["sj", "San José"], ["lp", "Loperena"]])
    arboles = Tabla(
        "Árboles",
        [Columna("id", oculta=True), Columna("sede_id", oculta=True), Columna("Especie"), Columna("DAP (cm)", "decimal"),
         Columna("Visitas", "entero"), Columna("Registro", "fecha")],
        [["a1", "sj", 'Mango "de azúcar"', 35.5, 2, date(2026, 3, 1)], ["a2", "lp", "Ceiba", None, 0, "2026-04-11T10:00:00-05:00"],
         ["a3", "lp", None, 12, None, None]],
        [Medida("Total", "COUNTROWS('Árboles')", "#,0")],
    )
    return [sedes, arboles], [Relacion("Árboles", "sede_id", "Sedes", "id")]


def _informe_simple(tablas):
    informe = Informe(tablas, TEMA)
    p = informe.pagina("Uno")
    p.tarjeta((16, 16, 200, 90), "Árboles[Total]")
    p.barras((16, 120, 600, 300), "Por especie", "Árboles[Especie]", "Árboles[Total]")
    return informe


# =================================== Paquete ===================================
def test_paquete_con_las_partes_que_espera_power_bi():
    tablas, relaciones = _tablas_simples()
    partes = _partes(plantilla(tablas, relaciones, _informe_simple(tablas)))
    assert set(partes) == {"Version", "[Content_Types].xml", "DataModelSchema", "Report/Layout", "Settings", "Metadata",
                           "Report/StaticResources/RegisteredResources/Prueba.json"}
    assert partes["Version"].decode("utf-16-le") == "1.28"
    assert partes["[Content_Types].xml"].startswith(b"\xef\xbb\xbf<?xml")
    for nombre in ("DataModelSchema", "Report/Layout", "Settings", "Metadata"):
        assert not partes[nombre].startswith(b"\xff\xfe"), "UTF-16 sin BOM"
        json.loads(partes[nombre].decode("utf-16-le"))
    assert json.loads(partes["Report/StaticResources/RegisteredResources/Prueba.json"])["name"] == "Prueba"


def test_las_filas_viajan_dentro_de_la_consulta():
    tablas, _ = _tablas_simples()
    filas = _filas_de_m(expresion_m(tablas[1]))
    assert filas == [
        ["a1", "sj", 'Mango "de azúcar"', 35.5, 2, "2026-03-01"],
        ["a2", "lp", "Ceiba", None, 0, "2026-04-11"],
        ["a3", "lp", None, 12.0, None, None],
    ]
    m = "\n".join(expresion_m(tablas[1]))
    assert 'Table.TransformColumnTypes(Tabla, {{"id", type text}' in m and '{"Registro", type date}}, "en-US")' in m


def test_tabla_vacia_sigue_siendo_valida():
    vacia = Tabla("Vacía", [Columna("Nombre"), Columna("Cuándo", "fecha")], [])
    assert _filas_de_m(expresion_m(vacia)) == []


def test_modelo_con_relaciones_formatos_y_sin_tablas_de_fechas_automaticas():
    tablas, relaciones = _tablas_simples()
    modelo = _modelo(plantilla(tablas, relaciones, _informe_simple(tablas)))["model"]
    assert modelo["culture"] == "es-CO"
    assert {"name": "__PBI_TimeIntelligenceEnabled", "value": "0"} in modelo["annotations"]
    assert modelo["relationships"][0] | {"name": "x"} == {"name": "x", "fromTable": "Árboles", "fromColumn": "sede_id",
                                                        "toTable": "Sedes", "toColumn": "id"}
    columnas = {c["name"]: c for c in modelo["tables"][1]["columns"]}
    assert columnas["id"]["isHidden"] is True
    assert columnas["Registro"]["dataType"] == "dateTime" and columnas["Registro"]["formatString"] == "dd/mm/yyyy"
    assert columnas["Visitas"]["dataType"] == "int64" and columnas["DAP (cm)"]["dataType"] == "double"
    # Nada de marcar la tabla de fechas: Power BI rechaza la plantilla con la llave en la fecha.
    assert all("isKey" not in c for t in modelo["tables"] for c in t["columns"])


def test_mismo_contenido_genera_el_mismo_archivo():
    tablas, relaciones = _tablas_simples()
    uno = plantilla(tablas, relaciones, _informe_simple(tablas))
    dos = plantilla(tablas, relaciones, _informe_simple(tablas))
    assert _partes(uno)["DataModelSchema"] == _partes(dos)["DataModelSchema"]
    assert _partes(uno)["Report/Layout"] == _partes(dos)["Report/Layout"]


# =================================== Validaciones ===================================
def _con(cambio):
    tablas, relaciones = _tablas_simples()
    cambio(tablas, relaciones)
    return tablas, relaciones


@pytest.mark.parametrize("cambio, texto", [
    (lambda t, r: t[0].filas.append(["sj", "Otra"]), "llaves vacías o repetidas"),
    (lambda t, r: t[0].filas.append([None, "Sin id"]), "llaves vacías o repetidas"),
    (lambda t, r: t[1].medidas.append(Medida("Especie", "1")), "nombre de una columna"),
    (lambda t, r: t[1].medidas.append(Medida("Total", "2")), "repetida"),
    (lambda t, r: t[1].filas.append(["a4", "sj", "Nim", 1.0, "3", None]), "espera un entero"),
    (lambda t, r: t[1].filas.append(["a4", "sj", "Nim", float("nan"), 1, None]), "no puede cargar"),
    (lambda t, r: t[1].filas.append(["a4", "sj", "Nim", 1.0, 1, "ayer"]), "espera una fecha"),
    (lambda t, r: t[1].filas.append(["a4", "sj"]), "tiene 2 valores"),
    (lambda t, r: r.append(Relacion("Árboles", "Visitas", "Sedes", "id")), "distinto tipo"),
    (lambda t, r: r.append(Relacion("Árboles", "sede_id", "Sedes", "nada")), "no existe"),
    (lambda t, r: t[1].columnas.append(Columna("Especie")), "repite una columna"),
], ids=["llave-repetida", "llave-vacia", "medida-como-columna", "medida-repetida", "entero-texto", "nan", "fecha-mala",
        "fila-corta", "relacion-tipos", "relacion-columna", "columna-repetida"])
def test_lo_que_power_bi_rechazaria_se_detecta_antes(cambio, texto):
    tablas, relaciones = _con(cambio)
    with pytest.raises(PlantillaInvalida, match=texto):
        plantilla(tablas, relaciones, Informe(tablas, TEMA))


def test_orden_por_otra_columna_debe_ser_consistente():
    tabla = Tabla("T", [Columna("Estado", ordenar_por="Orden"), Columna("Orden", "entero")], [["Sano", 1], ["Sano", 2]])
    with pytest.raises(PlantillaInvalida, match="dos valores de orden"):
        plantilla([tabla], [], Informe([tabla], TEMA))


@pytest.mark.parametrize("accion, texto", [
    (lambda p: p.tarjeta((0, 0, 100, 100), "Árboles[No existe]"), "no existe en el modelo"),
    (lambda p: p.tarjeta((0, 0, 100, 100), "Otra[Total]"), "no está en el modelo"),
    (lambda p: p.tarjeta((0, 0, 100, 100), "Total"), "mal escrito"),
    (lambda p: p.tarjeta((1200, 0, 200, 100), "Árboles[Total]"), "se sale de la página"),
    (lambda p: p.segmentador((0, 0, 100, 60), "Árboles[Total]"), "debe usar una columna"),
    (lambda p: p.dispersion((0, 0, 400, 300), "D", "Árboles[Especie]", "Árboles[DAP (cm)]", "Árboles[Total]"), "deben ser medidas"),
])
def test_el_informe_solo_usa_campos_que_existen(accion, texto):
    tablas, _ = _tablas_simples()
    with pytest.raises(PlantillaInvalida, match=re.escape(texto)):
        accion(Informe(tablas, TEMA).pagina("Uno"))


# =================================== Informe del arbolado ===================================
def _fuente(una_sede=False) -> informe_powerbi.Fuente:
    hoy = ahora()
    m = Metodo(id="m1", version=1, nombre="Conteo")
    especies = [("Mango", "Mangifera indica"), ("Ceiba", "Ceiba pentandra"), ("Nim", "Azadirachta indica")]
    arboles, inspecciones, observaciones, intervenciones = [], [], {}, []
    for n in range(12):
        sede = "sj" if n < 8 else "lp"
        comun, cientifico = especies[n % 3]
        arboles.append({
            "id": f"a{n}", "codigo": f"IE-{n:03d}", "institucion_id": sede, "zona": ["Patio", "Entrada"][n % 2],
            "especie_id": n % 3 + 1, "nombre_comun": comun, "nombre_cientifico": cientifico, "lat": 10.46, "lng": -73.25,
            "dap_cm": 10.0 + n * 5, "altura_m": 3.0 + n, "copa_m": 2.0 + n / 2, "etapa": "Adulto" if n % 2 else "Juvenil",
            "interferencia": "Cables" if n == 3 else "Ninguna", "registrado_en": (hoy - timedelta(days=300 - n)).isoformat(),
            "ultima_revision": "confirmada", "n_observaciones": 0,
        })
        for k, (estado, revision) in enumerate([("sano", "confirmada"), (["sano", "riesgo", "critico"][n % 3], ["confirmada", "pendiente", "anulada"][n % 3])]):
            iid = f"i{n}-{k}"
            inspecciones.append({
                "id": iid, "arbol_id": f"a{n}", "inspector_id": "u1" if n % 2 else "u2",
                "fecha": (hoy - timedelta(days=250 - n - k * 100)).isoformat(), "origen": "registro" if k == 0 else "seguimiento",
                "dap_cm": 10.0 + n * 5 + k, "altura_m": 3.0 + n, "copa_m": 2.0 + n / 2, "etapa": "Adulto", "interferencia": "Ninguna",
                "metodo_id": "m1", "puntaje_riesgo": float(n % 3), "calificacion": estado, "estado_revision": revision,
                "revisado_en": None if revision == "pendiente" else (hoy - timedelta(days=240 - n - k * 100)).isoformat(),
                "precision_gps_m": 5.0,
                # Datos viejos traían bejucos como sí/no: no deben impedir la descarga.
                "bejucos": False if n == 0 else n % 5, "insectos_sev": 2.0 if n == 1 else None,
            })
            observaciones[iid] = ["f_manchas"] if estado != "sano" else []
    for n, (estado, resultado) in enumerate([("ejecutada", "exitosa"), ("ejecutada", "parcial"), ("programada", None)]):
        intervenciones.append({
            "id": f"v{n}", "arbol_id": f"a{n}", "tipo_codigo": "poda_sanitaria", "estado": estado,
            "fecha_programada": (hoy.date() - timedelta(days=30)).isoformat(),
            "fecha_ejecucion": (hoy.date() - timedelta(days=20)).isoformat() if estado == "ejecutada" else None,
            "costo_estimado": 100000, "costo_real": 90000 if estado == "ejecutada" else None, "resultado": resultado,
            "creado_en": (hoy - timedelta(days=40)).isoformat(),
        })
    if una_sede:
        arboles = [a for a in arboles if a["institucion_id"] == "sj"]
    datos = indicadores.Datos(
        arboles=arboles, inspecciones=inspecciones, observaciones=observaciones,
        catalogo={"f_manchas": {"codigo": "f_manchas", "grupo": "follaje", "etiqueta": "Manchas"}},
        intervenciones=intervenciones, metodos={"m1": m}, metodo_defecto=m,
        perfiles={"u1": {"usuario_id": "u1", "nombre": "Michel Andrade", "curso_id": "c1"},
                  "u2": {"usuario_id": "u2", "nombre": "Laura Quintero", "curso_id": None}},
        cursos={"c1": {"id": "c1", "nombre": "10-A"}},
    )
    instituciones = {"sj": {"nombre": "IE San José", "nombre_corto": "San José", "codigo_dane": "120001000123", "municipio": "Valledupar"},
                     "lp": {"nombre": "Colegio Loperena", "nombre_corto": "Loperena"}}
    return informe_powerbi.Fuente(
        datos=datos, instituciones=instituciones, origenes={"3": "exotica"},
        tipos_intervencion={"poda_sanitaria": {"nombre": "Poda sanitaria"}}, dias_revisita={"sj": 180, "lp": 120},
        alcance="IE San José" if una_sede else "Todas las instituciones", generado=hoy, institucion_id="sj" if una_sede else None,
    )


def _tabla(modelo: dict, nombre: str) -> tuple[list[str], list[list]]:
    t = next(t for t in modelo["model"]["tables"] if t["name"] == nombre)
    return [c["name"] for c in t["columns"]], _filas_de_m(t["partitions"][0]["source"]["expression"])


def _columna(modelo: dict, tabla: str, columna: str) -> list:
    nombres, filas = _tabla(modelo, tabla)
    i = nombres.index(columna)
    return [f[i] for f in filas]


def test_informe_del_arbolado_tiene_sus_tablas_relaciones_y_paginas():
    contenido = informe_powerbi.generar(_fuente())
    modelo = _modelo(contenido)
    assert [t["name"] for t in modelo["model"]["tables"]] == ["Instituciones", "Árboles", "Inspecciones", "Hallazgos", "Intervenciones", "Calendario"]
    assert {(r["fromTable"], r["toTable"]) for r in modelo["model"]["relationships"]} == {
        ("Árboles", "Instituciones"), ("Inspecciones", "Árboles"), ("Intervenciones", "Árboles"),
        ("Hallazgos", "Inspecciones"), ("Inspecciones", "Calendario"), ("Intervenciones", "Calendario")}
    layout = _layout(contenido)
    assert [s["displayName"] for s in layout["sections"]] == [
        "Resumen", "Riesgo", "Inspecciones", "Intervenciones", "Medidas y carbono", "Inventario", "Notas"]
    # Con varias sedes cada página trae el segmentador de sede.
    assert '"Property":"Sede"' in json.dumps(layout["sections"][0], ensure_ascii=False).replace("\\", "")


def test_cada_visual_usa_campos_del_modelo():
    contenido = informe_powerbi.generar(_fuente())
    modelo = _modelo(contenido)
    campos = {(t["name"], c["name"]) for t in modelo["model"]["tables"] for c in t["columns"]}
    campos |= {(t["name"], m["name"]) for t in modelo["model"]["tables"] for m in t.get("measures", [])}
    usados = 0
    for seccion in _layout(contenido)["sections"]:
        for visual in seccion["visualContainers"]:
            consulta = json.loads(visual["config"])["singleVisual"].get("prototypeQuery")
            if not consulta:
                continue
            alias = {f["Name"]: f["Entity"] for f in consulta["From"]}
            for item in consulta["Select"]:
                ref = item.get("Column") or item.get("Measure")
                assert (alias[ref["Expression"]["SourceRef"]["Source"]], ref["Property"]) in campos
                usados += 1
    assert usados > 60


def test_las_cifras_coinciden_con_reportes():
    fuente = _fuente()
    modelo = _modelo(informe_powerbi.generar(fuente))
    hoy = fuente.generado.date()
    otra = _fuente().datos
    reporte = indicadores.calcular(otra, hoy - timedelta(days=400), hoy)
    estados = _columna(modelo, "Árboles", "Estado")
    assert len(estados) == reporte["inventario"]["total_arboles"] == 12
    assert {e: estados.count(n) for e, n in (("sano", "Sano"), ("riesgo", "En riesgo"), ("critico", "Crítico"))} == reporte["riesgo"]["por_estado"]
    co2 = sum(v or 0 for v in _columna(modelo, "Árboles", "CO2 almacenado (kg)"))
    assert co2 == pytest.approx(reporte["inventario"]["totales_ambientales"]["co2_kg"], abs=0.1)
    prioritarios = _columna(modelo, "Árboles", "Prioritario").count("Sí")
    assert prioritarios == reporte["riesgo"]["total_prioritarios"]
    # Cobertura del periodo completo: árboles con alguna inspección no anulada.
    nombres, filas = _tabla(modelo, "Inspecciones")
    validas = {f[nombres.index("arbol_id")] for f in filas if f[nombres.index("Revisión")] != "Anulada"}
    assert len(validas) == reporte["cobertura"]["arboles_inspeccionados_periodo"]
    assert _columna(modelo, "Intervenciones", "Vencida") == ["No", "No", "Sí"]
    bejucos = _columna(modelo, "Inspecciones", "Bejucos (severidad)")
    assert bejucos[0] is None and 4 in bejucos  # la primera es del árbol con bejucos = False
    assert 2 in _columna(modelo, "Inspecciones", "Insectos (severidad)")


def test_sin_nombres_de_personas_y_con_el_curso():
    contenido = informe_powerbi.generar(_fuente())
    modelo = _modelo(contenido)
    texto = json.dumps([_filas_de_m(t["partitions"][0]["source"]["expression"]) for t in modelo["model"]["tables"]], ensure_ascii=False)
    texto += json.dumps(_layout(contenido), ensure_ascii=False)
    assert "Michel" not in texto and "Laura" not in texto
    assert set(_columna(modelo, "Inspecciones", "Curso")) == {"10-A", "Sin curso"}


def test_una_sola_sede_sin_segmentador_de_sede():
    contenido = informe_powerbi.generar(_fuente(una_sede=True))
    assert _columna(_modelo(contenido), "Instituciones", "Sede") == ["San José"]
    layout = json.dumps(_layout(contenido), ensure_ascii=False).replace("\\", "")
    assert '"Property":"Sede"' not in layout


def test_calendario_cubre_todas_las_fechas_sin_huecos():
    modelo = _modelo(informe_powerbi.generar(_fuente()))
    fechas = [date.fromisoformat(f) for f in _columna(modelo, "Calendario", "Fecha")]
    assert fechas == [fechas[0] + timedelta(days=i) for i in range(len(fechas))]
    assert fechas[0].day == 1
    usadas = _columna(modelo, "Inspecciones", "Fecha") + _columna(modelo, "Intervenciones", "Fecha")
    assert all(fechas[0] <= date.fromisoformat(f) <= fechas[-1] for f in usadas if f)


# =================================== Descarga ===================================
@pytest.fixture
def api(monkeypatch):
    base = BaseMemoria(_mundo())
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: base)
    monkeypatch.setattr(db, "get_admin", lambda: base)

    def como(clave):
        uid = USUARIOS[clave][0]
        main.app.dependency_overrides[usuario_actual] = lambda: Sesion(token=clave, user_id=uid, email=f"{clave}@x.co")

    cliente = TestClient(main.app)
    cliente.como, cliente.base = como, base
    como("docente")
    yield cliente
    main.app.dependency_overrides.clear()


def test_docente_descarga_la_plantilla_de_su_institucion(api):
    r = api.post("/exportar", json={"conjunto": "todo", "formato": "pbit"})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["formato"] == "pbit" and re.fullmatch(r"arbolado-IE001-power-bi-\d{4}-\d{2}-\d{2}\.pbit", cuerpo["nombre"])
    ruta = next(k for k in api.base.archivos if k.endswith("todo-pbit.pbit"))
    modelo = _modelo(api.base.archivos[ruta])
    assert _columna(modelo, "Instituciones", "Sede") == ["San José"]
    assert all(c.startswith("IE001") for c in _columna(modelo, "Árboles", "Código"))


def test_administrador_descarga_todas_las_instituciones(api):
    api.como("admin")
    r = api.post("/exportar", json={"conjunto": "todo", "formato": "pbit"})
    assert r.status_code == 200, r.text
    assert r.json()["nombre"].startswith("arbolado-todas-power-bi-")


@pytest.mark.parametrize("quien, cuerpo, estado", [
    ("est1", {"conjunto": "todo", "formato": "pbit"}, 403),
    ("docente", {"conjunto": "arboles", "formato": "pbit"}, 422),
    ("docente", {"conjunto": "todo", "formato": "csv"}, 422),
])
def test_permisos_y_combinaciones(api, quien, cuerpo, estado):
    api.como(quien)
    assert api.post("/exportar", json=cuerpo).status_code == estado
