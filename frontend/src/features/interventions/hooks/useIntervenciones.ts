import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import type { EstadoIntervencion } from '@/features/interventions/schemas';
import { intervencionesService, type NuevaIntervencion } from '@/features/interventions/services/intervencionesService';

export function useTiposIntervencion() {
  return useQuery({ queryKey: ['intervenciones', 'tipos'], queryFn: intervencionesService.tipos, staleTime: 5 * 60_000 });
}

export function useIntervenciones(filtros: { institucionId?: string; estado?: EstadoIntervencion; tipoCodigo?: string }) {
  return useQuery({ queryKey: ['intervenciones', 'lista', filtros], queryFn: () => intervencionesService.listar(filtros) });
}

export function useIntervencion(id: string) {
  return useQuery({ queryKey: ['intervenciones', 'detalle', id], queryFn: () => intervencionesService.detalle(id) });
}

export function useIntervencionesArbol(arbolId: string) {
  return useQuery({ queryKey: ['arbol', arbolId, 'intervenciones'], queryFn: () => intervencionesService.deArbol(arbolId) });
}

export function useRecomendacionesArbol(arbolId: string) {
  return useQuery({ queryKey: ['arbol', arbolId, 'recomendaciones'], queryFn: () => intervencionesService.recomendacionesArbol(arbolId) });
}

export function useRecomendaciones(institucionId: string | undefined, prioridadMinima: number) {
  return useQuery({
    queryKey: ['intervenciones', 'recomendaciones', institucionId ?? 'todas', prioridadMinima],
    queryFn: () => intervencionesService.recomendaciones(institucionId, prioridadMinima),
  });
}

export function useCrearIntervencion() {
  const refrescar = useRefrescarTodo();
  return useMutation({ mutationFn: (datos: NuevaIntervencion) => intervencionesService.crear(datos), onSuccess: refrescar });
}

export function useEditarIntervencion() {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Record<string, unknown> }) => intervencionesService.editar(id, cambios),
    onSuccess: refrescar,
  });
}

export function useEditarTipoIntervencion() {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: ({ codigo, costo }: { codigo: string; costo: number }) =>
      intervencionesService.editarTipo(codigo, { costo_referencia: costo }),
    onSuccess: refrescar,
  });
}
