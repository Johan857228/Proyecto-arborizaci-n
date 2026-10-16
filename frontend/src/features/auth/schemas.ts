import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Escribe un correo válido.'),
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