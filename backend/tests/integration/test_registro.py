"""Casos de uso contra la base de datos, el almacenamiento de fotos y los cálculos reales."""

from datetime import datetime

import pytest
from sqlalchemy import func, select

from app.application.dto.registro import FiltrosArboles
from app.application.use_cases import arboles as casos
from app.core.exceptions import Conflicto, ErrorValidacion, NoEncontrado
from app.domain.enums import EstadoSanitario, Rol, TipoFoto
from app.domain.services.validaciones import HORA_COLOMBIA
from app.infrastructure.database.models import ArbolModel, EspecieModel, FotoModel, ObservacionModel
from app.infrastructure.database.repositories.arbol_repository import ArbolRepository
from tests.conftest import datos_validos, fotos_validas

AHORA = datetime(2026, 10, 7, 12, 0, tzinfo=HORA_COLOMBIA)


@pytest.fixture
def registrador(usuarios):
    return usuarios[Rol.REGISTRADOR]


def crear(db, almacen, usuario, **cambios):
    return casos.crear_arbol(db, almacen, datos_validos(**cambios), fotos_validas(), usuario, ahora=AHORA)


def contar(db, modelo) -> int:
    return db.scalar(select(func.count()).select_from(modelo))


def test_registro_guarda_arbol_observacion_calculos_y_fotos(db, almacen, registrador):
    arbol = casos.crear_arbol(db, almacen, datos_validos(), fotos_validas(extras=2), registrador, ahora=AHORA)

    assert arbol.codigo == "IE001-0001"
    assert arbol.creado_por_id == registrador.id
    obs = arbol.ultima
    assert obs.estado_sanitario == EstadoSanitario.EN_RIESGO
    assert [h.codigo for h in obs.hallazgos] == ["f_clorosis", "p_pulgones"]
    # Cálculos con la densidad provisional (las especies aún no tienen la suya)
    assert obs.biomasa_kg == pytest.approx(619.4, abs=0.1)
    assert obs.co2_kg == pytest.approx(1067.5, abs=0.1)
    assert obs.densidad_estimada is True
    # Fotos: en la base y en el disco
    assert [f.tipo for f in obs.fotos] == ["completo", "detalle", "extra", "extra"]
    for foto in obs.fotos:
        assert almacen.ruta(foto.ruta).read_bytes()[:4] in (b"\x89PNG", b"\xff\xd8\xff\xe0", b"RIFF")
    assert {f.mime for f in obs.fotos} == {"image/png", "image/jpeg", "image/webp"}


def test_usa_la_densidad_de_la_especie_si_la_tiene(db, almacen, registrador):
    db.get(EspecieModel, 1).densidad_madera = 0.55
    db.commit()
    obs = crear(db, almacen, registrador).ultima
    assert (obs.densidad_usada, obs.densidad_estimada) == (0.55, False)


def test_los_codigos_son_consecutivos_por_institucion(db, almacen, registrador):
    assert crear(db, almacen, registrador).codigo == "IE001-0001"
    assert crear(db, almacen, registrador).codigo == "IE001-0002"
    assert crear(db, almacen, registrador, institucion_id="vv").codigo == "IE003-0001"


def test_codigo_ocupado_se_reintenta_con_el_siguiente(db, almacen, registrador, monkeypatch):
    crear(db, almacen, registrador)  # ocupa IE001-0001
    original = ArbolRepository.siguiente_consecutivo
    respuestas = iter([1])  # la primera vez devuelve un consecutivo ya usado, como en una carrera

    def con_choque(self, institucion_id):
        return next(respuestas, None) or original(self, institucion_id)

    monkeypatch.setattr(ArbolRepository, "siguiente_consecutivo", con_choque)
    assert crear(db, almacen, registrador).codigo == "IE001-0002"


def test_si_el_codigo_no_se_puede_asignar_responde_conflicto(db, almacen, registrador, monkeypatch):
    crear(db, almacen, registrador)
    monkeypatch.setattr(ArbolRepository, "siguiente_consecutivo", lambda self, institucion_id: 1)
    with pytest.raises(Conflicto, match="código único"):
        crear(db, almacen, registrador)


def test_datos_invalidos_no_dejan_rastro(db, almacen, registrador):
    with pytest.raises(ErrorValidacion):
        casos.crear_arbol(db, almacen, datos_validos(altura_m=30), fotos_validas(), registrador, ahora=AHORA)
    assert contar(db, ArbolModel) == 0
    assert not any(almacen.carpeta.rglob("*.*"))


def test_foto_que_no_es_imagen_se_rechaza_junto_con_los_demas_errores(db, almacen, registrador):
    fotos = fotos_validas()
    fotos[0] = type(fotos[0])(TipoFoto.COMPLETO, "virus.png", b"no soy una imagen")
    with pytest.raises(ErrorValidacion) as error:
        casos.crear_arbol(db, almacen, datos_validos(zona=None), fotos, registrador, ahora=AHORA)
    assert error.value.errores == {
        "fotos": "La fotografía «virus.png» no es una imagen JPEG, PNG o WebP válida.",
        "zona": "Debes seleccionar una zona.",
    }


