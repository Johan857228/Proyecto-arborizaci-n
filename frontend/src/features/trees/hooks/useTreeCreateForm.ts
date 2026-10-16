import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useForm, useWatch } from 'react-hook-form';

import type { Catalogos } from '@/features/catalogs/types';
import { payloadBiotico, valoresBioticosIniciales } from '@/features/inspections/bioticos';
import { useCaptureLocation } from '@/features/trees/hooks/useCaptureLocation';
import { createArbolCreateSchema, fotosRegistroSchema, type ArbolFormInput } from '@/features/trees/schemas';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';

const MAX_FOTO_BYTES = 5 * 1024 * 1024;

const EXTENSIONES_FOTO: Record<FotoLocal['mimeType'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function isAllowedPhotoType(value: string | null | undefined): value is FotoLocal['mimeType'] {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

export function useTreeCreateForm(
  catalogs: Catalogos,
  onSubmit: (values: ArbolCrear, photos: FotoLocal[]) => Promise<void>,
) {
  const [photos, setPhotos] = useState<FotoLocal[]>([]);
  const [formError, setFormError] = useState<string>();
  const gps = useCaptureLocation();
  const schema = useMemo(() => createArbolCreateSchema(catalogs), [catalogs]);
  const { control, handleSubmit, setValue, formState: { errors } } = useForm<ArbolFormInput>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      institucion_id: '',
      zona: 'Patio central',
      zona_otra: '',
      lat: 0,
      lng: 0,
      gps_confirmado: false,
      precision_gps_m: null,
      especie_id: 0,
      dap_cm: undefined,
      altura_m: undefined,
      copa_m: undefined,
      etapa: 'Adulto',
      interferencia: 'Ninguna',
      interferencia_otra: '',
      observaciones: [],
      notas: '',
      ...valoresBioticosIniciales,
    },
  });

  const zonaActual = useWatch({ control, name: 'zona' });
  const interferenciaActual = useWatch({ control, name: 'interferencia' });
  const observacionesActuales = useWatch({ control, name: 'observaciones' }) ?? [];

  async function pickPhoto(tipo: FotoLocal['tipo']) {
    function savePhoto(asset: ImagePicker.ImagePickerAsset) {
      if (tipo === 'adicional' && photos.filter((photo) => photo.tipo === 'adicional').length >= 3) {
        setFormError('Puedes agregar hasta tres fotografías adicionales.');
        return;
      }
      const mimeType = asset.mimeType;
      const sizeBytes = asset.fileSize;
      if (!isAllowedPhotoType(mimeType)) {
        setFormError('Formato de foto no permitido. Selecciona JPG, PNG o WebP.');
        return;
      }
      if (sizeBytes == null || !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FOTO_BYTES) {
        setFormError('No se pudo verificar la foto o supera el límite de 5 MB. Selecciona otra.');
        return;
      }
      setPhotos((current) => {
        if (tipo === 'adicional') {
          return [...current, {
            tipo,
            uri: asset.uri,
            name: asset.fileName ?? `${tipo}-${Date.now()}.${EXTENSIONES_FOTO[mimeType]}`,
            mimeType,
            sizeBytes,
          }];
        }
        return [
          ...current.filter((photo) => photo.tipo !== tipo),
          {
            tipo,
            uri: asset.uri,
            name: asset.fileName ?? `${tipo}-${Date.now()}.${EXTENSIONES_FOTO[mimeType]}`,
            mimeType,
            sizeBytes,
          },
        ];
      });
      setFormError(undefined);
    }

    if (Platform.OS === 'web') {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      savePhoto(result.assets[0]);
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setFormError('Permite el acceso a la cámara para tomar evidencia del árbol.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    savePhoto(result.assets[0]);
  }

  async function updateLocation() {
    const value = await gps.capture();
    if (!value) return;
    setValue('lat', value.lat, { shouldValidate: true });
    setValue('lng', value.lng, { shouldValidate: true });
    setValue('gps_confirmado', true, { shouldValidate: true });
    setValue('precision_gps_m', value.accuracy == null ? null : Math.round(value.accuracy * 10) / 10, { shouldValidate: true });
  }

  function toggleObservation(code: string) {
    const updated = observacionesActuales.includes(code)
      ? observacionesActuales.filter((value) => value !== code)
      : [...observacionesActuales, code];
    setValue('observaciones', updated, { shouldValidate: true });
  }

  function clearObservations() {
    setValue('observaciones', [], { shouldValidate: true });
  }

  function removePhoto(photoToRemove: FotoLocal) {
    setPhotos((current) => current.filter((photo) => photo !== photoToRemove));
  }

  const submit = handleSubmit(async (input) => {
    setFormError(undefined);
    if (!photos.some((photo) => photo.tipo === 'completo')) {
      setFormError('Toma una fotografía general del árbol antes de guardar.');
      return;
    }
    const validPhotos = fotosRegistroSchema.safeParse(photos);
    if (!validPhotos.success) {
      setFormError('Revisa las fotografías: deben ser válidas y respetar los límites permitidos.');
      return;
    }
    const payload: ArbolCrear = {
      institucion_id: input.institucion_id,
      zona: input.zona,
      zona_otra: input.zona === 'Otra' ? input.zona_otra : undefined,
      lat: input.lat,
      lng: input.lng,
      especie_id: input.especie_id,
      dap_cm: input.dap_cm,
      altura_m: input.altura_m,
      copa_m: input.copa_m,
      etapa: input.etapa,
      interferencia: input.interferencia,
      interferencia_otra: input.interferencia === 'Otra infraestructura'
        ? input.interferencia_otra
        : undefined,
      observaciones: input.observaciones,
      precision_gps_m: input.precision_gps_m ?? null,
      notas: input.notas,
      ...payloadBiotico(input),
    };
    await onSubmit(payload, validPhotos.data);
  });

  return {
    control,
    errors,
    formError,
    gps,
    photos,
    zonaActual,
    interferenciaActual,
    observacionesActuales,
    pickPhoto,
    removePhoto,
    updateLocation,
    toggleObservation,
    clearObservations,
    submit,
  };
}
