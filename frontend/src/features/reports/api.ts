import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { getValidado } from '@/services/api/client';

const conteo = z.array(z.object({ nombre: z.string(), total: z.number().int() }));
const pct = z.number().nullable();
const estado = z.enum(['sano', 'riesgo', 'critico']);

export const reporteSchema = z.object({
  institucion_id: z.string().nullable(),
  periodo: z.object({ desde: z.string(), hasta: z.string(), corte: z.string() }),
  inventario: z.object({
    total_arboles: z.number().int(),
    registrados_periodo: z.number().int(),
    por_especie: conteo,
    por_zona: conteo,
    por_etapa: conteo,
    area_copa_total_m2: z.number(),
    totales_ambientales: z.object({ biomasa_total_kg: z.number(), carbono_kg: z.number(), co2_kg: z.number(), o2_kg: z.number() }),
  }),
  riesgo: z.object({
    por_estado: z.object({ sano: z.number().int(), riesgo: z.number().int(), critico: z.number().int() }),
    pct_riesgo_o_critico: pct,
    puntaje_promedio: z.number().nullable(),
    hallazgos_frecuentes: z.array(z.object({ codigo: z.string(), etiqueta: z.string(), grupo: z.string().nullable(), total: z.number().int() })),
    arboles_por_grupo: z.array(z.object({ grupo: z.string(), total: z.number().int() })),
    por_interferencia: conteo,
    arboles_prioritarios: z.array(z.object({
      id: z.string(),
      codigo: z.string(),
      nombre_comun: z.string(),
      zona: z.string(),
      estado,
      puntaje_riesgo: z.number().nullable(),
      interferencia: z.string().nullable(),
    })),
    total_prioritarios: z.number().int(),
  }),
  cobertura: z.object({
    arboles_inspeccionados_periodo: z.number().int(),
    cobertura_pct: pct,
    dias_revisita: z.number().int(),
    sin_inspeccion_reciente: z.number().int(),
    revision: z.object({
      confirmadas: z.number().int(),
      anuladas: z.number().int(),
      pendientes: z.number().int(),
      pct_revisadas: pct,
      pct_confirmadas_de_revisadas: pct,
    }),
  }),
  productividad: z.object({
    inspecciones_periodo: z.number().int(),
    confirmadas: z.number().int(),
    anuladas: z.number().int(),
    pendientes: z.number().int(),
    registros_nuevos: z.number().int(),
    por_mes: z.array(z.object({ mes: z.string(), total: z.number().int() })),
    por_inspector: z.array(z.object({
      usuario_id: z.string().nullable(),
      nombre: z.string(),
      total: z.number().int(),
      confirmadas: z.number().int(),
      anuladas: z.number().int(),
    })),
    por_curso: z.array(z.object({ curso_id: z.string().nullable(), nombre: z.string(), total: z.number().int() })),
    horas_promedio_revision: z.number().nullable(),
  }),
  intervenciones: z.object({
    ejecutadas_periodo: z.number().int(),
    costo_ejecutado_periodo: z.number(),
    arboles_intervenidos: z.number().int(),
    programadas: z.number().int(),
    programadas_vencidas: z.number().int(),
    costo_programado: z.number(),
    por_tipo: z.array(z.object({ tipo_codigo: z.string(), total: z.number().int(), costo: z.number() })),
    por_resultado: z.object({ exitosa: z.number().int(), parcial: z.number().int(), sin_efecto: z.number().int() }),
    eficacia_pct: pct,
  }),
});
export type Reporte = z.infer<typeof reporteSchema>;

export function useReporte(filtro: { institucionId?: string; desde?: string; hasta?: string }, enabled = true) {
  return useQuery({
    queryKey: ['reportes', filtro],
    enabled,
    queryFn: () =>
      getValidado('/reportes/indicadores', reporteSchema, {
        institucion_id: filtro.institucionId,
        desde: filtro.desde,
        hasta: filtro.hasta,
      }),
  });
}
