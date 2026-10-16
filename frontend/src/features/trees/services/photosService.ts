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

/** Valida la foto y la agrega al formulario multipart con el nombre de campo indicado.
 *  Devuelve la foto validada. */
export async function adjuntarFoto(form: FormData, campo: string, photo: FotoLocal) {
  const validatedPhoto = fotoLocalSchema.safeParse(photo);
  if (!validatedPhoto.success) {
    throw new ApiContractError('La fotografía no cumple los requisitos de formato o tamaño.');
  }
  const safePhoto = validatedPhoto.data;

  if (Platform.OS === 'web') {
    const response = await fetch(safePhoto.uri);
    if (!response.ok) {
      throw new Error('No se pudo leer la fotografía seleccionada.');
    }
    const blob = await response.blob();
    if (blob.size !== safePhoto.sizeBytes || blob.type !== safePhoto.mimeType) {
      throw new ApiContractError('La fotografía cambió o no coincide con el formato y tamaño validados.');
    }
    form.append(campo, blob, safePhoto.name);
  } else {
    form.append(campo, {
      uri: safePhoto.uri,
      name: safePhoto.name,
      type: safePhoto.mimeType,
    } as unknown as Blob);
  }
  return safePhoto;
}

async function uploadTo(path: string, photo: FotoLocal) {
  const form = new FormData();
  const safePhoto = await adjuntarFoto(form, 'archivo', photo);
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
