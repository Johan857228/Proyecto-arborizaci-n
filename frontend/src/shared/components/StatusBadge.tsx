import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette } from '@/config/constants';
import type { EstadoArbol } from '@/shared/types/entities';

export const estadoArbol: Record<EstadoArbol, { label: string; color: string; background: string }> = {
  sano: { label: 'Sano', color: palette.forest, background: palette.forestSoft },
  riesgo: { label: 'En riesgo', color: palette.amber, background: palette.amberSoft },
  critico: { label: 'Crítico', color: palette.red, background: palette.redSoft },
};

export function StatusBadge({ estado }: { estado: EstadoArbol }) {
  const style = estadoArbol[estado];
  return (
    <View style={[styles.badge, { backgroundColor: style.background }]}>
      <View style={[styles.dot, { backgroundColor: style.color }]} />
      <Text style={[styles.text, { color: style.color }]}>{style.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontFamily: fonts.bold },
});
