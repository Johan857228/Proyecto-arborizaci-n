import { z } from 'zod';

import type { Tono } from '@/shared/components/UI';

/** Proyecto Ambiental Escolar: mismos valores que backend/routers/prae.py. */
export const TEMAS = [
  { valor: 'arbolado', etiqueta: 'Arbolado escolar' },
  { valor: 'residuos', etiqueta: 'Residuos sólidos' },
  { valor: 'agua', etiqueta: 'Agua' },
  { valor: 'energia', etiqueta: 'Energía' },
  { valor: 'biodiversidad', etiqueta: 'Biodiversidad' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;
export type Tema = (typeof TEMAS)[number]['valor'];
const temas = TEMAS.map((t) => t.valor) as [Tema, ...Tema[]];

export const ESTADOS_PRAE = {
  formulacion: { etiqueta: 'En formulación', tono: 'neutro' },
  en_ejecucion: { etiqueta: 'En ejecución', tono: 'info' },
  evaluacion_parcial: { etiqueta: 'Evaluación parcial', tono: 'riesgo' },
  evaluado: { etiqueta: 'Evaluado', tono: 'sano' },
} as const satisfies Record<string, { etiqueta: string; tono: Tono }>;
export type EstadoPrae = keyof typeof ESTADOS_PRAE;

export const ESTADOS_ACCION = {
  pendiente: { etiqueta: 'Pendiente', tono: 'neutro' },
  en_curso: { etiqueta: 'En curso', tono: 'info' },
  cumplida: { etiqueta: 'Cumplida', tono: 'sano' },
  cancelada: { etiqueta: 'Cancelada', tono: 'neutro' },
} as const satisfies Record<string, { etiqueta: string; tono: Tono }>;
export type EstadoAccion = keyof typeof ESTADOS_ACCION;

export const INSTANCIAS = {
  consejo_directivo: 'Consejo directivo',
  secretaria: 'Secretaría de Educación',
  comite: 'Comité ambiental escolar',
  otra: 'Otra instancia',
} as const;
export type Instancia = keyof typeof INSTANCIAS;

export const TIPOS_EVIDENCIA = { foto: 'Foto', enlace: 'Enlace', nota: 'Nota' } as const;
export type TipoEvidencia = keyof typeof TIPOS_EVIDENCIA;

const fecha = z.string().nullable().optional();

export const accionSchema = z.object({
  id: z.string().min(1),
  titulo: z.string(),
  descripcion: z.string().nullable().optional(),
  responsable: z.string().nullable().optional(),
  fecha_inicio: fecha,
  fecha_fin: fecha,
  estado: z.enum(['pendiente', 'en_curso', 'cumplida', 'cancelada']),
  indicador: z.string().nullable().optional(),
  meta: z.string().nullable().optional(),
  vencida: z.boolean(),
});
export type Accion = z.infer<typeof accionSchema>;

export const evidenciaSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(['foto', 'enlace', 'nota']),
  titulo: z.string(),
  descripcion: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  foto_url: z.string().nullable().optional(),
  fecha: z.string(),
  accion_id: z.string().nullable().optional(),
  creado_en: z.string(),
});
export type Evidencia = z.infer<typeof evidenciaSchema>;

export const evaluacionSchema = z.object({
  id: z.string().min(1),
  instancia: z.enum(['consejo_directivo', 'secretaria', 'comite', 'otra']),
  fecha: z.string(),
  acta: z.string().nullable().optional(),
  cumplimiento_pct: z.number().int().nullable().optional(),
  logros: z.string().nullable().optional(),
  dificultades: z.string().nullable().optional(),
  recomendaciones: z.string().nullable().optional(),
  participantes: z.string().nullable().optional(),
  creado_en: z.string(),
});
export type Evaluacion = z.infer<typeof evaluacionSchema>;

export const praeSchema = z.object({
  id: z.string().min(1),
  institucion_id: z.string(),
  anio: z.number().int(),
  tema: z.enum(temas),
  tema_otro: z.string().nullable().optional(),
  titulo: z.string(),
  problema: z.string(),
  diagnostico: z.string().nullable().optional(),
  objetivo_general: z.string().nullable().optional(),
  objetivos_especificos: z.array(z.string()),
  comite: z.string().nullable().optional(),
  estado: z.enum(['formulacion', 'en_ejecucion', 'evaluacion_parcial', 'evaluado']),
  evaluaciones_faltantes: z.array(z.enum(['consejo_directivo', 'secretaria', 'comite', 'otra'])),
  resumen_acciones: z.object({
    total: z.number().int(),
    pendiente: z.number().int(),
    en_curso: z.number().int(),
    cumplida: z.number().int(),
    cancelada: z.number().int(),
    pct_cumplidas: z.number().nullable().optional(),
  }),
  acciones: z.array(accionSchema),
  evidencias: z.array(evidenciaSchema),
  evaluaciones: z.array(evaluacionSchema),
  puede_editar: z.boolean(),
  actualizado_en: z.string(),
});
export type Prae = z.infer<typeof praeSchema>;

