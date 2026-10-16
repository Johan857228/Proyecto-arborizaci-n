import { describe, expect, it } from '@jest/globals';

import { registroRespuestaSchema, registroSchema } from '@/features/auth/schemas';
import { crearCuentaSchema } from '@/features/perfil/schemas';

const cuenta = { nombre: '  Laura   Gómez ', email: ' Laura@Colegio.edu.co ', password: 'clave-segura-1', confirmar: 'clave-segura-1' };

const mensaje = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, campo: string) =>
  r.error?.issues.find((issue) => issue.path[0] === campo)?.message;

describe('crear una cuenta propia', () => {
  it('limpia el nombre y el correo antes de enviarlos', () => {
    const r = registroSchema.safeParse(cuenta);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ nombre: 'Laura Gómez', email: 'laura@colegio.edu.co' });
  });

  it('pide nombre, correo válido, contraseña de 8 a 72 caracteres y que coincida', () => {
    expect(mensaje(registroSchema.safeParse({ ...cuenta, nombre: '   ' }), 'nombre')).toBe('Escribe tu nombre.');
    expect(mensaje(registroSchema.safeParse({ ...cuenta, email: 'laura' }), 'email')).toBe('Escribe un correo válido.');
    expect(mensaje(registroSchema.safeParse({ ...cuenta, password: 'corta', confirmar: 'corta' }), 'password')).toBe('Usa al menos 8 caracteres.');
    expect(registroSchema.safeParse({ ...cuenta, password: 'x'.repeat(73), confirmar: 'x'.repeat(73) }).success).toBe(false);
    expect(mensaje(registroSchema.safeParse({ ...cuenta, confirmar: 'otra-clave-1' }), 'confirmar')).toBe('Las contraseñas no coinciden.');
  });

  it('acepta la respuesta con o sin sesión', () => {
    expect(registroRespuestaSchema.safeParse({ requiere_confirmacion: true, email: 'a@b.co', sesion: null }).success).toBe(true);
    expect(registroRespuestaSchema.safeParse({
      requiere_confirmacion: false,
      email: 'a@b.co',
      sesion: { access_token: 't', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, user_id: 'u1', email: 'a@b.co' },
    }).success).toBe(true);
  });
});

describe('cuenta creada por el administrador', () => {
  const base = { nombre: 'Sofía', email: 'sofia@x.co', password: 'clave-segura-1', rol: 'estudiante' as const, institucion_id: 'sj', curso_id: null };

  it('docentes y estudiantes necesitan institución; el administrador no', () => {
    expect(crearCuentaSchema.safeParse(base).success).toBe(true);
    expect(mensaje(crearCuentaSchema.safeParse({ ...base, institucion_id: null }), 'institucion_id'))
      .toBe('Elige la institución: docentes y estudiantes trabajan en una.');
    expect(crearCuentaSchema.safeParse({ ...base, rol: 'docente', institucion_id: null }).success).toBe(false);
    expect(crearCuentaSchema.safeParse({ ...base, rol: 'administrador', institucion_id: null }).success).toBe(true);
  });

  it('la contraseña inicial sigue las mismas reglas', () => {
    expect(mensaje(crearCuentaSchema.safeParse({ ...base, password: '1234567' }), 'password')).toBe('Usa al menos 8 caracteres.');
  });
});
