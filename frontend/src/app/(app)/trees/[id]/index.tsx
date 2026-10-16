import { useLocalSearchParams } from 'expo-router';

import { TreeDetailScreen } from '@/features/trees/components/TreeDetailScreen';

export default function TreeDetailRoute() {
  const { id, aviso } = useLocalSearchParams<{ id: string; aviso?: string }>();
  return <TreeDetailScreen key={id} arbolId={String(id)} aviso={aviso} />;
}
