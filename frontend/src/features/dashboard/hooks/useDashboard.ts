import { useQuery } from '@tanstack/react-query';

import { dashboardService } from '@/features/dashboard/services/dashboardService';

export const dashboardKeys = {
  stats: (institucionId?: string) => ['dashboard', 'stats', institucionId ?? 'todas'] as const,
  recentTrees: (institucionId?: string) => ['dashboard', 'recent-trees', institucionId ?? 'todas'] as const,
};

/** Estadísticas del inicio. Con institución, solo las de esa institución. `enabled` permite esperar
 *  a que cargue el perfil para no pedir primero las de todas. */
export function useStats(institucionId?: string, enabled = true) {
  return useQuery({ queryKey: dashboardKeys.stats(institucionId), queryFn: () => dashboardService.getStats(institucionId), enabled });
}

export function useDashboard(institucionId?: string, enabled = true) {
  const stats = useStats(institucionId, enabled);
  const recentTrees = useQuery({
    queryKey: dashboardKeys.recentTrees(institucionId),
    queryFn: () => dashboardService.getRecentTrees(institucionId),
    enabled,
  });
  return { stats, recentTrees };
}
