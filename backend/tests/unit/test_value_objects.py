import pytest

from app.domain.value_objects.coordenadas import Coordenadas
from app.domain.value_objects.medicion import ValorInvalido, leer_medida

REGLAS = {"msg_formato": "formato", "msg_positivo": "positivo", "maximo": 25, "msg_maximo": "maximo"}


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [(12, 12.0), ("12.5", 12.5), ("12,5", 12.5), (" 7 ", 7.0), (".5", 0.5), ("0012.25", 12.25), (25, 25.0)],
)
def test_medidas_validas(valor, esperado):
    assert leer_medida(valor, **REGLAS) == esperado


@pytest.mark.parametrize(
    ("valor", "mensaje"),
    [
        (None, "Este campo es obligatorio."),
        ("  ", "Este campo es obligatorio."),
        (True, "formato"),
        ("12a", "formato"),
        ("1e5", "formato"),
        (float("nan"), "formato"),
        (float("inf"), "formato"),
        ("9" * 400, "formato"),  # tantas cifras que el número se vuelve infinito
        ("0", "positivo"),
        (-3, "positivo"),
        ("12345", "Máximo 4 cifras enteras y 2 decimales."),
        ("1.234", "Máximo 4 cifras enteras y 2 decimales."),
        ("25.01", "maximo"),
    ],
)
def test_medidas_invalidas(valor, mensaje):
    with pytest.raises(ValorInvalido) as error:
        leer_medida(valor, **REGLAS)
    assert error.value.mensaje == mensaje


def test_medida_sin_maximo():
    assert leer_medida("9999.99", msg_formato="f", msg_positivo="p") == 9999.99


def test_coordenadas_se_redondean_a_6_decimales():
    c = Coordenadas.desde("10.46372249", -73.2539814)
    assert (c.latitud, c.longitud) == (10.463722, -73.253981)


@pytest.mark.parametrize(
    ("lat", "lon", "mensaje"),
    [
        (None, -73, "Debes obtener la ubicación antes de continuar."),
        (10, "", "Debes obtener la ubicación antes de continuar."),
        (90.1, 0, "La ubicación recibida no es válida."),
        (0, -180.5, "La ubicación recibida no es válida."),
        (True, 0, "La ubicación recibida no es válida."),
        ("norte", 0, "La ubicación recibida no es válida."),
        (float("nan"), 0, "La ubicación recibida no es válida."),
    ],
)
def test_coordenadas_invalidas(lat, lon, mensaje):
    with pytest.raises(ValorInvalido) as error:
        Coordenadas.desde(lat, lon)
    assert error.value.mensaje == mensaje


def test_limites_exactos_son_validos():
    assert Coordenadas.desde(-90, 180) == Coordenadas(-90.0, 180.0)
