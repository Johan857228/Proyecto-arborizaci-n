"""Almacenamiento de fotos y fechas en la base de datos."""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.infrastructure.database.tipos import FechaUTC
from app.infrastructure.storage.fotos import AlmacenFotos, verificar_imagen
from tests.conftest import imagen


def test_guardar_y_borrar(tmp_path):
    almacen = AlmacenFotos(tmp_path)
    ruta = almacen.guardar("IE001-0001", "completo", imagen(), ".png")
    assert ruta.startswith("IE001-0001/completo-") and ruta.endswith(".png")
    assert almacen.ruta(ruta).read_bytes() == imagen()
    almacen.borrar([ruta, "IE001-0001/no-existe.png"])
    assert not almacen.ruta(ruta).exists()


@pytest.mark.parametrize("ruta", ["../fuera.png", "IE001-0001/../../fuera.png", "/etc/passwd"])
def test_no_se_puede_salir_de_la_carpeta_de_fotos(tmp_path, ruta):
    with pytest.raises(ValueError, match="fuera del almacenamiento"):
        AlmacenFotos(tmp_path / "fotos").ruta(ruta)


def test_verificar_imagen():
    assert verificar_imagen(imagen("JPEG")).mime == "image/jpeg"
    assert verificar_imagen(imagen("PNG", (64, 48))).ancho == 64
    assert verificar_imagen(imagen("GIF")) is None  # formato no permitido
    assert verificar_imagen(b"") is None
    assert verificar_imagen(imagen("PNG")[:40]) is None  # archivo cortado


def test_fechas_se_guardan_en_utc():
    tipo = FechaUTC()
    colombia = datetime(2026, 10, 7, 10, 0, tzinfo=timezone(timedelta(hours=-5)))
    guardada = tipo.process_bind_param(colombia, None)
    assert guardada == datetime(2026, 10, 7, 15, 0)
    assert tipo.process_result_value(guardada, None) == datetime(2026, 10, 7, 15, 0, tzinfo=UTC)
    assert tipo.process_bind_param(None, None) is None
    assert tipo.process_result_value(None, None) is None
    with pytest.raises(ValueError, match="zona horaria"):
        tipo.process_bind_param(datetime(2026, 10, 7, 10, 0), None)
