import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Cuadrícula de columnas iguales. La última fila se completa con espacios vacíos
 * para que sus elementos no se estiren más que los de arriba.
 */
export function Grid<T>({
  items,
  columns,
  gap = 12,
  keyOf,
  renderItem,
}: {
  items: T[];
  columns: number;
  gap?: number;
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns));
  }

  return (
    <View style={{ gap }}>
      {rows.map((row) => (
        <View key={row.map(keyOf).join('|')} style={[styles.row, { gap }]}>
          {row.map((item) => (
            <View key={keyOf(item)} style={styles.cell}>{renderItem(item)}</View>
          ))}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`vacio-${index}`} style={styles.cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { flex: 1, minWidth: 0 },
});
