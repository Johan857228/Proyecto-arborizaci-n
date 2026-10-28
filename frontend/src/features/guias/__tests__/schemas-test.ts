import { describe, expect, it } from '@jest/globals';

import { claseFormSchema, guiaSchema, textoGrados } from '@/features/guias/schemas';

describe('guías de clase', () => {
  it('nombra los grados como en la ficha del backend', () => {
    expect(textoGrados([2])).toBe('Grado 2.°');
    expect(textoGrados([6, 7])).toBe('Grados 6.° y 7.°');
    expect(textoGrados([3, 4, 5])).toBe('Grados 3.°, 4.° y 5.°');
  });

  it('el registro de una clase: fecha no futura y de 1 a 80 asistentes', () => {
    const schema = claseFormSchema('2026-10-18');
    const base = { fecha: '2026-10-15', asistentes: 30, notas: '' };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, asistentes: undefined, curso_id: 'c1' }).success).toBe(true);
    expect(schema.safeParse({ ...base, fecha: '2026-10-19' }).success).toBe(false);
    expect(schema.safeParse({ ...base, fecha: '15/10/2026' }).success).toBe(false);
    expect(schema.safeParse({ ...base, asistentes: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base, asistentes: 81 }).success).toBe(false);
  });

  it('el esquema acepta una guía del backend', () => {
    const guia = {
      id: 'carbono', titulo: '¿Cuánto carbono guardan nuestros árboles?', area: 'ciencias', grados: [7],
      referente: 'DBA de Ciencias Naturales, grado 7.°, DBA 4', duracion_min: 55, datos: 'Muestra de árboles', laboratorio: null,
      aplicaciones: 2, proposito: 'p', materiales: ['Cinta'], momentos: [{ titulo: 'Exploración (10 min)', pasos: ['a'] }],
      preguntas: ['¿?'], evidencia: 'e', saber11: null, celular: 'c', seguridad: 's',
      clases: [{ id: 'k1', guia_id: 'carbono', guia_titulo: 't', institucion_id: 'sj', curso_id: null, curso_nombre: null,
        docente_nombre: 'Docente', fecha: '2026-10-15', asistentes: 30, notas: null, puede_borrar: true }],
    };
    expect(guiaSchema.safeParse(guia).success).toBe(true);
    expect(guiaSchema.safeParse({ ...guia, area: 'sociales' }).success).toBe(false);
  });
});
