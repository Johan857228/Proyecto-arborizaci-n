import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { photosService } from '@/features/trees/services/photosService';
import { treesService } from '@/features/trees/services/treesService';
import type { FotoLocal } from '@/features/trees/types';

export function useArbol(arbolId: string) {
  return useQuery({ queryKey: ['arbol', arbolId, 'detalle'], queryFn: () => treesService.getById(arbolId) });
}

export function useCalculos(arbolId: string) {
  return useQuery({ queryKey: ['arbol', arbolId, 'calculos'], queryFn: () => treesService.getCalculos(arbolId) });
}

export function useSubirFotoArbol(arbolId: string) {
  const refrescar = useRefrescarTodo();
  return useMutation({ mutationFn: (foto: FotoLocal) => photosService.upload(arbolId, foto), onSuccess: refrescar });
}
