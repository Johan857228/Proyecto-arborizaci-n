import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { especieOrigenSchema, mapaSchema, type Origen } from '@/features/mapa/schemas';
import { guardarZona, leerZonas, olvidarZona } from '@/features/mapa/teselas';
import type { Limites } from '@/features/mapa/geo';
import { enviarValidado, getValidado } from '@/services/api/client';

export const mapaService = {
  ver: (institucionId?: string) => getValidado('/mapa', mapaSchema, { institucion_id: institucionId }),
  clasificar: (especieId: number, origen: Origen | null) =>
    enviarValidado('patch', `/especies/${especieId}`, { origen }, especieOrigenSchema),
};

/** Capas del mapa. La raíz 'mapa' se guarda en el teléfono para verlo sin conexión. */
export function useMapa(institucionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['mapa', institucionId ?? 'propia'],
    queryFn: () => mapaService.ver(institucionId),
    enabled,
    staleTime: 60_000,
  });
}

export function useClasificarEspecie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ especieId, origen }: { especieId: number; origen: Origen | null }) => mapaService.clasificar(especieId, origen),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mapa'] });
      void queryClient.invalidateQueries({ queryKey: ['catalogs'] });
    },
  });
}

// Las zonas guardadas viven en el teléfono: se leen aunque no haya conexión.
export function useZonasGuardadas() {
  return useQuery({ queryKey: ['zonas-mapa'], queryFn: leerZonas, networkMode: 'always', staleTime: Infinity });
}

export function useGuardarZona(alAvanzar: (hechas: number, total: number) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ clave, nombre, limites, zoom }: { clave: string; nombre: string; limites: Limites; zoom: number }) =>
      guardarZona(clave, nombre, limites, zoom, alAvanzar),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['zonas-mapa'] }),
  });
}

export function useOlvidarZona() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: olvidarZona,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['zonas-mapa'] }),
  });
}
