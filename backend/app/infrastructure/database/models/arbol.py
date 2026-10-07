"""Árboles, observaciones y fotos.

El árbol guarda lo que casi no cambia (código, institución, especie, zona) y cada
observación lo que se mide en una visita. Así queda el historial de cada árbol.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, Numeric, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.infrastructure.database.models.catalogos import (
    EspecieModel,
    HallazgoModel,
    InstitucionModel,
    InterferenciaModel,
    ZonaModel,
)
from app.infrastructure.database.models.usuario import UsuarioModel
from app.infrastructure.database.tipos import FechaUTC, ahora_utc

Medida = Numeric(8, 2, asdecimal=False)

observacion_hallazgo = Table(
    "observacion_hallazgo",
    Base.metadata,
    Column("observacion_id", ForeignKey("observacion.id", ondelete="CASCADE"), primary_key=True),
    Column("hallazgo_codigo", ForeignKey("hallazgo.codigo"), primary_key=True),
)


class ArbolModel(Base):
    __tablename__ = "arbol"
    __table_args__ = (UniqueConstraint("institucion_id", "consecutivo"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    institucion_id: Mapped[str] = mapped_column(ForeignKey("institucion.id"))
    consecutivo: Mapped[int] = mapped_column(Integer)
    especie_id: Mapped[int] = mapped_column(ForeignKey("especie.id"))
    zona_codigo: Mapped[str] = mapped_column(ForeignKey("zona.codigo"))
    zona_otra: Mapped[str | None] = mapped_column(String(120))
    latitud: Mapped[float] = mapped_column(Float)
    longitud: Mapped[float] = mapped_column(Float)
    estado: Mapped[str] = mapped_column(String(10), default="activo")
    motivo_baja: Mapped[str | None] = mapped_column(String(300))
    creado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    creado_en: Mapped[datetime] = mapped_column(FechaUTC, default=ahora_utc)

    institucion: Mapped[InstitucionModel] = relationship()
    especie: Mapped[EspecieModel] = relationship()
    zona: Mapped[ZonaModel] = relationship()
    observaciones: Mapped[list["ObservacionModel"]] = relationship(
        back_populates="arbol",
        order_by=lambda: [ObservacionModel.fecha_hora, ObservacionModel.id],
        cascade="all, delete-orphan",
    )

    @property
    def ultima(self) -> "ObservacionModel":
        return self.observaciones[-1]


class ObservacionModel(Base):
    __tablename__ = "observacion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    arbol_id: Mapped[int] = mapped_column(ForeignKey("arbol.id", ondelete="CASCADE"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    fecha_hora: Mapped[datetime] = mapped_column(FechaUTC)
    latitud: Mapped[float] = mapped_column(Float)
    longitud: Mapped[float] = mapped_column(Float)
    cap_cm: Mapped[float | None] = mapped_column(Medida)
    dap_cm: Mapped[float | None] = mapped_column(Medida)
    altura_m: Mapped[float] = mapped_column(Medida)
    copa_m: Mapped[float] = mapped_column(Medida)
    etapa: Mapped[str] = mapped_column(String(20))
    interferencia_codigo: Mapped[str] = mapped_column(ForeignKey("interferencia.codigo"))
    interferencia_otra: Mapped[str | None] = mapped_column(String(160))
    estado_sanitario: Mapped[str] = mapped_column(String(12))
    regla_calificacion: Mapped[str] = mapped_column(String(40))
    # Resultados de los cálculos ambientales
    area_copa_m2: Mapped[float] = mapped_column(Medida)
    biomasa_kg: Mapped[float | None] = mapped_column(Medida)
    carbono_kg: Mapped[float | None] = mapped_column(Medida)
    co2_kg: Mapped[float | None] = mapped_column(Medida)
    o2_kg: Mapped[float | None] = mapped_column(Medida)
    densidad_usada: Mapped[float | None] = mapped_column(Float)
    densidad_estimada: Mapped[bool] = mapped_column(Boolean, default=False)
    version_formulas: Mapped[str] = mapped_column(String(40))
    creado_en: Mapped[datetime] = mapped_column(FechaUTC, default=ahora_utc)

    arbol: Mapped[ArbolModel] = relationship(back_populates="observaciones")
    usuario: Mapped[UsuarioModel | None] = relationship()
    interferencia: Mapped[InterferenciaModel] = relationship()
    hallazgos: Mapped[list[HallazgoModel]] = relationship(secondary=observacion_hallazgo, order_by=HallazgoModel.orden)
    fotos: Mapped[list["FotoModel"]] = relationship(
        back_populates="observacion", order_by="FotoModel.id", cascade="all, delete-orphan"
    )


class FotoModel(Base):
    __tablename__ = "foto"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    observacion_id: Mapped[int] = mapped_column(ForeignKey("observacion.id", ondelete="CASCADE"), index=True)
    tipo: Mapped[str] = mapped_column(String(10))
    ruta: Mapped[str] = mapped_column(String(200))
    mime: Mapped[str] = mapped_column(String(30))
    tamano_bytes: Mapped[int] = mapped_column(Integer)
    ancho: Mapped[int] = mapped_column(Integer)
    alto: Mapped[int] = mapped_column(Integer)
    creado_en: Mapped[datetime] = mapped_column(FechaUTC, default=ahora_utc)

    observacion: Mapped[ObservacionModel] = relationship(back_populates="fotos")
