import { z } from 'zod';

export const loginSchema = z.object({
  // Se quitan espacios al inicio o al final (comunes al pegar el correo) antes de validarlo.
  email: z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.')),
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

export const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).nullable(),
  token_type: z.literal('bearer'),
  expires_in: z.number().int().positive().nullable(),
  user_id: z.string().min(1),
  email: z.email().nullable(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// Supabase pide al menos 6 caracteres; la app exige 8 y corta en 72 (límite de bcrypt), igual que la API.
export const CLAVE_MIN = 8;
export const CLAVE_MAX = 72;

/** Nombre sin espacios de más, de 1 a 120 caracteres. */
export const nombrePersonaSchema = (vacio: string) => z
  .string()
  .transform((valor) => valor.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, vacio).max(120, 'Máximo 120 caracteres.'));

export const correoSchema = z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.'));

export const claveNuevaSchema = z
  .string()
  .min(CLAVE_MIN, `Usa al menos ${CLAVE_MIN} caracteres.`)
  .max(CLAVE_MAX, `Máximo ${CLAVE_MAX} caracteres.`);

export const registroSchema = z
  .object({
    nombre: nombrePersonaSchema('Escribe tu nombre.'),
    email: correoSchema,
    password: claveNuevaSchema,
    confirmar: z.string(),
  })
  .refine((valor) => valor.password === valor.confirmar, { path: ['confirmar'], message: 'Las contraseñas no coinciden.' });
export type RegistroFormInput = z.input<typeof registroSchema>;
export type RegistroFormValues = z.output<typeof registroSchema>;

export const registroRespuestaSchema = z.object({
  requiere_confirmacion: z.boolean(),
  email: z.string(),
  sesion: sessionSchema.nullable(),
});
export type RegistroRespuesta = z.infer<typeof registroRespuestaSchema>;