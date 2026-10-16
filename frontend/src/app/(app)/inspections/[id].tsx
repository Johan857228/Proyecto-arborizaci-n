import { useLocalSearchParams } from 'expo-router';

import { InspectionDetailScreen } from '@/features/inspections/components/InspectionDetailScreen';

export default function InspectionRoute() {
  const { id, aviso } = useLocalSearchParams<{ id: string; aviso?: string }>();
  return <InspectionDetailScreen key={id} inspeccionId={String(id)} aviso={aviso} />;
}
