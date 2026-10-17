import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import type { EstadoArbol } from '@/shared/types/entities';
import { crearEstilos, useTema, type Paleta } from '@/theme';

/** Etiqueta y colores de cada estado del árbol en el tema dado. */
export function estadosArbol(palette: Paleta): Record<EstadoArbol, { label: string; color: string; background: string }> {
  return {
  sano: { label: 'Sano', color: palette.forest, background: palette.forestSoft },
  riesgo: { label: 'En riesgo', color: palette.amber, background: palette.amberSoft },
  critico: { label: 'Crítico', color: palette.red, background: palette.redSoft },
  };
}

/** Estados del árbol con los colores del tema en uso. */
export function useEstadosArbol() {
  return estadosArbol(useTema().palette);
}

export function StatusBadge({ estado }: { estado: EstadoArbol }) {
  const styles = useStyles();
  const style = useEstadosArbol()[estado];
  return (
    <View style={[styles.badge, { backgroundColor: style.background }]}>
      <View style={[styles.dot, { backgroundColor: style.color }]} />
      <Text style={[styles.text, { color: style.color }]}>{style.label}</Text>
    </View>
  );
}

const useStyles = crearEstilos(() => ({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontFamily: fonts.bold },
}));
