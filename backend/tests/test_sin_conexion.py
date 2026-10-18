"""Registros hechos sin conexión: la app los reenvía con un id_cliente y el backend no los
duplica (migración 007). Usa el Supabase en memoria de test_modulos_api."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from postgrest.exceptions import APIError

import comun
from tests.test_modulos_api import A1, A2, I1, I3, USUARIOS, _arbol, api  # noqa: F401 (api es un fixture)

JPG = ("f.jpg", b"\xff\xd8\xff\xe0abc", "image/jpeg")
ID_ARBOL = "0c1b8d7e-1111-4a5b-9c3d-000000000001"
ID_VISITA = "0c1b8d7e-2222-4a5b-9c3d-000000000002"
ID_FOTO = "0c1b8d7e-3333-4a5b-9c3d-000000000003"

ARBOL = {"institucion_id": "sj", "zona": "Patio central", "lat": 10.4, "lng": -73.2, "especie_id": 1, "dap_cm": 20,
         "altura_m": 5, "copa_m": 3, "etapa": "Juvenil", "interferencia": "Ninguna", "observaciones": ["f_manchas"]}
VISITA = {"dap_cm": 31, "altura_m": 8, "copa_m": 4, "etapa": "Adulto", "interferencia": "Ninguna", "observaciones": ["f_manchas"]}


def _hace(**delta) -> str:
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


def _resumen_sigue_al_insertado(api):
    """El cliente en memoria asigna ids aleatorios: el resumen del árbol nuevo apunta al insertado."""
    api.base.tablas["arboles_resumen"].append(_arbol("id-por-asignar", "IE001-0002", "sj"))
    original = api.base.table

    def tabla(nombre):
        consulta = original(nombre)
        if nombre == "arboles":
            ejecutar = consulta.execute

            def execute():
                r = ejecutar()
                if consulta.op == "insert":
                    api.base.tablas["arboles_resumen"][-1]["id"] = r.data[0]["id"]
                return r
            consulta.execute = execute
        return consulta

    api.base.table = tabla


# ------------------------------------ Árboles ------------------------------------
def test_arbol_reenviado_no_se_duplica(api):
    _resumen_sigue_al_insertado(api)
    cuerpo = {**ARBOL, "id_cliente": ID_ARBOL, "capturado_en": _hace(hours=2)}
    primero = api.post("/arboles", json=cuerpo)
    assert primero.status_code == 201, primero.text
    segundo = api.post("/arboles", json=cuerpo)
    assert segundo.status_code == 200 and segundo.json()["id"] == primero.json()["id"]

    arboles = [a for a in api.base.tablas["arboles"] if a.get("id_cliente") == ID_ARBOL]
    assert len(arboles) == 1 and "capturado_en" not in arboles[0]
    registro = [i for i in api.base.tablas["inspecciones"] if i["arbol_id"] == primero.json()["id"]]
    assert len(registro) == 1 and registro[0]["capturado_en"] == cuerpo["capturado_en"]


def test_arbol_con_id_cliente_de_otra_persona(api):
    api.base.tablas["arboles"].append({"id": "otro", "registrado_por": USUARIOS["est2"][0], "id_cliente": ID_ARBOL})
    r = api.post("/arboles", json={**ARBOL, "id_cliente": ID_ARBOL})
    assert r.status_code == 409


def test_arbol_sin_id_cliente_funciona_como_antes(api):
    _resumen_sigue_al_insertado(api)
    r = api.post("/arboles", json=ARBOL)
    assert r.status_code == 201
    insertado = next(a for a in api.base.tablas["arboles"] if a["id"] == r.json()["id"])
    assert "id_cliente" not in insertado


# ---------------------------------- Inspecciones ----------------------------------
def test_inspeccion_reenviada_no_se_duplica(api):
    antes = len(api.base.tablas["inspecciones"])
    cuerpo = {**VISITA, "id_cliente": ID_VISITA, "capturado_en": _hace(days=3)}
    primero = api.post(f"/arboles/{A1}/inspecciones", json=cuerpo)
    assert primero.status_code == 201, primero.text
    segundo = api.post(f"/arboles/{A1}/inspecciones", json=cuerpo)
    assert segundo.status_code == 200 and segundo.json()["id"] == primero.json()["id"]
    assert len(api.base.tablas["inspecciones"]) == antes + 1
    guardada = next(i for i in api.base.tablas["inspecciones"] if i["id"] == primero.json()["id"])
    assert guardada["id_cliente"] == ID_VISITA and guardada["capturado_en"] == cuerpo["capturado_en"]
    hallazgos = [o for o in api.base.tablas["inspeccion_observaciones"] if o["inspeccion_id"] == guardada["id"]]
    assert len(hallazgos) == 1


def test_inspeccion_con_id_cliente_de_otro_arbol_o_persona(api):
    r = api.post(f"/arboles/{A1}/inspecciones", json={**VISITA, "id_cliente": ID_VISITA})
    assert r.status_code == 201
    # en la base de datos el trigger pone el inspector; el cliente en memoria no lo hace
    next(i for i in api.base.tablas["inspecciones"] if i["id"] == r.json()["id"])["inspector_id"] = USUARIOS["est1"][0]
    assert api.post(f"/arboles/{A2}/inspecciones", json={**VISITA, "id_cliente": ID_VISITA}).status_code == 409
    api.como("docente")
    assert api.post(f"/arboles/{A1}/inspecciones", json={**VISITA, "id_cliente": ID_VISITA}).status_code == 409


@pytest.mark.parametrize("capturado_en", [_hace(minutes=-30), _hace(days=200)])
def test_hora_de_captura_no_creible_se_descarta(api, capturado_en):
    r = api.post(f"/arboles/{A1}/inspecciones", json={**VISITA, "capturado_en": capturado_en})
    assert r.status_code == 201
    guardada = next(i for i in api.base.tablas["inspecciones"] if i["id"] == r.json()["id"])
    assert "capturado_en" not in guardada


# -------------------------------------- Fotos --------------------------------------
def test_foto_de_arbol_reenviada_no_se_duplica(api):
    url = f"/arboles/{A1}/fotos?tipo=adicional"
    for _ in range(2):
        assert api.post(url, files={"archivo": JPG}).status_code == 201
    tercera = api.post(f"{url}&id_cliente={ID_FOTO}", files={"archivo": JPG})
    assert tercera.status_code == 201
    # el reenvío de la tercera adicional no choca con el límite de tres
    repetida = api.post(f"{url}&id_cliente={ID_FOTO}", files={"archivo": JPG})
    assert repetida.status_code == 200 and repetida.json() == tercera.json()
    assert len(api.base.tablas["arbol_fotos"]) == 3 and len(api.base.archivos) == 3


def test_foto_de_inspeccion_reenviada_aunque_ya_se_haya_revisado(api):
    url = f"/inspecciones/{I1}/fotos?tipo=completo&id_cliente={ID_FOTO}"
    primera = api.post(url, files={"archivo": JPG})
    assert primera.status_code == 201
    next(i for i in api.base.tablas["inspecciones"] if i["id"] == I1)["estado_revision"] = "confirmada"
    repetida = api.post(url, files={"archivo": JPG})
    assert repetida.status_code == 200 and repetida.json()["id"] == primera.json()["id"]
    assert len(api.base.tablas["inspeccion_fotos"]) == 1 and len(api.base.archivos) == 1
    # el mismo id_cliente en la foto de otra inspección no se acepta
    assert api.post(f"/inspecciones/{I3}/fotos?tipo=completo&id_cliente={ID_FOTO}", files={"archivo": JPG}).status_code == 409


# ------------------------------- Ayudas de comun.py -------------------------------
class _Tabla:
    """Tabla mínima: el insert falla con los códigos indicados, en orden; el select devuelve `filas`."""

    def __init__(self, errores, filas):
        self.errores, self.filas, self.insertadas = list(errores), filas, []
        self._op = None

    def table(self, _):
        return self

    def insert(self, fila):
        self._op, self._fila = "insert", fila
        return self

    def select(self, *_):
        self._op = "select"
        return self

    def eq(self, *_):
        return self

    def limit(self, _):
        return self

    def execute(self):
        if self._op == "select":
            return SimpleNamespace(data=self.filas)
        if self.errores:
            raise APIError({"message": "x", "code": self.errores.pop(0), "hint": None, "details": None})
        self.insertadas.append(self._fila)
        return SimpleNamespace(data=[{**self._fila, "id": "nuevo"}])


def test_carrera_entre_dos_envios_devuelve_el_que_llego_primero():
    tabla = _Tabla(["23505"], [{"id": "primero", "id_cliente": ID_VISITA}])
    fila, nueva = comun.insertar_sin_duplicar(tabla, "inspecciones", {"id_cliente": ID_VISITA})
    assert (fila["id"], nueva) == ("primero", False)


def test_otro_duplicado_sin_id_cliente_sigue_siendo_error():
    with pytest.raises(APIError):
        comun.insertar_sin_duplicar(_Tabla(["23505"], []), "arboles", {"id_cliente": ID_ARBOL})
    with pytest.raises(APIError):
        comun.insertar_sin_duplicar(_Tabla(["23505"], []), "arboles", {"zona": "Otra"})


def test_sin_la_migracion_007_se_guarda_sin_esas_columnas():
    tabla = _Tabla(["PGRST204"], [])
    fila, nueva = comun.insertar_sin_duplicar(tabla, "inspecciones", {"dap_cm": 3, "id_cliente": ID_VISITA, "capturado_en": "x"})
    assert nueva and tabla.insertadas == [{"dap_cm": 3}]

    class SinColumna(_Tabla):
        def execute(self):
            raise APIError({"message": "column does not exist", "code": "42703", "hint": None, "details": None})

    assert comun.buscar_por_id_cliente(SinColumna([], []), "arboles", ID_ARBOL) is None
    assert comun.buscar_por_id_cliente(SinColumna([], []), "arboles", None) is None


def test_hora_de_captura():
    reciente = datetime.now(timezone.utc) - timedelta(days=1)
    assert comun.hora_de_captura(reciente) == reciente
    assert comun.hora_de_captura(None) is None
    assert comun.hora_de_captura(datetime.now(timezone.utc) + timedelta(hours=1)) is None
    assert comun.hora_de_captura(datetime.now(timezone.utc) - timedelta(days=91)) is None
    sin_zona = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    assert comun.hora_de_captura(sin_zona).tzinfo is not None
