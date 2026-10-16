import { describe, expect, it } from '@jest/globals';
import { AxiosError, AxiosHeaders } from 'axios';

import { presupuestoFormSchema } from '@/features/budgets/api';
import { arbolCreatePayloadSchema } from '@/features/trees/schemas';
import { metaFormSchema } from '@/features/goals/api';
import { gestiona, type MiPerfil } from '@/features/perfil/schemas';
import { metodoCamposSchema } from '@/features/settings/api';
import { ApiContractError, getApiErrorMessage } from '@/services/api/client';

function errorHttp(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fallo', 'ERR_BAD_REQUEST', config, null, { status, statusText: '', headers: {}, config, data });
}

describe('mensajes de error de la API', () => {
  it('usa el detalle del backend cuando es texto', () => {
    expect(getApiErrorMessage(errorHttp(409, { detail: 'La inspección ya fue revisada' }))).toBe('La inspección ya fue revisada');
  });

  it('convierte la lista de errores de validación de FastAPI en texto legible, también en los módulos', () => {
    const error = errorHttp(422, {
      detail: [{ loc: ['body', 'monto_asignado'], msg: 'Input should be greater than or equal to 0' }, { loc: ['body'], msg: 'Value error, Falta x' }],
    });
    expect(getApiErrorMessage(error)).toBe('El servidor rechazó estos datos: monto asignado, Falta x. Revísalos e intenta de nuevo.');
  });

  it('tiene mensajes para errores sin detalle y fallas de conexión', () => {
    expect(getApiErrorMessage(errorHttp(403, {}))).toBe('No tienes permiso para esta acción.');
    expect(getApiErrorMessage(errorHttp(500, {}))).toContain('El servidor tuvo un problema');
    expect(getApiErrorMessage(new AxiosError('sin red'))).toContain('No fue posible conectar');
    expect(getApiErrorMessage(new ApiContractError('Formato raro'))).toBe('Formato raro');
  });
});

describe('permisos en la interfaz (igual que el backend)', () => {
  const perfil = (rol: MiPerfil['rol'], institucion: string | null): MiPerfil => ({
    usuario_id: 'u', nombre: 'N', correo: null, rol, institucion_id: institucion, curso_id: null, activo: true,
    institucion_nombre: null, curso_nombre: null,
  });

  it('el administrador gestiona cualquier institución y el docente solo la suya', () => {
    expect(gestiona(perfil('administrador', null), 'la')).toBe(true);
    expect(gestiona(perfil('docente', 'sj'), 'sj')).toBe(true);
    expect(gestiona(perfil('docente', 'sj'), 'la')).toBe(false);
    expect(gestiona(perfil('estudiante', 'sj'), 'sj')).toBe(false);
    expect(gestiona(undefined, 'sj')).toBe(false);
  });
});

describe('formularios de configuración, presupuestos y metas', () => {
  const metodo = {
    nombre: 'Nueva versión', descripcion: '', peso_follaje: 1, peso_tronco: 1, peso_raiz: 2, peso_plagas: 3, peso_interferencia: 0,
    pesos_observacion: {}, umbral_riesgo: 1, umbral_critico: 4, densidad_madera_defecto: 0.6, factor_raiz: 0.24, fraccion_carbono: 0.47,
  };

  it('el umbral crítico debe superar al de riesgo y los pesos van de 0 a 100', () => {
    expect(metodoCamposSchema.safeParse(metodo).success).toBe(true);
    expect(metodoCamposSchema.safeParse({ ...metodo, umbral_critico: 1 }).success).toBe(false);
    expect(metodoCamposSchema.safeParse({ ...metodo, peso_plagas: 101 }).success).toBe(false);
    expect(metodoCamposSchema.safeParse({ ...metodo, pesos_observacion: { p_termitas: Number.NaN } }).success).toBe(false);
    expect(metodoCamposSchema.safeParse({ ...metodo, fraccion_carbono: 0.9 }).success).toBe(false);
  });

  it('un presupuesto necesita un periodo coherente y un monto no negativo', () => {
    const p = { nombre: 'Presupuesto 2026', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', monto_asignado: 1000, notas: '' };
    expect(presupuestoFormSchema.safeParse(p).success).toBe(true);
    expect(presupuestoFormSchema.safeParse({ ...p, fecha_fin: '2025-12-31' }).success).toBe(false);
    expect(presupuestoFormSchema.safeParse({ ...p, monto_asignado: -5 }).success).toBe(false);
    expect(presupuestoFormSchema.safeParse({ ...p, monto_asignado: 100_000_000_001 }).success).toBe(false);
  });

  it('una meta en porcentaje no puede superar 100', () => {
    const m = { indicador: 'arboles_sanos_pct', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31', valor_meta: 80, descripcion: '' };
    expect(metaFormSchema.safeParse(m).success).toBe(true);
    expect(metaFormSchema.safeParse({ ...m, valor_meta: 120 }).success).toBe(false);
    expect(metaFormSchema.safeParse({ ...m, indicador: 'arboles_registrados', valor_meta: 120 }).success).toBe(true);
    expect(metaFormSchema.safeParse({ ...m, indicador: 'arboles_registrados', valor_meta: 2e12 }).success).toBe(false);
  });
});

describe('registro con su primera inspección', () => {
  const arbol = {
    institucion_id: 'sj', zona: 'Patio central', lat: 10.4631, lng: -73.2532, especie_id: 1, dap_cm: 34.5, altura_m: 8,
    copa_m: 4.2, etapa: 'Adulto', interferencia: 'Ninguna', observaciones: [],
  };

  it('envía la precisión del GPS y las notas sin espacios sobrantes; las notas vacías no se envían', () => {
    const conNotas = arbolCreatePayloadSchema.safeParse({ ...arbol, precision_gps_m: 6.5, notas: '  Raíz expuesta  ' });
    expect(conNotas.success).toBe(true);
    expect(conNotas.data?.notas).toBe('Raíz expuesta');
    expect(arbolCreatePayloadSchema.safeParse({ ...arbol, precision_gps_m: null, notas: '   ' }).data?.notas).toBeUndefined();
    expect(arbolCreatePayloadSchema.safeParse({ ...arbol, notas: 'x'.repeat(1001) }).success).toBe(false);
    expect(arbolCreatePayloadSchema.safeParse({ ...arbol, precision_gps_m: -1 }).success).toBe(false);
  });
});
