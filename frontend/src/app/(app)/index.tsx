import { DashboardScreen } from '@/features/dashboard/components/DashboardScreen';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { TableroScreen } from '@/features/territorial/components/TableroScreen';

export default function DashboardRoute() {
  // El funcionario territorial no pertenece a un colegio: su inicio es el tablero de su territorio.
  const perfil = useMiPerfil();
  return perfil.data?.rol === 'territorial' ? <TableroScreen /> : <DashboardScreen />;
}
