import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth/store';
import type { EditarUsuario, ImagenPerfil, MiPerfil } from '@/features/perfil/schemas';
import { perfilService, type ImagenLocal } from '@/features/perfil/services/perfilService';

export function useMiPerfil() {
  const userId = useAuthStore((state) => state.session?.user_id);
  return useQuery({
    queryKey: ['perfil', userId],
    queryFn: perfilService.miPerfil,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
}

export function useUsuarios(institucionId?: string, enabled = true) {
  return useQuery({
    queryKey: ['usuarios', institucionId ?? 'todas'],
    queryFn: () => perfilService.usuarios(institucionId),
    enabled,
  });
}

/** Cuentas que ya iniciaron sesión pero no tienen institución (solo las ve el administrador):
 *  el perfil se crea solo al entrar por primera vez y el administrador debe asignarla. */
export function useCuentasSinInstitucion(enabled: boolean) {
  const usuarios = useUsuarios(undefined, enabled);
  return enabled ? (usuarios.data ?? []).filter((u) => !u.institucion_id).length : 0;
}

/** Después de cualquier cambio se refrescan todas las consultas activas: los módulos
 *  comparten datos (estado de árboles, puntos, avance de cursos, presupuestos…). */
export function useRefrescarTodo() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

export function useEditarUsuario() {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: ({ usuarioId, cambios }: { usuarioId: string; cambios: Partial<EditarUsuario> }) =>
      perfilService.editarUsuario(usuarioId, cambios),
    onSuccess: refrescar,
  });
}

export function useCambiarMiNombre() {
  const refrescar = useRefrescarTodo();
  return useMutation({ mutationFn: perfilService.cambiarMiNombre, onSuccess: refrescar });
}

/** Cambia (con una imagen) o quita (con null) la foto de perfil o la portada. El perfil que
 *  devuelve el backend reemplaza al de la caché, así la imagen nueva aparece enseguida. */
export function useImagenPerfil(imagen: ImagenPerfil) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user_id);
  return useMutation({
    mutationFn: (archivo: ImagenLocal | null) =>
      archivo ? perfilService.cambiarImagen(imagen, archivo) : perfilService.quitarImagen(imagen),
    onSuccess: (perfil: MiPerfil) => queryClient.setQueryData(['perfil', userId], perfil),
  });
}
