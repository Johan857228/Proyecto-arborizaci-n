import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTema } from '@/theme';

// Hoja con su nervadura (vena central y tres pares de venas), solo en trazo.
const CONTORNO = 'M50 4 C78 18 92 50 50 96 C8 50 22 18 50 4 Z';
const NERVADURA = [
  'M50 12 L50 90',
  'M50 30 Q61 23 71 17',
  'M50 30 Q39 23 29 17',
  'M50 48 Q64 40 79 35',
  'M50 48 Q36 40 21 35',
  'M50 66 Q62 60 73 57',
  'M50 66 Q38 60 27 57',
];

/** Hoja de marca de agua para la esquina de las tarjetas: da identidad sin competir con el
 *  contenido (opacidad muy baja, sin animación y sin recibir toques). */
export function LeafWatermark({ size = 132, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const { palette, oscuro } = useTema();
  return (
    <View
      style={[
        { position: 'absolute', top: -size * 0.28, right: -size * 0.22, width: size, height: size, opacity: oscuro ? 0.09 : 0.07, transform: [{ rotate: '32deg' }], pointerEvents: 'none' },
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <Path d={CONTORNO} stroke={palette.forest} strokeWidth={2} strokeLinejoin="round" />
        {NERVADURA.map((d) => (
          <Path key={d} d={d} stroke={palette.forest} strokeWidth={1.6} strokeLinecap="round" />
        ))}
      </Svg>
    </View>
  );
}
