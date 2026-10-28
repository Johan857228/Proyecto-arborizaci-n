import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { descargaSchema, informeSchema, tableroSchema, territorioSchema, type TipoTerritorio } from '@/features/territorial/schemas';
import { api, enviarValidado, getValidado } from '@/services/api/client';
import { abrirDescarga } from '@/shared/utils/descarga';

export interface DatosTerritorio {
  nombre: string;
  tipo: TipoTerritorio;
  divipolas: string[];
  institucion_ids: string[];
}

export const territorialService = {
  territorios: () => getValidado('/territorial/territorios', z.array(territorioSchema)),
  tablero: (territorioId: string | undefined, anio: number) =>
    getValidado('/territorial/tablero', tableroSchema, { territorio_id: territorioId, anio }),
  crear: (datos: DatosTerritorio) => enviarValidado('post', '/territorial/territorios', datos, territorioSchema),
  editar: (id: string, datos: Partial<DatosTerritorio>) => enviarValidado('patch', `/territorial/territorios/${id}`, datos, territorioSchema),
  borrar: async (id: string) => {
    await api.delete(`/territorial/territorios/${id}`);
  },
  miembros: (id: string, usuarioIds: string[]) =>
    enviarValidado('put', `/territorial/territorios/${id}/miembros`, { usuario_ids: usuarioIds }, territorioSchema),
  informe: (territorioId: string, anio: number) => getValidado('/territorial/informe', informeSchema, { territorio_id: territorioId, anio }),
  guardarInforme: (datos: { territorio_id: string; anio: number; secciones: Record<string, string>; estado: 'borrador' | 'final' }) =>
    enviarValidado('put', '/territorial/informe', datos, informeSchema),
  archivo: (datos: { territorio_id: string; anio: number; formato: 'pdf' | 'docx' }) =>
    enviarValidado('post', '/territorial/informe/archivo', datos, descargaSchema),
};

// La raíz 'territorial' se guarda en el teléfono: el tablero se consulta sin señal.
export function useTerritorios(enabled = true) {
  return useQuery({ queryKey: ['territorial', 'territorios'], queryFn: territorialService.territorios, enabled });
}

export function useTablero(territorioId: string | undefined, anio: number, enabled = true) {
  return useQuery({
    queryKey: ['territorial', 'tablero', territorioId ?? 'todas', anio],
    queryFn: () => territorialService.tablero(territorioId, anio),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useInforme(territorioId: string | undefined, anio: number) {
  return useQuery({
    queryKey: ['territorial', 'informe', territorioId, anio],
    queryFn: () => territorialService.informe(territorioId as string, anio),
    enabled: Boolean(territorioId),
  });
}

function useRefrescar() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['territorial'] });
}

export function useGuardarTerritorio() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: string; datos: DatosTerritorio }) => (id ? territorialService.editar(id, datos) : territorialService.crear(datos)),
    onSuccess: refrescar,
  });
}

export function useBorrarTerritorio() {
  const refrescar = useRefrescar();
  return useMutation({ mutationFn: territorialService.borrar, onSuccess: refrescar });
}

export function useMiembros() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ id, usuarioIds }: { id: string; usuarioIds: string[] }) => territorialService.miembros(id, usuarioIds),
    onSuccess: refrescar,
  });
}

export function useGuardarInforme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: territorialService.guardarInforme,
    onSuccess: (informe) => queryClient.setQueryData(['territorial', 'informe', informe.territorio_id, informe.anio], informe),
  });
}

export function useArchivoInforme() {
  return useMutation({
    mutationFn: async (datos: { territorio_id: string; anio: number; formato: 'pdf' | 'docx' }) => {
      const archivo = await territorialService.archivo(datos);
      await abrirDescarga(archivo.url);
      return archivo;
    },
  });
}
