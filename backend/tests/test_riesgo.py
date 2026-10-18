"""Tamizaje de riesgo de caída y alertas (migración 008). Usa el Supabase en memoria."""
import pytest
from postgrest.exceptions import APIError

from servicios.riesgo_caida import evaluar_tamizaje
from tests.test_modulos_api import A1, A2, api  # noqa: F401 (api es un fixture)
from tests.test_sin_conexion import ARBOL, VISITA, _resumen_sigue_al_insertado

INMINENTE = {"ramas_secas": "colgando", "debajo": ["recreo"]}
ALTO = {"cavidades": "grande", "debajo": ["paso"]}
BAJO = {"debajo": ["poco_uso"]}


def _visita(api, tamizaje, arbol=A1):  # noqa: F811
    return api.post(f"/arboles/{arbol}/inspecciones", json={**VISITA, "tamizaje": tamizaje})


# ------------------------------------ Reglas ------------------------------------
@pytest.mark.parametrize(
    ("respuestas", "categoria"),
    [
        ({"debajo": ["recreo"]}, "bajo"),
        ({"ramas_secas": "pequenas", "debajo": ["recreo"]}, "medio"),
        ({"ramas_secas": "pequenas", "debajo": ["poco_uso"]}, "bajo"),
        ({"hongos": "en_tronco_o_base", "debajo": ["cancha"]}, "alto"),
        ({"hongos": "en_tronco_o_base", "debajo": ["poco_uso"]}, "medio"),
        ({"hongos": "en_tronco_o_base", "debajo": ["cerrada"]}, "bajo"),
        ({"grietas": "abriendose", "debajo": ["aulas"]}, "inminente"),
        ({"inclinacion": "reciente", "debajo": ["poco_uso"]}, "alto"),
        ({"inclinacion": "reciente", "debajo": ["cerrada"]}, "medio"),
        # lo más grave define la probabilidad; lo más concurrido, la ocupación
        ({"raices": "expuestas", "ramas_secas": "colgando", "debajo": ["cerrada", "via"]}, "inminente"),
    ],
)
def test_matriz_de_categorias(respuestas, categoria):
    assert evaluar_tamizaje(respuestas)["categoria"] == categoria


def test_motivos_y_accion():
    r = evaluar_tamizaje({"ramas_secas": "grandes", "hongos": "en_ramas", "debajo": ["recreo", "cables"]})
    assert r["probabilidad"] == "probable" and r["ocupacion"] == "constante" and r["categoria"] == "alto"
    assert r["motivos"] == ["Ramas secas gruesas", "Hongos en ramas", "Debajo: zona de recreo o de descanso, cables eléctricos"]
    assert "visita técnica" in r["accion"]


def test_arbol_pequeno_baja_un_nivel():
    respuestas = {"ramas_secas": "colgando", "debajo": ["recreo"]}
    assert evaluar_tamizaje(respuestas, altura_m=2.5, dap_cm=8)["categoria"] == "alto"
    assert evaluar_tamizaje(respuestas, altura_m=2.5, dap_cm=30)["categoria"] == "inminente"
    assert evaluar_tamizaje({"debajo": ["recreo"]}, altura_m=1, dap_cm=1)["categoria"] == "bajo"


# --------------------------------- Inspecciones ---------------------------------
def test_inspeccion_con_tamizaje_inminente_abre_alerta(api):  # noqa: F811
    r = _visita(api, INMINENTE)
    assert r.status_code == 201, r.text
    riesgo = r.json()["riesgo_caida"]
    assert riesgo["categoria"] == "inminente" and riesgo["respuestas"]["ramas_secas"] == "colgando"
    assert "acordona" in riesgo["accion"]
    guardado = api.base.tablas["tamizajes_riesgo"]
    assert len(guardado) == 1 and guardado[0]["inspeccion_id"] == r.json()["id"]
    alertas = api.base.tablas["alertas_riesgo"]
    assert len(alertas) == 1
    assert alertas[0]["estado"] == "por_confirmar" and alertas[0]["institucion_id"] == "sj" and alertas[0]["categoria"] == "inminente"

    # otra visita con riesgo alto no abre otra alerta ni baja la categoría
    assert _visita(api, ALTO).status_code == 201
    assert len(api.base.tablas["alertas_riesgo"]) == 1
    assert api.base.tablas["alertas_riesgo"][0]["categoria"] == "inminente"
    # una de riesgo bajo no abre alerta
    assert _visita(api, BAJO, A2).status_code == 201
    assert len(api.base.tablas["alertas_riesgo"]) == 1


