import { describe, expect, it } from '@jest/globals';
import { loginSchema } from '@/features/auth/schemas';

describe('loginSchema', () => {
  it('acepta correo y contraseña no vacía', () => {
    expect(loginSchema.safeParse({ email: 'docente@colegio.edu.co', password: 'secreto' }).success).toBe(true);
  });

  it('rechaza correo mal formado y contraseña vacía', () => {
    expect(loginSchema.safeParse({ email: 'docente', password: '' }).success).toBe(false);
  });
});