import { useLocalSearchParams } from 'expo-router';

import { InspectionFormScreen } from '@/features/inspections/components/InspectionFormScreen';

export default function NewInspectionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InspectionFormScreen key={id} arbolId={String(id)} />;
}