def test_tamizaje_sin_lo_que_hay_debajo_no_es_valido(api):  # noqa: F811
    assert _visita(api, {"ramas_secas": "colgando"}).status_code == 422
    assert _visita(api, {"debajo": ["recreo"], "otra": 1}).status_code == 422


def test_historial_y_riesgo_vigente_del_arbol(api):  # noqa: F811
    primera = _visita(api, ALTO).json()
    segunda = _visita(api, BAJO).json()
    historial = {i["id"]: i for i in api.get(f"/arboles/{A1}/inspecciones").json()}
    assert historial[primera["id"]]["riesgo_caida"]["categoria"] == "alto"
    assert historial[segunda["id"]]["riesgo_caida"]["categoria"] == "bajo"

    riesgo = api.get(f"/arboles/{A1}/riesgo").json()
    assert riesgo["tamizaje"]["categoria"] == "bajo" and riesgo["tamizaje"]["inspeccion_id"] == segunda["id"]
    assert riesgo["alerta"]["categoria"] == "alto" and riesgo["alerta"]["categoria_actual"] == "bajo"

    # si se anula la última visita, vuelve a valer la anterior
    api.como("docente")
    assert api.post(f"/inspecciones/{segunda['id']}/anular", json={"motivo": "Datos de otro árbol"}).status_code == 200
    assert api.get(f"/arboles/{A1}/riesgo").json()["tamizaje"]["categoria"] == "alto"
    lista = {a["id"]: a for a in api.get("/arboles").json()}
    assert lista[A1]["riesgo_caida"] == "alto" and lista[A2]["riesgo_caida"] is None


def test_anular_la_inspeccion_descarta_su_alerta(api):  # noqa: F811
    visita = _visita(api, INMINENTE).json()
    api.como("docente")
    assert api.post(f"/inspecciones/{visita['id']}/anular", json={"motivo": "Foto de otro árbol"}).status_code == 200
    alerta = api.base.tablas["alertas_riesgo"][0]
    assert alerta["estado"] == "descartada" and "anulada" in alerta["comentario_revision"]


def test_registro_de_arbol_con_tamizaje(api):  # noqa: F811
    _resumen_sigue_al_insertado(api)
    r = api.post("/arboles", json={**ARBOL, "tamizaje": ALTO})
    assert r.status_code == 201, r.text
    assert r.json()["riesgo_caida"] == "alto"
    insertado = next(a for a in api.base.tablas["arboles"] if a["id"] == r.json()["id"])
    assert "tamizaje" not in insertado
    assert api.base.tablas["alertas_riesgo"][0]["arbol_id"] == r.json()["id"]


# ------------------------------------- Alertas -------------------------------------
def test_ciclo_de_una_alerta(api):  # noqa: F811
    _visita(api, INMINENTE)
    alerta = api.get("/alertas").json()
    assert len(alerta) == 1
    alerta = alerta[0]
    assert alerta["codigo"] == "IE001-0001" and alerta["nombre_comun"] == "Mango" and alerta["estado"] == "por_confirmar"
    url = f"/alertas/{alerta['id']}"

    # un estudiante la ve pero no la gestiona; un docente de otra sede ni la ve ni la gestiona
    assert api.post(f"{url}/confirmar", json={}).status_code == 403
    api.como("docente_la")
    assert api.get("/alertas").json() == []
    assert api.post(f"{url}/confirmar", json={}).status_code == 403

    api.como("docente")
    confirmada = api.post(f"{url}/confirmar", json={"comentario": "Rama colgando sobre el patio"})
    assert confirmada.status_code == 200 and confirmada.json()["estado"] == "confirmada"
    assert api.post(f"{url}/confirmar", json={}).status_code == 409
    aviso = api.post(f"{url}/aviso", json={"medio": "whatsapp"}).json()
    assert aviso["rectoria_medio"] == "whatsapp" and aviso["rectoria_avisada_en"]
    assert api.post(f"{url}/aviso", json={"medio": "paloma"}).status_code == 422

    assert api.post(f"{url}/atender", json={"nota": "ok"}).status_code == 422
    ajena = {"id": "dddddddd-0000-0000-0000-000000000001", "arbol_id": A2}
    api.base.tablas["intervenciones"].append(ajena)
    assert api.post(f"{url}/atender", json={"nota": "Se retiró la rama", "intervencion_id": ajena["id"]}).status_code == 422
    propia = {"id": "dddddddd-0000-0000-0000-000000000002", "arbol_id": A1}
    api.base.tablas["intervenciones"].append(propia)
    atendida = api.post(f"{url}/atender", json={"nota": "Se retiró la rama con autorización", "intervencion_id": propia["id"]})
    assert atendida.status_code == 200 and atendida.json()["estado"] == "atendida"
    assert atendida.json()["intervencion_id"] == propia["id"]

    assert api.get("/alertas").json() == []
    assert [a["estado"] for a in api.get("/alertas?estado=cerradas").json()] == ["atendida"]
    assert api.post(f"{url}/descartar", json={"motivo": "Ya no aplica"}).status_code == 409
    # cerrada la alerta, un nuevo riesgo abre otra
    _visita(api, ALTO)
    assert len(api.get("/alertas").json()) == 1


