import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL, palette } from '@/config/constants';
import { useLogin } from '@/features/auth/hooks/useLogin';
import { authService } from '@/features/auth/services/authService';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Eyebrow, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';

export function LoginScreen() {
  const login = useLogin();
  const webOrigin = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : null;
  const backendStatus = useQuery({
    queryKey: ['backend', 'status'],
    queryFn: authService.getBackendStatus,
    retry: false,
  });
  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  function submit(values: LoginFormValues) {
    login.mutate(values, {
      onSuccess: () => router.replace('/(app)' as Href),
    });
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Text style={styles.brandIcon}>A</Text></View>
        <Eyebrow>Inventario arbóreo escolar</Eyebrow>
        <Text style={styles.title}>Cuidar empieza{ '\n' }por conocer.</Text>
        <Text style={styles.subtitle}>Ingresa con la cuenta asignada por tu institución.</Text>

        {backendStatus.data?.temporal ? (
          <View style={styles.demoNotice}>
            <Text style={styles.demoTitle}>Entorno temporal de demostración</Text>
            <Text style={styles.demoText}>
              Los datos se guardan localmente en SQLite y no corresponden al sistema definitivo.
            </Text>
            <Text style={styles.demoText}>
              Credenciales por defecto (si el backend no las cambió):
            </Text>
            <Text style={styles.demoCredentials}>Correo: demo@arboles.local</Text>
            <Text style={styles.demoCredentials}>Contraseña: demo123</Text>
          </View>
        ) : null}

        {backendStatus.isError ? (
          <InlineMessage>
            No se pudo consultar {API_BASE_URL}/salud. Comprueba que el backend esté iniciado y que la URL
            sea correcta{webOrigin ? `; el backend también debe permitir ${webOrigin} en CORS_ORIGINS.` : '.'}
          </InlineMessage>
        ) : null}

        <View style={styles.form}>
          <Controller name="email" control={control} render={({ field, fieldState }) => (
            <Field
              label="Correo electrónico"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              error={fieldState.error?.message}
              placeholder="nombre@institucion.edu.co"
            />
          )} />
          <Controller name="password" control={control} render={({ field, fieldState }) => (
            <Field
              label="Contraseña"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              secureTextEntry
              autoComplete="password"
              error={fieldState.error?.message}
              placeholder="Tu contraseña"
            />
          )} />
          {login.error ? <InlineMessage>{getApiErrorMessage(login.error)}</InlineMessage> : null}
          <PrimaryButton title="Iniciar sesión" loading={login.isPending} onPress={handleSubmit(submit)} />
        </View>
        <Text style={styles.privacy}>Los registros quedan asociados a la institución y al usuario autenticado.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.canvas },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 36 },
  brandMark: { width: 54, height: 54, marginBottom: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: palette.forest },
  brandIcon: { color: palette.leaf, fontSize: 30, fontWeight: '900' },
  title: { marginTop: 13, color: palette.ink, fontSize: 38, fontWeight: '900', lineHeight: 43 },
  subtitle: { maxWidth: 320, marginTop: 12, color: palette.muted, fontSize: 16, lineHeight: 23 },
  demoNotice: { marginTop: 22, padding: 14, borderWidth: 1, borderColor: '#E8D5A5', borderRadius: 10, backgroundColor: '#FFF3D6', gap: 5 },
  demoTitle: { color: '#684D10', fontWeight: '800', fontSize: 13 },
  demoText: { color: '#684D10', fontSize: 12, lineHeight: 17 },
  demoCredentials: { color: '#684D10', fontSize: 12, fontWeight: '700' },
  form: { marginTop: 34, gap: 6 },
  privacy: { marginTop: 24, color: palette.muted, fontSize: 12, lineHeight: 18 },
});