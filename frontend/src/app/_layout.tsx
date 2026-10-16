import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, useSegments, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { api, setSessionExpiredHandler } from '@/services/api/client';
import { queryClient } from '@/services/api/queryClient';
import { BrandMark } from '@/shared/components/BrandMark';
import '@/global.css';

function SessionGate() {
  const { session, hydrated, hydrate } = useAuthStore();
  const segments = useSegments() as string[];
  const [temporaryStorage, setTemporaryStorage] = useState(false);
  // Si la fuente no carga, la app sigue con la del sistema en lugar de quedarse esperando.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const inLogin = segments[0] === 'login';
  const inApp = segments[0] === '(app)';

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Token expirado: cerrar la sesión una sola vez y limpiar los datos guardados en caché.
  useEffect(() => {
    setSessionExpiredHandler(async () => {
      if (!useAuthStore.getState().session) return;
      queryClient.clear();
      await useAuthStore.getState().expire();
    });
  }, []);

  useEffect(() => {
    void api.get<{ temporal?: boolean }>('/salud')
      .then(({ data }) => setTemporaryStorage(data.temporal === true))
      .catch(() => setTemporaryStorage(false));
  }, []);

  // Esperar a que se compruebe la sesión y carguen las fuentes.
  if (!hydrated || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.loading}>
        <BrandMark size={56} />
        <ActivityIndicator color={palette.forest} />
      </View>
    );
  }

  // Si no hay sesión, dirigir al inicio de sesión.
  if (!session && !inLogin && segments.length > 0) {
    return <Redirect href={'/login' as Href} />;
  }

  // Si ya hay sesión, evitar volver al inicio de sesión.
  if (session && inLogin) {
    return <Redirect href={'/(app)' as Href} />;
  }

  // Si hay sesión, mantener la navegación dentro de la aplicación.
  if (session && !inApp && segments[0] !== undefined) {
    return <Redirect href={'/(app)' as Href} />;
  }

  return (
    <View style={styles.root}>
      {temporaryStorage ? (
        <View style={styles.notice} accessibilityRole="alert">
          <Text style={styles.noticeText}>
            Modo temporal SQLite: árboles y fotos se guardan localmente en el proyecto para la
            demostración. No es la base de datos definitiva.
          </Text>
        </View>
      ) : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: palette.canvas,
          },
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionGate />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, backgroundColor: palette.canvas },
  root: { flex: 1 },
  notice: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF3D6',
    borderBottomWidth: 1,
    borderBottomColor: '#E8D5A5',
  },
  noticeText: { color: '#684D10', fontSize: 12, lineHeight: 17, textAlign: 'center' },
});