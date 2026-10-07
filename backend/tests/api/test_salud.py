from fastapi.testclient import TestClient

from app.main import create_app


def test_salud_con_base_de_datos(cliente):
    r = cliente.get("/api/salud")
    assert r.status_code == 200
    assert r.json()["estado"] == "ok"
    assert r.json()["entorno"] == "pruebas"


def test_salud_sin_base_de_datos(ajustes, tmp_path):
    ajustes.database_url = f"sqlite:///{(tmp_path / 'no-existe' / 'x.db').as_posix()}"
    with TestClient(create_app(ajustes)) as c:
        r = c.get("/api/salud")
    assert r.status_code == 503
    assert r.json()["base_de_datos"] == "sin conexión"


def test_documentacion_bajo_el_prefijo(cliente):
    assert cliente.get("/api/docs").status_code == 200
    assert cliente.get("/api/openapi.json").json()["info"]["title"].startswith("Inventario")
    assert cliente.get("/", follow_redirects=False).headers["location"] == "/api/docs"


def test_cors_permite_el_frontend(cliente):
    r = cliente.options(
        "/api/salud",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