def test_descartar_pide_motivo_y_el_admin_ve_todas(api):  # noqa: F811
    _visita(api, INMINENTE)
    _visita(api, ALTO, A2)
    api.como("admin")
    todas = api.get("/alertas").json()
    assert [a["categoria"] for a in todas] == ["inminente", "alto"]  # las inminentes primero
    assert [a["codigo"] for a in api.get("/alertas?institucion_id=la").json()] == ["IE002-0001"]
    url = f"/alertas/{todas[1]['id']}/descartar"
    assert api.post(url, json={"motivo": "no"}).status_code == 422
    descartada = api.post(url, json={"motivo": "La rama ya se había retirado"})
    assert descartada.status_code == 200 and descartada.json()["estado"] == "descartada"


# ------------------------------- Contactos de emergencia -------------------------------
def test_contactos_de_emergencia(api):  # noqa: F811
    assert api.get("/instituciones/sj/contactos").json()["rectoria_telefono"] is None
    cuerpo = {"rectoria_nombre": "Rectoría San José", "rectoria_telefono": "300 123 4567", "rectoria_correo": "Rectoria@SanJose.edu.co",
              "gestion_riesgo_telefono": "", "autoridad_ambiental_nombre": "Corpocesar", "autoridad_ambiental_telefono": "605 574 8960"}
    assert api.put("/instituciones/sj/contactos", json=cuerpo).status_code == 403  # estudiante
    api.como("docente_la")
    assert api.put("/instituciones/sj/contactos", json=cuerpo).status_code == 403
    assert api.get("/instituciones/sj/contactos").status_code == 403
    api.como("docente")
    assert api.put("/instituciones/sj/contactos", json={**cuerpo, "rectoria_telefono": "llamar a Juan"}).status_code == 422
    assert api.put("/instituciones/sj/contactos", json={**cuerpo, "rectoria_correo": "sin-arroba"}).status_code == 422
    guardado = api.put("/instituciones/sj/contactos", json=cuerpo)
    assert guardado.status_code == 200, guardado.text
    api.como("est1")
    leido = api.get("/instituciones/sj/contactos").json()
    assert leido["rectoria_correo"] == "rectoria@sanjose.edu.co" and leido["gestion_riesgo_telefono"] is None
    api.como("docente")
    api.put("/instituciones/sj/contactos", json={**cuerpo, "rectoria_nombre": "Rectora Ana"})
    assert len(api.base.tablas["contactos_emergencia"]) == 1


# --------------------------------- Sin la migración 008 ---------------------------------
def test_sin_la_migracion_008_la_categoria_se_calcula_igual(api):  # noqa: F811
    original = api.base.table

    def tabla(nombre):
        if nombre in ("tamizajes_riesgo", "alertas_riesgo", "contactos_emergencia"):
            raise APIError({"message": "relation does not exist", "code": "42P01", "hint": None, "details": None})
        return original(nombre)

    api.base.table = tabla
    r = _visita(api, INMINENTE)
    assert r.status_code == 201 and r.json()["riesgo_caida"]["categoria"] == "inminente"
    assert api.get("/alertas").json() == []
    assert api.get(f"/arboles/{A1}/riesgo").json() == {"tamizaje": None, "alerta": None}
    assert api.get("/arboles").status_code == 200
    assert api.get("/instituciones/sj/contactos").json()["institucion_id"] == "sj"


def test_si_falla_guardar_el_tamizaje_no_queda_la_inspeccion_a_medias(api):  # noqa: F811
    antes = len(api.base.tablas["inspecciones"])
    api.base.fallar["tamizajes_riesgo"] = "insert"
    assert _visita(api, ALTO).status_code == 422
    assert len(api.base.tablas["inspecciones"]) == antes

