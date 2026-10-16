import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { API_BASE_URL, fonts, palette, shadows } from '@/config/constants';
import { useLogin } from '@/features/auth/hooks/useLogin';
import { useAuthStore } from '@/features/auth/store';
import { authService } from '@/features/auth/services/authService';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';
import { useIsWide } from '@/hooks/use-is-wide';
import { getApiErrorMessage } from '@/services/api/client';
import { AppBackground } from '@/shared/components/AppBackground';
import { BrandMark } from '@/shared/components/BrandMark';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon, type IconName } from '@/shared/components/Icon';
import { gradient } from '@/shared/styles/gradient';
import { FadeIn, FloatingLeaf } from '@/shared/components/Motion';

const features: { icon: IconName; text: string }[] = [
  { icon: 'location', text: 'Registra cada árbol con ubicación GPS y fotografías.' },
  { icon: 'checkCircle', text: 'Consulta su estado fitosanitario en tiempo real.' },
  { icon: 'co2', text: 'Estima el CO₂ capturado y el oxígeno que produce el campus.' },
];

export function LoginScreen() {
  const isWide = useIsWide();
  // Tablets: panel de marca más compacto para que las dos mitades midan lo mismo.
  const isCompact = useWindowDimensions().width < 1024;
  const login = useLogin();
  const sessionExpired = useAuthStore((state) => state.sessionExpired);
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

  const form = (
    <View style={styles.form}>
      <View style={styles.formHeading}>
        <Text style={styles.formTitle}>Inicia sesión</Text>
        <Text style={styles.formSubtitle}>Ingresa con la cuenta asignada por tu institución.</Text>
      </View>

      {sessionExpired ? (
        <InlineMessage tone="warning">Tu sesión expiró por seguridad. Inicia sesión de nuevo para continuar.</InlineMessage>
      ) : null}

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
      <PrimaryButton
        title="Iniciar sesión"
        icon="forward"
        loading={login.isPending}
        onPress={handleSubmit(submit)}
      />
      <View style={styles.privacy}>
        <Icon name="lock" size={14} color={palette.muted} />
        <Text style={styles.privacyText}>
          Los registros quedan asociados a la institución y al usuario autenticado.
        </Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {isWide ? (
        <View style={styles.split}>
          <View style={[styles.brandPanel, isCompact && styles.brandPanelCompact]}>
            {/* Hojas decorativas que flotan lentamente en el panel de marca. */}
            <FloatingLeaf size={420} color={palette.leaf} opacity={0.09} style={{ right: -160, bottom: -150 }} />
            <FloatingLeaf size={180} color={palette.sun} opacity={0.08} delay={1500} duration={8000} style={{ right: 70, top: -60 }} />
            <View style={styles.brandRow}>
              <BrandMark size={44} />
              <Text style={styles.brandName}>Arbolado Escolar</Text>
            </View>
            <FadeIn index={1} style={styles.brandCopy}>
              <Text style={styles.brandEyebrow}>INVENTARIO ARBÓREO ESCOLAR</Text>
              <Text style={[styles.brandTitle, isCompact && styles.brandTitleCompact]}>Cuidar empieza{'\n'}por conocer.</Text>
              <View style={styles.features}>
                {features.map((feature) => (
                  <View key={feature.text} style={styles.feature}>
                    <View style={styles.featureIcon}>
                      <Icon name={feature.icon} size={18} color={palette.leaf} />
                    </View>
                    <Text style={styles.featureText}>{feature.text}</Text>
                  </View>
                ))}
              </View>
            </FadeIn>
            <Text style={styles.brandFooter}>Universidad Popular del Cesar · Valledupar</Text>
          </View>
          <View style={styles.photoSide}>
            {/* Foto del campus de la UPC como fondo del lado del formulario. */}
            <Image
              source={require('@/assets/images/login-campus-upc.jpg')}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel="Letrero Yo amo UPC en el campus de la Universidad Popular del Cesar"
            />
            <View style={styles.photoTint} />
            <ScrollView style={styles.formScroll} contentContainerStyle={[styles.formSide, isCompact && styles.formSideCompact]} keyboardShouldPersistTaps="handled">
              <FadeIn index={2} style={[styles.formCard, isCompact && styles.formCardCompact]}>{form}</FadeIn>
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.mobileContent} keyboardShouldPersistTaps="handled">
          <AppBackground />
          <FadeIn index={0} style={styles.mobileBrand}>
            <BrandMark size={52} />
            <Text style={styles.mobileEyebrow}>INVENTARIO ARBÓREO ESCOLAR</Text>
            <Text style={styles.mobileTitle}>Cuidar empieza{'\n'}por conocer.</Text>
          </FadeIn>
          <FadeIn index={1} style={styles.card}>{form}</FadeIn>
          <Text style={styles.mobileFooter}>Universidad Popular del Cesar · Valledupar</Text>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.canvas },
  form: { gap: 18 },
  formHeading: { gap: 6 },
  formTitle: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  formSubtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  privacyText: { flexShrink: 1, color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  // Escritorio y tablet: panel de marca a la izquierda y formulario a la derecha.
  split: { flex: 1, flexDirection: 'row' },
  // Ancho fijo de la mitad (incluye el relleno); con flex: 1 el relleno se sumaba y lo hacía más ancho.
  brandPanel: { width: '50%', maxWidth: 620, justifyContent: 'space-between', padding: 48, overflow: 'hidden', backgroundColor: palette.forestDark, ...gradient('linear-gradient(160deg, #1B7A41 0%, #0F3D26 55%, #0A2A1A 100%)') },
  brandPanelCompact: { padding: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandName: { color: palette.paper, fontSize: 18, fontFamily: fonts.extraBold },
  brandCopy: { gap: 18 },
  brandEyebrow: { color: palette.leaf, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1.6 },
  brandTitle: { color: palette.paper, fontSize: 46, fontFamily: fonts.extraBold, lineHeight: 52, letterSpacing: -1 },
  brandTitleCompact: { fontSize: 34, lineHeight: 40 },
  features: { gap: 14, marginTop: 10 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 420 },
  featureIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(166, 217, 106, 0.14)' },
  featureText: { flex: 1, color: '#D5E6DB', fontSize: 15, lineHeight: 21 },
  brandFooter: { color: '#9DBBA9', fontSize: 13 },
  photoSide: { flex: 1, minWidth: 0, overflow: 'hidden', backgroundColor: palette.canvas },
  // Velo verde suave sobre la foto para que la tarjeta del formulario resalte.
  photoTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(14, 68, 48, 0.28)' },
  formScroll: { flex: 1 },
  formSide: { flexGrow: 1, justifyContent: 'center', padding: 32 },
  formSideCompact: { padding: 20 },
  formCardCompact: { padding: 24 },
  formCard: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 32, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.96)', boxShadow: '0 4px 12px rgba(15, 42, 33, 0.12), 0 24px 60px rgba(15, 42, 33, 0.28)' },
  // Teléfonos: marca arriba y formulario en una tarjeta.
  mobileContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 32, gap: 24 },
  mobileBrand: { alignItems: 'center', gap: 10 },
  mobileEyebrow: { marginTop: 6, color: palette.forest, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.4 },
  mobileTitle: { color: palette.ink, fontSize: 30, fontFamily: fonts.extraBold, lineHeight: 36, textAlign: 'center', letterSpacing: -0.6 },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, boxShadow: shadows.raised },
  mobileFooter: { color: palette.muted, fontSize: 12, textAlign: 'center' },
});
