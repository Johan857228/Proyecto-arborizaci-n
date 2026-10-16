import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Link, router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, Text, View } from 'react-native';

import { API_BASE_URL, palette } from '@/config/constants';
import { AuthLayout, authStyles as styles } from '@/features/auth/components/AuthLayout';
import { useLogin } from '@/features/auth/hooks/useLogin';
import { useAuthStore } from '@/features/auth/store';
import { authService } from '@/features/auth/services/authService';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';

type EnlaceDeCorreo = 'confirmada' | 'invalido' | null;

/** Al abrir el enlace del correo de confirmación, Supabase vuelve a la app con el resultado
 *  en el fragmento de la URL (#access_token=...&type=signup o #error_code=...). */
function leerEnlaceDeCorreo(): EnlaceDeCorreo {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get('error') || params.get('error_code')) return 'invalido';
  if (params.get('type') === 'signup' && params.get('access_token')) return 'confirmada';
  return null;
}

export function LoginScreen() {
  const login = useLogin();
  const sessionExpired = useAuthStore((state) => state.sessionExpired);
  const aviso = useAuthStore((state) => state.aviso);
  const [enlace] = useState(leerEnlaceDeCorreo);
  const webOrigin = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : null;
  const backendStatus = useQuery({
    queryKey: ['backend', 'status'],
    queryFn: authService.getBackendStatus,
    retry: false,
  });
  const reenviar = useMutation({ mutationFn: authService.reenviarConfirmacion });
  const { control, handleSubmit, getValues } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // El fragmento trae tokens: se quita de la URL apenas se leyó. Expo Router lo guarda como el
  // parámetro "#" de la ruta y, al cargar, vuelve a escribir la URL con él; por eso se borra
  // del parámetro y luego, cuando el enrutador ya escribió la URL, también de la barra.
  useEffect(() => {
    if (!enlace || typeof window === 'undefined') return;
    // Vacío y no undefined: los parámetros se pasan a texto y "undefined" quedaría en la URL.
    router.setParams({ '#': '' });
    const limpiar = setTimeout(() => {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }, 300);
    return () => clearTimeout(limpiar);
  }, [enlace]);

  function submit(values: LoginFormValues) {
    reenviar.reset();
    login.mutate(values, {
      onSuccess: () => router.replace('/(app)' as Href),
    });
  }

  // La API responde 403 en el inicio de sesión solo cuando falta confirmar el correo.
  const sinConfirmar = isAxiosError(login.error) && login.error.response?.status === 403;

  return (
    <AuthLayout>
      <View style={styles.form}>
        <View style={styles.formHeading}>
          <Text style={styles.formTitle}>Inicia sesión</Text>
          <Text style={styles.formSubtitle}>Ingresa con tu cuenta de la institución.</Text>
        </View>

        {enlace === 'confirmada' ? (
          <InlineMessage tone="success">Tu correo quedó confirmado. Ya puedes iniciar sesión con tu contraseña.</InlineMessage>
        ) : null}
        {enlace === 'invalido' ? (
          <InlineMessage tone="warning">
            El enlace de confirmación venció o ya se usó. Inicia sesión y, si la cuenta sigue sin confirmar, pide un enlace nuevo.
          </InlineMessage>
        ) : null}

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

        <View>
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
        </View>

        {login.error ? <InlineMessage>{getApiErrorMessage(login.error)}</InlineMessage> : null}
        {sinConfirmar ? (
          reenviar.isSuccess ? (
            <InlineMessage tone="info">Te enviamos un enlace nuevo. Revisa también la carpeta de spam.</InlineMessage>
          ) : (
            <>
              {reenviar.error ? <InlineMessage>{getApiErrorMessage(reenviar.error)}</InlineMessage> : null}
              <PrimaryButton
                title="Reenviar el enlace"
                icon="mail"
                variant="secondary"
                loading={reenviar.isPending}
                onPress={() => reenviar.mutate(getValues('email'))}
              />
            </>
          )
        ) : null}
        <PrimaryButton
          title="Iniciar sesión"
          icon="forward"
          loading={login.isPending}
          onPress={handleSubmit(submit)}
        />
        <View style={styles.alterno}>
          <Text style={styles.alternoTexto}>¿No tienes cuenta?</Text>
          <Link href={'/register' as Href} style={styles.enlace}>Crear una cuenta</Link>
        </View>
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
