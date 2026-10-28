import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// Isotipo "Hoja-Pin": una hoja lima que también es un pin de mapa (el árbol ubicado en el
// inventario); su nervadura dibuja un árbol y el punto ámbar marca la ubicación. Mismos trazos
// que el ícono de la app (assets/images/icon.png).
const PUNTO = 'M28.889 52.185A9 3 0 1 0 35.111 52.185L33.6 54.2A2 2 0 0 1 30.4 54.2Z';
const HOJA = 'M32 53C36.5 47 49.5 37.5 49.5 26C49.5 15.5 39.5 10 32 6.5C24.5 10 14.5 15.5 14.5 26C14.5 37.5 27.5 47 32 53Z';
const CARA_ILUMINADA = 'M32 53C27.5 47 14.5 37.5 14.5 26C14.5 15.5 24.5 10 32 6.5Z';
const NERVADURA = 'M30 44L30 38.786A25.6 25.6 0 0 1 19.539 28.267A1.6 1.6 0 0 1 22.365 26.765A22.4 22.4 0 0 0 30 35.072L30 29.697A22.6 22.6 0 0 1 21.213 19.65A1.6 1.6 0 0 1 24.136 18.349A19.4 19.4 0 0 0 30 25.811L30 14A2 2 0 0 1 34 14L34 25.811A19.4 19.4 0 0 0 39.864 18.349A1.6 1.6 0 0 1 42.787 19.65A22.6 22.6 0 0 1 34 29.697L34 35.072A22.4 22.4 0 0 0 41.635 26.765A1.6 1.6 0 0 1 44.461 28.267A25.6 25.6 0 0 1 34 38.786L34 44A2 2 0 0 1 30 44Z';

/** Marca de Arbolado Escolar (cuadrado redondeado verde con la hoja-pin). Igual en los dos temas. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Arbolado Escolar">
      <Defs>
        <LinearGradient id="marcaFondo" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#1B7A41" />
          <Stop offset="0.55" stopColor="#166534" />
          <Stop offset="1" stopColor="#0F3D26" />
        </LinearGradient>
        <RadialGradient id="marcaBrillo" cx="0.3" cy="0.2" r="0.62">
          <Stop offset="0" stopColor="#B4DA55" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#B4DA55" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={64} height={64} rx={18} ry={18} fill="url(#marcaFondo)" />
      <Rect x={0} y={0} width={64} height={64} rx={18} ry={18} fill="url(#marcaBrillo)" />
      <Path fill="#F59E0B" d={PUNTO} />
      <Path fill="#B4DA55" d={HOJA} />
      <Path fill="#FFFFFF" opacity={0.22} d={CARA_ILUMINADA} />
      <Path fill="#0F3D26" d={NERVADURA} />
    </Svg>
  );
}
