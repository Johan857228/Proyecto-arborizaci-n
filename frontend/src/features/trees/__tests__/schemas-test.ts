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
});