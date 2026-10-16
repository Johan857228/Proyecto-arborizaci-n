import { useMutation, useQuery } from '@tanstack/react-query';

import { iaService } from '@/features/ia/service';
import type { FotoLocal } from '@/features/trees/types';

export function useEstadoIA() {
  return useQuery({ queryKey: ['ia', 'estado'], queryFn: iaService.estado, staleTime: 5 * 60_000, retry: false });
}

export function useAnalizarFotos() {
  return useMutation({
    mutationFn: ({ general, detalle }: { general: FotoLocal; detalle?: FotoLocal }) => iaService.analizar(general, detalle),
  });
}
