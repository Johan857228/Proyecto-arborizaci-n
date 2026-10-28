import { z } from 'zod';

/** Actividades que el estudiante registra además de sus inspecciones (las confirmadas cuentan solas).
 *  Mismas que TipoActividad en backend/routers/servicio_social.py. */
export const TIPOS_ACTIVIDAD = [
  { valor: 'siembra', etiqueta: 'Siembra', ayuda: 'Plantar árboles o plántulas.' },
  { valor: 'riego', etiqueta: 'Riego', ayuda: 'Regar los árboles del colegio.' },
  { valor: 'mantenimiento', etiqueta: 'Mantenimiento básico', ayuda: 'Limpieza, plateo o tutorado, sin herramientas cortantes.' },
  { valor: 'jornada', etiqueta: 'Jornada ambiental', ayuda: 'Jornadas de siembra, limpieza o cuidado con la comunidad.' },
  { valor: 'educacion', etiqueta: 'Educación ambiental', ayuda: 'Charlas, carteleras o recorridos con otros cursos.' },
  { valor: 'otra', etiqueta: 'Otra', ayuda: 'Otra actividad del proyecto ambiental.' },
] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number]['valor'];
const tiposActividad = TIPOS_ACTIVIDAD.map((t) => t.valor) as [TipoActividad, ...TipoActividad[]];

export const MAX_HORAS_DIA = 8;
export const MAX_DIAS_ATRAS = 90;

export const actividadSchema = z.object({
  id: z.string().min(1),
  estudiante_id: z.string(),
  estudiante_nombre: z.string().nullable().optional(),
  curso_nombre: z.string().nullable().optional(),
  tipo: z.enum(tiposActividad),
  etiqueta: z.string(),
  fecha: z.string(),
  horas: z.number(),
  descripcion: z.string(),
  arbol_id: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  foto_url: z.string().nullable().optional(),
  estado: z.enum(['pendiente', 'aprobada', 'rechazada']),
  comentario: z.string().nullable().optional(),
  revisado_en: z.string().nullable().optional(),
  creado_en: z.string(),
});
export type Actividad = z.infer<typeof actividadSchema>;

export const certificadoSchema = z.object({
  id: z.string().min(1),
  codigo: z.string(),
  estudiante_id: z.string(),
  estudiante_nombre: z.string(),
  curso_nombre: z.string().nullable().optional(),
  horas: z.number(),
  meta_horas: z.number(),
  periodo_inicio: z.string(),
  periodo_fin: z.string(),
  firmante_nombre: z.string(),
  firmante_cargo: z.string(),
  emitido_en: z.string(),
  anulado_en: z.string().nullable().optional(),
  anulado_motivo: z.string().nullable().optional(),
});
export type Certificado = z.infer<typeof certificadoSchema>;

export const ESTADOS_SERVICIO = ['al_dia', 'atrasado', 'completo'] as const;
export type EstadoServicio = (typeof ESTADOS_SERVICIO)[number];

export const resumenCortoSchema = z.object({
  estudiante_id: z.string(),
  nombre: z.string(),
  curso_id: z.string().nullable().optional(),
  curso_nombre: z.string().nullable().optional(),
  grado: z.number().int().nullable().optional(),
  en_servicio: z.boolean(),
  motivo: z.string().nullable().optional(),
  meta: z.number(),
  horas_aprobadas: z.number(),
  horas_pendientes: z.number(),
  horas_esperadas: z.number(),
  estado: z.enum(ESTADOS_SERVICIO).nullable().optional(),
  periodo_inicio: z.string().nullable().optional(),
  periodo_fin: z.string().nullable().optional(),
  certificado: certificadoSchema.nullable().optional(),
});
export type ResumenCorto = z.infer<typeof resumenCortoSchema>;

export const resumenSchema = resumenCortoSchema.extend({
  horas_por_inspeccion: z.number(),
  por_tipo: z.array(z.object({ tipo: z.string(), etiqueta: z.string(), horas: z.number() })),
  fuera_del_tope: z.number(),
  inspecciones_contadas: z.number().int(),
  actividades: z.array(actividadSchema),
  no_permitidas: z.string(),
});
export type Resumen = z.infer<typeof resumenSchema>;

export const parametrosSchema = z.object({
  institucion_id: z.string(),
  meta_horas: z.number(),
  horas_por_inspeccion: z.number(),
});
export type Parametros = z.infer<typeof parametrosSchema>;

export const descargaSchema = z.object({ url: z.string().min(1), nombre: z.string(), vence_en_segundos: z.number() });

/** Mismas reglas que ActividadIn en el backend. `hoy` es la fecha de Colombia (AAAA-MM-DD). */
export function crearActividadFormSchema(hoy: string) {
  const limite = new Date(`${hoy}T12:00:00`);
  limite.setDate(limite.getDate() - MAX_DIAS_ATRAS);
  const masAntigua = limite.toISOString().slice(0, 10);
  return z.object({
    tipo: z.enum(tiposActividad, { error: 'Elige el tipo de actividad.' }),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Escribe la fecha como AAAA-MM-DD.')
      .refine((f) => f <= hoy, 'La fecha no puede ser futura.')
      .refine((f) => f >= masAntigua, `Solo se registran actividades de los últimos ${MAX_DIAS_ATRAS} días.`),
    horas: z
      .number({ error: 'Escribe cuántas horas.' })
      .gt(0, 'Debe ser mayor que cero.')
      .max(MAX_HORAS_DIA, `Máximo ${MAX_HORAS_DIA} horas por día.`)
      .refine((h) => Math.round(h * 2) === h * 2, 'Usa medias horas: 0,5; 1; 1,5…'),
    descripcion: z.string().trim().min(10, 'Cuenta qué hiciste (mínimo 10 caracteres).').max(500, 'Máximo 500 caracteres.'),
  });
}
export type ActividadForm = z.infer<ReturnType<typeof crearActividadFormSchema>>;

export function horasTexto(horas: number) {
  return Number.isInteger(horas) ? String(horas) : horas.toFixed(1).replace('.', ',');
}

export function codigoLegible(codigo: string) {
  return `${codigo.slice(0, 4)}-${codigo.slice(4, 8)}-${codigo.slice(8)}`;
}
