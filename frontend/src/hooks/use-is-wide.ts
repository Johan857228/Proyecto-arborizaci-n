import { useWindowDimensions } from 'react-native';

import { layout } from '@/config/constants';

/**
 * true en tablets y escritorio. Solo se usa en pantallas que se dibujan en el cliente
 * (todas están detrás de SessionGate), así que no genera diferencias con el render estático.
 */
export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= layout.wideBreakpoint;
}
