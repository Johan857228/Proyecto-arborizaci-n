import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def ajustes(tmp_path):
    """Configuración aislada: SQLite temporal y sin leer el .env del equipo."""
    return Settings(
        _env_file=None,
        app_env="pruebas",
        database_url=f"sqlite:///{(tmp_path / 'pruebas.db').as_posix()}",
        storage_path=tmp_path / "fotos",
    )


@pytest.fixture
def cliente(ajustes):
    with TestClient(create_app(ajustes)) as c:
        yield c
