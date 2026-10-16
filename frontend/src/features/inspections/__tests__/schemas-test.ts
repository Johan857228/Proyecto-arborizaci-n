import { describe, expect, it } from '@jest/globals';

import type { Catalogos } from '@/features/catalogs/types';
import { anularSchema, crearInspeccionFormSchema, inspeccionPayloadSchema } from '@/features/inspections/schemas';

const catalogos: Catalogos = {
  especies: [{ id: 1, nombre_comun: 'Mango', nombre_cientifico: 'Mangifera indica' }],
  instituciones: [{ id: 'sj', nombre: 'IE San José', nombre_corto: 'San José', prefijo: 'IE001', lat: 10.46, lng: -73.25 }],
  observaciones: [
    { codigo: 'f_manchas', grupo: 'follaje', etiqueta: 'Manchas', orden: 1 },
    { codigo: 'p_termitas', grupo: 'plagas', etiqueta: 'Termitas', orden: 1 },
  ],
};

const valida = {
  gps_confirmado: false,
  lat: null,
  lng: null,
  precision_gps_m: null,
  dap_cm: 35.5,
  altura_m: 8.2,
  copa_m: 4.5,
  etapa: 'Adulto',
  interferencia: 'Ninguna',
  interferencia_otra: '',
  observaciones: ['f_manchas'],
  notas: '',
};

describe('formulario de inspección', () => {
  const schema = crearInspeccionFormSchema(catalogos);

  it('acepta una visita sin GPS y deja las notas vacías fuera', () => {
    const r = schema.safeParse(valida);
    expect(r.success).toBe(true);
    expect(r.success && r.data.notas).toBeUndefined();
  });

  it('rechaza medidas vacías, inválidas o fuera de rango con mensajes en español', () => {
    const vacia = schema.safeParse({ ...valida, dap_cm: undefined });
    expect(vacia.success).toBe(false);
    expect(vacia.error?.issues[0].message).toBe('Escribe un número válido.');
    expect(schema.safeParse({ ...valida, altura_m: Number.NaN }).success).toBe(false);
    expect(schema.safeParse({ ...valida, altura_m: 26 }).success).toBe(false);
    expect(schema.safeParse({ ...valida, copa_m: 0 }).success).toBe(false);
  });

  it('exige describir "Otra infraestructura" y solo acepta hallazgos del catálogo, sin repetir', () => {
    expect(schema.safeParse({ ...valida, interferencia: 'Otra infraestructura' }).success).toBe(false);
    expect(schema.safeParse({ ...valida, interferencia: 'Otra infraestructura', interferencia_otra: 'Sardinel' }).success).toBe(true);
    expect(schema.safeParse({ ...valida, observaciones: ['no_existe'] }).success).toBe(false);
    expect(schema.safeParse({ ...valida, observaciones: ['f_manchas', 'f_manchas'] }).success).toBe(false);
  });

  it('aplica los mismos límites que el registro: tronco 500 cm, copa 40 m y textos de 3 a 120 caracteres', () => {
    expect(schema.safeParse({ ...valida, dap_cm: 500, copa_m: 40 }).success).toBe(true);
    const tronco = schema.safeParse({ ...valida, dap_cm: 501 });
    expect(tronco.error?.issues.find((issue) => issue.path[0] === 'dap_cm')?.message).toBe('Máximo 500 cm (5 m).');
    const copa = schema.safeParse({ ...valida, copa_m: 40.5 });
    expect(copa.error?.issues.find((issue) => issue.path[0] === 'copa_m')?.message).toBe('Máximo 40 m.');
    const corto = schema.safeParse({ ...valida, interferencia: 'Otra infraestructura', interferencia_otra: ' ab ' });
    expect(corto.error?.issues.find((issue) => issue.path[0] === 'interferencia_otra')?.message).toBe('Escribe al menos 3 caracteres.');
    expect(schema.safeParse({ ...valida, interferencia: 'Otra infraestructura', interferencia_otra: 'x'.repeat(121) }).success).toBe(false);
  });

  it('rechaza un GPS capturado fuera de Colombia', () => {
    expect(schema.safeParse({ ...valida, gps_confirmado: true, lat: 10.4631, lng: -73.2532 }).success).toBe(true);
    const fuera = schema.safeParse({ ...valida, gps_confirmado: true, lat: 40.4168, lng: -3.7038 });
    expect(fuera.error?.issues.find((issue) => issue.path[0] === 'gps_confirmado')?.message)
      .toBe('La ubicación capturada está fuera de Colombia. Vuelve a capturarla junto al árbol.');
  });
});

describe('payload de inspección', () => {
  const payload = {
    lat: null, lng: null, precision_gps_m: null, dap_cm: 30, altura_m: 8, copa_m: 4, etapa: 'Adulto', interferencia: 'Ninguna',
    interferencia_otra: null, observaciones: [], notas: null,
  };

  it('no admite campos extra (por ejemplo, un código escrito a mano)', () => {
    expect(inspeccionPayloadSchema.safeParse(payload).success).toBe(true);
    expect(inspeccionPayloadSchema.safeParse({ ...payload, codigo: 'IE001-9999' }).success).toBe(false);
  });

  it('respeta los límites de la API: coordenadas en Colombia y medidas máximas', () => {
    expect(inspeccionPayloadSchema.safeParse({ ...payload, lat: 10.46, lng: -73.25 }).success).toBe(true);
    expect(inspeccionPayloadSchema.safeParse({ ...payload, lat: 20, lng: -73.25 }).success).toBe(false);
    expect(inspeccionPayloadSchema.safeParse({ ...payload, copa_m: 41 }).success).toBe(false);
    expect(inspeccionPayloadSchema.safeParse({ ...payload, dap_cm: 501 }).success).toBe(false);
  });
});

describe('anular', () => {
  it('pide un motivo de al menos 5 caracteres', () => {
    expect(anularSchema.safeParse({ motivo: '   no  ' }).success).toBe(false);
    expect(anularSchema.safeParse({ motivo: 'Medidas inconsistentes' }).success).toBe(true);
  });
});
