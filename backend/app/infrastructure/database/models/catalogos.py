from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InstitucionModel(Base):
    __tablename__ = "institucion"

    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    corto: Mapped[str] = mapped_column(String(60))
    prefijo: Mapped[str] = mapped_column(String(10), unique=True)
    latitud: Mapped[float] = mapped_column(Float)
    longitud: Mapped[float] = mapped_column(Float)


class ZonaModel(Base):
    __tablename__ = "zona"

    codigo: Mapped[str] = mapped_column(String(30), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(60))
    orden: Mapped[int] = mapped_column(Integer)


class InterferenciaModel(Base):
    __tablename__ = "interferencia"

    codigo: Mapped[str] = mapped_column(String(30), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(60))
    orden: Mapped[int] = mapped_column(Integer)


class EspecieModel(Base):
    __tablename__ = "especie"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre_comun: Mapped[str] = mapped_column(String(80), unique=True)
    nombre_cientifico: Mapped[str] = mapped_column(String(120), unique=True)
    # g/cm³. Vacía hasta que A. Datos entregue el valor de cada especie.
    densidad_madera: Mapped[float | None] = mapped_column(Float)


class HallazgoModel(Base):
    """Síntoma o plaga que se puede marcar en el estado fitosanitario."""

    __tablename__ = "hallazgo"

    codigo: Mapped[str] = mapped_column(String(20), primary_key=True)
    grupo: Mapped[str] = mapped_column(String(20))
    nombre: Mapped[str] = mapped_column(String(80))
    orden: Mapped[int] = mapped_column(Integer)
