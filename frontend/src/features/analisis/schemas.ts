import { z } from 'zod';

const fecha = z.string().nullable();
const numero = z.number().nullable();

export const arbolAnalisisSchema = z.object({
  id: z.string(),
  sede_id: z.string(),
  sede: z.string().nullable(),
  codigo: z.string().nullable(),
  zona: z.string().nullable(),
  especie: z.string().nullable(),
  nombre_cientifico: z.string().nullable(),
  origen: z.string(),
  etapa: z.string().nullable(),
  interferencia: z.string().nullable(),
  estado: z.string(),
  puntaje: numero,
  dap: numero,
  altura: numero,
  copa: numero,
  clase_dap: z.string().nullable(),
  clase_dap_orden: z.number().int().nullable(),
  area_copa: numero,
  biomasa_kg: numero,
  carbono_kg: numero,
  co2_kg: numero,
  lat: numero,
  lng: numero,
  n_inspecciones: z.number().int(),
  ultima_inspeccion: fecha,
  dias_desde: z.number().int().nullable(),
  revisita_pendiente: z.boolean(),
  prioritario: z.boolean(),
  registrado: fecha,
});
export type ArbolAnalisis = z.infer<typeof arbolAnalisisSchema>;

export const inspeccionAnalisisSchema = z.object({
  arbol_id: z.string(),
  fecha,
  tipo: z.string().nullable(),
  calificacion: z.string().nullable(),
  puntaje: numero,
  revision: z.string().nullable(),
  curso: z.string(),
  hallazgos: z.number().int(),
  horas_revision: numero,
});
export type InspeccionAnalisis = z.infer<typeof inspeccionAnalisisSchema>;

export const intervencionAnalisisSchema = z.object({
  arbol_id: z.string(),
  tipo: z.string().nullable(),
  estado: z.string().nullable(),
  fecha,
  fecha_programada: fecha,
  fecha_ejecucion: fecha,
  costo_estimado: numero,
  costo_real: numero,
  resultado: z.string().nullable(),
  vencida: z.boolean(),
});
export type IntervencionAnalisis = z.infer<typeof intervencionAnalisisSchema>;

export const hallazgoAnalisisSchema = z.object({
  arbol_id: z.string(),
  fecha,
  hallazgo: z.string(),
  grupo: z.string(),
  anulada: z.boolean(),
});
export type HallazgoAnalisis = z.infer<typeof hallazgoAnalisisSchema>;

export const analisisSchema = z.object({
  generado_en: z.string(),
  alcance: z.string(),
  institucion_id: z.string().nullable(),
  sedes: z.array(z.object({ id: z.string(), nombre: z.string() })),
  arboles: z.array(arbolAnalisisSchema),
  inspecciones: z.array(inspeccionAnalisisSchema),
  intervenciones: z.array(intervencionAnalisisSchema),
  hallazgos: z.array(hallazgoAnalisisSchema),
});
export type Analisis = z.infer<typeof analisisSchema>;