export const anioSchema = z.object({
  id: z.string(),
  anio: z.number().int(),
  titulo: z.string(),
  tema: z.enum(temas),
  estado: z.enum(['formulacion', 'en_ejecucion', 'evaluacion_parcial', 'evaluado']),
});
export type AnioPrae = z.infer<typeof anioSchema>;

const conteo = z.number().nullable().optional();
export const indicadoresSchema = z.object({
  periodo: z.object({ desde: z.string(), hasta: z.string() }),
  arbolado: z.object({
    total_arboles: conteo,
    registrados_periodo: conteo,
    por_estado: z.record(z.string(), z.number()).optional(),
    pct_riesgo_o_critico: conteo,
    co2_kg: conteo,
    inspecciones_periodo: conteo,
    confirmadas: conteo,
    arboles_inspeccionados_periodo: conteo,
    cobertura_pct: conteo,
    intervenciones_ejecutadas: conteo,
    participantes: conteo,
  }),
  alertas: z.object({ total: z.number(), abiertas: z.number(), atendidas: z.number(), descartadas: z.number() }).nullable().optional(),
  servicio_social: z.object({ estudiantes: z.number(), completaron: z.number(), horas_aprobadas: z.number() }).nullable().optional(),
  pedagogia: z.object({ clases: z.number(), guias: z.number(), asistentes: z.number() }).nullable().optional(),
});
export type IndicadoresPrae = z.infer<typeof indicadoresSchema>;

export const descargaSchema = z.object({ url: z.string().min(1), nombre: z.string(), vence_en_segundos: z.number() });

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escribe la fecha como AAAA-MM-DD.');

// Mismas reglas que PraeIn en el backend.
export const nuevoPraeSchema = z
  .object({
    tema: z.enum(temas, { error: 'Elige el tema del PRAE.' }),
    tema_otro: z.string().trim().max(80),
    titulo: z.string().trim().min(5, 'Escribe un título (mínimo 5 caracteres).').max(150),
    problema: z.string().trim().min(10, 'Describe el problema ambiental (mínimo 10 caracteres).').max(2000),
  })
  .refine((v) => v.tema !== 'otro' || v.tema_otro.length > 0, { path: ['tema_otro'], message: 'Escribe el tema.' });

export const accionFormSchema = z
  .object({
    titulo: z.string().trim().min(3, 'Escribe la acción.').max(150),
    responsable: z.string().trim().max(120),
    fecha_inicio: z.union([fechaIso, z.literal('')]),
    fecha_fin: z.union([fechaIso, z.literal('')]),
    indicador: z.string().trim().max(300),
    meta: z.string().trim().max(300),
  })
  .refine((v) => !v.fecha_inicio || !v.fecha_fin || v.fecha_fin >= v.fecha_inicio, { path: ['fecha_fin'], message: 'Debe ser posterior a la fecha inicial.' });

export function crearEvidenciaFormSchema(hoy: string) {
  return z
    .object({
      tipo: z.enum(['foto', 'enlace', 'nota']),
      titulo: z.string().trim().min(3, 'Escribe un título.').max(150),
      descripcion: z.string().trim().max(1000),
      url: z.string().trim().max(500),
      fecha: fechaIso.refine((f) => f <= hoy, 'La fecha no puede ser futura.'),
    })
    .refine((v) => v.tipo !== 'enlace' || v.url.startsWith('https://'), { path: ['url'], message: 'El enlace debe empezar por https://' });
}

export function crearEvaluacionFormSchema(hoy: string) {
  return z
    .object({
      instancia: z.enum(['consejo_directivo', 'secretaria', 'comite', 'otra'], { error: 'Elige quién evaluó.' }),
      fecha: fechaIso.refine((f) => f <= hoy, 'La fecha no puede ser futura.'),
      acta: z.string().trim().max(60),
      cumplimiento_pct: z.number().int('Sin decimales.').min(0).max(100, 'Máximo 100.').optional(),
      logros: z.string().trim().max(2000),
      dificultades: z.string().trim().max(2000),
      recomendaciones: z.string().trim().max(2000),
      participantes: z.string().trim().max(500),
    })
    .refine((v) => v.logros || v.dificultades || v.recomendaciones, { path: ['logros'], message: 'Escribe al menos los logros, las dificultades o las recomendaciones.' });
}

/** Texto vacío → null, para enviarlo al backend. */
export function nulo(texto: string) {
  return texto.trim() ? texto.trim() : null;
}
