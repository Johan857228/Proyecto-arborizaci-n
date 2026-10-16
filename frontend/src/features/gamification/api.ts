import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { getValidado } from '@/services/api/client';

export const progresoSchema = z.object({
  usuario_id: z.string(),
  nombre: z.string(),
  posicion_institucion: z.object({ posicion: z.number().int(), de: z.number().int() }).nullable(),
  puntos: z.number().int(),
  nivel: z.object({
    nombre: z.string(),
    minimo: z.number(),
    siguiente: z.string().nullable(),
    puntos_siguiente: z.number().nullable(),
    faltan: z.number(),
    progreso_pct: z.number(),
  }),
  racha: z.object({ actual: z.number().int(), mejor: z.number().int(), semanas_activas: z.number().int() }),
  logros: z.array(z.object({
    codigo: z.string(),
    nombre: z.string(),
    descripcion: z.string(),
    obtenido: z.boolean(),
    progreso: z.number(),
    meta: z.number(),
  })),
  resumen: z.object({
    inspecciones: z.number().int(),
    confirmadas: z.number().int(),
    pendientes: z.number().int(),
    anuladas: z.number().int(),
    arboles_registrados: z.number().int(),
  }),
});
export type Progreso = z.infer<typeof progresoSchema>;

const filaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  puntos: z.number().int(),
  posicion: z.number().int(),
  inspecciones_confirmadas: z.number().int(),
  nivel: z.string().optional(),
  curso_id: z.string().nullable().optional(),
  curso_nombre: z.string().nullable().optional(),
  integrantes: z.number().int().optional(),
  promedio_por_integrante: z.number().optional(),
});
export type FilaRanking = z.infer<typeof filaSchema>;

export const rankingSchema = z.object({
  tipo: z.enum(['individual', 'curso']),
  periodo: z.object({ desde: z.string().nullable(), hasta: z.string().nullable() }),
  total: z.number().int(),
  filas: z.array(filaSchema),
  mi_posicion: filaSchema.nullable(),
});
export type Ranking = z.infer<typeof rankingSchema>;

export interface FiltroRanking {
  tipo: 'individual' | 'curso';
  institucionId?: string;
  rol: 'estudiante' | 'docente' | 'todos';
  desde?: string;
  hasta?: string;
}

export const gamificacionService = {
  progreso: () => getValidado('/gamificacion/mi-progreso', progresoSchema),
  ranking: (f: FiltroRanking) =>
    getValidado('/gamificacion/ranking', rankingSchema, {
      tipo: f.tipo,
      institucion_id: f.institucionId,
      rol: f.rol,
      desde: f.desde,
      hasta: f.hasta,
      limite: 50,
    }),
};

export function useMiProgreso(enabled = true) {
  return useQuery({ queryKey: ['gamificacion', 'progreso'], queryFn: gamificacionService.progreso, enabled });
}

export function useRanking(filtro: FiltroRanking) {
  return useQuery({ queryKey: ['gamificacion', 'ranking', filtro], queryFn: () => gamificacionService.ranking(filtro) });
}
