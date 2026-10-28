import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import {
  accionSchema,
  anioSchema,
  descargaSchema,
  evaluacionSchema,
  evidenciaSchema,
  indicadoresSchema,
  praeSchema,
  type EstadoAccion,
  type Instancia,
  type Tema,
  type TipoEvidencia,
} from '@/features/prae/schemas';
import { adjuntarFoto } from '@/features/trees/services/photosService';
import type { FotoLocal } from '@/features/trees/types';
import { api, enviarValidado, getValidado, validar } from '@/services/api/client';
import { abrirDescarga } from '@/shared/utils/descarga';

export interface CambiosPrae {
  tema?: Tema;
  tema_otro?: string | null;
  titulo?: string;
  problema?: string;
  diagnostico?: string | null;
  objetivo_general?: string | null;
  objetivos_especificos?: string[];
  comite?: string | null;
}

export interface DatosAccion {
  titulo?: string;
  descripcion?: string | null;
  responsable?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  estado?: EstadoAccion;
  indicador?: string | null;
  meta?: string | null;
}

export interface DatosEvidencia {
  tipo: TipoEvidencia;
  titulo: string;
  descripcion: string | null;
  url: string | null;
  fecha: string;
  accion_id: string | null;
}

export interface DatosEvaluacion {
  instancia: Instancia;
  fecha: string;
  acta: string | null;
  cumplimiento_pct: number | null;
  logros: string | null;
  dificultades: string | null;
  recomendaciones: string | null;
  participantes: string | null;
}

export const praeService = {
  ver: (institucionId: string | undefined, anio: number) =>
    getValidado('/prae', praeSchema.nullable(), { institucion_id: institucionId, anio }),
  anios: (institucionId?: string) => getValidado('/prae/anios', z.array(anioSchema), { institucion_id: institucionId }),
  crear: (datos: { institucion_id: string; anio: number; tema: Tema; tema_otro: string | null; titulo: string; problema: string }) =>
    enviarValidado('post', '/prae', datos, praeSchema),
  editar: (id: string, cambios: CambiosPrae) => enviarValidado('patch', `/prae/${id}`, cambios, praeSchema),
  copiar: (id: string, anio: number) => enviarValidado('post', `/prae/${id}/copiar`, { anio }, praeSchema),
  crearAccion: (praeId: string, datos: DatosAccion) => enviarValidado('post', `/prae/${praeId}/acciones`, datos, accionSchema),
  editarAccion: (id: string, cambios: DatosAccion) => enviarValidado('patch', `/prae/acciones/${id}`, cambios, accionSchema),
  borrarAccion: async (id: string) => {
    await api.delete(`/prae/acciones/${id}`);
  },
  crearEvidencia: (praeId: string, datos: DatosEvidencia) => enviarValidado('post', `/prae/${praeId}/evidencias`, datos, evidenciaSchema),
  async subirFoto(evidenciaId: string, foto: FotoLocal) {
    const form = new FormData();
    await adjuntarFoto(form, 'archivo', foto);
    const { data } = await api.post<unknown>(`/prae/evidencias/${evidenciaId}/foto`, form);
    return validar(evidenciaSchema, data);
  },
  borrarEvidencia: async (id: string) => {
    await api.delete(`/prae/evidencias/${id}`);
  },
  crearEvaluacion: (praeId: string, datos: DatosEvaluacion) => enviarValidado('post', `/prae/${praeId}/evaluaciones`, datos, evaluacionSchema),
  borrarEvaluacion: async (id: string) => {
    await api.delete(`/prae/evaluaciones/${id}`);
  },
  indicadores: (praeId: string) => getValidado(`/prae/${praeId}/indicadores`, indicadoresSchema),
  informe: (praeId: string) => enviarValidado('post', `/prae/${praeId}/informe`, {}, descargaSchema),
};

function useRefrescarPrae() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['prae'] });
}

export function usePrae(institucionId: string | undefined, anio: number, enabled = true) {
  return useQuery({
    queryKey: ['prae', institucionId ?? 'propia', anio],
    queryFn: () => praeService.ver(institucionId, anio),
    enabled,
  });
}

export function useAniosPrae(institucionId: string | undefined, enabled = true) {
  return useQuery({ queryKey: ['prae', 'anios', institucionId ?? 'propia'], queryFn: () => praeService.anios(institucionId), enabled });
}

export function useIndicadoresPrae(praeId: string | undefined) {
  return useQuery({
    queryKey: ['prae', 'indicadores', praeId],
    queryFn: () => praeService.indicadores(praeId as string),
    enabled: Boolean(praeId),
    staleTime: 5 * 60_000,
  });
}

/** Una mutación del PRAE que al terminar refresca el expediente. */
function useAccionPrae<A, R>(fn: (args: A) => Promise<R>) {
  const refrescar = useRefrescarPrae();
  return useMutation({ mutationFn: fn, onSuccess: refrescar });
}

export const useCrearPrae = () => useAccionPrae(praeService.crear);
export const useEditarPrae = () => useAccionPrae(({ id, cambios }: { id: string; cambios: CambiosPrae }) => praeService.editar(id, cambios));
export const useCopiarPrae = () => useAccionPrae(({ id, anio }: { id: string; anio: number }) => praeService.copiar(id, anio));
export const useCrearAccion = () => useAccionPrae(({ praeId, datos }: { praeId: string; datos: DatosAccion }) => praeService.crearAccion(praeId, datos));
export const useEditarAccion = () => useAccionPrae(({ id, cambios }: { id: string; cambios: DatosAccion }) => praeService.editarAccion(id, cambios));
export const useBorrarAccion = () => useAccionPrae(praeService.borrarAccion);
export const useBorrarEvidencia = () => useAccionPrae(praeService.borrarEvidencia);
export const useCrearEvaluacion = () =>
  useAccionPrae(({ praeId, datos }: { praeId: string; datos: DatosEvaluacion }) => praeService.crearEvaluacion(praeId, datos));
export const useBorrarEvaluacion = () => useAccionPrae(praeService.borrarEvaluacion);

/** Crea la evidencia y, si es una foto, la sube. Si la foto falla, la evidencia queda y se avisa. */
export function useCrearEvidencia() {
  return useAccionPrae(async ({ praeId, datos, foto }: { praeId: string; datos: DatosEvidencia; foto?: FotoLocal }) => {
    const evidencia = await praeService.crearEvidencia(praeId, datos);
    if (!foto) return { evidencia };
    try {
      return { evidencia: await praeService.subirFoto(evidencia.id, foto) };
    } catch (fotoError) {
      return { evidencia, fotoError };
    }
  });
}

export function useInformePrae() {
  return useMutation({
    mutationFn: async (praeId: string) => {
      const descarga = await praeService.informe(praeId);
      await abrirDescarga(descarga.url);
      return descarga;
    },
  });
}
