import { z } from 'zod';

/** Respuesta de GET /mapa (backend/routers/mapa.py). */
const origen = z.enum(['nativa', 'exotica']).nullable();
const riesgo = z.enum(['bajo', 'medio', 'alto', 'inminente']).nullable();

export const arbolMapaSchema = z.object({
  id: z.string(),
  codigo: z.string().nullable(),
  institucion_id: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  especie_id: z.number().nullable(),
  nombre_comun: z.string(),
  nombre_cientifico: z.string().nullable(),
  origen,
  estado: z.enum(['sano', 'riesgo', 'critico']).nullable(),
  riesgo,
  alerta: z.enum(['por_confirmar', 'confirmada']).nullable(),
  etapa: z.string().nullable(),
  siembra: z.boolean(),
  zona: z.string().nullable(),
  registrado_en: z.string(),
});
export type ArbolMapa = z.infer<typeof arbolMapaSchema>;

export const sedeMapaSchema = z.object({
  id: z.string(),
  nombre: z.string().nullable(),
  nombre_corto: z.string().nullable(),
  prefijo: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  arboles: z.number(),
  alertas: z.number(),
});
export type SedeMapa = z.infer<typeof sedeMapaSchema>;

export const especieMapaSchema = z.object({
  especie_id: z.number().nullable(),
  nombre_comun: z.string(),
  nombre_cientifico: z.string().nullable(),
  origen,
  origen_sugerido: origen,
  total: z.number(),
});
export type EspecieMapa = z.infer<typeof especieMapaSchema>;

export const limitesSchema = z.object({ sur: z.number(), oeste: z.number(), norte: z.number(), este: z.number() });

export const mapaSchema = z.object({
  generado_en: z.string(),
  institucion_id: z.string().nullable(),
  arboles: z.array(arbolMapaSchema),
  sedes: z.array(sedeMapaSchema),
  especies: z.array(especieMapaSchema),
  resumen: z.object({
    total: z.number(),
    por_estado: z.record(z.string(), z.number()),
    por_riesgo: z.record(z.string(), z.number()),
    por_origen: z.record(z.string(), z.number()),
    pct_nativas: z.number().nullable(),
    siembras: z.number(),
    alertas: z.number(),
    especies: z.number(),
  }),
  limites: limitesSchema.nullable(),
  origen_editable: z.boolean(),
});
export type Mapa = z.infer<typeof mapaSchema>;

export const especieOrigenSchema = z.object({
  id: z.number(),
  nombre_comun: z.string(),
  nombre_cientifico: z.string().nullable(),
  origen,
  origen_guardado: origen,
  origen_sugerido: origen,
});
export type Origen = 'nativa' | 'exotica';
