import { Image } from 'expo-image';
import { useEffect, type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { fonts } from '@/config/constants';
import { useIsWide } from '@/hooks/use-is-wide';
import { BrandMark } from '@/shared/components/BrandMark';
import { FallingLeaves } from '@/shared/components/FallingLeaves';
import { Icon, type IconName } from '@/shared/components/Icon';
import { FadeIn, FloatingLeaf, Ripples } from '@/shared/components/Motion';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

const features: { icon: IconName; text: string }[] = [
  { icon: 'location', text: 'Registra cada árbol con ubicación GPS y fotografías.' },
  { icon: 'checkCircle', text: 'Consulta su estado fitosanitario en tiempo real.' },
  { icon: 'co2', text: 'Estima el CO₂ capturado y el oxígeno que produce el campus.' },
];

// Entradas con resorte (estilos animados: las animaciones de entrada con escala se congelan en web).
// El logo llega girando y rebota; la tarjeta gira en 3D desde un costado y se asienta.
const RESORTE_MARCA = { duration: 1000, dampingRatio: 0.5 };
const RESORTE_TARJETA = { duration: 900, dampingRatio: 0.65 };

function useEntrada(retraso: number, resorte: { duration: number; dampingRatio: number }): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const avance = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    avance.set(withDelay(retraso, withSpring(1, resorte)));
  }, [avance, reduceMotion, resorte, retraso]);
  return avance;
}

// Fondo del teléfono: verde bosque profundo con un resplandor lima arriba (en web, con brillos radiales).
const fondoMovil = Platform.OS === 'web'
  ? [
      'radial-gradient(60% 40% at 85% 0%, rgba(180, 218, 85, 0.30) 0%, rgba(180, 218, 85, 0) 70%)',
      'radial-gradient(50% 35% at 0% 35%, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0) 70%)',
      'linear-gradient(170deg, #1F8A49 0%, #0F3D26 48%, #0A2A1A 100%)',
    ].join(', ')
  : 'linear-gradient(170deg, #1F8A49 0%, #0F3D26 48%, #0A2A1A 100%)';

/** Marco de las pantallas sin sesión (inicio de sesión y registro): panel de marca y foto del
 *  campus en tablet y escritorio; fondo verde profundo con la tarjeta del formulario en teléfonos. */
export function AuthLayout({ children }: PropsWithChildren) {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  // Tablets: panel de marca más compacto para que las dos mitades midan lo mismo.
  const isCompact = useWindowDimensions().width < 1024;
  const marca = useEntrada(0, RESORTE_MARCA);
  const tarjeta = useEntrada(150, RESORTE_TARJETA);

  const estiloMarca = useAnimatedStyle(() => {
    const v = marca.get();
    return { opacity: Math.min(1, v * 1.5), transform: [{ rotate: `${(1 - v) * -200}deg` }, { scale: 0.4 + 0.6 * v }] };
  });
  const estiloTarjeta = useAnimatedStyle(() => {
    const v = tarjeta.get();
    return {
      opacity: Math.min(1, v * 1.6),
      transform: [{ perspective: 1000 }, { translateY: (1 - v) * 40 }, { rotateY: `${(1 - v) * -75}deg` }, { scale: 0.9 + 0.1 * v }],
    };
  });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {isWide ? (
        <View style={styles.split}>
          <View style={[styles.brandPanel, isCompact && styles.brandPanelCompact]}>
            {/* Hojas decorativas que flotan lentamente en el panel de marca. */}
            <FloatingLeaf size={420} color={palette.leaf} opacity={0.09} style={{ right: -160, bottom: -150 }} />
            <FloatingLeaf size={180} color={palette.sun} opacity={0.08} delay={1500} duration={8000} style={{ right: 70, top: -60 }} />
            <View style={styles.brandRow}>
              <Animated.View style={[styles.markWrapSmall, estiloMarca]}>
                <Ripples size={44} radius={13} color={palette.leaf} opacity={0.3} maxScale={1.8} duration={3200} />
                <BrandMark size={44} />
              </Animated.View>
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
              <Animated.View style={[styles.formCard, isCompact && styles.formCardCompact, estiloTarjeta]}>{children}</Animated.View>
            </ScrollView>
          </View>
        </View>
      ) : (
        <View style={styles.mobileRoot}>
          {/* Fondo fijo: degradado y hojas que flotan despacio; no recibe toques. */}
          <View style={[styles.mobileBackdrop, gradient(fondoMovil)]}>
            <FloatingLeaf size={360} color={palette.leaf} opacity={0.1} duration={9000} style={{ right: -150, top: -90 }} />
            <FloatingLeaf size={220} color={palette.sun} opacity={0.07} delay={1500} duration={8000} style={{ left: -100, top: 250 }} />
            <FloatingLeaf size={440} color={palette.leaf} opacity={0.05} delay={800} duration={11000} style={{ left: -190, bottom: -220 }} />
          </View>
          <ScrollView contentContainerStyle={styles.mobileContent} keyboardShouldPersistTaps="handled">
            <View style={styles.mobileBrand}>
              <Animated.View style={[styles.markWrap, estiloMarca]}>
                <Ripples size={60} radius={18} color={palette.leaf} opacity={0.35} maxScale={1.7} duration={3200} />
                <BrandMark size={60} />
              </Animated.View>
              <FadeIn index={1} style={styles.mobileCopy}>
                <Text style={styles.mobileEyebrow}>INVENTARIO ARBÓREO ESCOLAR</Text>
                <Text style={styles.mobileTitle}>Cuidar empieza{'\n'}por conocer.</Text>
              </FadeIn>
            </View>
            <Animated.View style={[styles.card, estiloTarjeta]}>{children}</Animated.View>
            <Text style={styles.mobileFooter}>Universidad Popular del Cesar · Valledupar</Text>
          </ScrollView>
        </View>
      )}
      {/* Al entrar a iniciar sesión o a registrarse, una ráfaga de hojas cruza la pantalla. */}
      <FallingLeaves cantidad={isWide ? 56 : 34} />
    </KeyboardAvoidingView>
  );
}

