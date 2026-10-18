import { useIsWide } from '@/hooks/use-is-wide';

/** Espacios de las pantallas: en teléfonos son más chicos para aprovechar el ancho. `pagina` es
 *  el margen lateral, `tarjeta` el relleno de las tarjetas y `separacion` el espacio entre bloques. */
export function useEspaciado() {
  const isWide = useIsWide();
  return isWide
    ? { pagina: 20, tarjeta: 20, separacion: 20 }
    : { pagina: 12, tarjeta: 14, separacion: 12 };
}

// Botón flotante de Savia (abajo a la derecha): su tamaño y su distancia a los bordes.
export const SAVIA_TAMANO = 58;
export const SAVIA_MARGEN = { telefono: 16, ancho: 28 };

/** Carril del botón de Savia al final de una pantalla: `alto` es lo que ocupa desde el borde
 *  inferior y `reservaDerecha` el ancho que hay que dejarle libre a la derecha. */
export function useCarrilSavia() {
  const margen = useIsWide() ? SAVIA_MARGEN.ancho : SAVIA_MARGEN.telefono;
  return { alto: margen + SAVIA_TAMANO, reservaDerecha: margen + SAVIA_TAMANO + 12 };
}

/** Espacio final de las pantallas con desplazamiento: deja ver el contenido por encima del botón
 *  de Savia en el teléfono (su carril más un respiro). */
export const ESPACIO_FINAL = SAVIA_MARGEN.telefono + SAVIA_TAMANO + 12;
