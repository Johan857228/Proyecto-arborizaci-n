import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"
SECRETO_VALIDO = "x" * 48


def _ajustes(**valores) -> Settings:
    return Settings(_env_file=None, **valores)


def test_url_de_postgres_se_arma_con_las_variables():
    url = _ajustes(postgres_host="db", postgres_password="clave", postgres_db="arboles").url_base_datos
    assert url == "postgresql+psycopg://arborizacion:clave@db:5432/arboles"


def test_contrasena_con_caracteres_especiales_no_rompe_la_url():
    url = _ajustes(postgres_password="p@ss:w/rd").url_base_datos
    assert "p%40ss%3Aw%2Frd@localhost" in url


def test_database_url_reemplaza_a_las_variables_postgres():
    assert _ajustes(database_url="sqlite:///./local.db").url_base_datos == "sqlite:///./local.db"


def test_database_url_vacia_se_ignora():
    assert _ajustes(database_url="").url_base_datos.startswith("postgresql+psycopg://")


def test_lee_variables_de_entorno_en_mayusculas(monkeypatch):
    monkeypatch.setenv("POSTGRES_HOST", "db")
    monkeypatch.setenv("CORS_ORIGINS", "https://a.com, https://b.com")
    ajustes = _ajustes()
    assert ajustes.postgres_host == "db"
    assert ajustes.lista_cors == ["https://a.com", "https://b.com"]


def test_produccion_exige_jwt_secret_largo():
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        _ajustes(app_env="produccion")
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        _ajustes(app_env="produccion", jwt_secret="corto")
    assert _ajustes(app_env="produccion", jwt_secret=SECRETO_VALIDO).app_env == "produccion"


def test_produccion_no_acepta_cors_abierto():
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        _ajustes(app_env="produccion", jwt_secret=SECRETO_VALIDO, cors_origins="*")


def test_desarrollo_genera_un_secreto_temporal():
    secreto = _ajustes().jwt_secret.get_secret_value()
    assert len(secreto) >= 32


def test_los_secretos_no_se_muestran_al_imprimir():
    texto = repr(_ajustes(postgres_password="clave-real", jwt_secret=SECRETO_VALIDO))
    assert "clave-real" not in texto
    assert SECRETO_VALIDO not in texto


def _variables_de_la_plantilla() -> dict[str, str]:
    lineas = ENV_EXAMPLE.read_text(encoding="utf-8").splitlines()
    pares = (re.match(r"^([A-Z_]+)=(.*)$", linea) for linea in lineas)
    return {m.group(1): m.group(2) for m in pares if m}


def test_la_plantilla_tiene_todas_las_variables():
    plantilla = _variables_de_la_plantilla()
    faltan = [campo.upper() for campo in Settings.model_fields if campo.upper() not in plantilla]
    assert faltan == [], f"Agrega estas variables a .env.example: {faltan}"


def test_la_plantilla_no_trae_secretos():
    plantilla = _variables_de_la_plantilla()
    assert plantilla["POSTGRES_PASSWORD"] == ""
    assert plantilla["JWT_SECRET"] == ""
    assert plantilla["ADMIN_PASSWORD"] == ""
