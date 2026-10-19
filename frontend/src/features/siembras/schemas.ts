import { z } from 'zod';

import type { Tono } from '@/shared/components/UI';

/** Siembras con seguimiento de supervivencia: mismos valores que backend/routers/siembras.py. */
export const HITOS = [3, 6, 12, 24] as const;
export type Hito = (typeof HITOS)[number];

export const ORGANIZADORES = {
  colegio: 'El colegio',
  alcaldia: 'Alcaldía',
  autoridad_ambiental: 'Autoridad ambiental',
  empresa: 'Empresa',
  otro: 'Otro',
} as const;
export type Organizador = keyof typeof ORGANIZADORES;

export const ESTADOS_CONTROL = {
  viva_buena: { etiqueta: 'Viva y sana', tono: 'sano' },
  viva_regular: { etiqueta: 'Viva, con problemas', tono: 'riesgo' },
  muerta: { etiqueta: 'Muerta', tono: 'critico' },
  no_encontrada: { etiqueta: 'No se encontró', tono: 'critico' },
} as const satisfies Record<string, { etiqueta: string; tono: Tono }>;
export type EstadoControl = keyof typeof ESTADOS_CONTROL;

export const ESTADOS_PLANTA = {
  viva: { etiqueta: 'Viva', tono: 'sano' },
  muerta: { etiqueta: 'Muerta', tono: 'critico' },
  sin_control: { etiqueta: 'Sin control', tono: 'neutro' },
} as const satisfies Record<string, { etiqueta: string; tono: Tono }>;

export const PADRINOS = {
  curso: 'Un curso',
  estudiante: 'Un estudiante',
  docente: 'Un docente',
  familia: 'Una familia',
  empresa: 'Una empresa',
  otro: 'Otro',
} as const;
export type PadrinoTipo = keyof typeof PADRINOS;

export const ROLES = { estudiante: 'Estudiante', docente: 'Docente', acudiente: 'Acudiente', voluntario: 'Voluntario', otro: 'Otro' } as const;
export type RolAsistente = keyof typeof ROLES;

export const SIGUIENTE = {
  proximo: { etiqueta: 'Próximo', tono: 'neutro' },
  pendiente: { etiqueta: 'Por hacer', tono: 'riesgo' },
  vencido: { etiqueta: 'Vencido', tono: 'critico' },
} as const satisfies Record<string, { etiqueta: string; tono: Tono }>;

const porHito = z.object({
  hito_meses: z.number(),
  debidas: z.number(),
  conocidas: z.number(),
  vivas: z.number(),
  pendientes: z.number(),
  supervivencia_pct: z.number().nullable(),
});

export const resumenSchema = z.object({
  sembradas: z.number(),
  nativas: z.number(),
  pct_nativas: z.number().nullable(),
  evaluadas: z.number(),
  vivas: z.number(),
  muertas: z.number(),
  supervivencia_pct: z.number().nullable(),
  controles_pendientes: z.number(),
  controles_vencidos: z.number(),
  completaron_2_anios: z.number(),
  por_hito: z.array(porHito),
});
export type ResumenSiembras = z.infer<typeof resumenSchema>;

const siguienteSchema = z.object({ hito_meses: z.number(), fecha: z.string(), estado: z.enum(['proximo', 'pendiente', 'vencido']) });

export const jornadaSchema = z.object({
  id: z.string(),
  institucion_id: z.string(),
  nombre: z.string(),
  fecha: z.string(),
  lugar: z.string().nullable(),
  organizador: z.enum(['colegio', 'alcaldia', 'autoridad_ambiental', 'empresa', 'otro']),
  oficial: z.boolean(),
  area_de_vida: z.string().nullable(),
  patrocinador: z.string().nullable(),
  notas: z.string().nullable(),
  resumen: resumenSchema,
  asistentes: z.object({ total: z.number(), estudiantes: z.number(), con_autorizacion: z.number() }),
  puede_editar: z.boolean(),
});
export type Jornada = z.infer<typeof jornadaSchema>;

export const controlSchema = z.object({
  id: z.string(),
  hito_meses: z.number().nullable(),
  fecha: z.string(),
  estado: z.enum(['viva_buena', 'viva_regular', 'muerta', 'no_encontrada']),
  altura_cm: z.number().nullable(),
  mantenimiento: z.boolean(),
  observaciones: z.string().nullable(),
  puede_borrar: z.boolean(),
});
export type Control = z.infer<typeof controlSchema>;

export const siembraSchema = z.object({
  id: z.string(),
  jornada_id: z.string(),
  institucion_id: z.string(),
  especie_id: z.number().nullable(),
  especie: z.string(),
  nombre_cientifico: z.string().nullable(),
  origen: z.enum(['nativa', 'exotica']).nullable(),
  lat: z.number(),
  lng: z.number(),
  precision_gps_m: z.number().nullable(),
  fecha: z.string(),
  vivero: z.string().nullable(),
  vivero_registro_ica: z.string().nullable(),
  altura_inicial_cm: z.number().nullable(),
  padrino_tipo: z.enum(['curso', 'estudiante', 'docente', 'familia', 'empresa', 'otro']),
  padrino: z.string().nullable(),
  reemplaza_id: z.string().nullable(),
  notas: z.string().nullable(),
  estado: z.enum(['viva', 'muerta', 'sin_control']),
  controles: z.array(controlSchema),
  siguiente: siguienteSchema.nullable(),
});
export type Siembra = z.infer<typeof siembraSchema>;

