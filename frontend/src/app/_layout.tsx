import '@/shared/validacion';

import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments, type Href, type Theme } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar, Text, View } from 'react-native';

import { useAuthStore } from '@/features/auth/store';
import { api, setSessionExpiredHandler, setSessionRenewedHandler } from '@/services/api/client';
import { queryClient } from '@/services/api/queryClient';
import { BrandMark } from '@/shared/components/BrandMark';
import '@/global.css';
import { crearEstilos, useTema, useTemaStore } from '@/theme';

function SessionGate() {
  const styles = useStyles();
  const { palette, oscuro } = useTema();
  // Colores de la navegación según el tema. El fondo es transparente para que se vea el fondo
  // decorativo de la app (si no, la navegación pinta su propio gris encima).
  const base = oscuro ? DarkTheme : DefaultTheme;
  const temaNavegacion: Theme = {
    ...base,
    colors: { ...base.colors, background: 'transparent', card: palette.paper, text: palette.ink, border: palette.line, primary: palette.forest },
  };
  const temaHidratado = useTemaStore((state) => state.hidratado);
  const hidratarTema = useTemaStore((state) => state.hidratar);
  const { session, hydrated, hydrate } = useAuthStore();
  const segments = useSegments() as string[];
  const [temporaryStorage, setTemporaryStorage] = useState(false);
  // Si la fuente no carga, la app sigue con la del sistema en lugar de quedarse esperando.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Pantallas sin sesión: inicio de sesión y registro.
  const inPublic = segments[0] === 'login' || segments[0] === 'registro';
  const inApp = segments[0] === '(app)';

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void hidratarTema();
  }, [hidratarTema]);

  // En web, las barras de desplazamiento y los controles nativos del navegador siguen el tema.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';
    document.body.style.backgroundColor = palette.sage;
  }, [oscuro, palette.sage]);

  // Token renovado: guardar la nueva sesión. Si ya no se puede renovar, cerrar la sesión una sola
  // vez (el store limpia también los datos guardados en caché).
  useEffect(() => {
    setSessionRenewedHandler((nueva) => useAuthStore.getState().setSession(nueva));
    setSessionExpiredHandler(async () => {
      if (!useAuthStore.getState().session) return;
      await useAuthStore.getState().expire();
    });
  }, []);

  useEffect(() => {
    void api.get<{ temporal?: boolean }>('/salud')
      .then(({ data }) => setTemporaryStorage(data.temporal === true))
      .catch(() => setTemporaryStorage(false));
  }, []);

  // Esperar a que se compruebe la sesión y carguen las fuentes.
  if (!hydrated || !temaHidratado || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.loading}>
        <BrandMark size={56} />
        <ActivityIndicator color={palette.forest} />
      </View>
    );
  }

  // Si no hay sesión, dirigir al inicio de sesión.
  if (!session && !inPublic && segments.length > 0) {
    return <Redirect href={'/login' as Href} />;
  }

  // Si ya hay sesión, evitar volver al inicio de sesión.
  if (session && inPublic) {
    return <Redirect href={'/(app)' as Href} />;
  }

  // Si hay sesión, mantener la navegación dentro de la aplicación.
  if (session && !inApp && segments[0] !== undefined) {
    return <Redirect href={'/(app)' as Href} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle={oscuro || inPublic ? 'light-content' : 'dark-content'} />
      {temporaryStorage ? (
        <View style={styles.notice} accessibilityRole="alert">
          <Text style={styles.noticeText}>
            Modo temporal SQLite: árboles y fotos se guardan localmente en el proyecto para la
            demostración. No es la base de datos definitiva.
          </Text>
        </View>
      ) : null}
      {/* Entre iniciar sesión y registrarse, fundido: el fondo parece el mismo mientras cambian la
          tarjeta y cruzan las hojas. Va en screenOptions y no como <Stack.Screen> hijas, porque
          con esas pantallas declaradas la redirección al iniciar sesión entraba en un ciclo. */}
      <ThemeProvider value={temaNavegacion}>
        <Stack
          screenOptions={({ route }) => {
            const publica = route.name === 'login' || route.name === 'registro';
            return {
              headerShown: false,
              animation: publica ? 'fade' : 'default',
              contentStyle: { backgroundColor: publica ? palette.forestDark : palette.canvas },
            };
          }}
        />
      </ThemeProvider>
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

const useStyles = crearEstilos(({ palette }) => ({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, backgroundColor: palette.canvas },
  root: { flex: 1 },
  notice: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: palette.amberSoft,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  noticeText: { color: palette.amber, fontSize: 12, lineHeight: 17, textAlign: 'center' },
}));