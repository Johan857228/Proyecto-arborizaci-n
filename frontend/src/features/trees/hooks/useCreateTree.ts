import { useMutation, useQueryClient } from '@tanstack/react-query';

import { treesService } from '@/features/trees/services/treesService';
import type { FiltrosInventario } from '@/features/trees/types';

export const treeKeys = {
  all: ['trees'] as const,
  list: (filters: FiltrosInventario) => ['trees', 'list', filters] as const,
};

export function useCreateTree() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: treesService.create,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: treeKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}