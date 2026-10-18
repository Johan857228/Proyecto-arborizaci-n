"""Exportación abierta (CSV, GeoJSON, Shapefile y paquete ZIP) y códigos DANE de las sedes."""
import csv
import io
import json
import os
import struct
import zipfile
from datetime import date
from types import SimpleNamespace

import pytest

os.environ.setdefault("SUPABASE_URL", "https://falso.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "sb_publishable_falsa")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "sb_secret_falsa")

from fastapi.testclient import TestClient  # noqa: E402
from postgrest.exceptions import APIError  # noqa: E402

import db  # noqa: E402
import main  # noqa: E402
from auth import Perfil, Sesion, perfil_actual  # noqa: E402
from servicios import exportacion  # noqa: E402

INSTITUCIONES = [
    {"id": "sj", "nombre": "Colegio San José", "nombre_corto": "San José", "prefijo": "IE001",
     "codigo_dane": "120001000123", "divipola": "20001", "municipio": "Valledupar"},
    {"id": "al", "nombre": "Colegio Los Almendros", "nombre_corto": "Los Almendros", "prefijo": "IE002",
     "codigo_dane": None, "divipola": None, "municipio": None},
]


def _arbol(i, institucion="sj", lat=10.4638, lng=-73.254):
    return {
        "id": f"a{i}", "codigo": f"IE001-000{i}", "institucion_id": institucion, "zona": "Patio central", "zona_otra": None,
        "lat": lat, "lng": lng, "nombre_comun": "Guayacán amarillo", "nombre_cientifico": "Handroanthus chrysanthus",
        "especie_id": 7, "dap_cm": 35.5, "altura_m": 8.2, "copa_m": 4.5, "etapa": "Adulto", "interferencia": "Ninguna",
        "interferencia_otra": None, "estado": "sano", "puntaje_riesgo": 0.0, "n_inspecciones": 2,
        "ultima_inspeccion_en": "2026-10-01T10:00:00-05:00", "ultima_revision": "confirmada",
        "registrado_en": "2026-03-01T09:00:00-05:00", "registrado_por": "estudiante-secreto",
    }


class Consulta:
    def __init__(self, base, tabla):
        self.base, self.tabla, self.filtros, self.accion, self.datos = base, tabla, [], "select", None

    def select(self, columnas="*", **_k):
        if self.tabla == "instituciones" and "codigo_dane" in columnas and self.base.sin_migracion:
            raise APIError({"message": "column instituciones.codigo_dane does not exist", "code": "42703", "hint": None, "details": None})
        return self

    def eq(self, columna, valor):
        self.filtros.append((columna, valor))
        return self

    def in_(self, columna, valores):
        self.filtros.append((columna, ("in", [str(v) for v in valores])))
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def update(self, cambios):
        self.accion, self.datos = "update", cambios
        return self

    def execute(self):
        filas = self.base.tablas.get(self.tabla, [])

        def coincide(f):
            for col, val in self.filtros:
                if isinstance(val, tuple):
                    if str(f.get(col)) not in val[1]:
                        return False
                elif str(f.get(col)) != str(val):
                    return False
            return True

        elegidas = [f for f in filas if coincide(f)]
        if self.accion == "update":
            if self.base.duplicado and "codigo_dane" in self.datos:
                raise APIError({"message": "duplicate key", "code": "23505", "hint": None, "details": None})
            for f in elegidas:
                f.update(self.datos)
        return SimpleNamespace(data=[dict(f) for f in elegidas])


class Almacen:
    def __init__(self, base):
        self.base = base

    def from_(self, _bucket):
        return self

    def upload(self, ruta, contenido, opciones=None):
        self.base.subidas.append((ruta, contenido, opciones))

    def create_signed_url(self, ruta, segundos, opciones=None):
        self.base.firmas.append((ruta, segundos, opciones))
        return {"signedURL": f"https://falso/{ruta}?token=x"}


class Base:
    def __init__(self):
        self.tablas = {
            "instituciones": [dict(i) for i in INSTITUCIONES],
            "arboles_resumen": [_arbol(1), _arbol(2, lat=None, lng=None), _arbol(3, institucion="al", lat=10.47, lng=-73.25)],
            "inspecciones": [
                {"id": "i1", "arbol_id": "a1", "inspector_id": "estudiante-secreto", "fecha": "2026-10-01T10:00:00-05:00", "origen": "seguimiento",
                 "lat": 10.4638, "lng": -73.254, "dap_cm": 36.0, "calificacion": "sano", "estado_revision": "confirmada",
                 "notas": "La vio Laura Martínez", "muestra_lab": False, "epifitas": ["bromelias", "liquenes"]},
                {"id": "i3", "arbol_id": "a3", "inspector_id": "otro", "fecha": "2026-10-02T10:00:00-05:00", "origen": "registro",
                 "calificacion": "riesgo", "estado_revision": "pendiente", "muestra_lab": True, "epifitas": []},
            ],
            "inspeccion_observaciones": [{"inspeccion_id": "i1", "observacion_codigo": "FE-02"}, {"inspeccion_id": "i1", "observacion_codigo": "DE-01"}],
            "intervenciones": [
                {"id": "v1", "arbol_id": "a1", "tipo_codigo": "poda", "estado": "ejecutada", "fecha_ejecucion": "2026-09-01",
                 "costo_real": 120000, "resultado": "exitosa", "responsable": "Juan Pérez", "creado_en": "2026-09-01"},
            ],
        }
        self.subidas, self.firmas = [], []
        self.storage = Almacen(self)
        self.sin_migracion = False
        self.duplicado = False

    def table(self, nombre):
        return Consulta(self, nombre)


def _perfil(uid, rol, institucion="sj"):
    return Perfil(usuario_id=uid, nombre=uid, rol=rol, institucion_id=institucion, curso_id=None, activo=True,
                  correo=None, sesion=Sesion(token="t", user_id=uid, email=None))


@pytest.fixture
def api(monkeypatch):
    base = Base()
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: base)
    monkeypatch.setattr(db, "get_admin", lambda: base)
    actual = {"perfil": _perfil("doc1", "docente")}
    main.app.dependency_overrides[perfil_actual] = lambda: actual["perfil"]

    def como(uid, rol, institucion="sj"):
        actual["perfil"] = _perfil(uid, rol, institucion)

    yield SimpleNamespace(http=TestClient(main.app), base=base, como=como)
    main.app.dependency_overrides.clear()


