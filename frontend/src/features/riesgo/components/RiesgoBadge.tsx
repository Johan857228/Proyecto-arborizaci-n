import { NOMBRE_CATEGORIA, type CategoriaRiesgo } from '@/features/riesgo/reglas';
import { Badge, type Tono } from '@/shared/components/UI';

export const TONO_CATEGORIA: Record<CategoriaRiesgo, Tono> = {
  bajo: 'sano',
  medio: 'info',
  alto: 'riesgo',
  inminente: 'critico',
};

export function RiesgoBadge({ categoria, corto = false }: { categoria: CategoriaRiesgo; corto?: boolean }) {
  return <Badge label={corto ? `Caída: ${NOMBRE_CATEGORIA[categoria]}` : `Riesgo de caída ${NOMBRE_CATEGORIA[categoria].toLowerCase()}`} tono={TONO_CATEGORIA[categoria]} />;
}
