import { describe, expect, it } from '@jest/globals';

import { chartColors } from '@/config/constants';
import { anilloDe, CAPAS_INICIALES, claseDe, COLOR_ALERTA, COLOR_SIEMBRA, especiesConColor, leyenda } from '@/features/mapa/capas';
import { mapaSchema, type ArbolMapa, type EspecieMapa } from '@/features/mapa/schemas';

function arbol(id: string, cambios: Partial<ArbolMapa> = {}): ArbolMapa {
  return {
    id, codigo: `IE001-${id}`, institucion_id: 'sj', lat: 10.46, lng: -73.25, especie_id: 1, nombre_comun: 'Mango',
    nombre_cientifico: 'Mangifera indica', origen: 'exotica', estado: 'sano', riesgo: null, alerta: null,
    etapa: 'Adulto', siembra: false, zona: 'Patio central', registrado_en: '2026-09-01', ...cambios,
  };
}

function especie(id: number, nombre: string, total: number): EspecieMapa {
  return { especie_id: id, nombre_comun: nombre, nombre_cientifico: null, origen: null, origen_sugerido: null, total };
}

describe('mapa: capas y leyenda', () => {
  const arboles = [
    arbol('1'),
    arbol('2', { estado: 'critico', riesgo: 'inminente', alerta: 'confirmada' }),
    arbol('3', { especie_id: 2, nombre_comun: 'Roble', origen: 'nativa', siembra: true, estado: null }),
    arbol('4', { especie_id: 6, nombre_comun: 'Ceiba', origen: null }),
  ];
  const especies = [especie(1, 'Mango', 2), especie(2, 'Roble', 1), especie(3, 'Nim', 0), especie(4, 'Caracolí', 0), especie(6, 'Ceiba', 1)];

  it('la leyenda cuenta por clase, en orden y sin clases vacías', () => {
    expect(leyenda(arboles, 'estado', especies).map((c) => [c.clave, c.total])).toEqual([['sano', 2], ['critico', 1], ['sin_dato', 1]]);
    expect(leyenda(arboles, 'riesgo', especies).map((c) => [c.etiqueta, c.total])).toEqual([['Inminente', 1], ['Sin tamizaje', 3]]);
    expect(leyenda(arboles, 'origen', especies).map((c) => [c.clave, c.total])).toEqual([['nativa', 1], ['exotica', 2], ['sin_dato', 1]]);
  });

  it('por especie: las 4 con más árboles tienen color propio y el resto va en "Otras"', () => {
    expect(especiesConColor(especies)).toEqual(['1', '2', '3', '4']);
    expect(claseDe(arboles[3], 'especie', especiesConColor(especies))).toBe('otras');
    const clases = leyenda(arboles, 'especie', especies);
    expect(clases.map((c) => [c.etiqueta, c.total, c.color])).toEqual([
      ['Mango', 2, chartColors.categorical[0]],
      ['Roble', 1, chartColors.categorical[1]],
      ['Otra especie', 1, chartColors.other],
    ]);
  });

  it('el anillo de alerta pesa más que el de siembra y se apaga con su capa', () => {
    const ambos = arbol('5', { alerta: 'por_confirmar', siembra: true });
    expect(anilloDe(ambos, CAPAS_INICIALES)).toBe(COLOR_ALERTA);
    expect(anilloDe(ambos, { ...CAPAS_INICIALES, alertas: false })).toBe(COLOR_SIEMBRA);
    expect(anilloDe(ambos, { ...CAPAS_INICIALES, alertas: false, siembras: false })).toBeNull();
    expect(anilloDe(arboles[0], CAPAS_INICIALES)).toBeNull();
  });

  it('el esquema acepta la respuesta del backend', () => {
    const respuesta = {
      generado_en: '2026-10-18T10:00:00-05:00', institucion_id: 'sj', arboles: [arbol('1')],
      sedes: [{ id: 'sj', nombre: 'IE San José', nombre_corto: 'San José', prefijo: 'IE001', lat: 10.46, lng: -73.25, arboles: 1, alertas: 0 }],
      especies: [especie(1, 'Mango', 1)],
      resumen: {
        total: 1, por_estado: { sano: 1, riesgo: 0, critico: 0 }, por_riesgo: { bajo: 0, sin_tamizaje: 1 },
        por_origen: { nativa: 0, exotica: 1, sin_dato: 0 }, pct_nativas: 0, siembras: 0, alertas: 0, especies: 1,
      },
      limites: { sur: 10.46, oeste: -73.25, norte: 10.46, este: -73.25 },
      origen_editable: false,
    };
    expect(mapaSchema.safeParse(respuesta).success).toBe(true);
    expect(mapaSchema.safeParse({ ...respuesta, arboles: [{ ...arbol('1'), riesgo: 'grave' }] }).success).toBe(false);
  });
});
