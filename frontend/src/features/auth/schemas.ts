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