def test_si_falla_el_guardado_se_borran_las_fotos_escritas(db, almacen, registrador, monkeypatch):
    def commit_que_falla():
        raise RuntimeError("se cayó la base")

    monkeypatch.setattr(db, "commit", commit_que_falla)
    with pytest.raises(RuntimeError):
        crear(db, almacen, registrador)
    monkeypatch.undo()
    assert contar(db, ObservacionModel) == 0
    assert contar(db, FotoModel) == 0
    assert not any(almacen.carpeta.rglob("*.*"))


def test_visita_nueva_queda_en_el_historial(db, almacen, registrador):
    codigo = crear(db, almacen, registrador).codigo
    datos = datos_validos(fecha_hora="2026-10-07T11:00:00-05:00", altura_m=12.8, observaciones=[])
    arbol = casos.registrar_visita(db, almacen, codigo, datos, fotos_validas(), registrador, ahora=AHORA)
    assert [o.altura_m for o in arbol.observaciones] == [12.0, 12.8]
    assert arbol.ultima.estado_sanitario == EstadoSanitario.SANO
    assert arbol.especie.id == 1  # la visita no cambia la especie


def test_visita_con_fecha_anterior_se_rechaza(db, almacen, registrador):
    codigo = crear(db, almacen, registrador).codigo
    with pytest.raises(ErrorValidacion) as error:
        casos.registrar_visita(
            db, almacen, codigo, datos_validos(fecha_hora="2026-08-01T10:00:00-05:00"), fotos_validas(), registrador
        )
    assert "fecha_hora" in error.value.errores


def test_arbol_dado_de_baja(db, almacen, registrador):
    codigo = crear(db, almacen, registrador).codigo
    with pytest.raises(ErrorValidacion):
        casos.dar_de_baja(db, codigo, "  ")
    casos.dar_de_baja(db, codigo, "Caído por tormenta")
    with pytest.raises(Conflicto, match="ya está dado de baja"):
        casos.dar_de_baja(db, codigo, "otra vez")
    with pytest.raises(Conflicto, match="no admite visitas"):
        casos.registrar_visita(db, almacen, codigo, datos_validos(), fotos_validas(), registrador)
    # Conserva su historial, pero sale de la lista y del resumen
    assert len(casos.consultar_arbol(db, codigo).observaciones) == 1
    assert casos.listar_arboles(db, FiltrosArboles())[1] == 0
    assert casos.listar_arboles(db, FiltrosArboles(incluir_bajas=True))[1] == 1
    assert casos.resumen(db)["dados_de_baja"] == 1


def test_arbol_inexistente(db):
    with pytest.raises(NoEncontrado, match="IE009-0001"):
        casos.consultar_arbol(db, "IE009-0001")


def test_listado_con_filtros_y_conteos(db, almacen, registrador):
    crear(db, almacen, registrador, observaciones=[])  # sano
    crear(db, almacen, registrador, especie_id=2)  # Cañaguate, en riesgo
    crear(
        db,
        almacen,
        registrador,
        institucion_id="la",
        observaciones=["f_manchas", "t_micelio", "r_cortes", "p_termitas"],
    )

    items, total, conteos = casos.listar_arboles(db, FiltrosArboles())
    assert total == 3
    assert [a.codigo for a in items] == ["IE002-0001", "IE001-0002", "IE001-0001"]  # más reciente primero
    assert conteos == {"todos": 3, "sano": 1, "en_riesgo": 1, "critico": 1}

    _, total, conteos = casos.listar_arboles(db, FiltrosArboles(institucion="sj"))
    assert (total, conteos["todos"]) == (2, 2)

    items, total, conteos = casos.listar_arboles(db, FiltrosArboles(estado_sanitario=EstadoSanitario.CRITICO))
    assert [a.codigo for a in items] == ["IE002-0001"]
    assert conteos["todos"] == 3  # el filtro de estado no cambia los conteos

    items, _, _ = casos.listar_arboles(db, FiltrosArboles(buscar="canaguate"))  # sin tilde
    assert [a.especie.nombre_comun for a in items] == ["Cañaguate"]

    items, total, _ = casos.listar_arboles(db, FiltrosArboles(desde=1, limite=1))
    assert (len(items), total) == (1, 3)


def test_resumen(db, almacen, registrador):
    crear(db, almacen, registrador, observaciones=[])
    crear(db, almacen, registrador)
    assert casos.resumen(db) == {
        "total": 2,
        "dados_de_baja": 0,
        "sano": 1,
        "en_riesgo": 1,
        "critico": 0,
        "instituciones": 3,
    }
