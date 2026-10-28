"""Catálogo de especies con fuente oficial (migración 015). GBIF se reemplaza por respuestas
con la misma forma que las reales (sin red)."""
import pytest

from servicios import fuentes_oficiales as fuentes
from tests.test_modulos_api import api  # noqa: F401 (api es un fixture)

C, EX, GR, AM, BS = (x.uuid for x in fuentes.LISTAS)


def _dataset(version, doi, fecha):
    return {"version": version, "doi": doi, "pubDate": f"{fecha}T00:00:00.000+00:00"}


DATASETS = {
    f"/dataset/{C}": _dataset("1.3", "10.15472/7avdhn", "2023-09-11"),
    f"/dataset/{EX}": _dataset("1.3", "10.15472/dm7hxc", "2024-11-08"),
    f"/dataset/{GR}": _dataset("1.6", "10.15468/yznr8v", "2022-06-30"),
    f"/dataset/{AM}": _dataset("1.2", "10.15472/frowz3", "2024-02-15"),
    f"/dataset/{BS}": _dataset("1.0", "10.15472/j2zpi7", "2017-02-09"),
}


class GbifFalso:
    """Responde /species/search por lista y nombre, y las rutas de cada registro."""

    def __init__(self, listas: dict[tuple[str, str], list[dict]], rutas: dict[str, dict] | None = None):
        self.listas, self.rutas, self.llamadas = listas, {**DATASETS, **(rutas or {})}, []

    def __call__(self, ruta, parametros=None):
        self.llamadas.append(ruta)
        if ruta == "/species/search":
            return {"results": self.listas.get((parametros["datasetKey"], parametros["q"].lower()), [])}
        return self.rutas.get(ruta, {"results": []})


def _uso(clave, nombre, estado="ACCEPTED", **extra):
    return {"key": clave, "canonicalName": nombre, "scientificName": f"{nombre} Autor", "taxonomicStatus": estado, **extra}


ROBLE = GbifFalso(
    {(C, "tabebuia rosea"): [_uso(166200062, "Tabebuia rosea")], (BS, "tabebuia rosea"): [_uso(100068152, "Tabebuia rosea")]},
    {"/species/166200062/distributions": {"results": [{"locality": "Atlántico, Bolívar, Cesar, Magdalena", "country": "CO"}]},
     "/species/166200062/speciesProfiles": {"results": [{"lifeForm": "Arbolito, Árbol"}]}},
)


@pytest.fixture(autouse=True)
def _sin_cache():
    fuentes._metadatos.clear()


# ------------------------------------ Consulta ------------------------------------
def test_nativa_del_bosque_seco_del_cesar_con_version_y_doi():
    ficha = fuentes.consultar("Tabebuia rosea (Bertol.) DC.", ROBLE)
    assert ficha["coincidencia"] == "exacta" and ficha["nombre_consultado"] == "Tabebuia rosea"
    assert ficha["origen"] == "nativa" and ficha["estatus"] is None
    assert ficha["departamentos"] == ["Atlántico", "Bolívar", "Cesar", "Magdalena"] and ficha["en_cesar"]
    assert ficha["forma_de_vida"] == "Arbolito, Árbol"
    assert ficha["bosque_seco"] and fuentes.bosque_seco_del_cesar(ficha)
    assert ficha["invasora"] is False and ficha["amenaza"] is None and ficha["avisos"] == []
    catalogo = ficha["fuentes"][0]
    assert catalogo["clave"] == "catalogo" and catalogo["version"] == "1.3" and catalogo["doi"] == "10.15472/7avdhn"
    assert catalogo["publicado"] == "2023-09-11" and catalogo["registro_url"] == "https://www.gbif.org/species/166200062"
    assert catalogo["dato"] == "Nativa; registrada en 4 departamentos (incluido Cesar)."
    assert [f["clave"] for f in ficha["fuentes"]] == ["catalogo", "exoticas", "griis", "amenazadas", "bosque_seco"]
    assert [f["encontrada"] for f in ficha["fuentes"]] == [True, False, False, False, True]
    assert ficha["fuentes"][3]["dato"] == "No está en la lista de especies amenazadas."


