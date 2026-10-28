"""Privacidad de menores: política, alias, autorización del acudiente, derechos y anonimización,
y limpieza de metadatos de las fotos. Usa un Supabase falso que sí filtra por columna."""
import os
from datetime import date
from types import SimpleNamespace

import pytest

os.environ.setdefault("SUPABASE_URL", "https://falso.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "sb_publishable_falsa")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "sb_secret_falsa")

from fastapi.testclient import TestClient  # noqa: E402

import comun  # noqa: E402
import db  # noqa: E402
import main  # noqa: E402
from auth import Perfil, Sesion, perfil_actual  # noqa: E402
from routers import privacidad  # noqa: E402

FIRMA = {
    "acudiente_nombre": "Rosa  Pérez Díaz",
    "acudiente_documento": "1065123456",
    "parentesco": "madre",
    "acudiente_contacto": "300 000 0000",
    "estudiante_escuchado": True,
    "firma": "rosa pérez díaz",
    "autoriza_tratamiento": True,
}


class Consulta:
    def __init__(self, base, tabla):
        self.base, self.tabla = base, tabla
        self.filtros, self.accion, self.datos = [], "select", None

    def select(self, *_a, **_k):
        return self

    def eq(self, columna, valor):
        self.filtros.append((columna, valor))
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def in_(self, columna, valores):
        self.filtros.append((columna, ("in", list(valores))))
        return self

    def insert(self, fila):
        self.accion, self.datos = "insert", fila
        return self

    def update(self, cambios):
        self.accion, self.datos = "update", cambios
        return self

    def _coincide(self, fila):
        for columna, valor in self.filtros:
            if isinstance(valor, tuple) and valor[0] == "in":
                if str(fila.get(columna)) not in [str(v) for v in valor[1]]:
                    return False
            elif str(fila.get(columna)) != str(valor):
                return False
        return True

    def execute(self):
        filas = self.base.tablas.setdefault(self.tabla, [])
        if self.accion == "insert":
            nueva = {"id": f"{self.tabla}-{len(filas) + 1}", "creado_en": "2026-10-16T10:00:00-05:00", **self.datos}
            filas.append(nueva)
            self.base.registro.append((self.tabla, "insert", nueva))
            return SimpleNamespace(data=[nueva])
        coinciden = [f for f in filas if self._coincide(f)]
        if self.accion == "update":
            for f in coinciden:
                f.update(self.datos)
            self.base.registro.append((self.tabla, "update", self.datos, dict(self.filtros)))
        return SimpleNamespace(data=[dict(f) for f in coinciden])


class Storage:
    def __init__(self, base):
        self.base = base

    def from_(self, _bucket):
        return self

    def upload(self, ruta, contenido, _opciones=None):
        self.base.registro.append(("storage", "upload", ruta, contenido))

    def remove(self, rutas):
        self.base.registro.append(("storage", "remove", rutas))

    def create_signed_url(self, ruta, _segundos):
        return {"signedURL": f"https://falso/{ruta}"}


class Base:
    def __init__(self):
        self.tablas: dict[str, list[dict]] = {}
        self.registro: list = []
        self.storage = Storage(self)
        self.auth_llamadas: list = []
        base = self

        class Admin:
            def get_user_by_id(self, uid):
                return SimpleNamespace(user=SimpleNamespace(app_metadata={"foto_path": f"perfiles/{uid}/foto-a.jpg"}))

            def update_user_by_id(self, uid, atributos):
                base.auth_llamadas.append((uid, atributos))

        self.auth = SimpleNamespace(admin=Admin())

    def table(self, nombre):
        return Consulta(self, nombre)


def _perfil(uid, rol="estudiante", institucion="sj"):
    return Perfil(usuario_id=uid, nombre=f"Persona {uid}", rol=rol, institucion_id=institucion, curso_id=None,
                  activo=True, correo=f"{uid}@colegio.edu.co", sesion=Sesion(token="t", user_id=uid, email=None))


@pytest.fixture
def api(monkeypatch):
    base = Base()
    base.tablas["perfiles"] = [
        {"usuario_id": "est1", "nombre": "Laura Martínez", "rol": "estudiante", "institucion_id": "sj", "curso_id": None, "activo": True},
        {"usuario_id": "44444444-4444-4444-4444-444444444444", "nombre": "Mateo Ríos", "rol": "estudiante", "institucion_id": "sj", "curso_id": None, "activo": True},
        {"usuario_id": "55555555-5555-5555-5555-555555555555", "nombre": "Ana Díaz", "rol": "estudiante", "institucion_id": "otra", "curso_id": None, "activo": True},
    ]
    monkeypatch.setattr(db, "cliente_de_usuario", lambda token: base)
    monkeypatch.setattr(db, "get_admin", lambda: base)
    actual = {"perfil": _perfil("est1")}
    main.app.dependency_overrides[perfil_actual] = lambda: actual["perfil"]
    cliente = TestClient(main.app)

    def como(uid, rol="estudiante", institucion="sj"):
        actual["perfil"] = _perfil(uid, rol, institucion)

    yield SimpleNamespace(http=cliente, base=base, como=como)
    main.app.dependency_overrides.clear()


# ------------------------------------------------------------------ Política y alias
def test_estado_inicial_de_un_estudiante(api):
    j = api.http.get("/privacidad/estado").json()
    assert j["requiere_consentimiento"] is True
    assert j["consentimiento"] is None and j["politica_aceptada"] is None
    assert j["politica_vigente"] == comun.POLITICA_VERSION


def test_docente_no_requiere_autorizacion_de_acudiente(api):
    api.como("doc1", "docente")
    assert api.http.get("/privacidad/estado").json()["requiere_consentimiento"] is False


def test_aceptar_politica(api):
    j = api.http.post("/privacidad/politica").json()
    assert j["politica_aceptada"] == comun.POLITICA_VERSION and j["politica_aceptada_en"]


@pytest.mark.parametrize("alias, estado", [
    ("Ceiba veloz", 200),
    ("  Guayacán_3  ", 200),
    (None, 200),
    ("ab", 422),
    ("laura@correo.com", 422),
    ("Llámame 3001234567", 422),
    ("<script>", 422),
])
def test_alias(api, alias, estado):
    r = api.http.put("/privacidad/alias", json={"alias": alias})
    assert r.status_code == estado, r.text
    if estado == 200:
        assert r.json()["alias"] == (alias.strip() if alias else None)


# ------------------------------------------------------------- Autorización del acudiente
def test_firma_en_la_app(api):
    r = api.http.post("/privacidad/consentimientos", json=FIRMA)
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["usuario_id"] == "est1" and j["metodo"] == "firma_app"
    assert j["acudiente_nombre"] == "Rosa Pérez Díaz"
    assert j["acudiente_documento"].endswith("3456") and "1065" not in j["acudiente_documento"]
    fila = api.base.tablas["consentimientos"][0]
    assert fila["institucion_id"] == "sj" and fila["registrado_por"] == "est1"
    assert fila["version_politica"] == comun.POLITICA_VERSION
    assert api.http.get("/privacidad/estado").json()["consentimiento"]["id"] == fila["id"]


@pytest.mark.parametrize("cambio, mensaje", [
    ({"firma": "Otra Persona"}, "firma"),
    ({"estudiante_escuchado": False}, "escuchó"),
    ({"autoriza_tratamiento": False}, "autorizar"),
    ({"acudiente_documento": "12"}, ""),
    ({"parentesco": "vecino"}, ""),
])
def test_firma_invalida(api, cambio, mensaje):
    r = api.http.post("/privacidad/consentimientos", json={**FIRMA, **cambio})
    assert r.status_code == 422
    assert mensaje in r.text


def test_estudiante_no_firma_por_otro(api):
    r = api.http.post("/privacidad/consentimientos", json={**FIRMA, "usuario_id": "44444444-4444-4444-4444-444444444444"})
    assert r.status_code == 403


def test_docente_firma_por_estudiante_de_su_institucion_y_no_de_otra(api):
    api.como("doc1", "docente")
    assert api.http.post("/privacidad/consentimientos", json={**FIRMA, "usuario_id": "44444444-4444-4444-4444-444444444444"}).status_code == 201
    assert api.http.post("/privacidad/consentimientos", json={**FIRMA, "usuario_id": "55555555-5555-5555-5555-555555555555"}).status_code == 403


def test_documento_escaneado_lo_sube_el_docente(api):
    api.como("doc1", "docente")
    jpg = bytes([0xFF, 0xD8, 0xFF, 0xD9])
    r = api.http.post(
        "/privacidad/consentimientos/documento",
        data={"usuario_id": "44444444-4444-4444-4444-444444444444", "acudiente_nombre": "Luis Ríos", "acudiente_documento": "77001122",
              "parentesco": "padre", "estudiante_escuchado": "true"},
        files={"archivo": ("formato.jpg", jpg, "image/jpeg")},
    )
    assert r.status_code == 201, r.text
    assert r.json()["documento_url"].startswith("https://falso/consentimientos/44444444-4444-4444-4444-444444444444/")
    subidas = [e for e in api.base.registro if e[:2] == ("storage", "upload")]
    assert subidas and subidas[0][2].startswith("consentimientos/44444444-4444-4444-4444-444444444444/")


def test_estudiante_no_sube_documentos(api):
    r = api.http.post(
        "/privacidad/consentimientos/documento",
        data={"usuario_id": "est1", "acudiente_nombre": "Luis Ríos", "acudiente_documento": "77001122",
              "parentesco": "padre", "estudiante_escuchado": "true"},
        files={"archivo": ("formato.jpg", bytes([0xFF, 0xD8, 0xFF, 0xD9]), "image/jpeg")},
    )
    assert r.status_code == 403


def test_revocar(api):
    api.base.tablas["consentimientos"] = [{
        "id": "11111111-1111-1111-1111-111111111111", "usuario_id": "est1", "institucion_id": "sj",
        "acudiente_nombre": "Rosa Pérez", "acudiente_documento": "1065123456", "parentesco": "madre",
        "metodo": "firma_app", "estudiante_escuchado": True, "version_politica": "2026-10-v1",
        "creado_en": "2026-10-01T10:00:00-05:00", "revocado_en": None,
    }]
    url = "/privacidad/consentimientos/11111111-1111-1111-1111-111111111111/revocar"
    r = api.http.post(url)
    assert r.status_code == 200 and r.json()["revocado_en"]
    assert api.http.post(url).status_code == 409
    assert api.http.get("/privacidad/estado").json()["consentimiento"] is None


def test_lista_de_estudiantes_para_el_docente(api):
    api.base.tablas["consentimientos"] = [
        {"id": "c1", "usuario_id": "est1", "institucion_id": "sj", "acudiente_nombre": "Rosa", "acudiente_documento": "1065123456",
         "parentesco": "madre", "metodo": "firma_app", "estudiante_escuchado": True, "version_politica": "v",
         "creado_en": "2026-10-01T10:00:00-05:00", "revocado_en": None},
    ]
    api.como("doc1", "docente")
    j = api.http.get("/privacidad/estudiantes").json()
    estados = {f["usuario_id"]: f["estado"] for f in j}
    assert estados == {"est1": "vigente", "44444444-4444-4444-4444-444444444444": "sin_autorizacion"}


def test_estudiante_no_ve_la_lista(api):
    assert api.http.get("/privacidad/estudiantes").status_code == 403


# ------------------------------------------------------------------ Derechos
def test_dias_habiles():
    assert privacidad.sumar_dias_habiles(date(2026, 10, 16), 10) == date(2026, 10, 30)
    assert privacidad.sumar_dias_habiles(date(2026, 10, 17), 1) == date(2026, 10, 19)


def test_crear_y_responder_solicitud(api):
    r = api.http.post("/privacidad/solicitudes", json={"tipo": "consulta", "detalle": "Quiero saber qué datos tienen de mí"})
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["estado"] == "pendiente" and j["fecha_limite"]
    assert api.http.get("/privacidad/solicitudes").json()[0]["tipo"] == "consulta"
    assert api.http.get("/privacidad/solicitudes?alcance=institucion").status_code == 403

    sid = "22222222-2222-2222-2222-222222222222"
    api.base.tablas["solicitudes_datos"][0]["id"] = sid
    api.como("doc1", "docente")
    lista = api.http.get("/privacidad/solicitudes?alcance=institucion").json()
    assert lista[0]["nombre"] == "Laura Martínez"
    r = api.http.patch(f"/privacidad/solicitudes/{sid}", json={"estado": "atendida", "respuesta": "Te enviamos la copia de tus datos."})
    assert r.status_code == 200 and r.json()["estado"] == "atendida"
    assert api.http.patch(f"/privacidad/solicitudes/{sid}", json={"estado": "rechazada", "respuesta": "Otra vez"}).status_code == 409


def test_mis_datos(api):
    api.base.tablas["inspecciones"] = [
        {"id": "i1", "arbol_id": "a1", "fecha": "2026-10-01T10:00:00-05:00", "estado_revision": "confirmada", "inspector_id": "est1"},
        {"id": "i2", "arbol_id": "a2", "fecha": "2026-10-02T10:00:00-05:00", "estado_revision": "pendiente", "inspector_id": "44444444-4444-4444-4444-444444444444"},
    ]
    j = api.http.get("/privacidad/mis-datos").json()
    assert j["perfil"]["usuario_id"] == "est1"
    assert [i["id"] for i in j["inspecciones"]] == ["i1"]
    assert "finalidades" in j and "autorizaciones_del_acudiente" in j


# ------------------------------------------------------------------ Anonimización
def test_anonimizar_solo_administrador(api):
    uid = "33333333-3333-3333-3333-333333333333"
    api.base.tablas["perfiles"].append({"usuario_id": uid, "nombre": "Egresado Real", "rol": "estudiante", "institucion_id": "sj", "activo": True})
    api.como("doc1", "docente")
    assert api.http.post(f"/privacidad/anonimizar/{uid}").status_code == 403
    api.como("adm1", "administrador", None)
    r = api.http.post(f"/privacidad/anonimizar/{uid}")
    assert r.status_code == 200, r.text
    fila = next(f for f in api.base.tablas["perfiles"] if f["usuario_id"] == uid)
    assert fila["nombre"].startswith("Exalumno") and fila["activo"] is False and fila["correo"] is None
    (llamada_uid, atributos), = api.base.auth_llamadas
    assert llamada_uid == uid and atributos["ban_duration"]
    assert ("storage", "remove", [f"perfiles/{uid}/foto-a.jpg"]) in api.base.registro


# ------------------------------------------------------------------ Metadatos de fotos
def _segmento(marcador, cuerpo):
    return bytes([0xFF, marcador]) + (len(cuerpo) + 2).to_bytes(2, "big") + cuerpo


def _exif_con_gps():
    entradas = [(0x0112, 3, 1, 6), (0x8825, 4, 1, 38)]  # Orientation = 6 y un puntero a GPS
    tiff = bytearray(b"II*" + bytes([0]) + (8).to_bytes(4, "little") + len(entradas).to_bytes(2, "little"))
    for etiqueta, tipo, cantidad, valor in entradas:
        tiff += etiqueta.to_bytes(2, "little") + tipo.to_bytes(2, "little") + cantidad.to_bytes(4, "little") + valor.to_bytes(4, "little")
    tiff += (0).to_bytes(4, "little") + b"GPS-10.4636N-73.2532W-SECRETO"
    return b"Exif" + bytes([0, 0]) + bytes(tiff)


def test_limpia_jpeg_y_conserva_la_orientacion():
    escaneo = _segmento(0xDA, bytes([1, 2, 3, 4])) + bytes([9, 8, 7, 6]) + bytes([0xFF, 0xD9])
    original = (
        bytes([0xFF, 0xD8])
        + _segmento(0xE0, b"JFIF" + bytes([0, 1, 1]))
        + _segmento(0xE1, _exif_con_gps())
        + _segmento(0xE1, b"http://ns.adobe.com/xap/1.0/" + bytes([0]) + b"<autor>Laura</autor>")
        + _segmento(0xFE, b"Tomada por Laura")
        + _segmento(0xDB, bytes(5))
        + escaneo
    )
    limpio = comun.limpiar_metadatos(original, "image/jpeg")
    assert b"SECRETO" not in limpio and b"Laura" not in limpio and b"xap" not in limpio
    assert limpio.startswith(bytes([0xFF, 0xD8]))
    assert limpio.endswith(escaneo)  # los datos de la imagen no cambian
    assert b"JFIF" in limpio
    inicio = limpio.index(b"Exif")
    assert comun._orientacion_exif(limpio[inicio + 6:]) == 6


def test_limpia_png():
    def trozo(tipo, datos):
        return len(datos).to_bytes(4, "big") + tipo + datos + bytes(4)

    firma = bytes([0x89]) + b"PNG" + bytes([0x0D, 0x0A, 0x1A, 0x0A])
    original = firma + trozo(b"IHDR", bytes(13)) + trozo(b"tEXt", b"Author" + bytes([0]) + b"Laura") + trozo(b"IDAT", bytes(3)) + trozo(b"IEND", b"")
    limpio = comun.limpiar_metadatos(original, "image/png")
    assert b"Laura" not in limpio and b"IHDR" in limpio and b"IDAT" in limpio and limpio.endswith(trozo(b"IEND", b""))


def test_limpia_webp():
    def trozo(tipo, datos):
        relleno = bytes([0]) if len(datos) % 2 else b""
        return tipo + len(datos).to_bytes(4, "little") + datos + relleno

    cuerpo = trozo(b"VP8X", bytes([0x0C]) + bytes(9)) + trozo(b"VP8 ", bytes(10)) + trozo(b"EXIF", b"GPS-SECRETO") + trozo(b"XMP ", b"<x>Laura</x>")
    original = b"RIFF" + (len(cuerpo) + 4).to_bytes(4, "little") + b"WEBP" + cuerpo
    limpio = comun.limpiar_metadatos(original, "image/webp")
    assert b"SECRETO" not in limpio and b"Laura" not in limpio
    assert int.from_bytes(limpio[4:8], "little") == len(limpio) - 8
    vp8x = limpio.index(b"VP8X")
    assert limpio[vp8x + 8] & 0x0C == 0


def test_si_la_foto_esta_rota_no_falla():
    assert comun.limpiar_metadatos(bytes([0xFF, 0xD8, 0xFF]), "image/jpeg").startswith(bytes([0xFF, 0xD8]))
