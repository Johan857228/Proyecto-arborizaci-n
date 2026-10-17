import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Platform, Text, View } from 'react-native';

import { API_BASE_URL } from '@/config/constants';
import { AuthLayout, useAuthFormStyles } from '@/features/auth/components/AuthLayout';
import { useLogin } from '@/features/auth/hooks/useLogin';
import { useAuthStore } from '@/features/auth/store';
import { authService } from '@/features/auth/services/authService';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';
import { useTema } from '@/theme';

export function LoginScreen() {
  const { palette } = useTema();
  const styles = useAuthFormStyles();
  const login = useLogin();
  const sessionExpired = useAuthStore((state) => state.sessionExpired);
  const aviso = useAuthStore((state) => state.aviso);
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
    <AuthLayout>
      <View style={styles.form}>
        {/* Los elementos de la tarjeta entran uno tras otro mientras la tarjeta gira. */}
        <FadeIn index={3} style={styles.formHeading}>
          <Text style={styles.formTitle}>Inicia sesión</Text>
          <Text style={styles.formSubtitle}>Ingresa con tu correo y tu contraseña.</Text>
        </FadeIn>

        {sessionExpired ? (
          <InlineMessage tone="warning">Tu sesión expiró por seguridad. Inicia sesión de nuevo para continuar.</InlineMessage>
        ) : null}

        {aviso ? <InlineMessage tone="warning">{aviso}</InlineMessage> : null}

        {backendStatus.data?.temporal ? (
          <InlineMessage tone="warning">
            Entorno temporal de demostración: los datos se guardan localmente en SQLite y no corresponden
            al sistema definitivo. Credenciales por defecto (si el backend no las cambió): demo@arboles.local
            / demo123.
          </InlineMessage>
        ) : null}

        {backendStatus.isError ? (
          <InlineMessage>
            No se pudo consultar {API_BASE_URL}/salud. Comprueba que el backend esté iniciado y que la URL
            sea correcta{webOrigin ? `; el backend también debe permitir ${webOrigin} en CORS_ORIGINS.` : '.'}
          </InlineMessage>
        ) : null}

        <FadeIn index={4} style={styles.fields}>
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
              returnKeyType="go"
              onSubmitEditing={handleSubmit(submit)}
              error={fieldState.error?.message}
              placeholder="Tu contraseña"
            />
          )} />
        </FadeIn>

        {login.error ? <InlineMessage>{getApiErrorMessage(login.error)}</InlineMessage> : null}
        <FadeIn index={5}>
          <PrimaryButton
            title="Iniciar sesión"
            icon="forward"
            loading={login.isPending}
            onPress={handleSubmit(submit)}
          />
        </FadeIn>
        <FadeIn index={6} style={styles.switchRow}>
          <Text style={styles.switchText}>¿No tienes cuenta?</Text>
          <Text accessibilityRole="link" style={styles.switchLink} onPress={() => router.push('/registro' as Href)}>
            Regístrate
          </Text>
        </FadeIn>
        <View style={styles.privacy}>
          <Icon name="lock" size={14} color={palette.muted} />
          <Text style={styles.privacyText}>
            Los registros quedan asociados a la institución y al usuario autenticado.
          </Text>
        </View>
      </View>
    </AuthLayout>
  );
}