/** Estilos del contenido de la tarjeta, compartidos por el inicio de sesión y el registro. */
export const useAuthFormStyles = crearEstilos(({ palette }) => ({
  form: { gap: 18 },
  formHeading: { gap: 6 },
  formTitle: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  formSubtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  fields: { gap: 0 },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 },
  switchText: { color: palette.muted, fontSize: 14 },
  switchLink: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold, textDecorationLine: 'underline' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  privacyText: { flexShrink: 1, color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
}));

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1, backgroundColor: palette.canvas },
  // Escritorio y tablet: panel de marca a la izquierda y formulario a la derecha.
  split: { flex: 1, flexDirection: 'row' },
  // Ancho fijo de la mitad (incluye el relleno); con flex: 1 el relleno se sumaba y lo hacía más ancho.
  brandPanel: { width: '50%', maxWidth: 620, justifyContent: 'space-between', padding: 48, overflow: 'hidden', backgroundColor: palette.forestDark, ...gradient('linear-gradient(160deg, #1B7A41 0%, #0F3D26 55%, #0A2A1A 100%)') },
  brandPanelCompact: { padding: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  markWrapSmall: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: palette.white, fontSize: 18, fontFamily: fonts.extraBold },
  brandCopy: { gap: 18 },
  brandEyebrow: { color: palette.leaf, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1.6 },
  brandTitle: { color: palette.white, fontSize: 46, fontFamily: fonts.extraBold, lineHeight: 52, letterSpacing: -1 },
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
  formCard: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 32, borderRadius: 20, backgroundColor: palette.paper, boxShadow: '0 4px 12px rgba(15, 42, 33, 0.12), 0 24px 60px rgba(15, 42, 33, 0.28)' },
  // Teléfonos: fondo verde profundo, marca arriba y formulario en una tarjeta blanca.
  mobileRoot: { flex: 1, backgroundColor: palette.forestDark },
  mobileBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', pointerEvents: 'none' },
  mobileContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 32, gap: 26 },
  mobileBrand: { alignItems: 'center', gap: 18 },
  markWrap: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  mobileCopy: { alignItems: 'center', gap: 10 },
  mobileEyebrow: { color: palette.leaf, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1.6 },
  mobileTitle: { color: palette.white, fontSize: 32, fontFamily: fonts.extraBold, lineHeight: 38, textAlign: 'center', letterSpacing: -0.6 },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, borderRadius: 24, backgroundColor: palette.paper, boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22), 0 30px 70px rgba(0, 0, 0, 0.22)' },
  mobileFooter: { color: '#9DBBA9', fontSize: 12, textAlign: 'center' },
}));
