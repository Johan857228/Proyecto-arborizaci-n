import { Platform } from 'react-native';
import { z } from 'zod';

import { api, enviarValidado, getValidado, validar } from '@/services/api/client';
import { miPerfilSchema, usuarioSchema, type EditarUsuario, type ImagenPerfil } from '@/features/perfil/schemas';

/** Imagen elegida de la galería, lista para subir. */
export interface ImagenLocal {
  uri: string;
  name: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

async function formularioCon(imagen: ImagenLocal) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const respuesta = await fetch(imagen.uri);
    if (!respuesta.ok) throw new Error('No se pudo leer la imagen seleccionada.');
    form.append('archivo', await respuesta.blob(), imagen.name);
  } else {
    form.append('archivo', { uri: imagen.uri, name: imagen.name, type: imagen.mimeType } as unknown as Blob);
  }
  return form;
}

export const perfilService = {
  miPerfil: () => getValidado('/perfil', miPerfilSchema),

  cambiarMiNombre: (nombre: string) => enviarValidado('patch', '/perfil', { nombre }, miPerfilSchema),

  /** Sube la foto de perfil o la portada del inicio (PUT /perfil/foto o /perfil/portada). */
  cambiarImagen: async (imagen: ImagenPerfil, archivo: ImagenLocal) => {
    const { data } = await api.put<unknown>(`/perfil/${imagen}`, await formularioCon(archivo));
    return validar(miPerfilSchema, data);
  },

  /** Quita la foto de perfil o la portada (el inicio vuelve a la foto del campus). */
  quitarImagen: (imagen: ImagenPerfil) => enviarValidado('delete', `/perfil/${imagen}`, undefined, miPerfilSchema),

  usuarios: (institucionId?: string) => getValidado('/usuarios', z.array(usuarioSchema), { institucion_id: institucionId }),

  editarUsuario: (usuarioId: string, cambios: Partial<EditarUsuario>) =>
    enviarValidado('patch', `/usuarios/${usuarioId}`, cambios, usuarioSchema),
};
