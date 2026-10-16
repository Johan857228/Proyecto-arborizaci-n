import { QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Stack, useSegments, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { api } from '@/services/api/client';
import { queryClient } from '@/services/api/queryClient';

function SessionGate() {
  const { session, hydrated, hydrate } = useAuthStore();
  const segments = useSegments() as string[];
  const [temporaryStorage, setTemporaryStorage] = useState(false);

  const inLogin = segments[0] === 'login';
  const inApp = segments[0] === '(app)';

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void api.get<{ temporal?: boolean }>('/salud')
      .then(({ data }) => setTemporaryStorage(data.temporal === true))
      .catch(() => setTemporaryStorage(false));
  }, []);

  // Esperar a que se compruebe la sesión.
  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.canvas,
        }}
      >
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