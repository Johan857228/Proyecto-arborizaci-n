import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { fonts, palette } from '@/config/constants';
import type { GrupoObservacion, ObservacionCatalogo } from '@/features/catalogs/types';
import { useIsWide } from '@/hooks/use-is-wide';
import type { EstadoArbol } from '@/shared/types/entities';
import { InlineMessage } from '@/shared/components/FormControls';
import { Grid } from '@/shared/components/Grid';
import { Icon, type IconName } from '@/shared/components/Icon';
import { usePop } from '@/shared/components/Motion';
import { StatusBadge, estadoArbol } from '@/shared/components/StatusBadge';

const grupos: { key: GrupoObservacion; label: string; icon: IconName }[] = [
  { key: 'follaje', label: 'Follaje', icon: 'leaf' },
  { key: 'tronco', label: 'Tronco y ramas', icon: 'tree' },
  { key: 'raiz', label: 'Raíz y base', icon: 'roots' },
  { key: 'plagas', label: 'Plagas', icon: 'pest' },
];

// Vista previa con la regla provisional del backend (vista arboles_resumen):
// 0 observaciones = sano, 1 a 3 = en riesgo, 4 o más = crítico.
function estadoEstimado(cantidad: number): EstadoArbol {
  if (cantidad === 0) return 'sano';
  return cantidad <= 3 ? 'riesgo' : 'critico';
}

function ObservationRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const pop = usePop(selected);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <Animated.View style={[styles.checkbox, selected && styles.checkboxSelected, pop]}>
        {selected ? <Icon name="check" size={14} color={palette.paper} /> : null}
      </Animated.View>
      <Text style={[styles.rowText, selected && styles.rowTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ObservationPicker({
  observaciones,
  selected,
  error,
  onToggle,
  onClear,
}: {
  observaciones: ObservacionCatalogo[];
  selected: string[];
  error?: string;
  onToggle: (codigo: string) => void;
  onClear: () => void;
}) {
  const isWide = useIsWide();
  const estado = estadoEstimado(selected.length);
  const tono = estadoArbol[estado];
  const bloques = grupos
    .map((grupo) => ({
      ...grupo,
      items: observaciones
        .filter((observacion) => observacion.grupo === grupo.key)
        .sort((a, b) => a.orden - b.orden),
    }))
    .filter((grupo) => grupo.items.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Observaciones fitosanitarias</Text>
          <Text style={styles.subtitle}>Marca todo lo que observes, agrupado por parte del árbol.</Text>
        </View>
        {selected.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={onClear} style={styles.clear}>
            <Icon name="close" size={16} color={palette.forest} />
            <Text style={styles.clearText}>Limpiar selección</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.estimate, { backgroundColor: tono.background }]}>
        <View style={styles.estimateMain}>
          <Text style={styles.estimateLabel}>
            {selected.length === 0
              ? 'Sin observaciones marcadas'
              : `${selected.length} ${selected.length === 1 ? 'observación marcada' : 'observaciones marcadas'}`}
          </Text>
          <Text style={styles.estimateRule}>Estado estimado: 0 sano · 1 a 3 en riesgo · 4 o más crítico</Text>
        </View>
        <StatusBadge estado={estado} />
      </View>

      {error ? <InlineMessage>{error}</InlineMessage> : null}

      <Grid
        items={bloques}
        columns={isWide ? 2 : 1}
        gap={12}
        keyOf={(grupo) => grupo.key}
        renderItem={(grupo) => {
          const marcadas = grupo.items.filter((item) => selected.includes(item.codigo)).length;
          return (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={styles.groupIcon}><Icon name={grupo.icon} size={18} color={palette.forest} /></View>
                <Text style={styles.groupTitle}>{grupo.label}</Text>
                <Text style={[styles.groupCount, marcadas > 0 && styles.groupCountActive]}>
                  {marcadas}/{grupo.items.length}
                </Text>
              </View>
              <View style={styles.rows}>
                {grupo.items.map((item) => (
                  <ObservationRow
                    key={item.codigo}
                    label={item.etiqueta}
                    selected={selected.includes(item.codigo)}
                    onPress={() => onToggle(item.codigo)}
                  />
                ))}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  headerText: { flexGrow: 1, flexShrink: 1, flexBasis: 220, gap: 2 },
  title: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  clearText: { color: palette.forest, fontSize: 13, fontFamily: fonts.bold },
  estimate: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  estimateMain: { flex: 1, minWidth: 0, gap: 2 },
  estimateLabel: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  estimateRule: { color: palette.muted, fontSize: 12 },
  group: { flexGrow: 1, gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: '#FAFCFA' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.forestSoft },
  groupTitle: { flex: 1, color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  groupCount: { minWidth: 36, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden', textAlign: 'center', color: palette.muted, backgroundColor: palette.canvas, fontSize: 12, fontFamily: fonts.bold },
  groupCountActive: { color: palette.paper, backgroundColor: palette.forest },
  rows: { gap: 6 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', backgroundColor: palette.paper },
  rowSelected: { borderColor: 'rgba(27, 107, 74, 0.35)', backgroundColor: palette.forestSoft },
  pressed: { opacity: 0.75 },
  checkbox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1.5, borderColor: '#B7C4BC', backgroundColor: palette.paper },
  checkboxSelected: { borderColor: palette.forest, backgroundColor: palette.forest },
  rowText: { flex: 1, color: palette.ink, fontSize: 14 },
  rowTextSelected: { color: palette.forestDark, fontFamily: fonts.semiBold },
});
