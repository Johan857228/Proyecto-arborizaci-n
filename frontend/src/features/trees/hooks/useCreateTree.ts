import type { FiltrosInventario } from '@/features/trees/types';

// El registro se hace con useRegisterTree, que guarda en el teléfono si no hay conexión.
export const treeKeys = {
  all: ['trees'] as const,
  list: (filters: FiltrosInventario) => ['trees', 'list', filters] as const,
};
