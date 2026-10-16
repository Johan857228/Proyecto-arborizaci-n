from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

import db
import main
from tests.conftest import ARBOL, CUERPO_ARBOL


# ------------------------------- Públicos y acceso -------------------------------
def test_salud():
    assert TestClient(main.app).get("/salud").json() == {"estado": "ok"}


def test_sin_token_da_401():
    main.app.dependency_overrides.clear()
    r = TestClient(main.app).get("/arboles")
    assert r.status_code == 401


def test_token_invalido_da_401(monkeypatch):
    main.app.dependency_overrides.clear()

    class AdminMalo:
        class auth:
            @staticmethod
            def get_user(token):
                raise Exception("token malo")

    monkeypatch.setattr(db, "get_admin", lambda: AdminMalo)
    r = TestClient(main.app).get("/arboles", headers={"Authorization": "Bearer basura"})
    assert r.status_code == 401


def test_login_credenciales_malas(monkeypatch):
    class AnonMalo:
        class auth:
            @staticmethod
            def sign_in_with_password(datos):
                raise AuthApiError("Invalid login credentials", 400, None)

    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: AnonMalo)
    r = TestClient(main.app).post("/auth/login", json={"email": "a@b.c", "password": "x"})
    assert r.status_code == 401


def test_login_ok(monkeypatch):
    sesion = SimpleNamespace(access_token="tok", refresh_token="ref", expires_in=3600)
    usuario = SimpleNamespace(id="u1", email="a@b.c")

    class AnonBueno:
        class auth:
            @staticmethod
            def sign_in_with_password(datos):
                return SimpleNamespace(session=sesion, user=usuario)

    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: AnonBueno)
    r = TestClient(main.app).post("/auth/login", json={"email": "a@b.c", "password": "x"})
    assert r.status_code == 200
    assert r.json()["access_token"] == "tok"
    assert r.json()["user_id"] == "u1"


@pytest.mark.parametrize("email", ["sin-arroba", "a@b", "a b@c.co", "x" * 250 + "@b.co"])
def test_login_rechaza_correo_mal_escrito(email):
    r = TestClient(main.app).post("/auth/login", json={"email": email, "password": "x"})
    assert r.status_code == 422


def test_login_normaliza_el_correo(monkeypatch):
    enviados = []

    class AnonBueno:
        class auth:
            @staticmethod
            def sign_in_with_password(datos):
                enviados.append(datos)
                return SimpleNamespace(
                    session=SimpleNamespace(access_token="tok", refresh_token=None, expires_in=3600),
                    user=SimpleNamespace(id="u1", email="docente@colegio.edu.co"),
                )

    monkeypatch.setattr(db, "nuevo_cliente_anon", lambda: AnonBueno)
    r = TestClient(main.app).post("/auth/login", json={"email": "  Docente@Colegio.edu.co ", "password": "x"})
    assert r.status_code == 200
    assert enviados[0]["email"] == "docente@colegio.edu.co"


# ------------------------------- Crear árbol (validación) -------------------------------
@pytest.mark.parametrize(
    "cambio",
    [
        {"altura_m": 30},
        {"altura_m": 0},
        {"dap_cm": -1},
        {"copa_m": 0},
        {"etapa": "Gigante"},
        {"zona": "Otra"},                                    # falta zona_otra
        {"interferencia": "Otra infraestructura"},           # falta interferencia_otra
        {"lat": 200},
        {"zona": "Cancha inventada"},
        {"dap_cm": 500.1},                                   # tronco de más de 5 m
        {"copa_m": 41},
        {"lat": 40.4168, "lng": -3.7038},                    # Madrid: fuera de Colombia
        {"lat": 0, "lng": 0},
        {"zona": "Otra", "zona_otra": "ab"},                 # muy corto
        {"zona": "Otra", "zona_otra": "x" * 121},            # muy largo
        {"zona": "Otra", "zona_otra": "    "},               # solo espacios
        {"interferencia": "Otra infraestructura", "interferencia_otra": "x" * 121},
        {"observaciones": [f"c{i}" for i in range(51)]},
        {"observaciones": [""]},
        {"especie_id": 0},
        {"institucion_id": ""},
    ],
)
def test_crear_arbol_rechaza_datos_invalidos(entorno, cambio):
    cliente, _, _ = entorno
    r = cliente.post("/arboles", json={**CUERPO_ARBOL, **cambio})
    assert r.status_code == 422


