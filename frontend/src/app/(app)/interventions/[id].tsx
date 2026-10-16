import { useLocalSearchParams } from 'expo-router';

import { InterventionDetailScreen } from '@/features/interventions/components/InterventionDetailScreen';

export default function InterventionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InterventionDetailScreen key={id} intervencionId={String(id)} />;
}
