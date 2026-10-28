import { describe, expect, it } from '@jest/globals';

import { modulosPara } from '@/features/modules/modulos';
import type { MiPerfil } from '@/features/perfil/schemas';
import { divipolasValidas, separarDivipolas, tableroSchema } from '@/features/territorial/schemas';

function perfil(rol: MiPerfil['rol']): MiPerfil {
  return {
    usuario_id: 'u1', nombre: 'Prueba', correo: null, rol, institucion_id: rol === 'territorial' ? null : 'sj', curso_id: null, activo: true,
    institucion_nombre: null, curso_nombre: null, foto_url: null, portada_url: null,
  } as MiPerfil;
}

describe('tablero territorial', () => {
  it('lee los municipios separados por comas, espacios o líneas', () => {
    expect(separarDivipolas('20001, 20011\n20001;20060')).toEqual(['20001', '20011', '20060']);
    expect(divipolasValidas(['20001', '20011'])).toBe(true);
    expect(divipolasValidas(['2001'])).toBe(false);
    expect(divipolasValidas([])).toBe(true);
  });

  it('el funcionario territorial solo ve su tablero; el docente no lo ve', () => {
    expect(modulosPara(perfil('territorial')).map((m) => m.clave)).toEqual(['territorial']);
    expect(modulosPara(perfil('administrador')).some((m) => m.clave === 'territorial')).toBe(true);
    expect(modulosPara(perfil('docente')).some((m) => m.clave === 'territorial')).toBe(false);
    expect(modulosPara(perfil('estudiante')).some((m) => m.clave === 'territorial')).toBe(false);
    expect(modulosPara(perfil('docente')).some((m) => m.clave === 'prae')).toBe(true);
  });

  it('acepta la respuesta del backend', () => {
    const tablero = {
      territorio_id: 't1', territorio: 'Secretaría de Educación de Valledupar', anio: 2026, generado_en: '2026-10-18T10:00:00-05:00',
      totales: { instituciones: 1, semaforo: { verde: 1, amarillo: 0, rojo: 0 }, arboles: 10, jornadas: 1, sembradas: 5, pct_nativas: 80,
        supervivencia_pct: null, clases: 2, estudiantes_en_clases: 60, inspectores: 4, asistentes_siembras: 9, estudiantes_servicio: 30, horas_servicio: 120.5 },
      instituciones: [{
        id: 'sj', nombre: 'IE San José', nombre_corto: 'San José', codigo_dane: null, municipio: 'Valledupar', divipola: '20001', semaforo: 'verde',
        prae: { id: 'p1', titulo: 'PRAE', tema: 'arbolado', tema_otro: null, estado: 'evaluado', evaluaciones_faltantes: [], pct_cumplidas: 50 },
        arboles: { total: 10, sano: 8, riesgo: 1, critico: 1 }, siembras: null, clases: { clases: 2, guias: 1, asistentes: 60 },
        servicio_social: null, inspectores: 4,
      }],
    };
    expect(tableroSchema.safeParse(tablero).success).toBe(true);
    expect(tableroSchema.safeParse({ ...tablero, instituciones: [{ ...tablero.instituciones[0], semaforo: 'azul' }] }).success).toBe(false);
  });
});
