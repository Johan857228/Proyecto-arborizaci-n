import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { fonts, palette } from '@/config/constants';
import { Icon, type IconName } from '@/shared/components/Icon';
import { useEntryProgress } from '@/shared/components/Motion';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Icono opcional en la leyenda (obligatorio para estados: el color nunca va solo). */
  icon?: IconName;
}

const percent = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 0 });

/**
 * Gráfico circular tipo dona. Las porciones se dibujan con un barrido al aparecer, llevan una
 * separación de 2 px y una leyenda con nombre, valor y porcentaje (el color nunca es la única pista).
 * Al pasar el cursor o tocar una porción o su fila, se resalta y su dato aparece en el centro.
 */
export function DonutChart({
  slices,
  centerLabel,
  size = 168,
  thickness = 22,
  delay = 300,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  size?: number;
  thickness?: number;
  delay?: number;
}) {
  const progress = useEntryProgress(1100, delay);
  const [activeKey, setActiveKey] = useState<string>();
  const visibles = slices.filter((slice) => slice.value > 0);
  const total = visibles.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - thickness) / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const gap = visibles.length > 1 ? 2 : 0;
  const active = visibles.find((slice) => slice.key === activeKey);

  // Cada porción empieza donde termina la anterior; el progreso hace el barrido inicial.
  const arcs = visibles.reduce<{ slice: DonutSlice; length: number; offset: number }[]>((acc, slice) => {
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    return [...acc, { slice, length: (slice.value / total) * circumference * progress, offset }];
  }, []);

  const toggle = (key: string) => setActiveKey((current) => (current === key ? undefined : key));
  // En web, react-native-svg pasa las props del responder táctil al DOM y React las rechaza;
  // por eso ahí se usan eventos de mouse (que además dan el resaltado al pasar el cursor).
  const sliceEvents = (key: string) => (Platform.OS === 'web'
    ? { onMouseEnter: () => setActiveKey(key), onMouseLeave: () => setActiveKey(undefined), onClick: () => toggle(key) }
    : { onPress: () => toggle(key) }) as object;

  const resumen = visibles.length === 0
    ? `${centerLabel}: sin datos`
    : visibles.map((slice) => `${slice.label} ${slice.value}`).join(', ');

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }} accessible accessibilityLabel={resumen}>
        <Svg width={size} height={size}>
          <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={palette.canvas} strokeWidth={thickness} fill="none" />
            {arcs.map(({ slice, length, offset: start }) => {
              const dimmed = active !== undefined && active.key !== slice.key;
              return (
                <Circle
                  key={slice.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={active?.key === slice.key ? thickness + 6 : thickness}
                  strokeDasharray={`${Math.max(length - gap, 0)} ${circumference}`}
                  strokeDashoffset={-start}
                  opacity={dimmed ? 0.3 : 1}
                  {...sliceEvents(slice.key)}
                />
              );
            })}
          </G>
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerValue}>{active ? active.value : total}</Text>
          <Text style={styles.centerLabel} numberOfLines={2}>
            {active ? `${active.label} · ${percent.format(active.value / total)}` : centerLabel}
          </Text>
        </View>
      </View>

      <View style={styles.legend}>
        {visibles.length === 0 ? <Text style={styles.empty}>Aún no hay datos para este gráfico.</Text> : null}
        {visibles.map((slice) => {
          const selected = active?.key === slice.key;
          return (
            <Pressable
              key={slice.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => toggle(slice.key)}
              onHoverIn={() => setActiveKey(slice.key)}
              onHoverOut={() => setActiveKey(undefined)}
              style={[styles.row, selected && styles.rowSelected]}
            >
              {slice.icon ? (
                <View style={[styles.swatchIcon, { backgroundColor: slice.color }]}>
                  <Icon name={slice.icon} size={12} color={palette.paper} />
                </View>
              ) : (
                <View style={[styles.swatch, { backgroundColor: slice.color }]} />
              )}
              <Text style={styles.rowLabel} numberOfLines={1}>{slice.label}</Text>
              <Text style={styles.rowValue}>{slice.value}</Text>
              <Text style={styles.rowPercent}>{percent.format(slice.value / total)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Dona y leyenda lado a lado cuando hay espacio; en tarjetas angostas la leyenda baja.
  container: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 20 },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  centerValue: { color: palette.ink, fontSize: 30, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  centerLabel: { marginTop: 2, color: palette.muted, fontSize: 12, textAlign: 'center' },
  legend: { flexGrow: 1, flexBasis: 180, gap: 4 },
  empty: { color: palette.muted, fontSize: 13, textAlign: 'center' },
  row: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 10 },
  rowSelected: { backgroundColor: palette.canvas },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  swatchIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  rowLabel: { flex: 1, color: palette.ink, fontSize: 14 },
  rowValue: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  rowPercent: { minWidth: 42, textAlign: 'right', color: palette.muted, fontSize: 13 },
});