def test_exotica_naturalizada_con_riesgo_de_invasion():
    gbif = GbifFalso(
        {(C, "leucaena leucocephala"): [_uso(166216727, "Leucaena leucocephala")],
         (EX, "leucaena leucocephala"): [_uso(190692517, "Leucaena leucocephala")],
         (GR, "leucaena leucocephala"): [_uso(148737358, "Leucaena leucocephala")]},
        {"/species/166216727/distributions": {"results": [{"locality": "Cesar, Meta", "country": "CO", "establishmentMeans": "MANAGED"}]},
         "/species/190692517/descriptions": {"results": [
             {"type": "Potencial de establecimiento e invasión Lista Flora Exótica", "description": "Alto Riesgo"},
             {"type": "Origen", "description": "Exótica"},
             {"type": "Estatus en Colombia", "description": "Naturalizada"},
             {"type": "Referencia", "description": "Cárdenas-López et al. 2010"}]},
         "/species/148737358/distributions": {"results": [{"country": "CO", "establishmentMeans": "INTRODUCED"}]}},
    )
    ficha = fuentes.consultar("Leucaena leucocephala", gbif)
    assert ficha["origen"] == "exotica" and ficha["estatus"] == "naturalizada"
    assert ficha["invasora"] is False and ficha["riesgo_invasion"] == "Alto Riesgo"
    assert not fuentes.bosque_seco_del_cesar(ficha) and ficha["avisos"] == []
    assert ficha["fuentes"][0]["dato"] == "Cultivada; registrada en 2 departamentos (incluido Cesar)."
    assert ficha["fuentes"][1]["dato"] == "Exótica, naturalizada, potencial de invasión: alto riesgo."
    assert ficha["fuentes"][2]["dato"] == "Registrada como introducida en Colombia."


def test_invasora_oficial_y_amenazada():
    gbif = GbifFalso(
        {(EX, "ulex europaeus"): [_uso(1, "Ulex europaeus")]},
        {"/species/1/descriptions": {"results": [{"type": "Origen", "description": "Exótica"},
                                                 {"type": "Potencial de establecimiento e invasión", "description": "Invasora"}]}},
    )
    ficha = fuentes.consultar("Ulex europaeus", gbif)
    assert ficha["invasora"] is True and ficha["riesgo_invasion"] is None and ficha["origen"] == "exotica"
    assert any("invasora" in a for a in ficha["avisos"]) and any("Catálogo" in a for a in ficha["avisos"])

    # La declaración oficial viene aparte del potencial de invasión.
    retamo = GbifFalso(
        {(EX, "ulex europaeus"): [_uso(4, "Ulex europaeus")]},
        {"/species/4/descriptions": {"results": [
            {"type": "Potencial de establecimiento e invasión Lista Flora Exótica", "description": "Alto Riesgo"},
            {"type": "Categoría según van Kleunen et al. (2015)", "description": "Invasora"},
            {"type": "Invasividad Resolución 207 MADS", "description": "Invasora"},
            {"type": "Origen", "description": "Exótica"}]}},
    )
    ficha = fuentes.consultar("Ulex europaeus", retamo)
    assert ficha["invasora"] is True and ficha["riesgo_invasion"] == "Alto Riesgo"
    assert ficha["fuentes"][1]["dato"] == "Exótica, declarada invasora (Resolución 207 de 2010), potencial de invasión: alto riesgo."
    solo_global = GbifFalso(
        {(EX, "ulex europaeus"): [_uso(4, "Ulex europaeus")]},
        {"/species/4/descriptions": {"results": [{"type": "Categoría según van Kleunen et al. (2015)", "description": "Invasora"}]}})
    assert fuentes.consultar("Ulex europaeus", solo_global)["invasora"] is False

    caoba = GbifFalso({(AM, "swietenia macrophylla"): [_uso(2, "Swietenia macrophylla", threatStatuses=["CRITICALLY_ENDANGERED"])]})
    assert fuentes.consultar("Swietenia macrophylla", caoba)["amenaza"] == "CR"
    sin_estado = GbifFalso({(AM, "cedrela odorata"): [_uso(3, "Cedrela odorata", threatStatuses=[])]},
                           {"/species/3/distributions": {"results": [{"threatStatus": "ENDANGERED"}]}})
    ficha = fuentes.consultar("Cedrela odorata", sin_estado)
    assert ficha["amenaza"] == "EN" and ficha["fuentes"][3]["dato"] == "En peligro (EN)."


