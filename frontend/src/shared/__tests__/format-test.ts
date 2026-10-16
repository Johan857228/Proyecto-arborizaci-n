import { describe, expect, it } from '@jest/globals';

import { formatFecha, formatFechaHora, formatMes, formatNumero, formatPesos, formatPorcentaje, parsearNumero } from '@/shared/format';
import { fechaIso } from '@/shared/validacion';

describe('formatos', () => {
  it('separa miles con punto y decimales con coma, sin ceros de sobra', () => {
    expect(formatNumero(1234567.891)).toBe('1.234.567,89');
    expect(formatNumero(1000)).toBe('1.000');
    expect(formatNumero(8.5)).toBe('8,5');
    expect(formatNumero(-12.345, 1)).toBe('-12,3');
    expect(formatNumero(null)).toBe('—');
    expect(formatNumero(Number.NaN)).toBe('—');
  });

  it('muestra pesos sin decimales', () => {
    expect(formatPesos(1250000)).toBe('$ 1.250.000');
    expect(formatPesos(-95000.6)).toBe('-$ 95.001');
    expect(formatPorcentaje(66.67)).toBe('66,7 %');
  });

  it('muestra fechas en hora de Colombia', () => {
    expect(formatFecha('2026-03-05')).toBe('5 mar 2026');
    // 02:30 UTC del 16 de octubre todavía es 15 de octubre en Colombia
    expect(formatFecha('2026-10-16T02:30:00+00:00')).toBe('15 oct 2026');
    expect(formatFechaHora('2026-10-16T15:04:00Z')).toBe('16 oct 2026, 10:04');
    expect(formatMes('2026-12')).toBe('dic 2026');
    expect(formatFecha(null)).toBe('—');
  });
});

describe('parsearNumero', () => {
  it('acepta coma o punto decimal y conserva lo vacío como undefined', () => {
    expect(parsearNumero('8,5')).toBe(8.5);
    expect(parsearNumero(' 12.25 ')).toBe(12.25);
    expect(parsearNumero('')).toBeUndefined();
    expect(parsearNumero('  ')).toBeUndefined();
  });

  it('devuelve NaN para texto que no es un número (la validación muestra el error)', () => {
    expect(parsearNumero('abc')).toBeNaN();
    expect(parsearNumero('1.2.3')).toBeNaN();
    expect(parsearNumero('.')).toBeNaN();
  });
});

describe('fechaIso', () => {
  it('acepta fechas reales en formato AAAA-MM-DD', () => {
    expect(fechaIso.safeParse('2026-02-28').success).toBe(true);
    expect(fechaIso.safeParse('2028-02-29').success).toBe(true);
  });

  it('rechaza formatos ambiguos y días que no existen', () => {
    expect(fechaIso.safeParse('2026-02-30').success).toBe(false);
    expect(fechaIso.safeParse('15/10/2026').success).toBe(false);
    expect(fechaIso.safeParse('2026-1-5').success).toBe(false);
  });
});
