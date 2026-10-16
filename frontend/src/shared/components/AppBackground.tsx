import { Platform, StyleSheet, View } from 'react-native';

import { palette } from '@/config/constants';
import { FloatingLeaf } from '@/shared/components/Motion';
import { gradient } from '@/shared/styles/gradient';

// En web: resplandores radiales lima (arriba a la izquierda) y sol (arriba a la derecha) sobre el
// marfil de los senderos. En nativo, un degradado lineal equivalente y más simple.
const fondo = Platform.OS === 'web'
  ? [
      'radial-gradient(55% 45% at 0% 0%, rgba(180, 218, 85, 0.32) 0%, rgba(180, 218, 85, 0) 70%)',
      'radial-gradient(40% 35% at 100% 0%, rgba(245, 158, 11, 0.14) 0%, rgba(245, 158, 11, 0) 70%)',
      'radial-gradient(50% 40% at 100% 100%, rgba(22, 101, 52, 0.08) 0%, rgba(22, 101, 52, 0) 70%)',
      'linear-gradient(180deg, #F1F0E2 0%, #F6F4EC 40%, #F6F4EC 100%)',
    ].join(', ')
  : 'linear-gradient(180deg, #EEF1DD 0%, #F6F4EC 45%)';

/** Fondo decorativo de la app; va detrás de todo el contenido y no recibe toques. */
export function AppBackground() {
  return (
    <View style={[styles.fill, { backgroundColor: palette.canvas }, gradient(fondo)]}>
      <FloatingLeaf size={520} color={palette.forest} opacity={0.035} duration={9000} style={{ left: -220, top: 180 }} />
      <FloatingLeaf size={380} color={palette.leaf} opacity={0.08} duration={11000} delay={2000} style={{ right: -160, bottom: -120 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', pointerEvents: 'none' },
});
