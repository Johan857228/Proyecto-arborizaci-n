import { z } from 'zod';

import { claveNuevaSchema, correoSchema, nombrePersonaSchema } from '@/features/auth/schemas';

export const rolSchema = z.enum(['administrador', 'docente', 'estudiante']);
export type Rol = z.infer<typeof rolSchema>;

export const ETIQUETA_ROL: Record<Rol, string> = {
  administrador: 'Administrador',
  docente: 'Docente',
  estudiante: 'Estudiante',
};

export function etiquetaRol(rol: string) {
  const resultado = rolSchema.safeParse(rol);
  return resultado.success ? ETIQUETA_ROL[resultado.data] : rol;
}

export const usuarioSchema = z.object({
  usuario_id: z.string().min(1),
  nombre: z.string().min(1),
  correo: z.string().nullable(),
  rol: rolSchema,
  institucion_id: z.string().nullable(),
  curso_id: z.string().nullable(),
  activo: z.boolean(),
});
export type Usuario = z.infer<typeof usuarioSchema>;

export const miPerfilSchema = usuarioSchema.extend({
  institucion_nombre: z.string().nullable(),
  curso_nombre: z.string().nullable(),
});
export type MiPerfil = z.infer<typeof miPerfilSchema>;

export const editarNombreSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe tu nombre.').max(120, 'Máximo 120 caracteres.'),
});

export const editarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre.').max(120),
  rol: rolSchema,
  institucion_id: z.string().nullable(),
  curso_id: z.string().nullable(),
  activo: z.boolean(),
});
export type EditarUsuario = z.infer<typeof editarUsuarioSchema>;

/** Cuenta que crea el administrador: queda confirmada y con su rol e institución. */
export const crearCuentaSchema = z
  .object({
    nombre: nombrePersonaSchema('Escribe el nombre.'),
    email: correoSchema,
    password: claveNuevaSchema,
    rol: rolSchema,
    institucion_id: z.string().nullable(),
    curso_id: z.string().nullable(),
  })
  .superRefine((valor, ctx) => {
    if (valor.rol !== 'administrador' && !valor.institucion_id) {
      ctx.addIssue({ code: 'custom', path: ['institucion_id'], message: 'Elige la institución: docentes y estudiantes trabajan en una.' });
    }
  });
export type CrearCuentaInput = z.input<typeof crearCuentaSchema>;
export type CrearCuenta = z.output<typeof crearCuentaSchema>;

export function esAdmin(perfil: MiPerfil | undefined) {
  return perfil?.rol === 'administrador';
}

export function esRevisor(perfil: MiPerfil | undefined) {
  return perfil?.rol === 'administrador' || perfil?.rol === 'docente';
}

/** Administrador en cualquier institución; docente solo en la suya (igual que el backend). */
export function gestiona(perfil: MiPerfil | undefined, institucionId: string | null | undefined) {
  if (!perfil || !institucionId) return false;
  return perfil.rol === 'administrador' || (perfil.rol === 'docente' && perfil.institucion_id === institucionId);
}
