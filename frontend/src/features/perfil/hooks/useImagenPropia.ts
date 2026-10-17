import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import { useImagenPerfil } from '@/features/perfil/hooks/usePerfil';
import type { ImagenPerfil } from '@/features/perfil/schemas';
import type { ImagenLocal } from '@/features/perfil/services/perfilService';
import { getApiErrorMessage } from '@/services/api/client';

const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS: Record<string, ImagenLocal['mimeType']> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};
const POR_EXTENSION: Record<string, ImagenLocal['mimeType']> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// La foto de perfil se recorta cuadrada y la portada en formato panorámico, como se muestran.
const ASPECTO: Record<ImagenPerfil, [number, number]> = { foto: [1, 1], portada: [16, 9] };

function tipoDe(asset: ImagePicker.ImagePickerAsset): ImagenLocal['mimeType'] | undefined {
  if (asset.mimeType) return TIPOS[asset.mimeType.toLowerCase()];
  const extension = (asset.fileName ?? asset.uri).split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return POR_EXTENSION[extension];
}

/** Elegir de la galería, subir o quitar la foto de perfil o la portada, con los mismos límites del
 *  backend (JPG, PNG o WebP de máximo 5 MB). */
export function useImagenPropia(imagen: ImagenPerfil) {
  const mutacion = useImagenPerfil(imagen);
  const [error, setError] = useState<string>();

  async function elegir() {
    setError(undefined);
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: ASPECTO[imagen],
      quality: 0.8,
    });
    if (resultado.canceled || !resultado.assets[0]) return;
    const asset = resultado.assets[0];
    const mimeType = tipoDe(asset);
    if (!mimeType) {
      setError('Formato no permitido. Elige una imagen JPG, PNG o WebP.');
      return;
    }
    if (asset.fileSize != null && asset.fileSize > MAX_BYTES) {
      setError('La imagen supera el máximo de 5 MB. Elige otra.');
      return;
    }
    const extension = mimeType.split('/')[1].replace('jpeg', 'jpg');
    try {
      await mutacion.mutateAsync({ uri: asset.uri, name: asset.fileName ?? `${imagen}.${extension}`, mimeType });
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  async function quitar() {
    setError(undefined);
    try {
      await mutacion.mutateAsync(null);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return { elegir, quitar, cargando: mutacion.isPending, error, limpiarError: () => setError(undefined) };
}
