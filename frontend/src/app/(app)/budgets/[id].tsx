import { useLocalSearchParams } from 'expo-router';

import { BudgetDetailScreen } from '@/features/budgets/components/BudgetDetailScreen';

export default function BudgetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BudgetDetailScreen key={id} presupuestoId={String(id)} />;
}
