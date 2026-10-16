import { useLocalSearchParams } from 'expo-router';

import { InterventionFormScreen } from '@/features/interventions/components/InterventionFormScreen';

export default function NewInterventionRoute() {
  const { id, tipo } = useLocalSearchParams<{ id: string; tipo?: string }>();
  return <InterventionFormScreen key={`${id}-${tipo ?? ''}`} arbolId={String(id)} tipoInicial={tipo} />;
}
