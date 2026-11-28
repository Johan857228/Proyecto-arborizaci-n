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

// Mismas reglas del backend (RegistroIn y RestablecerIn en backend/schemas.py).
export const contrasenaSchema = z
  .string()
  .min(8, 'Usa al menos 8 caracteres.')
  .max(72, 'Máximo 72 caracteres.')
  .regex(/\p{L}/u, 'Incluye al menos una letra.')
  .regex(/\d/, 'Incluye al menos un número.');

// Registro: las mismas reglas del backend (RegistroIn en backend/schemas.py).
export const registroSchema = z
  .object({
    nombre: z
      .string()
      .transform((valor) => valor.trim().replace(/\s+/g, ' '))
      .pipe(z.string().min(2, 'Escribe tu nombre completo.').max(120, 'Máximo 120 caracteres.')),
    email: z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.')),
    password: contrasenaSchema,
    confirmacion: z.string().min(1, 'Repite la contraseña.'),
    // Ley 1581: la autorización se da antes de crear la cuenta.
    acepta_politica: z.boolean().refine((v) => v, 'Debes aceptar la política de tratamiento de datos.'),
  })
  .refine((valores) => valores.password === valores.confirmacion, {
    path: ['confirmacion'],
    message: 'Las contraseñas no coinciden.',
  });

export const registroRespuestaSchema = z.object({
  requiere_confirmacion: z.boolean(),
  sesion: sessionSchema.nullable(),
  mensaje: z.string().min(1),
});

// Recuperar la contraseña: primero el correo y, desde el enlace, la contraseña nueva.
export const recuperarSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.')),
});
export type RecuperarFormValues = z.infer<typeof recuperarSchema>;

export const restablecerSchema = z
  .object({
    password: contrasenaSchema,
    confirmacion: z.string().min(1, 'Repite la contraseña.'),
  })
  .refine((valores) => valores.password === valores.confirmacion, {
    path: ['confirmacion'],
    message: 'Las contraseñas no coinciden.',
  });
export type RestablecerFormValues = z.infer<typeof restablecerSchema>;

export const mensajeSchema = z.object({ mensaje: z.string().min(1) });

// enviado = false: el backend no mandó el correo porque su enlace no llevaría a la app.
export const recuperarRespuestaSchema = z.object({ mensaje: z.string().min(1), enviado: z.boolean().default(true) });

export type RegistroFormInput = z.input<typeof registroSchema>;
export type RegistroFormValues = z.output<typeof registroSchema>;
export type RegistroRespuesta = z.infer<typeof registroRespuestaSchema>;
