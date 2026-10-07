"""Cálculos ambientales. El ejemplo del mango es el de la planeación del backend (sección 10)."""

import math

import pytest

from app.infrastructure.calculations.ambientales import (
    DENSIDAD_POR_DEFECTO,
    VERSION_FORMULAS,
    area_copa_m2,
    calcular,
    dap_desde_cap,
)


def test_dap_desde_cap():
    assert dap_desde_cap(126) == 40.11
    assert dap_desde_cap(math.pi * 30) == 30.0


def test_area_de_copa():
    assert area_copa_m2(8) == 50.27
    assert area_copa_m2(2) == pytest.approx(math.pi, abs=0.01)


def test_ejemplo_del_mango_de_la_planeacion():
    r = calcular(dap_cm=40, cap_cm=None, altura_m=12, copa_m=8, densidad=0.6)
    assert r.area_copa_m2 == 50.27
    assert r.biomasa_kg == pytest.approx(619.4, abs=0.1)
    assert r.carbono_kg == pytest.approx(291.1, abs=0.1)
    assert r.co2_kg == pytest.approx(1067.5, abs=0.1)
    assert r.o2_kg == pytest.approx(776.4, abs=0.1)
    assert r.densidad_estimada is False
    assert r.version == VERSION_FORMULAS


def test_relaciones_entre_resultados():
    r = calcular(dap_cm=55.3, cap_cm=None, altura_m=17.2, copa_m=11, densidad=0.73)
    assert r.carbono_kg == pytest.approx(r.biomasa_kg * 0.47, abs=0.01)
    assert r.co2_kg == pytest.approx(r.carbono_kg * 44 / 12, abs=0.01)
    assert r.o2_kg == pytest.approx(r.co2_kg * 32 / 44, abs=0.01)


def test_sin_densidad_usa_la_provisional_y_lo_marca():
    r = calcular(dap_cm=40, cap_cm=None, altura_m=12, copa_m=8, densidad=None)
    assert r.densidad_usada == DENSIDAD_POR_DEFECTO
    assert r.densidad_estimada is True
    assert r.biomasa_kg == pytest.approx(619.4, abs=0.1)


def test_usa_el_cap_si_no_hay_dap():
    r = calcular(dap_cm=None, cap_cm=126, altura_m=12, copa_m=8, densidad=0.6)
    assert r.dap_cm == 40.11
    assert r.biomasa_kg > 600


@pytest.mark.parametrize("dap", [None, 4.99])
def test_sin_dap_o_dap_pequeno_no_calcula_biomasa(dap):
    r = calcular(dap_cm=dap, cap_cm=None, altura_m=1.1, copa_m=1, densidad=0.6)
    assert r.area_copa_m2 == 0.79
    assert (r.biomasa_kg, r.carbono_kg, r.co2_kg, r.o2_kg, r.densidad_usada) == (None,) * 5
    assert r.densidad_estimada is False


def test_la_biomasa_crece_con_el_dap_y_la_altura():
    pequeno = calcular(dap_cm=20, cap_cm=None, altura_m=8, copa_m=4, densidad=0.6)
    grande = calcular(dap_cm=40, cap_cm=None, altura_m=16, copa_m=8, densidad=0.6)
    assert grande.biomasa_kg > pequeno.biomasa_kg * 6
