import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { AuthLayout, authStyles as styles } from '@/features/auth/components/AuthLayout';
import { useAuthStore } from '@/features/auth/store';
import { authService } from '@/features/auth/services/authService';
import {
  CLAVE_MIN,
  registroSchema,
  type RegistroFormInput,
  type RegistroFormValues,
  type RegistroRespuesta,
} from '@/features/auth/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';

/** Vuelve al inicio de sesión sin apilar otra copia de esa pantalla. */
function volverAlLogin() {
  if (router.canGoBack()) router.back();
  else router.replace('/login' as Href);
}

export function RegisterScreen() {
  const setSession = useAuthStore((state) => state.setSession);
  const [enviado, setEnviado] = useState<RegistroRespuesta | null>(null);
  const registrar = useMutation({ mutationFn: authService.registrar });
  const reenviar = useMutation({ mutationFn: authService.reenviarConfirmacion });
  const { control, handleSubmit } = useForm<RegistroFormInput, unknown, RegistroFormValues>({
    resolver: zodResolver(registroSchema),
    defaultValues: { nombre: '', email: '', password: '', confirmar: '' },
  });

  function submit(values: RegistroFormValues) {
    registrar.mutate(values, {
      onSuccess: async (respuesta) => {
        // Si Supabase no pide confirmar el correo, la cuenta entra de una vez.
        if (respuesta.sesion) {
          await setSession(respuesta.sesion);
          router.replace('/(app)' as Href);
          return;
        }
        setEnviado(respuesta);
      },
    });
  }

  if (enviado) {
    return (
      <AuthLayout>
        <View style={styles.form}>
          <View style={styles.formHeading}>
            <Text style={styles.formTitle}>Revisa tu correo</Text>
            <Text style={styles.formSubtitle}>
              Te enviamos un enlace a {enviado.email} para confirmar la cuenta. Ábrelo y después inicia
              sesión con la contraseña que elegiste.
            </Text>
          </View>
          <InlineMessage tone="info">
            Si no llega en unos minutos, revisa la carpeta de spam. Si ese correo ya tenía una cuenta,
            no te llegará nada: inicia sesión directamente.
          </InlineMessage>
          {reenviar.isSuccess ? <InlineMessage tone="success">Te enviamos un enlace nuevo.</InlineMessage> : null}
          {reenviar.error ? <InlineMessage>{getApiErrorMessage(reenviar.error)}</InlineMessage> : null}
          <PrimaryButton title="Ir a iniciar sesión" icon="forward" onPress={volverAlLogin} />
          {!reenviar.isSuccess ? (
            <PrimaryButton
              title="Reenviar el enlace"
              icon="mail"
              variant="secondary"
              loading={reenviar.isPending}
              onPress={() => reenviar.mutate(enviado.email)}
            />
          ) : null}
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <View style={styles.form}>
        <View style={styles.formHeading}>
          <Text style={styles.formTitle}>Crea tu cuenta</Text>
          <Text style={styles.formSubtitle}>
            Entras como estudiante. El administrador te asigna la institución y el curso.
          </Text>
        </View>

        <View>
          <Controller name="nombre" control={control} render={({ field, fieldState }) => (
            <Field
              label="Nombre completo"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoComplete="name"
              autoCapitalize="words"
              error={fieldState.error?.message}
              placeholder="Como aparece en la lista del curso"
            />
          )} />
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
              hint="Te llegará un enlace para confirmarlo."
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
              autoComplete="new-password"
              error={fieldState.error?.message}
              hint={`Mínimo ${CLAVE_MIN} caracteres; mezcla letras y números.`}
              placeholder="Elige una contraseña"
            />
          )} />
          <Controller name="confirmar" control={control} render={({ field, fieldState }) => (
            <Field
              label="Repite la contraseña"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit(submit)}
              error={fieldState.error?.message}
              placeholder="La misma contraseña"
            />
          )} />
        </View>

        {registrar.error ? <InlineMessage>{getApiErrorMessage(registrar.error)}</InlineMessage> : null}
        <PrimaryButton title="Crear cuenta" icon="person" loading={registrar.isPending} onPress={handleSubmit(submit)} />
        <View style={styles.alterno}>
          <Text style={styles.alternoTexto}>¿Ya tienes cuenta?</Text>
          <Text accessibilityRole="link" style={styles.enlace} onPress={volverAlLogin}>Inicia sesión</Text>
        </View>
        <View style={styles.privacy}>
          <Icon name="lock" size={14} color={palette.muted} />
          <Text style={styles.privacyText}>
            Tus registros quedan a tu nombre y los revisa un docente de la institución.
          </Text>
        </View>
      </View>
    </AuthLayout>
  );
}
