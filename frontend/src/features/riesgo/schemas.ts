import { z } from 'zod';

import { CATEGORIAS, DEBAJO, OCUPACIONES, PROBABILIDADES } from '@/features/riesgo/reglas';

const valoresDebajo = DEBAJO.map((d) => d.valor) as [string, ...string[]];

// Mismas reglas que Tamizaje en backend/schemas.py.
export const tamizajeSchema = z.object({
  inclinacion: z.enum(['ninguna', 'leve', 'marcada', 'reciente']),
  raices: z.enum(['sanas', 'expuestas', 'danadas']),
  ramas_secas: z.enum(['ninguna', 'pequenas', 'grandes', 'colgando']),
  cavidades: z.enum(['ninguna', 'pequena', 'grande']),
  hongos: z.enum(['ninguno', 'en_ramas', 'en_tronco_o_base']),
  grietas: z.enum(['ninguna', 'en_ramas', 'en_tronco_o_union', 'abriendose']),
  debajo: z.array(z.enum(valoresDebajo)).min(1, 'Indica qué hay debajo del árbol.').max(9),
}).strict();

export const resultadoTamizajeSchema = z.object({
  categoria: z.enum(CATEGORIAS),
  probabilidad: z.enum(PROBABILIDADES),
  ocupacion: z.enum(OCUPACIONES),
  motivos: z.array(z.string()),
  accion: z.string(),
  respuestas: tamizajeSchema,
});
export type ResultadoTamizaje = z.infer<typeof resultadoTamizajeSchema>;

export const ESTADOS_ALERTA = ['por_confirmar', 'confirmada', 'descartada', 'atendida'] as const;
export type EstadoAlerta = (typeof ESTADOS_ALERTA)[number];
export const MEDIOS_AVISO = ['whatsapp', 'correo', 'llamada', 'en_persona', 'otro'] as const;
export type MedioAviso = (typeof MEDIOS_AVISO)[number];

export const alertaSchema = z.object({
  id: z.string().min(1),
  arbol_id: z.string().min(1),
  codigo: z.string(),
  nombre_comun: z.string(),
  zona: z.string(),
  zona_otra: z.string().nullable().optional(),
  institucion_id: z.string(),
  nombre_corto: z.string(),
  inspeccion_id: z.string(),
  categoria: z.enum(['alto', 'inminente']),
  estado: z.enum(ESTADOS_ALERTA),
  motivos: z.array(z.string()),
  accion: z.string(),
  creada_en: z.string(),
  actualizada_en: z.string().nullable().optional(),
  revisada_en: z.string().nullable().optional(),
  comentario_revision: z.string().nullable().optional(),
  rectoria_avisada_en: z.string().nullable().optional(),
  rectoria_medio: z.enum(MEDIOS_AVISO).nullable().optional(),
  atendida_en: z.string().nullable().optional(),
  nota_cierre: z.string().nullable().optional(),
  intervencion_id: z.string().nullable().optional(),
  foto_url: z.string().nullable().optional(),
  categoria_actual: z.enum(CATEGORIAS).nullable().optional(),
});
export type Alerta = z.infer<typeof alertaSchema>;

export const riesgoArbolSchema = z.object({
  tamizaje: resultadoTamizajeSchema.extend({ inspeccion_id: z.string(), creado_en: z.string() }).nullable(),
  alerta: alertaSchema.nullable(),
});
export type RiesgoArbol = z.infer<typeof riesgoArbolSchema>;

const telefono = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^[0-9 +()-]{3,20}$/.test(v) && v.replace(/\D/g, '').length >= 3), 'Escribe solo el número (dígitos, espacios, + o -).');

// Mismas reglas que ContactosIn en backend/routers/riesgo.py.
export const contactosFormSchema = z.object({
  rectoria_nombre: z.string().trim().max(120, 'Máximo 120 caracteres.'),
  rectoria_telefono: telefono,
  rectoria_correo: z.string().trim().max(160).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Escribe un correo válido.'),
  gestion_riesgo_telefono: telefono,
  autoridad_ambiental_nombre: z.string().trim().max(120, 'Máximo 120 caracteres.'),
  autoridad_ambiental_telefono: telefono,
});
export type ContactosForm = z.infer<typeof contactosFormSchema>;

export const contactosSchema = z.object({
  institucion_id: z.string(),
  rectoria_nombre: z.string().nullable().optional(),
  rectoria_telefono: z.string().nullable().optional(),
  rectoria_correo: z.string().nullable().optional(),
  gestion_riesgo_telefono: z.string().nullable().optional(),
  autoridad_ambiental_nombre: z.string().nullable().optional(),
  autoridad_ambiental_telefono: z.string().nullable().optional(),
  actualizado_en: z.string().nullable().optional(),
});
export type Contactos = z.infer<typeof contactosSchema>;
