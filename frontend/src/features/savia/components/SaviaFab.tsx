import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInRight, FadeOutRight } from 'react-native-reanimated';

import { fonts } from '@/config/constants';
import { SaviaMark } from '@/features/savia/components/SaviaMark';
import { SaviaPanel } from '@/features/savia/components/SaviaPanel';
import { useIsWide } from '@/hooks/use-is-wide';
import { Ripples, usePressScale } from '@/shared/components/Motion';
import { crearEstilos, useTema } from '@/theme';

const TAMANO = 58;

/** Botón flotante de Savia, siempre visible en la esquina inferior derecha de la app. Dos ondas
 *  suaves salen de él para que se note que está "viva"; al tocarlo abre el panel de Savia. */
export function SaviaFab() {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  const press = usePressScale(0.94);
  const [abierto, setAbierto] = useState(false);
  // "Hola, soy Savia" se presenta unos segundos la primera vez que aparece el botón.
  const [presentando, setPresentando] = useState(true);

  useEffect(() => {
    const temporizador = setTimeout(() => setPresentando(false), 5000);
    return () => clearTimeout(temporizador);
  }, []);

  return (
    <>
      <View style={[styles.anchor, isWide ? styles.anchorWide : styles.anchorPhone]}>
        {presentando ? (
          <Animated.View entering={FadeInRight.delay(900).duration(300)} exiting={FadeOutRight.duration(250)} style={styles.label}>
            <Text style={styles.labelText}>Hola, soy <Text style={styles.labelName}>Savia</Text></Text>
          </Animated.View>
        ) : null}
        <Animated.View entering={FadeIn.delay(400).duration(300)} style={styles.fabWrap}>
          <Ripples size={TAMANO} color={palette.leaf} />
          <Animated.View style={press.style}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir Savia, asistente de inteligencia artificial"
              hitSlop={8}
              onPress={() => {
                setPresentando(false);
                setAbierto(true);
              }}
              onPressIn={press.onPressIn}
              onPressOut={press.onPressOut}
              style={styles.fab}
            >
              <SaviaMark size={TAMANO} />
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
      <SaviaPanel visible={abierto} onClose={() => setAbierto(false)} />
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  anchor: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10, pointerEvents: 'box-none' },
  anchorPhone: { right: 16, bottom: 16 },
  anchorWide: { right: 28, bottom: 28 },
  label: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: palette.forestDark,
    boxShadow: '0 6px 18px rgba(15, 61, 38, 0.25)',
  },
  labelText: { color: '#D5E6DB', fontSize: 13, fontFamily: fonts.semiBold },
  labelName: { color: palette.leaf, fontFamily: fonts.extraBold },
  fabWrap: { width: TAMANO, height: TAMANO, alignItems: 'center', justifyContent: 'center' },
  fab: { width: TAMANO, height: TAMANO, borderRadius: TAMANO / 2, boxShadow: '0 8px 22px rgba(15, 61, 38, 0.35)' },
}));