export const jornadaDetalleSchema = jornadaSchema.extend({ siembras: z.array(siembraSchema) });
export type JornadaDetalle = z.infer<typeof jornadaDetalleSchema>;

export const asistenteSchema = z.object({
  id: z.string(),
  usuario_id: z.string().nullable(),
  nombre: z.string(),
  rol: z.enum(['estudiante', 'docente', 'acudiente', 'voluntario', 'otro']),
  curso: z.string().nullable(),
  arboles_sembrados: z.number().nullable(),
  autoriza_certificado: z.boolean(),
  autorizacion_registrada_en: z.string().nullable(),
});
export type Asistente = z.infer<typeof asistenteSchema>;

export const resumenGeneralSchema = z.object({
  total: resumenSchema,
  por_jornada: z.array(z.object({ id: z.string(), nombre: z.string(), fecha: z.string().nullable(), resumen: resumenSchema })),
  por_sede: z.array(z.object({ id: z.string(), nombre: z.string(), fecha: z.string().nullable(), resumen: resumenSchema })),
  proximos: z.array(siguienteSchema.extend({ siembra_id: z.string(), jornada_id: z.string(), jornada: z.string(), especie: z.string() })),
});
export type ResumenGeneral = z.infer<typeof resumenGeneralSchema>;

export const descargaSchema = z.object({ url: z.string().min(1), nombre: z.string(), vence_en_segundos: z.number(), filas: z.number() });

// ------------------------------------ Formularios ------------------------------------
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escribe la fecha como AAAA-MM-DD.');
const texto = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);

export const jornadaFormSchema = z.object({
  nombre: z.string().trim().min(3, 'Ponle un nombre a la jornada (mínimo 3 caracteres).').max(120),
  fecha: fechaIso,
  lugar: texto(160),
  organizador: z.enum(['colegio', 'alcaldia', 'autoridad_ambiental', 'empresa', 'otro']),
  oficial: z.boolean(),
  area_de_vida: texto(160),
  patrocinador: texto(120),
});

/** Mismas reglas que SiembraIn en el backend. */
export function plantaFormSchema(hoy: string) {
  return z
    .object({
      especie_id: z.number().optional(),
      especie_otra: texto(80),
      lat: z.number({ error: 'Toma la ubicación con el GPS o escribe la latitud.' }).min(-4.3, 'La latitud debe estar en Colombia.').max(13.5, 'La latitud debe estar en Colombia.'),
      lng: z.number({ error: 'Toma la ubicación con el GPS o escribe la longitud.' }).min(-82, 'La longitud debe estar en Colombia.').max(-66.8, 'La longitud debe estar en Colombia.'),
      fecha: fechaIso.refine((f) => f <= hoy, 'La fecha de siembra no puede ser futura.'),
      vivero: texto(120),
      vivero_registro_ica: texto(40),
      altura_inicial_cm: z.number().min(1, 'Mínimo 1 cm.').max(500, 'Máximo 500 cm.').optional(),
      padrino_tipo: z.enum(['curso', 'estudiante', 'docente', 'familia', 'empresa', 'otro']),
      padrino_curso_id: z.string().optional(),
      padrino_usuario_id: z.string().optional(),
      padrino_nombre: texto(120),
    })
    .superRefine((d, ctx) => {
      if (d.especie_id == null && d.especie_otra.length < 2) ctx.addIssue({ code: 'custom', path: ['especie_id'], message: 'Elige la especie o escribe cuál es.' });
      if (d.padrino_tipo === 'curso' && !d.padrino_curso_id) ctx.addIssue({ code: 'custom', path: ['padrino_curso_id'], message: 'Elige el curso padrino.' });
      if ((d.padrino_tipo === 'estudiante' || d.padrino_tipo === 'docente') && !d.padrino_usuario_id) {
        ctx.addIssue({ code: 'custom', path: ['padrino_usuario_id'], message: 'Elige la persona que apadrina.' });
      }
      if (['familia', 'empresa', 'otro'].includes(d.padrino_tipo) && d.padrino_nombre.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['padrino_nombre'], message: 'Escribe quién apadrina la plántula.' });
      }
    });
}

export function controlFormSchema(hoy: string, sembrada: string) {
  return z.object({
    hito_meses: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24)]).optional(),
    fecha: fechaIso.refine((f) => f <= hoy, 'La fecha del control no puede ser futura.').refine((f) => f >= sembrada, 'El control no puede ser anterior a la siembra.'),
    estado: z.enum(['viva_buena', 'viva_regular', 'muerta', 'no_encontrada'], { error: 'Elige cómo está la plántula.' }),
    altura_cm: z.number().min(1, 'Mínimo 1 cm.').max(3000, 'Máximo 3.000 cm.').optional(),
    mantenimiento: z.boolean(),
    observaciones: texto(500),
  });
}

export const vacio = (v: string) => (v.trim() ? v.trim() : null);

/** "Pasó el control de 6 meses" → "6 meses"; null = control extra. */
export function textoHito(hito: number | null) {
  return hito == null ? 'Control extra' : `${hito} meses`;
}
