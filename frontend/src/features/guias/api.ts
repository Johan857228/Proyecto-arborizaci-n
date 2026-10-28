import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { claseSchema, fichaSchema, guiaResumenSchema, guiaSchema } from '@/features/guias/schemas';
import { api, enviarValidado, getValidado } from '@/services/api/client';
import { abrirDescarga } from '@/shared/utils/descarga';

export interface DatosClase {
  guia_id: string;
  fecha: string;
  curso_id: string | null;
  asistentes: number | null;
  notas: string | null;
  institucion_id?: string;
}

export const guiasService = {
  listar: (institucionId?: string) => getValidado('/guias', z.array(guiaResumenSchema), { institucion_id: institucionId }),
  ver: (id: string, institucionId?: string) => getValidado(`/guias/${id}`, guiaSchema, { institucion_id: institucionId }),
  clases: (institucionId?: string) => getValidado('/guias/clases', z.array(claseSchema), { institucion_id: institucionId }),
  registrar: (datos: DatosClase) => enviarValidado('post', '/guias/clases', datos, claseSchema),
  borrar: async (id: string) => {
    await api.delete(`/guias/clases/${id}`);
  },
  ficha: (id: string, datos: { curso_id?: string | null; semilla?: number; institucion_id?: string }) =>
    enviarValidado('post', `/guias/${id}/ficha`, datos, fichaSchema),
};

// La raíz 'guias' se guarda en el teléfono: las guías se leen sin conexión.
export function useGuias(institucionId?: string, enabled = true) {
  return useQuery({ queryKey: ['guias', 'lista', institucionId ?? 'propia'], queryFn: () => guiasService.listar(institucionId), enabled });
}

export function useGuia(id: string, institucionId?: string, enabled = true) {
  return useQuery({ queryKey: ['guias', 'detalle', id, institucionId ?? 'propia'], queryFn: () => guiasService.ver(id, institucionId), enabled });
}

export function useClases(institucionId?: string, enabled = true) {
  return useQuery({ queryKey: ['guias', 'clases', institucionId ?? 'propia'], queryFn: () => guiasService.clases(institucionId), enabled });
}

function useRefrescarGuias() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['guias'] });
    void queryClient.invalidateQueries({ queryKey: ['prae'] });
  };
}

export function useRegistrarClase() {
  const refrescar = useRefrescarGuias();
  return useMutation({ mutationFn: guiasService.registrar, onSuccess: refrescar });
}

export function useBorrarClase() {
  const refrescar = useRefrescarGuias();
  return useMutation({ mutationFn: guiasService.borrar, onSuccess: refrescar });
}

/** Genera la ficha en el servidor y abre la descarga. */
export function useFicha() {
  return useMutation({
    mutationFn: async ({ id, ...datos }: { id: string; curso_id?: string | null; semilla?: number; institucion_id?: string }) => {
      const ficha = await guiasService.ficha(id, datos);
      await abrirDescarga(ficha.url);
      return ficha;
    },
  });
}
