"""Casos de uso de los árboles: crear, consultar, listar, registrar visitas y dar de baja."""

import unicodedata
from datetime import datetime
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.application.dto.registro import FiltrosArboles, FotoRecibida
from app.application.services.registro_observacion import guardar_observacion, verificar_fotos
from app.core.exceptions import Conflicto, ErrorValidacion, NoEncontrado
from app.domain.enums import EstadoArbol, EstadoSanitario
from app.domain.services.codigos import codigo_arbol
from app.domain.services.validaciones import HORA_COLOMBIA, validar_nueva_visita, validar_registro_nuevo
from app.infrastructure.database.models import ArbolModel, UsuarioModel
from app.infrastructure.database.repositories.arbol_repository import ArbolRepository
from app.infrastructure.database.repositories.catalogo_repository import CatalogoRepository
from app.infrastructure.storage.fotos import AlmacenFotos

INTENTOS_CODIGO = 3


def _ahora(ahora: datetime | None) -> datetime:
    return ahora or datetime.now(HORA_COLOMBIA)


def _normalizar(texto: str) -> str:
    """Minúsculas y sin tildes, para que "canaguate" encuentre "Cañaguate"."""
    sin_tildes = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def consultar_arbol(db: Session, codigo: str) -> ArbolModel:
    arbol = ArbolRepository(db).por_codigo(codigo)
    if arbol is None:
        raise NoEncontrado(f"No existe un árbol con el código {codigo}.")
    return arbol


def crear_arbol(
    db: Session,
    almacen: AlmacenFotos,
    datos: dict[str, Any],
    fotos: list[FotoRecibida],
    usuario: UsuarioModel,
    *,
    ahora: datetime | None = None,
) -> ArbolModel:
    catalogos = CatalogoRepository(db)
    errores: dict[str, str] = {}
    fotos_verificadas = verificar_fotos(fotos, errores)
    identificacion, observacion = validar_registro_nuevo(
        datos,
        [foto.para_reglas() for foto in fotos],
        catalogos.catalogo_valido(),
        ahora=_ahora(ahora),
        errores_previos=errores,
    )

    arboles = ArbolRepository(db)
    # El código se calcula al guardar. Si dos personas guardan a la vez en la misma
    # institución, la restricción única de la base rechaza al segundo y se reintenta.
    for _ in range(INTENTOS_CODIGO):
        institucion = catalogos.institucion(identificacion.institucion_id)
        consecutivo = arboles.siguiente_consecutivo(institucion.id)
        arbol = ArbolModel(
            codigo=codigo_arbol(institucion.prefijo, consecutivo),
            institucion_id=institucion.id,
            consecutivo=consecutivo,
            especie_id=identificacion.especie_id,
            zona_codigo=identificacion.zona,
            zona_otra=identificacion.zona_otra,
            latitud=observacion.coordenadas.latitud,
            longitud=observacion.coordenadas.longitud,
            estado=EstadoArbol.ACTIVO.value,
            creado_por_id=usuario.id,
        )
        try:
            arboles.agregar(arbol)
            break
        except IntegrityError:
            db.rollback()
    else:
        raise Conflicto("No fue posible asignar un código único. Intenta de nuevo.")

    guardar_observacion(db, almacen, arbol, observacion, fotos_verificadas, usuario)
    return consultar_arbol(db, arbol.codigo)


def registrar_visita(
    db: Session,
    almacen: AlmacenFotos,
    codigo: str,
    datos: dict[str, Any],
    fotos: list[FotoRecibida],
    usuario: UsuarioModel,
    *,
    ahora: datetime | None = None,
) -> ArbolModel:
    """Nueva observación de un árbol existente. La institución, la zona y la especie no cambian."""
    arbol = consultar_arbol(db, codigo)
    if arbol.estado == EstadoArbol.BAJA:
        raise Conflicto(f"El árbol {arbol.codigo} está dado de baja y no admite visitas nuevas.")
    errores: dict[str, str] = {}
    fotos_verificadas = verificar_fotos(fotos, errores)
    observacion = validar_nueva_visita(
        datos,
        [foto.para_reglas() for foto in fotos],
        CatalogoRepository(db).catalogo_valido(),
        ahora=_ahora(ahora),
        ultima_fecha=arbol.ultima.fecha_hora,
        errores_previos=errores,
    )
    guardar_observacion(db, almacen, arbol, observacion, fotos_verificadas, usuario)
    return consultar_arbol(db, arbol.codigo)


def dar_de_baja(db: Session, codigo: str, motivo: str) -> ArbolModel:
    """Marca el árbol como dado de baja (talado, muerto, caído) sin borrar su historial."""
    arbol = consultar_arbol(db, codigo)
    motivo = (motivo or "").strip()
    if not motivo:
        raise ErrorValidacion({"motivo": "Escribe el motivo de la baja."})
    if arbol.estado == EstadoArbol.BAJA:
        raise Conflicto(f"El árbol {arbol.codigo} ya está dado de baja.")
    arbol.estado = EstadoArbol.BAJA.value
    arbol.motivo_baja = motivo[:300]
    db.commit()
    return arbol


def listar_arboles(db: Session, filtros: FiltrosArboles) -> tuple[list[ArbolModel], int, dict[str, int]]:
    """Devuelve la página pedida, el total con todos los filtros y el conteo por estado sanitario.

    El conteo por estado se calcula sin el filtro de estado, para los chips del frontend.
    """
    arboles = ArbolRepository(db).todos()
    if not filtros.incluir_bajas:
        arboles = [a for a in arboles if a.estado == EstadoArbol.ACTIVO]
    if filtros.institucion:
        arboles = [a for a in arboles if a.institucion_id == filtros.institucion]
    termino = _normalizar(filtros.buscar.strip())
    if termino:
        arboles = [
            a
            for a in arboles
            if termino in _normalizar(f"{a.codigo} {a.especie.nombre_comun} {a.especie.nombre_cientifico}")
        ]
    conteos = {"todos": len(arboles)} | {estado.value: 0 for estado in EstadoSanitario}
    for arbol in arboles:
        conteos[arbol.ultima.estado_sanitario] += 1
    if filtros.estado_sanitario:
        arboles = [a for a in arboles if a.ultima.estado_sanitario == filtros.estado_sanitario]
    return arboles[filtros.desde : filtros.desde + filtros.limite], len(arboles), conteos


def resumen(db: Session) -> dict[str, int]:
    arboles = ArbolRepository(db).todos()
    activos = [a for a in arboles if a.estado == EstadoArbol.ACTIVO]
    datos = {"total": len(activos), "dados_de_baja": len(arboles) - len(activos)}
    for estado in EstadoSanitario:
        datos[estado.value] = sum(1 for a in activos if a.ultima.estado_sanitario == estado)
    datos["instituciones"] = len(CatalogoRepository(db).instituciones())
    return datos
