import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** Logo de Savia, la IA del arbolado: una hoja (el árbol) con un destello (la IA). Con `animated`,
 *  el destello titila despacio; se queda quieto si el sistema pide reducir el movimiento. */
export function SaviaMark({ size = 56, animated = true }: { size?: number; animated?: boolean }) {
  const reduceMotion = useReducedMotion();
  const twinkle = useSharedValue(0);

  useEffect(() => {
    if (!animated || reduceMotion) return;
    twinkle.set(withRepeat(withTiming(1, { duration: 1800, easing: EASE_IN_OUT }), -1, true));
  }, [animated, reduceMotion, twinkle]);

  const sparkle = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.25 * twinkle.get(),
    transform: [{ scale: 0.8 + 0.3 * twinkle.get() }, { rotate: `${twinkle.get() * 45}deg` }],
  }));

  return (
    <View style={{ width: size, height: size }} accessible={false}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="saviaFondo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#1F8A49" />
            <Stop offset="1" stopColor="#0B3320" />
          </LinearGradient>
          <LinearGradient id="saviaHoja" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#8FCB3A" />
            <Stop offset="1" stopColor="#D4EE8A" />
          </LinearGradient>
        </Defs>
        <Circle cx="32" cy="32" r="32" fill="url(#saviaFondo)" />
        {/* Hoja inclinada con su nervadura */}
        <Path d="M17 47 C17 31 27 21 43 21 C43 37 33 47 17 47 Z" fill="url(#saviaHoja)" />
        <Path d="M20 44 L36 28" stroke="#0F3D26" strokeWidth={2.6} strokeLinecap="round" />
        <Path d="M27 37 L27 31 M31 33 L36 33" stroke="#0F3D26" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
        {/* Punto de "savia" que sube por la nervadura */}
        <Circle cx="44" cy="45" r="2.6" fill="#FDE68A" opacity={0.9} />
      </Svg>
      <Animated.View
        style={[
          { position: 'absolute', left: size * 0.6, top: size * 0.08, width: size * 0.3, height: size * 0.3, pointerEvents: 'none' },
          sparkle,
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 24 24">
          <Path d="M12 0 L14.4 9.6 L24 12 L14.4 14.4 L12 24 L9.6 14.4 L0 12 L9.6 9.6 Z" fill="#FDE68A" />
        </Svg>
      </Animated.View>
    </View>
  );
}
