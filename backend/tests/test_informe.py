"""Informe del arbolado en PDF y Excel, y datos del módulo de Análisis."""
import io
import re
import zipfile
from datetime import timedelta

import pytest

from servicios import indicadores, informe_arbolado
from tests.test_powerbi import _fuente, api  # noqa: F401 (api es un fixture)


def _partes(contenido: bytes) -> dict[str, str]:
    with zipfile.ZipFile(io.BytesIO(contenido)) as z:
        return {n: z.read(n).decode("utf-8") for n in z.namelist() if n.endswith(".xml")}


# =================================== Resumen ===================================
def test_el_resumen_coincide_con_reportes():
    fuente = _fuente()
    r = informe_arbolado.resumen(informe_arbolado.tablas(fuente), fuente)
    hoy = fuente.generado.date()
    reporte = indicadores.calcular(_fuente().datos, hoy - timedelta(days=400), hoy)
    assert r.total == reporte["inventario"]["total_arboles"] == 12
    assert {"sano": r.cuantos("Sano"), "riesgo": r.cuantos("En riesgo"), "critico": r.cuantos("Crítico")} == reporte["riesgo"]["por_estado"]
    assert r.co2_t * 1000 == pytest.approx(reporte["inventario"]["totales_ambientales"]["co2_kg"], abs=0.1)
    assert r.prioritarios == reporte["riesgo"]["total_prioritarios"]
    assert r.inspeccionados == reporte["cobertura"]["arboles_inspeccionados_periodo"]
    assert (r.ejecutadas, r.programadas, r.vencidas) == (2, 1, 1)
    assert r.costo_ejecutado == 180000 and r.costo_programado == 100000
    assert sum(c + p for _m, c, p in r.por_mes) <= r.inspecciones - r.anuladas
    assert r.varias_sedes and {s["Sede"] for s in r.sedes} == {"San José", "Loperena"}


def test_una_sede_no_trae_tabla_por_institucion():
    fuente = _fuente(una_sede=True)
    r = informe_arbolado.resumen(informe_arbolado.tablas(fuente), fuente)
    assert r.total == 8 and not r.varias_sedes and r.sedes == []


def test_lectura_del_estado_en_palabras():
    fuente = _fuente()
    r = informe_arbolado.resumen(informe_arbolado.tablas(fuente), fuente)
    texto = informe_arbolado.lectura_estado(r)
    assert texto.startswith("De los 12 árboles registrados, 8 están sanos (66,7 %)")


def test_cifras_al_estilo_colombiano():
    assert informe_arbolado.numero(1234567.891, 1) == "1.234.567,9"
    assert informe_arbolado.pesos(180000) == "$ 180.000"
    assert informe_arbolado.porcentaje(None) == "—"


# ===================================== PDF =====================================
def test_pdf_con_portada_secciones_e_inventario():
    contenido = informe_arbolado.generar_pdf(_fuente())
    assert contenido.startswith(b"%PDF-1.4") and contenido.rstrip().endswith(b"%%EOF")
    paginas = int(re.search(rb"/Count (\d+)", contenido).group(1))
    assert paginas >= 3
    for texto in ("Todas las instituciones", "Estado del arbolado", "Especies m\xe1s registradas", "Inventario completo",
                  "IE-011", "Poda sanitaria", "Por instituci\xf3n"):
        assert f"({texto}".encode("cp1252") in contenido, texto
    assert b"Michel" not in contenido and b"Laura" not in contenido


def test_pdf_sin_arboles_no_falla():
    fuente = _fuente(una_sede=True)
    fuente.datos.arboles.clear()
    fuente.datos.inspecciones.clear()
    fuente.datos.intervenciones.clear()
    contenido = informe_arbolado.generar_pdf(fuente)
    assert b"(Todav\xeda no hay \xe1rboles registrados" in contenido


# ==================================== Excel ====================================
def test_excel_con_hojas_tablas_y_graficos():
    partes = _partes(informe_arbolado.generar_excel(_fuente()))
    libro = partes["xl/workbook.xml"]
    hojas = re.findall(r'<sheet name="([^"]+)"', libro)
    assert hojas == ["Resumen", "Árboles", "Prioritarios", "Inspecciones", "Intervenciones", "Hallazgos",
                     "Por institución", "Notas", "Datos de gráficos"]
    graficos = [n for n in partes if n.startswith("xl/charts/chart")]
    assert len(graficos) >= 6
    tablas = [n for n in partes if n.startswith("xl/tables/table")]
    assert len(tablas) == 6  # una por hoja de datos (Notas y el resumen no llevan)
    # Los gráficos leen de la hoja de datos.
    assert all("Datos de gráficos" in partes[g] for g in graficos)
    textos = partes["xl/sharedStrings.xml"]
    assert "Michel" not in textos and "Laura" not in textos
    assert "10-A" in textos and "IE-011" in textos


def test_un_texto_que_parece_formula_queda_como_texto():
    fuente = _fuente(una_sede=True)
    fuente.datos.arboles[0]["zona"] = '=HYPERLINK("http://malo","clic")'
    partes = _partes(informe_arbolado.generar_excel(fuente))
    hojas = [v for k, v in partes.items() if k.startswith("xl/worksheets/sheet")]
    assert not any("<f>" in h for h in hojas)
    assert "=HYPERLINK" in partes["xl/sharedStrings.xml"]


# ================================== Descarga ==================================
@pytest.mark.parametrize("formato, extension", [("pdf", "pdf"), ("xlsx", "xlsx")])
def test_docente_descarga_el_informe(api, formato, extension):  # noqa: F811
    r = api.post("/exportar", json={"conjunto": "todo", "formato": formato})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert re.fullmatch(rf"arbolado-IE001-informe-\d{{4}}-\d{{2}}-\d{{2}}\.{extension}", cuerpo["nombre"])
    ruta = next(k for k in api.base.archivos if k.endswith(f"todo-{formato}.{extension}"))
    contenido = api.base.archivos[ruta]
    assert contenido.startswith(b"%PDF" if formato == "pdf" else b"PK")


@pytest.mark.parametrize("quien, cuerpo, estado", [
    ("est1", {"conjunto": "todo", "formato": "pdf"}, 403),
    ("docente", {"conjunto": "arboles", "formato": "xlsx"}, 422),
    ("docente", {"conjunto": "inspecciones", "formato": "pdf"}, 422),
])
def test_permisos_del_informe(api, quien, cuerpo, estado):  # noqa: F811
    api.como(quien)
    assert api.post("/exportar", json=cuerpo).status_code == estado


# ================================== Análisis ==================================
def test_analisis_trae_las_filas_calculadas(api):  # noqa: F811
    r = api.get("/analisis", params={"institucion_id": "sj"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["alcance"] == "IE San José" and [s["id"] for s in j["sedes"]] == ["sj"]
    assert j["arboles"] and all(a["sede_id"] == "sj" for a in j["arboles"])
    a = j["arboles"][0]
    assert a["estado"] in ("Sano", "En riesgo", "Crítico") and isinstance(a["prioritario"], bool)
    ids = {a["id"] for a in j["arboles"]}
    assert all(i["arbol_id"] in ids for i in j["inspecciones"])
    texto = r.text
    assert "Laura" not in texto and "Mateo" not in texto


def test_analisis_para_estudiantes_tambien(api):  # noqa: F811
    api.como("est1")
    assert api.get("/analisis", params={"institucion_id": "sj"}).status_code == 200


def test_analisis_de_una_institucion_que_no_existe(api):  # noqa: F811
    assert api.get("/analisis", params={"institucion_id": "zz"}).status_code == 404