def test_crear_arbol_acepta_los_valores_limite(entorno):
    cliente, _, _ = entorno
    limites = {"dap_cm": 500, "altura_m": 25, "copa_m": 40, "zona": "Otra", "zona_otra": "abc"}
    assert cliente.post("/arboles", json={**CUERPO_ARBOL, **limites}).status_code == 201


def test_crear_arbol_guarda_el_texto_otra_sin_espacios(entorno):
    cliente, _, registro = entorno
    cliente.post("/arboles", json={**CUERPO_ARBOL, "zona": "Otra", "zona_otra": "  Huerta  "})
    insert = next(a for t, m, a, k in registro if t == "arboles" and m == "insert")[0]
    assert insert["zona_otra"] == "Huerta"


def test_crear_arbol_ok(entorno):
    cliente, _, registro = entorno
    r = cliente.post("/arboles", json=CUERPO_ARBOL)
    assert r.status_code == 201
    assert r.json()["codigo"] == "IE001-0001"
    # no debe enviarse 'observaciones' ni 'registrado_por' a la tabla arboles
    insert = next(a for t, m, a, k in registro if t == "arboles" and m == "insert")[0]
    assert "observaciones" not in insert and "registrado_por" not in insert


def test_crear_arbol_con_zona_otra_valida(entorno):
    cliente, _, _ = entorno
    r = cliente.post("/arboles", json={**CUERPO_ARBOL, "zona": "Otra", "zona_otra": "  Huerta  "})
    assert r.status_code == 201


def test_observacion_inexistente_da_422(entorno):
    cliente, almacen, _ = entorno
    almacen["observaciones_catalogo"] = [{"codigo": "f_manchas"}]
    r = cliente.post("/arboles", json={**CUERPO_ARBOL, "observaciones": ["no_existe"]})
    assert r.status_code == 422


def test_si_fallan_observaciones_se_borra_el_arbol(entorno):
    cliente, almacen, registro = entorno
    almacen["observaciones_catalogo"] = [{"codigo": "f_manchas"}]
    almacen["falla_insert"] = "arbol_observaciones"
    r = cliente.post("/arboles", json={**CUERPO_ARBOL, "observaciones": ["f_manchas"]})
    assert r.status_code == 422  # 23503 traducido
    assert ("arboles", "delete", (), {}) in registro  # compensación


# ------------------------------- Lectura -------------------------------
def test_listar_arboles_con_filtros(entorno):
    cliente, _, registro = entorno
    r = cliente.get("/arboles?estado=sano&institucion_id=sj&especie=man&limite=10")
    assert r.status_code == 200 and len(r.json()) == 1
    metodos = [(m, a) for t, m, a, k in registro if t == "arboles_resumen"]
    assert ("eq", ("estado", "sano")) in metodos
    assert ("ilike", ("nombre_comun", "%man%")) in metodos


def test_listar_rechaza_estado_invalido(entorno):
    cliente, _, _ = entorno
    assert cliente.get("/arboles?estado=azul").status_code == 422
    assert cliente.get("/arboles?limite=1000").status_code == 422


def test_listar_filtra_solo_zonas_del_catalogo(entorno):
    cliente, _, registro = entorno
    assert cliente.get("/arboles?zona=Cancha inventada").status_code == 422
    assert cliente.get("/arboles?zona=Zona deportiva").status_code == 200
    assert ("arboles_resumen", "eq", ("zona", "Zona deportiva"), {}) in registro


