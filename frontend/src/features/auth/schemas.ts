import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Escribe un correo válido.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;