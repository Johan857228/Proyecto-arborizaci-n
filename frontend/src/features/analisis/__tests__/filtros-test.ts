import { describe, expect, it } from '@jest/globals';

import { analisisSchema, type Analisis, type ArbolAnalisis } from '@/features/analisis/schemas';
import {
  agrupar,
  desdeDelPeriodo,
  filtrarArboles,
  filtrarInspecciones,
  filtrarIntervenciones,
  indicadores,
  novedades,
  porMes,
  restarDias,
} from '@/features/analisis/filtros';

function arbol(id: string, cambios: Partial<ArbolAnalisis> = {}): ArbolAnalisis {
  return {
    id, sede_id: 'sj', sede: 'San José', codigo: `IE001-${id}`, zona: 'Patio', especie: 'Mango', nombre_cientifico: 'Mangifera indica',
    origen: 'Exótica', etapa: 'Adulto', interferencia: 'Ninguna', estado: 'Sano', puntaje: 1, dap: 30, altura: 8, copa: 5,
    clase_dap: '30 a 45 cm', clase_dap_orden: 4, area_copa: 19.6, biomasa_kg: 300, carbono_kg: 150, co2_kg: 550, lat: 10.4, lng: -73.2,
    n_inspecciones: 1, ultima_inspeccion: '2026-11-01', dias_desde: 24, revisita_pendiente: false, prioritario: false, registrado: '2026-01-10',
    ...cambios,
  };
}

const ARBOLES = [
  arbol('1'),
  arbol('2', { estado: 'Crítico', zona: 'Entrada', prioritario: true, especie: 'Ceiba', origen: 'Nativa' }),
  arbol('3', { estado: 'En riesgo', zona: 'Entrada', especie: 'Ceiba', origen: 'Nativa', co2_kg: null }),
];

const insp = (arbol_id: string, fecha: string, revision = 'Confirmada', curso = '10-A') => ({
  arbol_id, fecha, tipo: 'Seguimiento', calificacion: 'Sano', puntaje: 1, revision, curso, hallazgos: 0, horas_revision: 2,
});

const INSPECCIONES = [
  insp('1', '2026-11-20'),
  insp('2', '2026-10-05', 'Pendiente'),
  insp('2', '2026-02-01', 'Anulada', '9-B'),
  insp('3', '2025-06-01'),
];

describe('filtros cruzados', () => {
  it('filtra árboles por varias dimensiones y deja fuera la suya al graficarla', () => {
    expect(filtrarArboles(ARBOLES, { zona: 'Entrada' }).map((a) => a.id)).toEqual(['2', '3']);
    expect(filtrarArboles(ARBOLES, { zona: 'Entrada', estado: 'Crítico' }).map((a) => a.id)).toEqual(['2']);
    // El gráfico de estados ignora el filtro de estado para seguir mostrando todas las porciones.
    expect(filtrarArboles(ARBOLES, { zona: 'Entrada', estado: 'Crítico' }, 'estado').map((a) => a.id)).toEqual(['2', '3']);
    expect(filtrarArboles(ARBOLES, { zona: 'Sin zona' })).toEqual([]);
  });

  it('las inspecciones siguen a los árboles, al periodo, al mes y al curso', () => {
    const ids = new Set(['1', '2', '3']);
    const desde = desdeDelPeriodo('2026-11-25', '90');
    expect(desde).toBe('2026-08-27');
    expect(filtrarInspecciones(INSPECCIONES, ids, {}, desde).map((i) => i.fecha)).toEqual(['2026-11-20', '2026-10-05']);
    expect(filtrarInspecciones(INSPECCIONES, ids, {}, undefined)).toHaveLength(4);
    // Un mes elegido manda sobre el periodo.
    expect(filtrarInspecciones(INSPECCIONES, ids, { mes: '2026-02' }, desde).map((i) => i.fecha)).toEqual(['2026-02-01']);
    expect(filtrarInspecciones(INSPECCIONES, ids, { curso: '9-B' }, undefined)).toHaveLength(1);
    expect(filtrarInspecciones(INSPECCIONES, new Set(['1']), {}, undefined)).toHaveLength(1);
  });

  it('las intervenciones programadas cuentan aunque su fecha sea vieja', () => {
    const v = (estado: string, fecha: string) => ({
      arbol_id: '1', tipo: 'Poda', estado, fecha, fecha_programada: fecha, fecha_ejecucion: null,
      costo_estimado: 100, costo_real: estado === 'Ejecutada' ? 90 : null, resultado: null, vencida: estado === 'Programada',
    });
    const lista = [v('Programada', '2025-01-01'), v('Ejecutada', '2025-01-01'), v('Ejecutada', '2026-11-01')];
    expect(filtrarIntervenciones(lista, new Set(['1']), {}, '2026-01-01')).toHaveLength(2);
    expect(filtrarIntervenciones(lista, new Set(['1']), { tipo: 'Riego' }, undefined)).toHaveLength(0);
  });
});

