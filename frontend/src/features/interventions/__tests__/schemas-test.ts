import { describe, expect, it } from '@jest/globals';

import { ejecutarSchema, intervencionFormSchema } from '@/features/interventions/schemas';

const base = {
  tipo_codigo: 'poda_sanitaria',
  responsable: 'Brigada ambiental',
  descripcion: '',
  fecha_programada: '',
  fecha_ejecucion: '',
  costo_estimado: undefined,
  costo_real: undefined,
  resultado: undefined,
  resultado_detalle: '',
};

describe('formulario de intervención', () => {
  it('una programada necesita fecha válida; el costo estimado es opcional', () => {
    expect(intervencionFormSchema.safeParse({ ...base, estado: 'programada' }).success).toBe(false);
    expect(intervencionFormSchema.safeParse({ ...base, estado: 'programada', fecha_programada: '2026-13-01' }).success).toBe(false);
    expect(intervencionFormSchema.safeParse({ ...base, estado: 'programada', fecha_programada: '2026-12-01' }).success).toBe(true);
  });

  it('una ejecutada necesita fecha, costo real y resultado', () => {
    const ejecutada = { ...base, estado: 'ejecutada', fecha_ejecucion: '2026-10-10', costo_real: 95000, resultado: 'exitosa' };
    expect(intervencionFormSchema.safeParse(ejecutada).success).toBe(true);
    const sinCosto = intervencionFormSchema.safeParse({ ...ejecutada, costo_real: undefined });
    expect(sinCosto.success).toBe(false);
    expect(sinCosto.error?.issues.map((i) => i.path.join('.'))).toContain('costo_real');
    expect(intervencionFormSchema.safeParse({ ...ejecutada, resultado: undefined }).success).toBe(false);
    expect(intervencionFormSchema.safeParse({ ...ejecutada, costo_real: -1 }).success).toBe(false);
  });

  it('exige un responsable', () => {
    expect(intervencionFormSchema.safeParse({ ...base, estado: 'programada', fecha_programada: '2026-12-01', responsable: ' ' }).success).toBe(false);
  });
});

describe('registrar ejecución', () => {
  it('valida los datos de una intervención realizada', () => {
    expect(ejecutarSchema.safeParse({ fecha_ejecucion: '2026-10-10', costo_real: 0, resultado: 'parcial', resultado_detalle: '' }).success).toBe(true);
    expect(ejecutarSchema.safeParse({ fecha_ejecucion: '2026-10-10', costo_real: Number.NaN, resultado: 'parcial' }).success).toBe(false);
    expect(ejecutarSchema.safeParse({ fecha_ejecucion: '2026-10-10', costo_real: 1, resultado: 'bien' }).success).toBe(false);
  });
});

describe('topes de costo de la API', () => {
  it('no deja enviar costos de más de mil millones de pesos', () => {
    expect(ejecutarSchema.safeParse({ fecha_ejecucion: '2026-10-01', costo_real: 1_000_000_000, resultado: 'exitosa' }).success).toBe(true);
    const caro = ejecutarSchema.safeParse({ fecha_ejecucion: '2026-10-01', costo_real: 200_000_200_000, resultado: 'exitosa' });
    expect(caro.error?.issues[0].message).toBe('Máximo $ 1.000.000.000.');
  });
});
