"""Configuración del backend.

Todos los valores salen de variables de entorno o del archivo backend/.env.
La plantilla con todas las variables, sin secretos, está en backend/.env.example.
Los nombres de las variables se escriben en mayúsculas (POSTGRES_HOST, JWT_SECRET...).
"""

import logging
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

logger = logging.getLogger(__name__)

LARGO_MINIMO_SECRETO = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Aplicación
    app_env: Literal["desarrollo", "pruebas", "produccion"] = "desarrollo"
    api_prefix: str = "/api"

    # Base de datos. Si DATABASE_URL tiene valor, reemplaza a las variables POSTGRES_*.
    database_url: str | None = None
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "arborizacion"
    postgres_user: str = "arborizacion"
    postgres_password: SecretStr = SecretStr("")

    # Seguridad
    jwt_secret: SecretStr | None = None
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    cors_origins: str = "http://localhost:5173"

    # Primer administrador: se crea al arrancar si la base no tiene usuarios.
    admin_email: str | None = None
    admin_password: SecretStr | None = None

    # Fotografías
    storage_path: Path = Path("data/fotos")

    @property
    def url_base_datos(self) -> str:
        """URL de conexión para SQLAlchemy.

        Se arma con URL.create para que una contraseña con caracteres como @, : o /
        no rompa la dirección.
        """
        if self.database_url:
            return self.database_url
        return URL.create(
            "postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value() or None,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        ).render_as_string(hide_password=False)

    @property
    def lista_cors(self) -> list[str]:
        return [origen.strip() for origen in self.cors_origins.split(",") if origen.strip()]

    @model_validator(mode="after")
    def _revisar_secretos(self) -> "Settings":
        secreto = self.jwt_secret.get_secret_value() if self.jwt_secret else ""
        if self.app_env == "produccion":
            if len(secreto) < LARGO_MINIMO_SECRETO:
                raise ValueError(
                    f"JWT_SECRET debe tener al menos {LARGO_MINIMO_SECRETO} caracteres en producción. "
                    'Genera uno con: python -c "import secrets; print(secrets.token_urlsafe(48))"'
                )
            if "*" in self.lista_cors:
                raise ValueError("CORS_ORIGINS no puede ser * en producción; indica los dominios del frontend.")
        elif not secreto:
            # En desarrollo se genera uno temporal para no bloquear a nadie. Las sesiones
            # se pierden cada vez que se reinicia el servidor.
            self.jwt_secret = SecretStr(secrets.token_urlsafe(48))
            logger.warning("JWT_SECRET no está definido; se usa uno temporal solo para %s.", self.app_env)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
