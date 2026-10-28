import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { catalogoSchema, especieCatalogoSchema, type Catalogo, type EspecieCatalogo } from '@/features/especies/schemas';
import { enviarValidado, getValidado } from '@/services/api/client';

export const especiesService = {
  catalogo: () => getValidado('/especies/catalogo', catalogoSchema),
  consultar: (id: number) => enviarValidado('post', `/especies/${id}/fuente-oficial`, {}, especieCatalogoSchema),
  veda: (id: number, veda: string | null, vedaUrl: string | null) =>
    enviarValidado('put', `/especies/${id}/veda`, { veda, veda_url: vedaUrl }, especieCatalogoSchema),
};

const CLAVE = ['especies', 'catalogo'] as const;

export function useCatalogoEspecies() {
  return useQuery({ queryKey: CLAVE, queryFn: especiesService.catalogo, staleTime: 10 * 60_000 });
}

/** Pone la especie actualizada en la lista (conserva el conteo de árboles, que no cambia). */
function useActualizarEnLista() {
  const queryClient = useQueryClient();
  return (nueva: EspecieCatalogo) => {
    queryClient.setQueryData<Catalogo>(CLAVE, (actual) =>
      actual && {
        ...actual,
        especies: actual.especies.map((e) => (e.id === nueva.id ? { ...nueva, arboles: e.arboles } : e)),
      },
    );
  };
}

/** Al terminar (una o varias consultas) se recalcula el resumen y se refrescan los catálogos
 *  del registro y del mapa, que usan el origen y las marcas de la ficha. */
export function useRefrescarCatalogo() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: CLAVE });
    void queryClient.invalidateQueries({ queryKey: ['catalogs'] });
    void queryClient.invalidateQueries({ queryKey: ['mapa'] });
  };
}

export function useConsultarFuente() {
  const actualizar = useActualizarEnLista();
  return useMutation({ mutationFn: especiesService.consultar, onSuccess: actualizar });
}

export function useRegistrarVeda() {
  const actualizar = useActualizarEnLista();
  const refrescar = useRefrescarCatalogo();
  return useMutation({
    mutationFn: ({ id, veda, vedaUrl }: { id: number; veda: string | null; vedaUrl: string | null }) => especiesService.veda(id, veda, vedaUrl),
    onSuccess: (nueva) => {
      actualizar(nueva);
      refrescar();
    },
  });
}
