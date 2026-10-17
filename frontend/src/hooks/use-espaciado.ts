import { useIsWide } from '@/hooks/use-is-wide';

/** Espacios de las pantallas: en teléfonos son más chicos para aprovechar el ancho. `pagina` es
 *  el margen lateral, `tarjeta` el relleno de las tarjetas y `separacion` el espacio entre bloques. */
export function useEspaciado() {
  const isWide = useIsWide();
  return isWide
    ? { pagina: 20, tarjeta: 20, separacion: 20 }
    : { pagina: 12, tarjeta: 14, separacion: 12 };
}

/** Espacio final de las pantallas con desplazamiento: deja ver el contenido por encima del botón de Savia. */
export const ESPACIO_FINAL = 96;
