"""Coordina el registro de una observación:

    validar fotos -> calcular -> guardar observación y resultados -> guardar fotos

Lo usan tanto el registro de un árbol nuevo como el de una visita nueva.
"""

from sqlalchemy.orm import Session

from app.application.dto.registro import FotoRecibida
from app.domain.entities.registro import Observacion
from app.domain.services.estado_sanitario import REGLA_VIGENTE, calificar
from app.infrastructure.calculations.ambientales import calcular
from app.infrastructure.database.models import ArbolModel, FotoModel, ObservacionModel, UsuarioModel
from app.infrastructure.database.repositories.catalogo_repository import CatalogoRepository
from app.infrastructure.storage.fotos import AlmacenFotos, ImagenVerificada, verificar_imagen


def verificar_fotos(fotos: list[FotoRecibida], errores: dict[str, str]) -> list[tuple[FotoRecibida, ImagenVerificada]]:
    """Revisa que cada archivo sea de verdad una imagen. Si alguno no lo es, lo anota en `errores`."""
    verificadas = []
    for foto in fotos:
        imagen = verificar_imagen(foto.contenido)
        if imagen is None:
            errores["fotos"] = f"La fotografía «{foto.nombre}» no es una imagen JPEG, PNG o WebP válida."
            return []
        verificadas.append((foto, imagen))
    return verificadas


def guardar_observacion(
    db: Session,
    almacen: AlmacenFotos,
    arbol: ArbolModel,
    observacion: Observacion,
    fotos: list[tuple[FotoRecibida, ImagenVerificada]],
    usuario: UsuarioModel,
) -> ObservacionModel:
    """Guarda la observación con sus cálculos y sus fotos en una sola transacción.

    Si algo falla, se deshace todo y se borran los archivos que alcanzaron a escribirse.
    """
    resultado = calcular(
        dap_cm=observacion.dap_cm,
        cap_cm=observacion.cap_cm,
        altura_m=observacion.altura_m,
        copa_m=observacion.copa_m,
        densidad=arbol.especie.densidad_madera,
    )
    modelo = ObservacionModel(
        usuario_id=usuario.id,
        fecha_hora=observacion.fecha_hora,
        latitud=observacion.coordenadas.latitud,
        longitud=observacion.coordenadas.longitud,
        cap_cm=observacion.cap_cm,
        dap_cm=resultado.dap_cm,
        altura_m=observacion.altura_m,
        copa_m=observacion.copa_m,
        etapa=observacion.etapa.value,
        interferencia_codigo=observacion.interferencia,
        interferencia_otra=observacion.interferencia_otra,
        estado_sanitario=calificar(observacion.hallazgos).value,
        regla_calificacion=REGLA_VIGENTE,
        area_copa_m2=resultado.area_copa_m2,
        biomasa_kg=resultado.biomasa_kg,
        carbono_kg=resultado.carbono_kg,
        co2_kg=resultado.co2_kg,
        o2_kg=resultado.o2_kg,
        densidad_usada=resultado.densidad_usada,
        densidad_estimada=resultado.densidad_estimada,
        version_formulas=resultado.version,
        hallazgos=CatalogoRepository(db).hallazgos_por_codigo(observacion.hallazgos),
    )
    arbol.observaciones.append(modelo)

    rutas: list[str] = []
    try:
        for foto, imagen in fotos:
            ruta = almacen.guardar(arbol.codigo, foto.tipo.value, foto.contenido, imagen.extension)
            rutas.append(ruta)
            modelo.fotos.append(
                FotoModel(
                    tipo=foto.tipo.value,
                    ruta=ruta,
                    mime=imagen.mime,
                    tamano_bytes=len(foto.contenido),
                    ancho=imagen.ancho,
                    alto=imagen.alto,
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        almacen.borrar(rutas)
        raise
    return modelo
