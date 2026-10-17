import { Platform, View } from 'react-native';

import { FloatingLeaf } from '@/shared/components/Motion';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

/** Fondo decorativo de la app (salvia en el tema claro, verde casi negro en el oscuro); va detrás
 *  de todo el contenido y no recibe toques. */
export function AppBackground() {
  const styles = useStyles();
  const { palette, fondo, oscuro } = useTema();
  return (
    <View style={[styles.fill, { backgroundColor: palette.sage }, gradient(Platform.OS === 'web' ? fondo.web : fondo.nativo)]}>
      <FloatingLeaf size={520} color={palette.forest} opacity={oscuro ? 0.05 : 0.06} duration={9000} style={{ left: -220, top: 160 }} />
      <FloatingLeaf size={380} color={palette.leaf} opacity={oscuro ? 0.06 : 0.16} duration={11000} delay={2000} style={{ right: -160, bottom: -120 }} />
      <FloatingLeaf size={240} color={palette.sun} opacity={oscuro ? 0.04 : 0.08} duration={10000} delay={1000} style={{ right: -70, top: -60 }} />
    </View>
  );
}

const useStyles = crearEstilos(() => ({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', pointerEvents: 'none' },
}));