describe('agregados', () => {
  it('agrupa de mayor a menor y junta el resto en Otras', () => {
    expect(agrupar(ARBOLES, (a) => a.especie)).toEqual([
      { clave: 'Ceiba', etiqueta: 'Ceiba', valor: 2 },
      { clave: 'Mango', etiqueta: 'Mango', valor: 1 },
    ]);
    const muchas = Array.from({ length: 12 }, (_, i) => arbol(String(i), { especie: `E${String(i).padStart(2, '0')}` }));
    const top = agrupar(muchas, (a) => a.especie, { maximo: 5 });
    expect(top).toHaveLength(5);
    expect(top[4]).toEqual({ clave: '__otras__', etiqueta: 'Otras', valor: 8 });
  });

  it('meses con confirmadas y pendientes, sin las anuladas', () => {
    const meses = porMes(INSPECCIONES, '2026-11-25');
    expect(meses).toHaveLength(12);
    expect(meses[0].clave).toBe('2025-12');
    expect(meses[11]).toMatchObject({ clave: '2026-11', etiqueta: 'nov 26', confirmadas: 1, pendientes: 0 });
    expect(meses.find((m) => m.clave === '2026-10')).toMatchObject({ confirmadas: 0, pendientes: 1 });
    expect(meses.find((m) => m.clave === '2026-02')).toMatchObject({ confirmadas: 0, pendientes: 0 });
  });

  it('indicadores del tablero', () => {
    const k = indicadores(ARBOLES, INSPECCIONES, []);
    expect(k).toMatchObject({ total: 3, sanos: 1, riesgo: 1, criticos: 1, prioritarios: 1, especies: 2, inspecciones: 4, confirmadas: 2, pendientes: 1, anuladas: 1 });
    expect(k.pctRiesgo).toBeCloseTo(66.67, 1);
    expect(k.pctNativas).toBeCloseTo(66.67, 1);
    expect(k.co2T).toBeCloseTo(1.1);
    expect(k.pctRevisadas).toBe(75);
    expect(k.cobertura).toBe(100);
  });

  it('resta días cruzando meses y años', () => {
    expect(restarDias('2026-03-01', 1)).toBe('2026-02-28');
    expect(restarDias('2026-01-05', 10)).toBe('2025-12-26');
  });
});

describe('en vivo', () => {
  const base = (cambios: Partial<Analisis> = {}): Analisis => analisisSchema.parse({
    generado_en: '2026-11-25T10:00:00-05:00', alcance: 'IE San José', institucion_id: 'sj', sedes: [{ id: 'sj', nombre: 'San José' }],
    arboles: ARBOLES, inspecciones: INSPECCIONES, intervenciones: [], hallazgos: [], ...cambios,
  });

  it('avisa lo que llegó desde la carga anterior', () => {
    const antes = base();
    const ahora = base({ inspecciones: [...INSPECCIONES, insp('1', '2026-11-25', 'Pendiente')], arboles: [...ARBOLES, arbol('4')] });
    expect(novedades(antes, ahora)).toEqual(['1 árbol nuevo', '1 inspección nueva']);
    expect(novedades(undefined, ahora)).toEqual([]);
    expect(novedades(ahora, ahora)).toEqual([]);
  });
});