def test_listar_busca_la_especie_sin_comodines(entorno):
    cliente, _, registro = entorno
    assert cliente.get("/arboles", params={"especie": "  100%_ma*ngo "}).status_code == 200
    assert ("arboles_resumen", "ilike", ("nombre_comun", r"%100\%\_mango%"), {}) in registro
    assert cliente.get("/arboles", params={"especie": "x" * 61}).status_code == 422


def test_detalle_arbol(entorno):
    cliente, almacen, _ = entorno
    almacen["observaciones_catalogo"] = [{"codigo": "f_manchas", "grupo": "follaje", "etiqueta": "Manchas", "orden": 1}]
    almacen["arbol_observaciones"] = [{"observacion_codigo": "f_manchas"}]
    almacen["arbol_fotos"] = [{"id": "f1", "tipo": "completo", "storage_path": "x/y.jpg"}]
    r = cliente.get(f"/arboles/{ARBOL['id']}")
    assert r.status_code == 200
    j = r.json()
    assert j["observaciones"][0]["etiqueta"] == "Manchas"
    assert j["fotos"][0]["url"].startswith("https://falso/")


def test_detalle_no_existe(entorno):
    cliente, almacen, _ = entorno
    almacen["arboles_resumen"] = []
    assert cliente.get(f"/arboles/{ARBOL['id']}").status_code == 404


def test_id_con_formato_malo(entorno):
    cliente, _, _ = entorno
    assert cliente.get("/arboles/no-es-uuid").status_code == 422


def test_calculos_endpoint(entorno):
    cliente, _, _ = entorno
    r = cliente.get(f"/arboles/{ARBOL['id']}/calculos")
    assert r.status_code == 200
    j = r.json()
    assert j["biomasa_total_kg"] > 0 and j["co2_kg"] > j["carbono_kg"] > 0
    assert "Chave" in j["metodo"] and j["advertencia"]


def test_estadisticas(entorno):
    cliente, almacen, _ = entorno
    otro = {**ARBOL, "nombre_comun": "Ceiba", "prefijo": "IE002", "nombre_corto": "Los Almendros",
            "estado": "critico", "etapa": "Juvenil", "dap_cm": 20.0, "altura_m": 5.0, "copa_m": 2.5}
    almacen["arboles_resumen"] = [ARBOL, ARBOL, otro]
    j = cliente.get("/estadisticas").json()
    assert j["total"] == 3
    assert j["por_estado"] == {"sano": 2, "riesgo": 0, "critico": 1}
    assert j["especies_frecuentes"][0] == {"nombre_comun": "Mango", "total": 2}
    assert j["promedios"]["dap_cm"] == pytest.approx((35.5 * 2 + 20) / 3, abs=0.01)
    assert j["totales_ambientales"]["co2_kg"] > 0
    assert [i["prefijo"] for i in j["por_institucion"]] == ["IE001", "IE002"]


def test_estadisticas_sin_datos(entorno):
    cliente, almacen, _ = entorno
    almacen["arboles_resumen"] = []
    j = cliente.get("/estadisticas").json()
    assert j["total"] == 0 and j["promedios"]["dap_cm"] is None


# ------------------------------- Fotos -------------------------------
JPG = ("foto.jpg", b"\xff\xd8\xff\xe0fakejpg", "image/jpeg")


def _subir(cliente, tipo="completo", archivo=JPG):
    return cliente.post(f"/arboles/{ARBOL['id']}/fotos?tipo={tipo}", files={"archivo": archivo})


def test_subir_foto_ok(entorno):
    cliente, _, registro = entorno
    r = _subir(cliente)
    assert r.status_code == 201
    assert r.json()["storage_path"].startswith(ARBOL["id"] + "/")
    assert any(t == "storage" and m == "upload" for t, m, a, k in registro)


def test_foto_tipo_invalido(entorno):
    cliente, _, _ = entorno
    assert _subir(cliente, tipo="otro").status_code == 422


