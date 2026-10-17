import { z } from 'zod';

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
  // URLs firmadas temporales; null si la persona no ha subido foto o portada.
  foto_url: z.string().nullable().default(null),
  portada_url: z.string().nullable().default(null),
});

/** Imágenes propias del perfil: la foto (avatar) y la portada del inicio. */
export type ImagenPerfil = 'foto' | 'portada';
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
