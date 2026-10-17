import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

// Tonos de hojas del campus: lima, verdes y amarillos con un toque de terracota.
const COLORES = ['#B4DA55', '#C9E777', '#8FCB3A', '#5E9E3D', '#2F7D3A', '#F2C14E', '#F59E0B', '#D9822B'];
const HOJA = 'M3 21 C3 11 9 3 21 3 C21 15 13 21 3 21 Z';
const NERVIO = 'M5 19 L16 8';
const NERVIOS_LATERALES = 'M9 15 L9 11 M12 12 L16 12';

// Capas de profundidad: al fondo hojas pequeñas, tenues y lentas; adelante grandes y rápidas.
const CAPAS = [
  { peso: 0.4, tamano: [10, 16], opacidad: [0.4, 0.6], duracion: [3000, 3800], vaiven: [8, 16] },
  { peso: 0.4, tamano: [18, 30], opacidad: [0.8, 0.95], duracion: [2200, 3000], vaiven: [14, 28] },
  { peso: 0.2, tamano: [36, 56], opacidad: [0.9, 1], duracion: [1500, 2100], vaiven: [24, 44] },
] as const;

interface Hoja {
  inicioX: number;
  inicioY: number;
  empujeX: number;
  tamano: number;
  color: string;
  retraso: number;
  duracion: number;
  vaiven: number;
  oscilaciones: number;
  fase: number;
  giroInicial: number;
  giro: number;
  volteos: number;
  opacidad: number;
}

const entre = (rango: readonly [number, number]) => rango[0] + Math.random() * (rango[1] - rango[0]);

function crearHojas(cantidad: number, ancho: number, alto: number): Hoja[] {
  // Ordenadas de menor a mayor: las grandes (más cerca) se dibujan encima.
  return crearSinOrden(cantidad, ancho, alto).sort((a, b) => a.tamano - b.tamano);
}

function crearSinOrden(cantidad: number, ancho: number, alto: number): Hoja[] {
  return Array.from({ length: cantidad }, () => {
    const sorteo = Math.random();
    const capa = sorteo < CAPAS[0].peso ? CAPAS[0] : sorteo < CAPAS[0].peso + CAPAS[1].peso ? CAPAS[1] : CAPAS[2];
    const tamano = entre(capa.tamano);
    return {
      // Entran desde arriba y la izquierda, y el viento las empuja en diagonal hacia la derecha.
      inicioX: (Math.random() * 1.1 - 0.35) * ancho,
      inicioY: -tamano - Math.random() * alto * 0.35,
      empujeX: ancho * (0.35 + Math.random() * 0.5),
      tamano,
      color: COLORES[Math.floor(Math.random() * COLORES.length)],
      retraso: Math.random() * 550,
      duracion: entre(capa.duracion),
      vaiven: entre(capa.vaiven),
      oscilaciones: 1 + Math.random() * 1.8,
      fase: Math.random() * Math.PI * 2,
      giroInicial: Math.random() * 360,
      giro: (Math.random() > 0.5 ? 1 : -1) * (240 + Math.random() * 420),
      volteos: 1.5 + Math.random() * 2.5,
      opacidad: entre(capa.opacidad),
    };
  });
}

/** Ráfaga de hojas que cruza la pantalla una vez al aparecer: caen en diagonal empujadas por el
 *  viento, meciéndose, girando y volteándose, en tres capas de profundidad. Decorativa: no recibe
 *  toques y no se muestra si el sistema pide reducir el movimiento. */
export function FallingLeaves({ cantidad = 34 }: { cantidad?: number }) {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  // Se sortean una vez por pantalla (en el inicializador, no en cada render).
  const [hojas] = useState(() => crearHojas(cantidad, width, height));
  if (reduceMotion) return null;
  return (
    <View style={styles.capa}>
      {hojas.map((hoja, indice) => (
        <HojaEnElViento key={indice} hoja={hoja} alto={height} />
      ))}
    </View>
  );
}

function HojaEnElViento({ hoja, alto }: { hoja: Hoja; alto: number }) {
  const avance = useSharedValue(0);

  useEffect(() => {
    avance.set(withDelay(hoja.retraso, withTiming(1, { duration: hoja.duracion, easing: Easing.linear })));
  }, [avance, hoja.duracion, hoja.retraso]);

  const estilo = useAnimatedStyle(() => {
    const p = avance.get();
    // El viento empuja fuerte al principio y luego afloja (curva de salida).
    const empuje = 1 - (1 - p) * (1 - p);
    const entrada = Math.min(1, p / 0.06);
    const salida = Math.min(1, (1 - p) / 0.12);
    return {
      opacity: p === 0 ? 0 : hoja.opacidad * Math.min(entrada, salida),
      transform: [
        { translateX: hoja.inicioX + hoja.empujeX * empuje + hoja.vaiven * Math.sin(p * Math.PI * 2 * hoja.oscilaciones + hoja.fase) },
        { translateY: hoja.inicioY + p * (alto - hoja.inicioY + hoja.tamano) },
        { rotate: `${hoja.giroInicial + p * hoja.giro}deg` },
        // La hoja "se voltea": se angosta y se ensancha como si girara sobre sí misma.
        { scaleX: 0.25 + 0.75 * Math.abs(Math.cos(p * Math.PI * hoja.volteos)) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.hoja, { width: hoja.tamano, height: hoja.tamano }, estilo]}>
      <Svg width="100%" height="100%" viewBox="0 0 24 24">
        <Path d={HOJA} fill={hoja.color} />
        <Path d={NERVIO} stroke="rgba(15, 61, 38, 0.5)" strokeWidth={1.4} strokeLinecap="round" />
        <Path d={NERVIOS_LATERALES} stroke="rgba(15, 61, 38, 0.35)" strokeWidth={1} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  capa: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 20 },
  hoja: { position: 'absolute', top: 0, left: 0 },
});
