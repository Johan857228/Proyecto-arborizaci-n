import { describe, expect, it } from '@jest/globals';

import { codigoLegible, crearActividadFormSchema, horasTexto } from '@/features/servicio/schemas';

// Mismas reglas que ActividadIn en backend/routers/servicio_social.py.
describe('crearActividadFormSchema', () => {
  const schema = crearActividadFormSchema('2026-10-18');
  const valida = { tipo: 'siembra', fecha: '2026-10-10', horas: 1.5, descripcion: 'Sembramos dos guayacanes' };

  it('acepta una actividad válida', () => {
    expect(schema.safeParse(valida).success).toBe(true);
  });

  const invalidas: [Record<string, unknown>, string][] = [
    [{ fecha: '2026-10-19' }, 'futura'],
    [{ fecha: '2026-07-01' }, 'más de 90 días'],
    [{ fecha: '10/10/2026' }, 'formato'],
    [{ horas: 1.25 }, 'medias horas'],
    [{ horas: 8.5 }, 'más de 8 horas'],
    [{ horas: 0 }, 'cero'],
    [{ descripcion: 'corto' }, 'descripción corta'],
    [{ tipo: 'poda' }, 'tipo no permitido'],
  ];
  it.each(invalidas)('rechaza %o (%s)', (cambio) => {
    expect(schema.safeParse({ ...valida, ...cambio }).success).toBe(false);
  });
});

describe('formatos', () => {
  it('muestra horas y códigos como en el certificado', () => {
    expect([horasTexto(80), horasTexto(82.5), horasTexto(0.5)]).toEqual(['80', '82,5', '0,5']);
    expect(codigoLegible('ABCD2345XY')).toBe('ABCD-2345-XY');
  });
});
