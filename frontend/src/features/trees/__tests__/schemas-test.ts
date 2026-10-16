import { describe, expect, it } from '@jest/globals';
import { arbolCreateSchema } from '@/features/trees/schemas';

const validTree = {
  institucion_id: 'inst-1',
  zona: 'Patio central',
  lat: 10.4631,
  lng: -73.2532,
  gps_confirmado: true,
  especie_id: 1,
  dap_cm: 34.5,
  altura_m: 8,
  copa_m: 4.2,
  etapa: 'Adulto',
  interferencia: 'Ninguna',
  observaciones: [],
};

describe('arbolCreateSchema', () => {
  it('acepta datos con institución, especie y coordenadas capturadas', () => {
    expect(arbolCreateSchema.safeParse(validTree).success).toBe(true);
  });

  it('rechaza una ubicación no capturada y medidas fuera de rango', () => {
    expect(arbolCreateSchema.safeParse({ ...validTree, gps_confirmado: false }).success).toBe(false);
    expect(arbolCreateSchema.safeParse({ ...validTree, altura_m: 26 }).success).toBe(false);
  });

  it('exige descripción cuando se selecciona una opción Otra', () => {
    expect(arbolCreateSchema.safeParse({ ...validTree, zona: 'Otra' }).success).toBe(false);
    expect(arbolCreateSchema.safeParse({ ...validTree, zona: 'Otra', zona_otra: 'Cancha norte' }).success).toBe(true);
  });

  it('rechaza una ubicación GPS fuera de Colombia', () => {
    const resultado = arbolCreateSchema.safeParse({ ...validTree, lat: 40.4168, lng: -3.7038 });
    expect(resultado.error?.issues.find((issue) => issue.path[0] === 'gps_confirmado')?.message)
      .toBe('La ubicación capturada está fuera de Colombia. Vuelve a capturarla en el campus.');
  });

  it('exige al menos 3 caracteres y máximo 120 en los textos de "Otra"', () => {
    const corto = arbolCreateSchema.safeParse({ ...validTree, zona: 'Otra', zona_otra: 'ab' });
    expect(corto.error?.issues.find((issue) => issue.path[0] === 'zona_otra')?.message).toBe('Escribe al menos 3 caracteres.');
    const largo = arbolCreateSchema.safeParse({ ...validTree, zona: 'Otra', zona_otra: 'x'.repeat(121) });
    expect(largo.error?.issues.find((issue) => issue.path[0] === 'zona_otra')?.message).toBe('Máximo 120 caracteres.');
  });

  it('limita el tronco a 500 cm (5 m), la altura a 25 m y la copa a 40 m', () => {
    expect(arbolCreateSchema.safeParse({ ...validTree, dap_cm: 500 }).success).toBe(true);
    const tronco = arbolCreateSchema.safeParse({ ...validTree, dap_cm: 501 });
    expect(tronco.error?.issues.find((issue) => issue.path[0] === 'dap_cm')?.message).toBe('Máximo 500 cm (5 m).');
    expect(arbolCreateSchema.safeParse({ ...validTree, altura_m: 25 }).success).toBe(true);
    expect(arbolCreateSchema.safeParse({ ...validTree, altura_m: 25.1 }).success).toBe(false);
    expect(arbolCreateSchema.safeParse({ ...validTree, copa_m: 40 }).success).toBe(true);
    const copa = arbolCreateSchema.safeParse({ ...validTree, copa_m: 40.5 });
    expect(copa.error?.issues.find((issue) => issue.path[0] === 'copa_m')?.message).toBe('Máximo 40 m.');
  });

  it('muestra en español qué medida falta o no es un número', () => {
    const vacia = arbolCreateSchema.safeParse({ ...validTree, altura_m: undefined });
    expect(vacia.error?.issues.find((issue) => issue.path[0] === 'altura_m')?.message).toBe('Ingresa la altura.');
    const invalida = arbolCreateSchema.safeParse({ ...validTree, dap_cm: Number('abc') });
    expect(invalida.error?.issues.find((issue) => issue.path[0] === 'dap_cm')?.message).toBe('Escribe un número válido.');
  });
});