def test_sinonimo_busca_tambien_con_el_nombre_aceptado():
    gbif = GbifFalso(
        {(C, "tabebuia chrysantha"): [_uso(166199380, "Tabebuia chrysantha", "SYNONYM", acceptedKey=166199377)],
         (C, "handroanthus chrysanthus"): [_uso(166199377, "Handroanthus chrysanthus")],
         (BS, "handroanthus chrysanthus"): [_uso(9, "Handroanthus chrysanthus")]},
        {"/species/166199377": {"canonicalName": "Handroanthus chrysanthus"},
         "/species/166199377/distributions": {"results": [{"locality": "Cesar", "country": "CO"}]}},
    )
    ficha = fuentes.consultar("Tabebuia chrysantha", gbif)
    assert ficha["coincidencia"] == "sinonimo" and ficha["nombre_aceptado"] == "Handroanthus chrysanthus"
    assert ficha["bosque_seco"] and ficha["en_cesar"] and ficha["origen"] == "nativa"
    assert ficha["fuentes"][0]["dato"].startswith("Sinónimo de Handroanthus chrysanthus.")
    assert any("sinónimo" in a for a in ficha["avisos"])

    # El Catálogo deja el sinónimo sin ubicar ("Incertae sedis"): se usa el árbol taxonómico de GBIF.
    gbif.rutas["/species/166199377"] = {"canonicalName": "Incertae sedis"}
    gbif.rutas["/species/match"] = {"status": "SYNONYM", "matchType": "EXACT", "species": "Handroanthus chrysanthus"}
    gbif.listas[(C, "handroanthus chrysanthus")] = [_uso(7, "Handroanthus chrysanthus")]
    gbif.rutas["/species/7/distributions"] = {"results": [{"locality": "Cesar, La Guajira", "country": "CO"}]}
    ficha = fuentes.consultar("Tabebuia chrysantha", gbif)
    assert ficha["coincidencia"] == "sinonimo" and ficha["nombre_aceptado"] == "Handroanthus chrysanthus"
    assert ficha["departamentos"] == ["Cesar", "La Guajira"] and fuentes.bosque_seco_del_cesar(ficha)

    # Nombre antiguo que el Catálogo no trae: también se resuelve con GBIF.
    gbif.listas.pop((C, "tabebuia chrysantha"))
    assert fuentes.consultar("Tabebuia chrysantha", gbif)["coincidencia"] == "sinonimo"

    # Sinónimo sin nombre aceptado en ninguna parte: no se inventa el origen.
    sin_aceptado = GbifFalso({(C, "tabebuia chrysantha"): [_uso(1, "Tabebuia chrysantha", "SYNONYM", acceptedKey=2)]},
                             {"/species/2": {"canonicalName": "Incertae sedis"}})
    ficha = fuentes.consultar("Tabebuia chrysantha", sin_aceptado)
    assert ficha["coincidencia"] == "sinonimo" and ficha["nombre_aceptado"] is None and ficha["origen"] is None
    assert ficha["fuentes"][0]["dato"] == "Aparece como sinónimo, sin nombre aceptado."


def test_listas_que_no_coinciden_y_nombre_no_encontrado():
    coco = GbifFalso({(C, "cocos nucifera"): [_uso(166200141, "Cocos nucifera")], (GR, "cocos nucifera"): [_uso(5, "Cocos nucifera")]},
                     {"/species/5/distributions": {"results": [{"establishmentMeans": "INTRODUCED"}]}})
    ficha = fuentes.consultar("Cocos nucifera", coco)
    assert ficha["origen"] == "exotica"
    assert ficha["avisos"] == ["Las listas no coinciden en el origen: Catálogo de Plantas y Líquenes de Colombia la trata "
                               "como nativa. Se usa exótica."]

    ficha = fuentes.consultar("Arbolus inventadus", GbifFalso({}))
    assert ficha["coincidencia"] == "no_encontrada" and ficha["origen"] is None and not ficha["en_catalogo"]
    assert ficha["fuentes"][0]["dato"] == "No aparece con ese nombre." and len(ficha["avisos"]) == 1

    # Otra especie de nombre parecido no cuenta como coincidencia.
    parecida = GbifFalso({(C, "tabebuia rosea"): [_uso(1, "Tabebuia roseoalba")]})
    assert fuentes.consultar("Tabebuia rosea", parecida)["coincidencia"] == "no_encontrada"


def test_nombre_incompleto_y_metadatos_en_cache():
    with pytest.raises(fuentes.ErrorFuente) as error:
        fuentes.consultar("Tabebuia", GbifFalso({}))
    assert error.value.estado == 422
    gbif = GbifFalso({})
    fuentes.consultar("Ceiba pentandra", gbif)
    fuentes.consultar("Ceiba pentandra", gbif)
    assert sum(r.startswith("/dataset/") for r in gbif.llamadas) == 5


# ------------------------------------- API -------------------------------------
def _especies(api):  # noqa: F811
    for sede in api.base.tablas["instituciones"]:
        sede.update(lat=10.46, lng=-73.25)
    api.base.tablas["especies"] = [
        {"id": 1, "nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica"},
        {"id": 2, "nombre_comun": "Roble morado", "nombre_cientifico": "Tabebuia rosea (Bertol.) DC."},
        {"id": 3, "nombre_comun": "Mamón cotoprix", "nombre_cientifico": "Melicoccus oliviformis"},
    ]


