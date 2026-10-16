import { z } from 'zod';

import { api, ApiContractError } from '@/services/api/client';
import type { Estadisticas } from '@/features/dashboard/types';
import { arbolesResumenSchema } from '@/features/trees/schemas';
import type { ArbolResumen } from '@/shared/types/entities';

const estadisticasSchema = z.object({
  total: z.number().int().nonnegative(),
  por_estado: z.record(z.string(), z.number().int().nonnegative()),
  por_institucion: z.array(z.object({
    prefijo: z.string(),
    nombre_corto: z.string(),
    total: z.number().int().nonnegative(),
  })),
  por_etapa: z.record(z.string(), z.number().int().nonnegative()),
  especies_frecuentes: z.array(z.object({
    nombre_comun: z.string(),
    total: z.number().int().nonnegative(),
  })),
  promedios: z.object({
    dap_cm: z.number().nullable(),
    altura_m: z.number().nullable(),
    copa_m: z.number().nullable(),
  }),
  totales_ambientales: z.object({
    biomasa_total_kg: z.number(),
    carbono_kg: z.number(),
    co2_kg: z.number(),
    o2_kg: z.number(),
  }),
});

export const dashboardService = {
  async getStats(): Promise<Estadisticas> {
    const { data } = await api.get<unknown>('/estadisticas');
    const result = estadisticasSchema.safeParse(data);
    if (!result.success) {
      throw new ApiContractError('El servidor devolvió estadísticas con un formato inválido.');
    }
    return result.data;
  },

  async getRecentTrees(): Promise<ArbolResumen[]> {
    const { data } = await api.get<unknown>('/arboles', {
      params: { limite: 5, desplazamiento: 0 },
    });
    const result = arbolesResumenSchema.safeParse(data);
    if (!result.success) {
      throw new ApiContractError('El servidor devolvió registros de árboles con un formato inválido.');
    }
    return result.data;
  },
};
