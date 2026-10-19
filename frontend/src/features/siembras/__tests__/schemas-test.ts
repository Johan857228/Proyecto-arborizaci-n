import { describe, expect, it } from '@jest/globals';

import { controlFormSchema, jornadaDetalleSchema, jornadaFormSchema, plantaFormSchema, textoHito } from '@/features/siembras/schemas';

// Mismas reglas que SiembraIn y ControlIn en backend/routers/siembras.py.
describe('siembras: formularios', () => {
  const planta = {
    especie_id: 2, especie_otra: '', lat: 10.4641, lng: -73.2562, fecha: '2026-04-29', vivero: '', vivero_registro_ica: '',
    altura_inicial_cm: 40, padrino_tipo: 'curso', padrino_curso_id: 'c1', padrino_usuario_id: undefined, padrino_nombre: '',
  };
  const schema = plantaFormSchema('2026-10-18');

  it('una plántula necesita especie, coordenadas en Colombia y fecha no futura', () => {
    expect(schema.safeParse(planta).success).toBe(true);
    expect(schema.safeParse({ ...planta, especie_id: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...planta, especie_id: undefined, especie_otra: 'Caracolí' }).success).toBe(true);
    expect(schema.safeParse({ ...planta, lat: 40.4 }).success).toBe(false);
    expect(schema.safeParse({ ...planta, lng: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...planta, lat: Number.NaN }).success).toBe(false);
    expect(schema.safeParse({ ...planta, fecha: '2026-10-19' }).success).toBe(false);
  });

  it('cada tipo de padrino pide su dato', () => {
    expect(schema.safeParse({ ...planta, padrino_curso_id: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...planta, padrino_tipo: 'estudiante' }).success).toBe(false);
    expect(schema.safeParse({ ...planta, padrino_tipo: 'estudiante', padrino_usuario_id: 'u1' }).success).toBe(true);
    expect(schema.safeParse({ ...planta, padrino_tipo: 'empresa' }).success).toBe(false);
    expect(schema.safeParse({ ...planta, padrino_tipo: 'empresa', padrino_nombre: 'Ferretería El Roble' }).success).toBe(true);
  });

  it('un control: estado obligatorio, no futuro ni anterior a la siembra', () => {
    const control = controlFormSchema('2026-10-18', '2026-04-29');
    const base = { hito_meses: 6, fecha: '2026-10-17', estado: 'viva_buena', altura_cm: 60, mantenimiento: true, observaciones: '' };
    expect(control.safeParse(base).success).toBe(true);
    expect(control.safeParse({ ...base, hito_meses: undefined }).success).toBe(true); // control extra
    expect(control.safeParse({ ...base, hito_meses: 9 }).success).toBe(false);
    expect(control.safeParse({ ...base, estado: undefined }).success).toBe(false);
    expect(control.safeParse({ ...base, fecha: '2026-10-19' }).success).toBe(false);
    expect(control.safeParse({ ...base, fecha: '2026-04-28' }).success).toBe(false);
  });

  it('la jornada necesita nombre y fecha', () => {
    const jornada = { nombre: 'Día del Árbol', fecha: '2026-04-29', lugar: '', organizador: 'alcaldia', oficial: true, area_de_vida: '', patrocinador: '' };
    expect(jornadaFormSchema.safeParse(jornada).success).toBe(true);
    expect(jornadaFormSchema.safeParse({ ...jornada, nombre: 'Ya' }).success).toBe(false);
    expect(jornadaFormSchema.safeParse({ ...jornada, organizador: 'ministerio' }).success).toBe(false);
  });

  it('textos de los hitos y respuesta del backend', () => {
    expect([textoHito(3), textoHito(null)]).toEqual(['3 meses', 'Control extra']);
    const resumen = { sembradas: 1, nativas: 1, pct_nativas: 100, evaluadas: 0, vivas: 0, muertas: 0, supervivencia_pct: null,
      controles_pendientes: 0, controles_vencidos: 1, completaron_2_anios: 0,
      por_hito: [{ hito_meses: 3, debidas: 1, conocidas: 0, vivas: 0, pendientes: 1, supervivencia_pct: null }] };
    const detalle = {
      id: 'j1', institucion_id: 'sj', nombre: 'Día del Árbol 2026', fecha: '2026-04-29', lugar: null, organizador: 'alcaldia', oficial: true,
      area_de_vida: null, patrocinador: null, notas: null, resumen, asistentes: { total: 0, estudiantes: 0, con_autorizacion: 0 }, puede_editar: true,
      siembras: [{
        id: 's1', jornada_id: 'j1', institucion_id: 'sj', especie_id: 2, especie: 'Roble morado', nombre_cientifico: 'Tabebuia rosea', origen: 'nativa',
        lat: 10.46, lng: -73.25, precision_gps_m: 4, fecha: '2026-04-29', vivero: null, vivero_registro_ica: null, altura_inicial_cm: 40,
        padrino_tipo: 'curso', padrino: '10-A', reemplaza_id: null, notas: null, estado: 'sin_control', controles: [],
        siguiente: { hito_meses: 3, fecha: '2026-07-29', estado: 'vencido' },
      }],
    };
    expect(jornadaDetalleSchema.safeParse(detalle).success).toBe(true);
    expect(jornadaDetalleSchema.safeParse({ ...detalle, siembras: [{ ...detalle.siembras[0], estado: 'enferma' }] }).success).toBe(false);
  });
});
