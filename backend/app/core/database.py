"""Conexión a la base de datos con SQLAlchemy."""

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Segundos que se espera a PostgreSQL antes de darlo por caído. Sin este límite, una
# base que no responde deja colgada la petición (y el chequeo de salud) varios minutos.
TIEMPO_CONEXION_S = 5


class Base(DeclarativeBase):
    """Base de los modelos de SQLAlchemy (app/infrastructure/database/models)."""


def crear_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": TIEMPO_CONEXION_S})


def crear_sesiones(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def verificar_conexion(engine: Engine) -> bool:
    try:
        with engine.connect() as conexion:
            conexion.execute(text("SELECT 1"))
        return True
    except SQLAlchemyError:
        return False
