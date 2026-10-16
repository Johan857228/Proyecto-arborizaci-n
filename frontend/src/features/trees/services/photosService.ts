import { Platform } from 'react-native';
import { z } from 'zod';

import { ApiContractError, api, validar } from '@/services/api/client';
import type { FotoLocal } from '@/features/trees/types';
import { fotoLocalSchema } from '@/features/trees/schemas';

const fotoSubidaSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(['completo', 'detalle', 'adicional']),
  storage_path: z.string().min(1),
});

async function uploadTo(path: string, photo: FotoLocal) {
  const validatedPhoto = fotoLocalSchema.safeParse(photo);
  if (!validatedPhoto.success) {
    throw new ApiContractError('La fotografía no cumple los requisitos de formato o tamaño.');
  }
  const safePhoto = validatedPhoto.data;

  const form = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(safePhoto.uri);
    if (!response.ok) {
      throw new Error('No se pudo leer la fotografía seleccionada.');
    }
    const blob = await response.blob();
    if (blob.size !== safePhoto.sizeBytes || blob.type !== safePhoto.mimeType) {
      throw new ApiContractError('La fotografía cambió o no coincide con el formato y tamaño validados.');
    }
    form.append('archivo', blob, safePhoto.name);
  } else {
    form.append('archivo', {
      uri: safePhoto.uri,
      name: safePhoto.name,
      type: safePhoto.mimeType,
    } as unknown as Blob);
  }
  const { data } = await api.post<unknown>(path, form, {
    params: { tipo: safePhoto.tipo },
  });
  return validar(fotoSubidaSchema, data);
}

export const photosService = {
  /** Foto de registro del árbol (POST /arboles/{id}/fotos). */
  upload: (treeId: string, photo: FotoLocal) => uploadTo(`/arboles/${treeId}/fotos`, photo),
  /** Cualquier endpoint de fotos (p. ej. /inspecciones/{id}/fotos). */
  uploadTo,
};
