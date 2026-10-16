import { useQuery } from '@tanstack/react-query';

import { dashboardService } from '@/features/dashboard/services/dashboardService';

export const dashboardKeys = {
  stats: ['dashboard', 'stats'] as const,
  recentTrees: ['dashboard', 'recent-trees'] as const,
};

export function useStats() {
  return useQuery({ queryKey: dashboardKeys.stats, queryFn: dashboardService.getStats });
}

export function useDashboard() {
  const stats = useStats();
  const recentTrees = useQuery({
    queryKey: dashboardKeys.recentTrees,
    queryFn: dashboardService.getRecentTrees,
  });
  return { stats, recentTrees };
}