def test_foto_formato_invalido(entorno):
    cliente, _, _ = entorno
    assert _subir(cliente, archivo=("a.pdf", b"%PDF", "application/pdf")).status_code == 422


def test_foto_con_contenido_que_no_es_imagen(entorno):
    cliente, _, registro = entorno
    falsa = ("virus.jpg", b"MZ\x90\x00 esto no es una imagen", "image/jpeg")
    assert _subir(cliente, archivo=falsa).status_code == 422
    assert not any(t == "storage" and m == "upload" for t, m, a, k in registro)


@pytest.mark.parametrize(
    "contenido, extension",
    [
        (b"\x89PNG\r\n\x1a\n" + b"datos", ".png"),
        (b"RIFF\x10\x00\x00\x00WEBPVP8 ", ".webp"),
    ],
)
def test_foto_se_guarda_con_su_formato_real(entorno, contenido, extension):
    cliente, _, _ = entorno
    # el navegador dice JPG, pero el contenido manda
    r = _subir(cliente, archivo=("foto.jpg", contenido, "image/jpeg"))
    assert r.status_code == 201
    assert r.json()["storage_path"].endswith(extension)


def test_foto_archivo_vacio(entorno):
    cliente, _, _ = entorno
    assert _subir(cliente, archivo=("a.jpg", b"", "image/jpeg")).status_code == 422


def test_foto_muy_grande(entorno, monkeypatch):
    cliente, _, _ = entorno
    monkeypatch.setattr(main, "MAX_FOTO_BYTES", 10)
    assert _subir(cliente, archivo=("a.jpg", b"x" * 50, "image/jpeg")).status_code == 413


def test_foto_de_arbol_ajeno_da_403(entorno):
    cliente, almacen, _ = entorno
    almacen["arboles"] = [{**ARBOL, "registrado_por": "otro-usuario"}]
    assert _subir(cliente).status_code == 403


def test_maximo_tres_adicionales(entorno):
    cliente, almacen, _ = entorno
    almacen["arbol_fotos"] = [{"id": str(i)} for i in range(3)]
    assert _subir(cliente, tipo="adicional").status_code == 409


def test_foto_duplicada_limpia_storage(entorno):
    cliente, almacen, registro = entorno
    almacen["falla_insert"] = "arbol_fotos"
    r = _subir(cliente)
    assert r.status_code == 422
    assert any(t == "storage" and m == "remove" for t, m, a, k in registro)


# ------------------------------- Catálogos -------------------------------
def test_catalogos_publicos(entorno):
    cliente, almacen, _ = entorno
    almacen["especies"] = [{"id": 1, "nombre_comun": "Mango", "nombre_cientifico": "Mangifera indica"}]
    almacen["instituciones"] = [
        {"id": "sj", "nombre": "IE San José", "nombre_corto": "San José", "prefijo": "IE001", "lat": 10.46, "lng": -73.25}
    ]
    almacen["observaciones_catalogo"] = [{"codigo": "f_manchas", "grupo": "follaje", "etiqueta": "Manchas", "orden": 1}]
    main.app.dependency_overrides.clear()  # no requiere token
    r = cliente.get("/catalogos")
    assert r.status_code == 200
    assert r.json()["especies"][0]["nombre_comun"] == "Mango"


# ------------------------------- CORS -------------------------------
def _preflight(origen):
    return TestClient(main.app).options(
        "/arboles",
        headers={
            "Origin": origen,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


@pytest.mark.parametrize(
    "origen",
    [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5174",     # otro puerto
        "http://127.0.0.1:5173",     # 127.0.0.1 es un origen distinto a localhost
        "http://localhost",
    ],
)
def test_cors_permite_localhost_en_cualquier_puerto(origen):
    r = _preflight(origen)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origen


def test_cors_rechaza_origen_desconocido():
    r = _preflight("https://sitio-ajeno.com")
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers


def test_cors_respuesta_normal_lleva_el_encabezado():
    r = TestClient(main.app).get("/salud", headers={"Origin": "http://localhost:5173"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"