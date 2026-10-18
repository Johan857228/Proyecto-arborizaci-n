import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import {
  actividadSchema,
  certificadoSchema,
  descargaSchema,
  parametrosSchema,
  resumenCortoSchema,
  resumenSchema,
  type ActividadForm,
} from '@/features/servicio/schemas';
import { adjuntarFoto } from '@/features/trees/services/photosService';
import type { FotoLocal } from '@/features/trees/types';
import { api, enviarValidado, getValidado, validar } from '@/services/api/client';
import { abrirDescarga } from '@/shared/utils/descarga';

export interface NuevaActividad extends ActividadForm {
  lat?: number | null;
  lng?: number | null;
}

export const servicioService = {
  resumen: (estudianteId?: string) => getValidado('/servicio-social/resumen', resumenSchema, { estudiante_id: estudianteId }),
  registrar: (datos: NuevaActividad) => enviarValidado('post', '/servicio-social/actividades', datos, actividadSchema),
  async subirFoto(actividadId: string, foto: FotoLocal) {
    const form = new FormData();
    await adjuntarFoto(form, 'archivo', foto);
    const { data } = await api.post<unknown>(`/servicio-social/actividades/${actividadId}/foto`, form);
    return validar(actividadSchema, data);
  },
  estudiantes: (institucionId?: string, cursoId?: string) =>
    getValidado('/servicio-social/estudiantes', z.array(resumenCortoSchema), { institucion_id: institucionId, curso_id: cursoId }),
  pendientes: (institucionId?: string) =>
    getValidado('/servicio-social/actividades/pendientes', z.array(actividadSchema), { institucion_id: institucionId }),
  revisar: (actividadId: string, accion: 'aprobar' | 'rechazar', texto?: string) =>
    enviarValidado(
      'post',
      `/servicio-social/actividades/${actividadId}/${accion}`,
      accion === 'aprobar' ? { comentario: texto || null } : { motivo: texto },
      actividadSchema,
    ),
  parametros: (institucionId: string) => getValidado(`/servicio-social/parametros/${institucionId}`, parametrosSchema),
  guardarParametros: (institucionId: string, valores: { meta_horas: number; horas_por_inspeccion: number }) =>
    enviarValidado('put', `/servicio-social/parametros/${institucionId}`, valores, parametrosSchema),
  certificados: (institucionId?: string) =>
    getValidado('/servicio-social/certificados', z.array(certificadoSchema), { institucion_id: institucionId }),
  emitir: (datos: { estudiante_id: string; firmante_nombre: string; firmante_cargo: string; autorizado_por_rectoria: boolean }) =>
    enviarValidado('post', '/servicio-social/certificados', datos, certificadoSchema),
  descarga: (certificadoId: string) => getValidado(`/servicio-social/certificados/${certificadoId}/descarga`, descargaSchema),
  anular: (certificadoId: string, motivo: string) =>
    enviarValidado('post', `/servicio-social/certificados/${certificadoId}/anular`, { motivo }, certificadoSchema),
};

function useRefrescarServicio() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['servicio'] });
}

export function useResumenServicio(estudianteId?: string, enabled = true) {
  return useQuery({
    queryKey: ['servicio', 'resumen', estudianteId ?? 'propio'],
    queryFn: () => servicioService.resumen(estudianteId),
    enabled,
  });
}

/** Registra la actividad y luego su foto. Si la foto falla, la actividad queda guardada y se avisa. */
export function useRegistrarActividad() {
  const refrescar = useRefrescarServicio();
  return useMutation({
    mutationFn: async ({ datos, foto }: { datos: NuevaActividad; foto: FotoLocal }) => {
      const actividad = await servicioService.registrar(datos);
      try {
        return { actividad: await servicioService.subirFoto(actividad.id, foto) };
      } catch (fotoError) {
        return { actividad, fotoError };
      }
    },
    onSuccess: refrescar,
  });
}

export function useSubirFotoActividad() {
  const refrescar = useRefrescarServicio();
  return useMutation({
    mutationFn: ({ actividadId, foto }: { actividadId: string; foto: FotoLocal }) => servicioService.subirFoto(actividadId, foto),
    onSuccess: refrescar,
  });
}

export function useEstudiantesServicio(institucionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['servicio', 'estudiantes', institucionId ?? 'propia'],
    queryFn: () => servicioService.estudiantes(institucionId),
    enabled,
  });
}

export function usePendientesServicio(institucionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['servicio', 'pendientes', institucionId ?? 'propia'],
    queryFn: () => servicioService.pendientes(institucionId),
    enabled,
  });
}

export function useRevisarActividad() {
  const refrescar = useRefrescarServicio();
  return useMutation({
    mutationFn: ({ actividadId, accion, texto }: { actividadId: string; accion: 'aprobar' | 'rechazar'; texto?: string }) =>
      servicioService.revisar(actividadId, accion, texto),
    onSuccess: refrescar,
  });
}

export function useParametrosServicio(institucionId: string | undefined) {
  return useQuery({
    queryKey: ['servicio', 'parametros', institucionId],
    queryFn: () => servicioService.parametros(institucionId as string),
    enabled: Boolean(institucionId),
  });
}

export function useGuardarParametros(institucionId: string) {
  const refrescar = useRefrescarServicio();
  return useMutation({
    mutationFn: (valores: { meta_horas: number; horas_por_inspeccion: number }) => servicioService.guardarParametros(institucionId, valores),
    onSuccess: refrescar,
  });
}

export function useCertificados(institucionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['servicio', 'certificados', institucionId ?? 'propia'],
    queryFn: () => servicioService.certificados(institucionId),
    enabled,
  });
}

export function useEmitirCertificado() {
  const refrescar = useRefrescarServicio();
  return useMutation({ mutationFn: servicioService.emitir, onSuccess: refrescar });
}

export function useAnularCertificado() {
  const refrescar = useRefrescarServicio();
  return useMutation({
    mutationFn: ({ certificadoId, motivo }: { certificadoId: string; motivo: string }) => servicioService.anular(certificadoId, motivo),
    onSuccess: refrescar,
  });
}

/** Pide el enlace temporal del PDF y lo abre. */
export function useDescargarCertificado() {
  return useMutation({
    mutationFn: async (certificadoId: string) => {
      const descarga = await servicioService.descarga(certificadoId);
      await abrirDescarga(descarga.url);
      return descarga;
    },
  });
}