def _instituciones():
    return {i["id"]: i for i in INSTITUCIONES}


# ------------------------------------------------------------------ Formatos
def test_csv_sin_datos_personales_y_con_dane():
    filas = exportacion.filas_arboles([_arbol(1)], _instituciones())
    contenido = exportacion.a_csv(filas, exportacion.CAMPOS_ARBOLES)
    assert contenido.startswith("﻿".encode("utf-8"))  # BOM para que Excel lea las tildes
    lector = list(csv.DictReader(io.StringIO(contenido.decode("utf-8-sig"))))
    assert lector[0]["codigo"] == "IE001-0001"
    assert lector[0]["codigo_dane_sede"] == "120001000123" and lector[0]["divipola"] == "20001"
    assert lector[0]["especie_comun"] == "Guayacán amarillo"
    assert lector[0]["ultima_inspeccion"] == "2026-10-01" and lector[0]["dap_cm"] == "35.5"
    assert b"estudiante-secreto" not in contenido and "registrado_por" not in lector[0]


def test_inspecciones_csv_sin_notas_ni_inspector():
    arboles = {"a1": _arbol(1)}
    base = Base()
    filas = exportacion.filas_inspecciones(base.tablas["inspecciones"], arboles, {"i1": ["FE-02", "DE-01"]}, _instituciones())
    assert len(filas) == 1  # la de a3 no está en los árboles pedidos
    contenido = exportacion.a_csv(filas, exportacion.CAMPOS_INSPECCIONES).decode("utf-8-sig")
    fila = next(csv.DictReader(io.StringIO(contenido)))
    assert fila["hallazgos"] == "DE-01;FE-02" and fila["epifitas"] == "bromelias;liquenes" and fila["muestra_lab"] == "no"
    assert "Laura" not in contenido and "estudiante-secreto" not in contenido


