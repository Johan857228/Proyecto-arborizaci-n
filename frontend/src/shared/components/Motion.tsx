/**
 * Animaciones compartidas, inspiradas en componentes de 21st.dev (Blur Fade, Number Ticker,
 * Shimmer Button, fondos animados) y recreadas con Reanimated para que funcionen en web, Android e iOS.
 * Todas respetan la opción del sistema "reducir movimiento".
 */
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** Entrada suave hacia arriba; `index` escalona la aparición de listas y tarjetas. */
export function FadeIn({ index = 0, style, children }: PropsWithChildren<{ index?: number; style?: StyleProp<ViewStyle> }>) {
  return (
    <Animated.View entering={FadeInDown.duration(450).delay(Math.min(index, 10) * 70)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Número que cuenta desde su valor anterior hasta el nuevo (como Number Ticker). */
export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  style,
  duration = 1000,
}: {
  value: number;
  format?: (value: number) => string;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    const start = from.current;
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(start + (value - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduceMotion]);

  return <Text style={style}>{format(reduceMotion ? value : display)}</Text>;
}

/** Progreso de 0 a 1 al montar (para gráficos que se dibujan); 1 de inmediato si se reduce el movimiento. */
export function useEntryProgress(duration = 1000, delay = 0) {
  const reduceMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const startsAt = Date.now() + delay;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - startsAt) / duration));
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, duration, reduceMotion]);
  return reduceMotion ? 1 : progress;
}

/** Crece de izquierda a derecha (barras de progreso), animando escala y no el ancho. */
export function GrowIn({ delay = 250, style, children }: PropsWithChildren<{ delay?: number; style?: StyleProp<ViewStyle> }>) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) progress.set(withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })));
  }, [delay, progress, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }));
  return <Animated.View style={[style, { transformOrigin: 'left' }, animated]}>{children}</Animated.View>;
}

/** Brillo que cruza el contenedor cada pocos segundos (como Shimmer Button). */
export function Shimmer({ color = 'rgba(255, 255, 255, 0.55)' }: { color?: string }) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const position = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || width === 0) return;
    position.set(withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withDelay(2400, withTiming(0, { duration: 0 })),
      ),
      -1,
    ));
  }, [position, reduceMotion, width]);
  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: position.get() * (width + 120) - 80 }, { skewX: '-20deg' }],
  }));
  if (reduceMotion) return null;
  return (
    <View
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', pointerEvents: 'none' }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 50, backgroundColor: color, opacity: 0.6 }, band]} />
    </View>
  );
}

/** Forma orgánica (hoja) que flota lentamente; decorativa, no recibe toques. */
export function FloatingLeaf({
  size,
  color,
  opacity = 0.1,
  duration = 6500,
  delay = 0,
  style,
}: {
  size: number;
  color: string;
  opacity?: number;
  duration?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    drift.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true)));
  }, [delay, drift, duration, reduceMotion]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: -14 * drift.get() }, { rotate: `${drift.get() * 8 - 4}deg` }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          opacity,
          backgroundColor: color,
          borderTopLeftRadius: size,
          borderBottomRightRadius: size,
          pointerEvents: 'none',
        },
        style,
        animated,
      ]}
    />
  );
}

/** Pequeño "rebote" cuando `active` cambia (casillas que se marcan). */
export function usePop(active: boolean) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (reduceMotion) return;
    scale.set(withSequence(withTiming(0.82, { duration: 70 }), withSpring(1, { damping: 9, stiffness: 320 })));
  }, [active, reduceMotion, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
}

/** Escala con resorte al presionar, en lugar de un cambio instantáneo. */
export function usePressScale(pressedScale = 0.97) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    onPressIn: () => scale.set(withSpring(pressedScale, { damping: 18, stiffness: 400 })),
    onPressOut: () => scale.set(withSpring(1, { damping: 14, stiffness: 300 })),
  };
}

const EASE_OUT_FUERTE = Easing.bezier(0.23, 1, 0.32, 1);

/** Ondas que salen de un elemento cada pocos segundos, como un pulso; decorativas, no reciben
 *  toques. Desaparecen si el sistema pide reducir el movimiento. */
export function Ripples({
  size,
  color,
  radius = size / 2,
  count = 2,
  duration = 2800,
  maxScale = 1.6,
  opacity = 0.45,
}: {
  size: number;
  color: string;
  radius?: number;
  count?: number;
  duration?: number;
  maxScale?: number;
  opacity?: number;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    progress.set(withRepeat(withTiming(1, { duration, easing: EASE_OUT_FUERTE }), -1, false));
  }, [duration, progress, reduceMotion]);
  if (reduceMotion) return null;
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Ripple
          key={index}
          progress={progress}
          offset={index / count}
          size={size}
          radius={radius}
          color={color}
          maxScale={maxScale}
          opacity={opacity}
        />
      ))}
    </>
  );
}

function Ripple({
  progress,
  offset,
  size,
  radius,
  color,
  maxScale,
  opacity,
}: {
  progress: SharedValue<number>;
  offset: number;
  size: number;
  radius: number;
  color: string;
  maxScale: number;
  opacity: number;
}) {
  const style = useAnimatedStyle(() => {
    const avance = (progress.get() + offset) % 1;
    return { opacity: opacity * (1 - avance), transform: [{ scale: 1 + (maxScale - 1) * avance }] };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', width: size, height: size, borderRadius: radius, backgroundColor: color, pointerEvents: 'none' }, style]}
    />
  );
}
