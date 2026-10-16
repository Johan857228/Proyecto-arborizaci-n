import { useQuery } from '@tanstack/react-query';

import { catalogsService } from '@/features/catalogs/services/catalogsService';

export const catalogKeys = { all: ['catalogs'] as const };

export function useCatalogs() {
  return useQuery({ queryKey: catalogKeys.all, queryFn: catalogsService.getAll });
}