def test_geojson_en_orden_longitud_latitud():
    filas = exportacion.filas_arboles([_arbol(1), _arbol(2, lat=None, lng=None)], _instituciones())
    datos = json.loads(exportacion.a_geojson(filas, exportacion.CAMPOS_ARBOLES))
    assert datos["type"] == "FeatureCollection" and len(datos["features"]) == 1
    f = datos["features"][0]
    assert f["geometry"] == {"type": "Point", "coordinates": [-73.254, 10.4638]}
    assert f["properties"]["codigo"] == "IE001-0001" and "lat" not in f["properties"]


def test_shapefile_se_puede_leer():
    filas = exportacion.filas_arboles([_arbol(1), _arbol(3, lat=10.47, lng=-73.25)], _instituciones())
    paquete = zipfile.ZipFile(io.BytesIO(exportacion.a_shapefile(filas, exportacion.CAMPOS_ARBOLES, "arboles", date(2026, 10, 17))))
    assert sorted(paquete.namelist()) == ["arboles.cpg", "arboles.dbf", "arboles.prj", "arboles.shp", "arboles.shx"]
    shp = paquete.read("arboles.shp")
    codigo, = struct.unpack(">i", shp[:4])
    largo_palabras, = struct.unpack(">i", shp[24:28])
    version, tipo = struct.unpack("<2i", shp[28:36])
    xmin, ymin, xmax, ymax = struct.unpack("<4d", shp[36:68])
    assert (codigo, version, tipo) == (9994, 1000, 1) and largo_palabras * 2 == len(shp)
    assert (xmin, ymin, xmax, ymax) == (-73.254, 10.4638, -73.25, 10.47)
    numero, contenido = struct.unpack(">2i", shp[100:108])
    tipo_punto, x, y = struct.unpack("<i2d", shp[108:128])
    assert (numero, contenido, tipo_punto, x, y) == (1, 10, 1, -73.254, 10.4638)

    shx = paquete.read("arboles.shx")
    assert len(shx) == 100 + 8 * 2 and struct.unpack(">2i", shx[100:108]) == (50, 10) and struct.unpack(">2i", shx[108:116]) == (64, 10)

    dbf = paquete.read("arboles.dbf")
    registros, largo_cabecera, largo_registro = struct.unpack("<IHH", dbf[4:12])
    assert registros == 2
    nombres = [dbf[32 + 32 * k:32 + 32 * k + 11].rstrip(bytes(1)).decode() for k in range((largo_cabecera - 33) // 32)]
    assert "COD_DANE" in nombres and "ESP_COMUN" in nombres and all(len(n) <= 10 for n in nombres)
    primero = dbf[largo_cabecera:largo_cabecera + largo_registro]
    assert b"IE001-0001" in primero and "Guayacán amarillo".encode("utf-8") in primero and b"120001000123" in primero
    assert dbf[-1] == 0x1A
    assert paquete.read("arboles.cpg") == b"UTF-8" and b"WGS_1984" in paquete.read("arboles.prj")


def test_recorte_utf8_no_parte_caracteres():
    assert exportacion._recortar_utf8("Guayacán", 7) == b"Guayac"


# ------------------------------------------------------------------ Endpoint
def test_docente_exporta_solo_su_institucion(api):
    r = api.http.post("/exportar", json={"conjunto": "arboles", "formato": "csv", "institucion_id": "al"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["filas"] == 2 and j["nombre"].startswith("arbolado-IE001-arboles-") and j["nombre"].endswith(".csv")
    assert j["url"].startswith("https://falso/exportaciones/doc1/") and j["sin_codigo_dane"] == []
    ruta, contenido, opciones = api.base.subidas[0]
    assert ruta == "exportaciones/doc1/arboles-csv.csv" and opciones["upsert"] == "true"
    assert b"IE002" not in contenido and b"IE001-0003" not in contenido
    _ruta, segundos, opciones_firma = api.base.firmas[0]
    assert segundos == 600 and opciones_firma == {"download": j["nombre"]}


def test_admin_exporta_todas_y_avisa_sedes_sin_dane(api):
    api.como("adm1", "administrador", None)
    j = api.http.post("/exportar", json={"conjunto": "arboles", "formato": "geojson"}).json()
    assert j["filas"] == 3 and "todas" in j["nombre"]
    assert j["sin_codigo_dane"] == ["Los Almendros"]


def test_paquete_completo(api):
    j = api.http.post("/exportar", json={"conjunto": "todo", "formato": "zip"}).json()
    assert j["nombre"].endswith(".zip")
    paquete = zipfile.ZipFile(io.BytesIO(api.base.subidas[0][1]))
    nombres = set(paquete.namelist())
    assert {"LEEME.txt", "arboles.csv", "arboles.geojson", "inspecciones.csv", "intervenciones.csv", "diccionario.csv", "arboles_shp/arboles.shp"} <= nombres
    intervenciones = paquete.read("intervenciones.csv").decode("utf-8-sig")
    assert "poda" in intervenciones and "Juan Pérez" not in intervenciones
    assert "Ley 1581" in paquete.read("LEEME.txt").decode("utf-8")


@pytest.mark.parametrize("cuerpo", [
    {"conjunto": "inspecciones", "formato": "geojson"},
    {"conjunto": "intervenciones", "formato": "shp"},
    {"conjunto": "todo", "formato": "csv"},
    {"conjunto": "arboles", "formato": "zip"},
    {"conjunto": "otro", "formato": "csv"},
])
def test_combinaciones_invalidas(api, cuerpo):
    assert api.http.post("/exportar", json=cuerpo).status_code == 422


def test_estudiante_no_exporta(api):
    api.como("est1", "estudiante")
    assert api.http.post("/exportar", json={"conjunto": "arboles", "formato": "csv"}).status_code == 403


def test_diccionario(api):
    j = api.http.get("/exportar/diccionario").json()
    campos = {(c["conjunto"], c["campo"]) for c in j["campos"]}
    assert ("arboles", "codigo_dane_sede") in campos and ("inspecciones", "hallazgos") in campos
    assert j["sistema_de_coordenadas"] == "WGS84 (EPSG:4326)"


# ------------------------------------------------------------------ Códigos DANE
def test_admin_asigna_codigo_dane(api):
    api.como("adm1", "administrador", None)
    r = api.http.patch("/instituciones/al", json={"codigo_dane": " 120001000456 ", "divipola": "20001", "municipio": "Valledupar"})
    assert r.status_code == 200, r.text
    assert r.json()["codigo_dane"] == "120001000456"
    fila = next(i for i in api.base.tablas["instituciones"] if i["id"] == "al")
    assert fila["divipola"] == "20001"


@pytest.mark.parametrize("cuerpo", [{"codigo_dane": "12345"}, {"codigo_dane": "12000100045A"}, {"divipola": "200"}, {"municipio": "V"}])
def test_codigos_invalidos(api, cuerpo):
    api.como("adm1", "administrador", None)
    assert api.http.patch("/instituciones/al", json=cuerpo).status_code == 422


def test_quitar_codigo_dane(api):
    api.como("adm1", "administrador", None)
    r = api.http.patch("/instituciones/sj", json={"codigo_dane": ""})
    assert r.status_code == 200 and r.json()["codigo_dane"] is None
    # Solo cambia lo enviado: el municipio sigue igual.
    assert r.json()["municipio"] == "Valledupar"


def test_codigo_dane_repetido(api):
    api.como("adm1", "administrador", None)
    api.base.duplicado = True
    r = api.http.patch("/instituciones/al", json={"codigo_dane": "120001000123"})
    assert r.status_code == 409 and "otra sede" in r.json()["detail"]


def test_docente_no_edita_instituciones(api):
    assert api.http.patch("/instituciones/sj", json={"codigo_dane": "120001000999"}).status_code == 403


def test_sin_migracion_se_listan_sin_codigos(api):
    api.base.sin_migracion = True
    j = api.http.get("/instituciones").json()
    assert {i["id"] for i in j} == {"sj", "al"}
