import { z } from 'zod';

// Mismas reglas que backend/routers/privacidad.py.
export const PARENTESCOS = ['madre', 'padre', 'acudiente', 'otro'] as const;
export const ETIQUETA_PARENTESCO: Record<(typeof PARENTESCOS)[number], string> = {
  madre: 'Madre',
  padre: 'Padre',
  acudiente: 'Acudiente',
  otro: 'Otro familiar',
};

export const TIPOS_SOLICITUD = ['consulta', 'rectificacion', 'supresion', 'revocatoria'] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];
export const ETIQUETA_SOLICITUD: Record<TipoSolicitud, { titulo: string; texto: string; plazo: string }> = {
  consulta: { titulo: 'Consultar mis datos', texto: 'Saber qué datos tienen de ti y para qué se usan.', plazo: '10 días hábiles' },
  rectificacion: { titulo: 'Corregir un dato', texto: 'Algo está mal o desactualizado.', plazo: '15 días hábiles' },
  supresion: { titulo: 'Eliminar mis datos', texto: 'Que borren datos que ya no deben tener.', plazo: '15 días hábiles' },
  revocatoria: { titulo: 'Retirar la autorización', texto: 'Que dejen de tratar tus datos.', plazo: '15 días hábiles' },
};

export const consentimientoSchema = z.object({
  id: z.string().min(1),
  usuario_id: z.string().min(1),
  acudiente_nombre: z.string(),
  acudiente_documento: z.string(),
  parentesco: z.string(),
  metodo: z.enum(['firma_app', 'documento']),
  estudiante_escuchado: z.boolean(),
  version_politica: z.string(),
  creado_en: z.string(),
  revocado_en: z.string().nullable(),
  documento_url: z.string().nullable(),
});
export type Consentimiento = z.infer<typeof consentimientoSchema>;

export const estadoPrivacidadSchema = z.object({
  politica_vigente: z.string(),
  politica_aceptada: z.string().nullable(),
  politica_aceptada_en: z.string().nullable(),
  alias: z.string().nullable(),
  requiere_consentimiento: z.boolean(),
  consentimiento: consentimientoSchema.nullable(),
});
export type EstadoPrivacidad = z.infer<typeof estadoPrivacidadSchema>;

export const solicitudSchema = z.object({
  id: z.string().min(1),
  usuario_id: z.string().min(1),
  nombre: z.string().nullable(),
  tipo: z.enum(TIPOS_SOLICITUD),
  detalle: z.string(),
  estado: z.enum(['pendiente', 'atendida', 'rechazada']),
  respuesta: z.string().nullable(),
  creado_en: z.string(),
  atendida_en: z.string().nullable(),
  fecha_limite: z.string(),
  vencida: z.boolean(),
});
export type Solicitud = z.infer<typeof solicitudSchema>;

export const estudianteConsentimientoSchema = z.object({
  usuario_id: z.string().min(1),
  nombre: z.string(),
  curso_id: z.string().nullable(),
  estado: z.enum(['vigente', 'sin_autorizacion', 'revocada']),
  consentimiento: consentimientoSchema.nullable(),
});
export type EstudianteConsentimiento = z.infer<typeof estudianteConsentimientoSchema>;

const nombreLimpio = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(3, 'Escribe el nombre completo.').max(120, 'Máximo 120 caracteres.'));

/** Autorización firmada en la app: el acudiente, presente, escribe su nombre completo. */
export const firmaSchema = z
  .object({
    acudiente_nombre: nombreLimpio,
    acudiente_documento: z.string().trim().regex(/^[0-9A-Za-z-]{4,20}$/, 'Escribe el número de documento (4 a 20 caracteres, sin espacios).'),
    parentesco: z.enum(PARENTESCOS, { error: 'Elige el parentesco.' }),
    acudiente_contacto: z.string().trim().max(120, 'Máximo 120 caracteres.'),
    estudiante_escuchado: z.boolean().refine((v) => v, 'Confirma que se escuchó la opinión del estudiante.'),
    autoriza_tratamiento: z.boolean().refine((v) => v, 'El acudiente debe autorizar el tratamiento de los datos.'),
    firma: nombreLimpio,
  })
  .refine((v) => v.firma.toLocaleLowerCase('es') === v.acudiente_nombre.toLocaleLowerCase('es'), {
    path: ['firma'],
    message: 'La firma debe ser el mismo nombre completo del acudiente.',
  });
export type FirmaInput = z.input<typeof firmaSchema>;
export type FirmaValores = z.output<typeof firmaSchema>;

export const aliasSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .refine((v) => v === '' || v.length >= 3, 'Usa al menos 3 caracteres.')
  .refine((v) => v.length <= 30, 'Máximo 30 caracteres.')
  .refine((v) => !v.includes('@') && (v.match(/\d/g) ?? []).length < 7, 'Sin correos ni números de teléfono o documento.')
  .refine((v) => /^[\p{L}\p{N} ._-]*$/u.test(v), 'Usa solo letras, números, espacios, puntos o guiones.');

export const solicitudInSchema = z.object({
  tipo: z.enum(TIPOS_SOLICITUD),
  detalle: z.string().trim().min(5, 'Cuéntanos un poco más (mínimo 5 caracteres).').max(1000, 'Máximo 1.000 caracteres.'),
});
