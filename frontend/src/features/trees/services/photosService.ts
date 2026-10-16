import { ApiContractError, api } from '@/services/api/client';
import type { FotoLocal } from '@/features/trees/types';
import { fotoLocalSchema } from '@/features/trees/schemas';
import { Platform } from 'react-native';

export const photosService = {
  async upload(treeId: string, photo: FotoLocal) {
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
    const { data } = await api.post(`/arboles/${treeId}/fotos`, form, {
      params: { tipo: safePhoto.tipo },
    });
    return data;
  },
};