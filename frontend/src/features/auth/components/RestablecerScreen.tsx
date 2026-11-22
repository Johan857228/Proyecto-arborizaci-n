import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, Text, View } from 'react-native';

import { AuthLayout, useAuthFormStyles } from '@/features/auth/components/AuthLayout';
import { restablecerSchema, type RestablecerFormValues } from '@/features/auth/schemas';
import { authService } from '@/features/auth/services/authService';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';
import { crearEstilos, useTema } from '@/theme';

interface Enlace {
  token?: string;
  error?: string;
}

/** Lo que trae el enlace del correo. Supabase devuelve el token después de "#" (esa parte de la
 *  dirección no viaja a ningún servidor y el token vence en una hora) o, si el enlace venció, el
 *  motivo. */
function leerEnlace(): Enlace {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return {};
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const token = hash.get('type') === 'recovery' ? hash.get('access_token') ?? undefined : undefined;
  const error = hash.get('error_description') ?? query.get('error_description') ?? undefined;
  return { token, error: error?.replace(/\+/g, ' ') };
}

/** Crear la contraseña nueva desde el enlace del correo. */
export function RestablecerScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const authFormStyles = useAuthFormStyles();
  const [enlace] = useState(leerEnlace);
  const restablecer = useMutation({
    mutationFn: (password: string) => authService.restablecer(enlace.token ?? '', password),
  });
  const { control, handleSubmit } = useForm<RestablecerFormValues>({
    resolver: zodResolver(restablecerSchema),
    defaultValues: { password: '', confirmacion: '' },
  });

  function guardar(valores: RestablecerFormValues) {
    restablecer.mutate(valores.password);
  }

  const pedirOtro = (
    <PrimaryButton title="Pedir otro enlace" icon="mail" variant="secondary" onPress={() => router.replace('/recuperar' as Href)} />
  );

  if (restablecer.data) {
    return (
      <AuthLayout>
        <View style={authFormStyles.form}>
          <View style={styles.icono}>
            <Icon name="checkCircle" size={26} color={palette.forest} />
          </View>
          <View style={authFormStyles.formHeading}>
            <Text style={authFormStyles.formTitle}>Contraseña guardada</Text>
            <Text style={authFormStyles.formSubtitle}>{restablecer.data}</Text>
          </View>
          <PrimaryButton title="Iniciar sesión" icon="forward" onPress={() => router.replace('/login' as Href)} />
        </View>
      </AuthLayout>
    );
  }

  if (!enlace.token) {
    return (
      <AuthLayout>
        <View style={authFormStyles.form}>
          <View style={authFormStyles.formHeading}>
            <Text style={authFormStyles.formTitle}>Enlace no válido</Text>
            <Text style={authFormStyles.formSubtitle}>
              {enlace.error
                ? 'El enlace venció o ya se usó. Pide uno nuevo y ábrelo antes de una hora.'
                : 'Abre esta página desde el enlace que te llegó al correo.'}
            </Text>
          </View>
          {pedirOtro}
          <Text accessibilityRole="link" style={[authFormStyles.switchLink, styles.centrado]} onPress={() => router.replace('/login' as Href)}>
            Volver a iniciar sesión
          </Text>
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <View style={authFormStyles.form}>
        <FadeIn index={3} style={authFormStyles.formHeading}>
          <Text style={authFormStyles.formTitle}>Crea tu contraseña nueva</Text>
          <Text style={authFormStyles.formSubtitle}>Al menos 8 caracteres, con letras y números.</Text>
        </FadeIn>
        <FadeIn index={4} style={authFormStyles.fields}>
          <Controller name="password" control={control} render={({ field, fieldState }) => (
            <Field
              label="Contraseña nueva"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              secureTextEntry
              autoComplete="new-password"
              error={fieldState.error?.message}
            />
          )} />
          <Controller name="confirmacion" control={control} render={({ field, fieldState }) => (
            <Field
              label="Repite la contraseña"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit(guardar)}
              error={fieldState.error?.message}
            />
          )} />
        </FadeIn>
        {restablecer.error ? <InlineMessage>{getApiErrorMessage(restablecer.error)}</InlineMessage> : null}
        <FadeIn index={5}>
          <PrimaryButton title="Guardar contraseña" icon="lock" loading={restablecer.isPending} onPress={handleSubmit(guardar)} />
        </FadeIn>
        {restablecer.error ? pedirOtro : null}
      </View>
    </AuthLayout>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  icono: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: palette.forestSoft },
  centrado: { textAlign: 'center' },
}));
