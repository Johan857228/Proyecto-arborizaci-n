import { describe, expect, it } from '@jest/globals';
import { loginSchema, registroRespuestaSchema, registroSchema } from '@/features/auth/schemas';

describe('loginSchema', () => {
  it('acepta correo y contraseña no vacía', () => {
    expect(loginSchema.safeParse({ email: 'docente@colegio.edu.co', password: 'secreto' }).success).toBe(true);
  });

  it('rechaza correo mal formado y contraseña vacía', () => {
    expect(loginSchema.safeParse({ email: 'docente', password: '' }).success).toBe(false);
  });
});
describe('registroSchema', () => {
  const valido = { nombre: '  Ana   Pérez ', email: ' Ana@Colegio.edu.co ', password: 'arboles2026', confirmacion: 'arboles2026', acepta_politica: true };

  function errorEn(cambios: Partial<typeof valido>, campo: keyof typeof valido) {
    const resultado = registroSchema.safeParse({ ...valido, ...cambios });
    return resultado.error?.issues.find((issue) => issue.path[0] === campo)?.message;
  }

  it('limpia el nombre y el correo', () => {
    expect(registroSchema.parse(valido)).toMatchObject({ nombre: 'Ana Pérez', email: 'ana@colegio.edu.co' });
  });

  it('pide una contraseña de 8 caracteres con letras y números, repetida igual', () => {
    expect(errorEn({ password: 'abc123', confirmacion: 'abc123' }, 'password')).toBe('Usa al menos 8 caracteres.');
    expect(errorEn({ password: 'solamenteletras', confirmacion: 'solamenteletras' }, 'password')).toBe('Incluye al menos un número.');
    expect(errorEn({ password: '1234567890', confirmacion: '1234567890' }, 'password')).toBe('Incluye al menos una letra.');
    expect(errorEn({ confirmacion: 'otra2026' }, 'confirmacion')).toBe('Las contraseñas no coinciden.');
    expect(errorEn({ acepta_politica: false }, 'acepta_politica')).toBe('Debes aceptar la política de tratamiento de datos.');
  });

  it('rechaza un nombre muy corto', () => {
    expect(errorEn({ nombre: ' A ' }, 'nombre')).toBe('Escribe tu nombre completo.');
  });
});

describe('registroRespuestaSchema', () => {
  it('acepta la respuesta sin sesión cuando hay que confirmar el correo', () => {
    const respuesta = { requiere_confirmacion: true, sesion: null, mensaje: 'Revisa tu correo.' };
    expect(registroRespuestaSchema.safeParse(respuesta).success).toBe(true);
  });
});
