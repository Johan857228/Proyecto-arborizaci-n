import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { AuthLayout, useAuthFormStyles } from '@/features/auth/components/AuthLayout';
import { recuperarSchema, type RecuperarFormValues } from '@/features/auth/schemas';
import { authService } from '@/features/auth/services/authService';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';
import { crearEstilos, useTema } from '@/theme';

/** "¿Olvidaste tu contraseña?": pide el correo y el backend manda el enlace para crear una nueva. */
export function RecuperarScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const authFormStyles = useAuthFormStyles();
  const recuperar = useMutation({ mutationFn: (email: string) => authService.recuperar(email) });
  const { control, handleSubmit } = useForm<RecuperarFormValues>({
    resolver: zodResolver(recuperarSchema),
    defaultValues: { email: '' },
  });

  function enviar(valores: RecuperarFormValues) {
    recuperar.mutate(valores.email);
  }

  if (recuperar.data) {
    return (
      <AuthLayout>
        <View style={authFormStyles.form}>
          <View style={styles.icono}>
            <Icon name="mail" size={26} color={palette.forest} />
          </View>
          <View style={authFormStyles.formHeading}>
            <Text style={authFormStyles.formTitle}>Revisa tu correo</Text>
            <Text style={authFormStyles.formSubtitle}>{recuperar.data}</Text>
          </View>
          <InlineMessage tone="info">
            El enlace sirve una sola vez y vence en una hora. Ábrelo en este mismo dispositivo para crear la contraseña nueva.
          </InlineMessage>
          <PrimaryButton title="Volver a iniciar sesión" icon="forward" onPress={() => router.replace('/login' as Href)} />
          <Text accessibilityRole="link" style={[authFormStyles.switchLink, styles.centrado]} onPress={() => recuperar.reset()}>
            Usar otro correo
          </Text>
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <View style={authFormStyles.form}>
        <FadeIn index={3} style={authFormStyles.formHeading}>
          <Text style={authFormStyles.formTitle}>Recupera tu contraseña</Text>
          <Text style={authFormStyles.formSubtitle}>
            Escribe el correo con el que te registraste y te enviamos un enlace para crear una contraseña nueva.
          </Text>
        </FadeIn>
        <FadeIn index={4} style={authFormStyles.fields}>
          <Controller name="email" control={control} render={({ field, fieldState }) => (
            <Field
              label="Correo electrónico"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={handleSubmit(enviar)}
              error={fieldState.error?.message}
              placeholder="nombre@institucion.edu.co"
            />
          )} />
        </FadeIn>
        {recuperar.error ? <InlineMessage>{getApiErrorMessage(recuperar.error)}</InlineMessage> : null}
        <FadeIn index={5}>
          <PrimaryButton title="Enviar enlace" icon="mail" loading={recuperar.isPending} onPress={handleSubmit(enviar)} />
        </FadeIn>
        <FadeIn index={6} style={authFormStyles.switchRow}>
          <Text style={authFormStyles.switchText}>¿Ya la recordaste?</Text>
          <Text accessibilityRole="link" style={authFormStyles.switchLink} onPress={() => router.replace('/login' as Href)}>
            Inicia sesión
          </Text>
        </FadeIn>
      </View>
    </AuthLayout>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  icono: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: palette.forestSoft },
  centrado: { textAlign: 'center' },
}));
