import { isAxiosError } from 'axios';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { palette } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { useIsWide } from '@/hooks/use-is-wide';
import { AppBackground } from '@/shared/components/AppBackground';
import { AppHeader, BottomNav } from '@/shared/components/AppNavigation';

export default function AppLayout() {
  const isWide = useIsWide();
  const perfil = useMiPerfil();
  const signOut = useAuthStore((state) => state.signOut);
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
      </View>
      {isWide ? null : <BottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  content: { flex: 1 },
});