def test_catalogo_con_ficha_oficial_y_permisos(api, monkeypatch):  # noqa: F811
    _especies(api)
    monkeypatch.setattr(fuentes, "traer_http", ROBLE)
    r = api.get("/especies/catalogo").json()
    assert r["editable"] is False and r["migracion_pendiente"] is False and len(r["listas"]) == 5
    mango = next(e for e in r["especies"] if e["id"] == 1)
    assert mango["arboles"] == 1 and mango["origen"] == "exotica" and mango["origen_fuente"] == "app" and mango["ficha"] is None
    assert next(e for e in r["especies"] if e["id"] == 3)["origen_fuente"] is None
    assert r["resumen"]["arboles"] == 1 and r["resumen"]["pct_arboles_nativos"] == 0

    assert api.post("/especies/2/fuente-oficial").status_code == 403
    api.como("docente")
    assert api.put("/especies/2/veda", json={"veda": "Resolución 0316 de 1974"}).status_code == 403

    api.como("admin")
    assert api.put("/especies/2/veda", json={"veda": "Resolución 0316 de 1974"}).status_code == 409  # sin consultar
    r = api.post("/especies/2/fuente-oficial")
    assert r.status_code == 200
    j = r.json()
    assert j["origen"] == "nativa" and j["origen_fuente"] == "oficial"
    assert j["ficha"]["bosque_seco_cesar"] is True and j["ficha"]["fuentes"][0]["version"] == "1.3"
    guardada = api.base.tablas["especies_fuente_oficial"][0]
    assert guardada["consultado_por"] == "00000000-0000-0000-0000-00000000000a" and guardada["especie_id"] == 2
    assert next(e for e in api.base.tablas["especies"] if e["id"] == 2)["origen"] == "nativa"
    assert api.post("/especies/99/fuente-oficial").status_code == 404

    r = api.put("/especies/2/veda", json={"veda": "  Resolución 0316   de 1974 ", "veda_url": "https://ejemplo.gov.co/r"})
    assert r.status_code == 200 and r.json()["ficha"]["veda"] == "Resolución 0316 de 1974"
    assert api.put("/especies/2/veda", json={"veda": "Res", "veda_url": "ftp://x"}).status_code == 422
    # Una nueva consulta conserva la veda.
    api.post("/especies/2/fuente-oficial")
    assert api.base.tablas["especies_fuente_oficial"][0]["veda"] == "Resolución 0316 de 1974"

    catalogo = {e["id"]: e for e in api.get("/catalogos").json()["especies"]}
    assert catalogo[2]["en_veda"] is True and catalogo[2]["invasora"] is False and catalogo[2]["origen"] == "nativa"
    assert catalogo[1]["en_veda"] is False and catalogo[1]["amenaza"] is None

    r = api.get("/especies/catalogo").json()
    assert r["editable"] is True and r["resumen"]["con_ficha"] == 1 and r["resumen"]["en_veda"] == 1
    assert r["resumen"]["bosque_seco_cesar"] == 1 and r["resumen"]["arboles"] == 2

    r = api.put("/especies/2/veda", json={"veda": None})
    assert r.json()["ficha"]["veda"] is None and r.json()["ficha"]["veda_registrada_en"] is None


def test_origen_cambiado_a_mano_y_errores(api, monkeypatch):  # noqa: F811
    _especies(api)
    api.como("admin")
    monkeypatch.setattr(fuentes, "traer_http", ROBLE)
    api.post("/especies/2/fuente-oficial")
    api.patch("/especies/2", json={"origen": "exotica"})  # el administrador lo cambia desde el mapa
    roble = next(e for e in api.get("/especies/catalogo").json()["especies"] if e["id"] == 2)
    assert roble["origen"] == "exotica" and roble["origen_fuente"] == "administrador"

    def sin_red(ruta, parametros=None):
        raise fuentes.ErrorFuente(503, "No fue posible consultar GBIF (SiB Colombia).")

    monkeypatch.setattr(fuentes, "traer_http", sin_red)
    fuentes._metadatos.clear()
    r = api.post("/especies/1/fuente-oficial")
    assert r.status_code == 503 and "GBIF" in r.json()["detail"]

    monkeypatch.setattr(fuentes, "traer_http", ROBLE)
    api.base.fallar["especies_fuente_oficial"] = ("upsert", "42P01")
    assert api.post("/especies/2/fuente-oficial").status_code == 409
    api.base.fallar["especies_fuente_oficial"] = ("select", "42P01")
    r = api.get("/especies/catalogo").json()
    assert r["migracion_pendiente"] is True and r["editable"] is False
    assert api.get("/catalogos").status_code == 200
