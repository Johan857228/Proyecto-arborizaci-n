import { isAxiosError } from 'axios';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useAuthStore } from '@/features/auth/store';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { useContactos } from '@/features/riesgo/api';
import { SaviaFab } from '@/features/savia/components/SaviaFab';
import { useIsWide } from '@/hooks/use-is-wide';
import { AppBackground } from '@/shared/components/AppBackground';
import { AppHeader, BottomNav } from '@/shared/components/AppNavigation';
import { crearEstilos } from '@/theme';

export default function AppLayout() {
  const styles = useStyles();
  const isWide = useIsWide();
  const perfil = useMiPerfil();
  const signOut = useAuthStore((state) => state.signOut);
  // Los contactos de emergencia de la sede quedan en la copia del teléfono: la ruta de emergencia
  // debe funcionar sin señal aunque nadie haya abierto Alertas.
  useContactos(perfil.data?.institucion_id ?? undefined);
  // El backend responde 403 al perfil de una cuenta desactivada: se cierra la sesión con el motivo.
  const cuentaDesactivada = isAxiosError(perfil.error) && perfil.error.response?.status === 403;

  useEffect(() => {
    if (cuentaDesactivada) {
      void signOut('Tu cuenta está desactivada. Habla con el administrador de tu institución.');
    }
  }, [cuentaDesactivada, signOut]);

  // Barra superior en todas las pantallas; en teléfonos la navegación va abajo, como en una app nativa.
  // Las pantallas son transparentes para que se vea el fondo decorativo común.
  return (
    <View style={styles.root}>
      <AppBackground />
      <AppHeader />
      <View style={styles.content}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="trees/index" />
          <Stack.Screen name="trees/new" />
        </Stack>
        {/* Savia, la IA de la app: siempre a mano en la esquina inferior derecha. */}
        <SaviaFab />
      </View>
      {isWide ? null : <BottomNav />}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  root: { flex: 1, backgroundColor: palette.sage },
  content: { flex: 1 },
}));
