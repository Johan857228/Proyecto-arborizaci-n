import { describe, expect, it } from '@jest/globals';

import { accionFormSchema, crearEvaluacionFormSchema, crearEvidenciaFormSchema, nulo, nuevoPraeSchema } from '@/features/prae/schemas';

// Mismas reglas que los modelos de backend/routers/prae.py.
describe('PRAE: formularios', () => {
  it('crear el PRAE pide tema, título y problema (y cuál si el tema es otro)', () => {
    const valido = { tema: 'residuos', tema_otro: '', titulo: 'Colegio sin plástico', problema: 'Mucho plástico en el patio' };
    expect(nuevoPraeSchema.safeParse(valido).success).toBe(true);
    expect(nuevoPraeSchema.safeParse({ ...valido, tema: 'otro' }).success).toBe(false);
    expect(nuevoPraeSchema.safeParse({ ...valido, tema: 'otro', tema_otro: 'Huerta' }).success).toBe(true);
    expect(nuevoPraeSchema.safeParse({ ...valido, titulo: 'Eco' }).success).toBe(false);
    expect(nuevoPraeSchema.safeParse({ ...valido, tema: undefined }).success).toBe(false);
  });

  it('una acción no puede terminar antes de empezar', () => {
    const base = { titulo: 'Puntos de reciclaje', responsable: '', fecha_inicio: '2026-03-01', fecha_fin: '2026-05-30', indicador: '', meta: '' };
    expect(accionFormSchema.safeParse(base).success).toBe(true);
    expect(accionFormSchema.safeParse({ ...base, fecha_fin: '2026-02-01' }).success).toBe(false);
    expect(accionFormSchema.safeParse({ ...base, fecha_inicio: '', fecha_fin: '' }).success).toBe(true);
    expect(accionFormSchema.safeParse({ ...base, fecha_inicio: '01/03/2026' }).success).toBe(false);
  });

  it('los enlaces de evidencia son https y nada es de fecha futura', () => {
    const schema = crearEvidenciaFormSchema('2026-10-18');
    const base = { tipo: 'enlace', titulo: 'Video', descripcion: '', url: 'https://video.co/1', fecha: '2026-10-01' };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, url: 'http://video.co/1' }).success).toBe(false);
    expect(schema.safeParse({ ...base, tipo: 'nota', url: '' }).success).toBe(true);
    expect(schema.safeParse({ ...base, fecha: '2026-10-19' }).success).toBe(false);
  });

  it('una evaluación necesita instancia y al menos logros, dificultades o recomendaciones', () => {
    const schema = crearEvaluacionFormSchema('2026-10-18');
    const base = { instancia: 'consejo_directivo', fecha: '2026-10-10', acta: '015', cumplimiento_pct: 70, logros: 'Se instalaron puntos', dificultades: '', recomendaciones: '', participantes: '' };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, logros: '' }).success).toBe(false);
    expect(schema.safeParse({ ...base, instancia: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...base, cumplimiento_pct: 120 }).success).toBe(false);
  });

  it('los textos vacíos se envían como null', () => {
    expect([nulo('  '), nulo(' acta 3 ')]).toEqual([null, 'acta 3']);
  });
});
