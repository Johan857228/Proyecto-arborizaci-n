import { useQuery } from '@tanstack/react-query';

import { analisisSchema } from '@/features/analisis/schemas';
import { getValidado } from '@/services/api/client';

export type { Analisis, ArbolAnalisis, HallazgoAnalisis, InspeccionAnalisis, IntervencionAnalisis } from '@/features/analisis/schemas';

/** Cada cuánto se vuelven a pedir los datos mientras la pantalla está abierta. */
export const INTERVALO_EN_VIVO_MS = 20_000;

export const analisisService = {
  datos: (institucionId?: string) => getValidado('/analisis', analisisSchema, { institucion_id: institucionId }),
};

/** Datos del tablero, en vivo: se piden de nuevo cada 20 segundos mientras la pantalla está abierta
 *  (y al volver a la ventana), así lo que se registra en el colegio aparece sin recargar. */
export function useAnalisis(institucionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['analisis', institucionId ?? 'todas'],
    queryFn: () => analisisService.datos(institucionId),
    enabled,
    staleTime: 10_000,
    refetchInterval: INTERVALO_EN_VIVO_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
