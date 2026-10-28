import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { z } from 'zod';

import { useAuthStore } from '@/features/auth/store';
import {
  consentimientoSchema,
  estadoPrivacidadSchema,
  estudianteConsentimientoSchema,
  solicitudSchema,
  type FirmaValores,
  type TipoSolicitud,
} from '@/features/privacidad/schemas';
import { api, enviarValidado, getValidado, validar } from '@/services/api/client';

export interface FotoFormato {
  uri: string;
  name: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export const privacidadService = {
  estado: () => getValidado('/privacidad/estado', estadoPrivacidadSchema),
  aceptarPolitica: () => enviarValidado('post', '/privacidad/politica', undefined, estadoPrivacidadSchema),
  cambiarAlias: (alias: string | null) => enviarValidado('put', '/privacidad/alias', { alias }, estadoPrivacidadSchema),
  firmar: (valores: FirmaValores, usuarioId?: string) =>
    enviarValidado('post', '/privacidad/consentimientos', {
      ...valores,
      acudiente_contacto: valores.acudiente_contacto || null,
      usuario_id: usuarioId ?? null,
    }, consentimientoSchema),
  subirFormato: async (datos: Omit<FirmaValores, 'firma' | 'autoriza_tratamiento'> & { usuarioId: string }, foto: FotoFormato) => {
    const form = new FormData();
    form.append('usuario_id', datos.usuarioId);
    form.append('acudiente_nombre', datos.acudiente_nombre);
    form.append('acudiente_documento', datos.acudiente_documento);
    form.append('parentesco', datos.parentesco);
    form.append('estudiante_escuchado', String(datos.estudiante_escuchado));
    if (datos.acudiente_contacto) form.append('acudiente_contacto', datos.acudiente_contacto);
    if (Platform.OS === 'web') {
      const respuesta = await fetch(foto.uri);
      form.append('archivo', await respuesta.blob(), foto.name);
    } else {
      form.append('archivo', { uri: foto.uri, name: foto.name, type: foto.mimeType } as unknown as Blob);
    }
    const { data } = await api.post<unknown>('/privacidad/consentimientos/documento', form);
    return validar(consentimientoSchema, data);
  },
  revocar: (id: string) => enviarValidado('post', `/privacidad/consentimientos/${id}/revocar`, undefined, consentimientoSchema),
  estudiantes: (institucionId?: string) =>
    getValidado('/privacidad/estudiantes', z.array(estudianteConsentimientoSchema), { institucion_id: institucionId }),
  misDatos: async () => (await api.get<unknown>('/privacidad/mis-datos')).data,
  solicitudes: (alcance: 'mias' | 'institucion', institucionId?: string) =>
    getValidado('/privacidad/solicitudes', z.array(solicitudSchema), { alcance, institucion_id: institucionId }),
  crearSolicitud: (tipo: TipoSolicitud, detalle: string) =>
    enviarValidado('post', '/privacidad/solicitudes', { tipo, detalle }, solicitudSchema),
  responder: (id: string, estado: 'atendida' | 'rechazada', respuesta: string) =>
    enviarValidado('patch', `/privacidad/solicitudes/${id}`, { estado, respuesta }, solicitudSchema),
  anonimizar: async (usuarioId: string) => {
    await api.post(`/privacidad/anonimizar/${usuarioId}`);
  },
};

const claves = {
  estado: (uid?: string) => ['privacidad', 'estado', uid] as const,
  estudiantes: (institucionId?: string) => ['privacidad', 'estudiantes', institucionId ?? 'propia'] as const,
  solicitudes: (alcance: string, institucionId?: string) => ['privacidad', 'solicitudes', alcance, institucionId ?? 'propia'] as const,
};

export function usePrivacidad() {
  const uid = useAuthStore((state) => state.session?.user_id);
  return useQuery({ queryKey: claves.estado(uid), queryFn: privacidadService.estado, enabled: Boolean(uid), staleTime: 5 * 60_000 });
}

/** Cualquier cambio de privacidad refresca el estado, las listas y los rankings (alias). */
function useRefrescarPrivacidad() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['privacidad'] }),
    queryClient.invalidateQueries({ queryKey: ['gamificacion'] }),
  ]);
}

export function useAceptarPolitica() {
  const refrescar = useRefrescarPrivacidad();
  return useMutation({ mutationFn: privacidadService.aceptarPolitica, onSuccess: refrescar });
}

export function useCambiarAlias() {
  const refrescar = useRefrescarPrivacidad();
  return useMutation({ mutationFn: privacidadService.cambiarAlias, onSuccess: refrescar });
}

export function useFirmar() {
  const refrescar = useRefrescarPrivacidad();
  return useMutation({
    mutationFn: ({ valores, usuarioId }: { valores: FirmaValores; usuarioId?: string }) => privacidadService.firmar(valores, usuarioId),
    onSuccess: refrescar,
  });
}

export function useSubirFormato() {
  const refrescar = useRefrescarPrivacidad();
  return useMutation({
    mutationFn: ({ datos, foto }: { datos: Parameters<typeof privacidadService.subirFormato>[0]; foto: FotoFormato }) =>
      privacidadService.subirFormato(datos, foto),
    onSuccess: refrescar,
  });
}

export function useRevocar() {
  const refrescar = useRefrescarPrivacidad();
  return useMutation({ mutationFn: privacidadService.revocar, onSuccess: refrescar });
}

export function useEstudiantesConsentimiento(institucionId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: claves.estudiantes(institucionId), queryFn: () => privacidadService.estudiantes(institucionId), enabled });
}

export function useSolicitudes(alcance: 'mias' | 'institucion', institucionId?: string, enabled = true) {
  return useQuery({ queryKey: claves.solicitudes(alcance, institucionId), queryFn: () => privacidadService.solicitudes(alcance, institucionId), enabled });
}

export function useCrearSolicitud() {
  const refrescar = useRefrescarPrivacidad();
  return useMutation({
    mutationFn: ({ tipo, detalle }: { tipo: TipoSolicitud; detalle: string }) => privacidadService.crearSolicitud(tipo, detalle),
    onSuccess: refrescar,
  });
}

export function useResponderSolicitud() {
  const refrescar = useRefrescarPrivacidad();
  return useMutation({
    mutationFn: ({ id, estado, respuesta }: { id: string; estado: 'atendida' | 'rechazada'; respuesta: string }) =>
      privacidadService.responder(id, estado, respuesta),
    onSuccess: refrescar,
  });
}

export function useAnonimizar() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: privacidadService.anonimizar, onSuccess: () => queryClient.invalidateQueries() });
}
