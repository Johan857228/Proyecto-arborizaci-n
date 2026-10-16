import { describe, expect, it } from '@jest/globals';
import { findOption, parseDecimal, sanitizeDecimal } from '@/shared/utils/forms';

describe('findOption', () => {
  const especies = [
    { label: 'Mango', value: 7 },
    { label: 'Ceiba', value: 12 },
  ];

  it('encuentra opciones numéricas aunque el select de web entregue texto', () => {
    expect(findOption(especies, '7')?.label).toBe('Mango');
    expect(findOption(especies, 12)?.label).toBe('Ceiba');
  });

  it('no devuelve nada para el valor vacío de "Seleccionar"', () => {
    expect(findOption(especies, '')).toBeUndefined();
  });
});

describe('sanitizeDecimal', () => {
  it('quita letras y deja un solo separador decimal', () => {
    expect(sanitizeDecimal('12abc')).toBe('12');
    expect(sanitizeDecimal('NaN')).toBe('');
    expect(sanitizeDecimal('8,5')).toBe('8.5');
    expect(sanitizeDecimal('1.2.3')).toBe('1.23');
  });
});

describe('parseDecimal', () => {
  it('convierte el texto saneado y deja vacío en lugar de cero', () => {
    expect(parseDecimal('35.5')).toBe(35.5);
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('.')).toBeUndefined();
    expect(parseDecimal('12.')).toBe(12);
  });
});
