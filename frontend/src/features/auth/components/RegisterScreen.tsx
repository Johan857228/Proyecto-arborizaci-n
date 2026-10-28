import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { AuthLayout, useAuthFormStyles } from '@/features/auth/components/AuthLayout';
import { useRegistro } from '@/features/auth/hooks/useRegistro';
import {
  registroSchema,
  type RegistroFormInput,
  type RegistroFormValues,
} from '@/features/auth/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Casilla, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';
import { crearEstilos, useTema } from '@/theme';

/** Registro de una cuenta nueva. Queda como estudiante sin institución: un docente o un
 *  administrador le asigna institución y rol desde Usuarios. */
export function RegisterScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const authFormStyles = useAuthFormStyles();
  const registro = useRegistro();
  const { control, handleSubmit } = useForm<RegistroFormInput, unknown, RegistroFormValues>({
    resolver: zodResolver(registroSchema),
    defaultValues: { nombre: '', email: '', password: '', confirmacion: '', acepta_politica: false },
  });

  function submit(valores: RegistroFormValues) {
    registro.mutate(valores, {
      onSuccess: (respuesta) => {
        if (respuesta.sesion) router.replace('/(app)' as Href);
      },
    });
  }

  // Supabase pidió confirmar el correo: no hay sesión todavía.
  if (registro.data?.requiere_confirmacion) {
    return (
      <AuthLayout>
        <View style={authFormStyles.form}>
          <View style={styles.doneIcon}>
            <Icon name="mail" size={26} color={palette.forest} />
          </View>
          <View style={authFormStyles.formHeading}>
            <Text style={authFormStyles.formTitle}>Revisa tu correo</Text>
            <Text style={authFormStyles.formSubtitle}>{registro.data.mensaje}</Text>
          </View>
          <InlineMessage tone="info">
            Tu cuenta queda como estudiante. Un docente o un administrador te asignará tu institución.
          </InlineMessage>
          <PrimaryButton title="Ir a iniciar sesión" icon="forward" onPress={() => router.replace('/login' as Href)} />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <View style={authFormStyles.form}>
        {/* Los elementos de la tarjeta entran uno tras otro mientras la tarjeta gira. */}
        <FadeIn index={3} style={authFormStyles.formHeading}>
          <Text style={authFormStyles.formTitle}>Crea tu cuenta</Text>
          <Text style={authFormStyles.formSubtitle}>
            Regístrate para inventariar los árboles de tu institución.
          </Text>
        </FadeIn>

        <FadeIn index={4} style={authFormStyles.fields}>
          <Controller name="nombre" control={control} render={({ field, fieldState }) => (
            <Field
              label="Nombre completo"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoComplete="name"
              autoCapitalize="words"
              maxLength={120}
              error={fieldState.error?.message}
              placeholder="Como aparecerá en los registros"
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
              maxLength={72}
              hint="Mínimo 8 caracteres, con letras y números."
              error={fieldState.error?.message}
              placeholder="Crea una contraseña"
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
              maxLength={72}
              returnKeyType="go"
              onSubmitEditing={handleSubmit(submit)}
              error={fieldState.error?.message}
              placeholder="Escríbela otra vez"
            />
          )} />
          <Controller name="acepta_politica" control={control} render={({ field, fieldState }) => (
            <Casilla checked={field.value} onChange={field.onChange} error={fieldState.error?.message}>
              Acepto la{' '}
              <Text accessibilityRole="link" style={authFormStyles.switchLink} onPress={() => router.push('/politica' as Href)}>
                política de tratamiento de datos
              </Text>
              . Si soy menor de edad, mi acudiente también deberá autorizarla.
            </Casilla>
          )} />
        </FadeIn>

        {registro.error ? <InlineMessage>{getApiErrorMessage(registro.error)}</InlineMessage> : null}
        <FadeIn index={5}>
          <PrimaryButton
            title="Crear cuenta"
            icon="check"
            loading={registro.isPending}
            onPress={handleSubmit(submit)}
          />
        </FadeIn>
        <FadeIn index={6} style={authFormStyles.switchRow}>
          <Text style={authFormStyles.switchText}>¿Ya tienes cuenta?</Text>
          <Text accessibilityRole="link" style={authFormStyles.switchLink} onPress={() => router.replace('/login' as Href)}>
            Inicia sesión
          </Text>
        </FadeIn>
        <Text style={styles.note}>
          Tu cuenta empieza como estudiante. Un docente o un administrador te asigna la institución y el rol.
        </Text>
      </View>
    </AuthLayout>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  doneIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: palette.forestSoft,
  },
  note: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: fonts.semiBold },
}));
