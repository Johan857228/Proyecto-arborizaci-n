import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform } from 'react-native';

import type { FotoLocal } from '@/features/trees/types';

const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const MAX_ADICIONALES = 3;

function isAllowedPhotoType(value: string | null | undefined): value is FotoLocal['mimeType'] {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

/** Selección de fotografías con las reglas del backend: una general, una de detalle y
 *  hasta tres adicionales; JPG, PNG o WebP de máximo 5 MB. En web abre la galería; en
 *  el teléfono, la cámara. */
export function usePhotoPicker() {
  const [photos, setPhotos] = useState<FotoLocal[]>([]);
  const [photoError, setPhotoError] = useState<string>();

  /** Valida y guarda la foto; devuelve la foto guardada o undefined si no cumple las reglas. */
  function savePhoto(tipo: FotoLocal['tipo'], asset: ImagePicker.ImagePickerAsset): FotoLocal | undefined {
    if (tipo === 'adicional' && photos.filter((photo) => photo.tipo === 'adicional').length >= MAX_ADICIONALES) {
      setPhotoError('Puedes agregar hasta tres fotografías adicionales.');
      return;
    }
    const mimeType = asset.mimeType;
    const sizeBytes = asset.fileSize;
    if (!isAllowedPhotoType(mimeType)) {
      setPhotoError('Formato de foto no permitido. Selecciona JPG, PNG o WebP.');
      return;
    }
    if (sizeBytes == null || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FOTO_BYTES) {
      setPhotoError('No se pudo verificar la foto o supera el límite de 5 MB. Selecciona otra.');
      return;
    }
    const nueva: FotoLocal = {
      tipo,
      uri: asset.uri,
      name: asset.fileName ?? `${tipo}-${Date.now()}.${mimeType.split('/')[1].replace('jpeg', 'jpg')}`,
      mimeType,
      sizeBytes,
    };
    setPhotos((current) =>
      tipo === 'adicional' ? [...current, nueva] : [...current.filter((photo) => photo.tipo !== tipo), nueva],
    );
    setPhotoError(undefined);
    return nueva;
  }

  async function pickPhoto(tipo: FotoLocal['tipo']): Promise<FotoLocal | undefined> {
    if (Platform.OS === 'web') {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets[0]) return;
      return savePhoto(tipo, result.assets[0]);
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Permite el acceso a la cámara para tomar evidencia del árbol.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    return savePhoto(tipo, result.assets[0]);
  }

  function removePhoto(photoToRemove: FotoLocal) {
    setPhotos((current) => current.filter((photo) => photo !== photoToRemove));
  }

  return { photos, photoError, setPhotoError, pickPhoto, removePhoto };
}
