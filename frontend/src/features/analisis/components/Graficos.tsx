import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import type { Item } from '@/features/analisis/filtros';
import { formatNumero } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

/**
 * Gráficos del tablero de Análisis. Tocar una barra o una columna la elige como filtro (otra vez,
 * la suelta); mientras hay algo elegido, lo demás queda atenuado. Cada fila lleva su cifra escrita:
 * el color nunca es la única pista.
 */
export interface Parte {
  clave: string;
  etiqueta: string;
  valor: number;
  color: string;
}

const entero = (v: number) => formatNumero(v, 0);

export function Leyenda({ partes }: { partes: { etiqueta: string; color: string }[] }) {
  const styles = useStyles();
  return (
    <View style={styles.leyenda}>
      {partes.map((p) => (
        <View key={p.etiqueta} style={styles.leyendaItem}>
          <View style={[styles.muestra, { backgroundColor: p.color }]} />
          <Text style={styles.leyendaTexto}>{p.etiqueta}</Text>
        </View>
      ))}
    </View>
  );
}

function Vacio() {
  const styles = useStyles();
  return <Text style={styles.vacio}>No hay datos con estos filtros.</Text>;
}

/** Barras horizontales, una por categoría. */
export function Barras({
  items,
  seleccion,
  onSelect,
  color,
  formato = entero,
}: {
  items: Item[];
  seleccion?: string;
  onSelect?: (clave: string) => void;
  color?: string;
  formato?: (valor: number) => string;
}) {
  const styles = useStyles();
  const { palette } = useTema();
  if (!items.length) return <Vacio />;
  const maximo = Math.max(...items.map((i) => i.valor), 1);
  return (
    <View style={styles.lista}>
      {items.map((item) => {
        const elegida = seleccion === item.clave;
        const atenuada = seleccion !== undefined && !elegida;
        const seleccionable = Boolean(onSelect) && item.clave !== '__otras__';
        return (
          <Pressable
            key={item.clave}
            disabled={!seleccionable}
            accessibilityRole={seleccionable ? 'button' : undefined}
            accessibilityState={seleccionable ? { selected: elegida } : undefined}
            accessibilityLabel={`${item.etiqueta}: ${formato(item.valor)}`}
            onPress={() => onSelect?.(item.clave)}
            style={({ pressed }) => [styles.fila, elegida && styles.filaElegida, atenuada && styles.atenuada, pressed && styles.presionada]}
          >
            <Text style={[styles.etiqueta, elegida && styles.etiquetaElegida]} numberOfLines={1}>{item.etiqueta}</Text>
            <View style={styles.pista}>
              <View style={[styles.relleno, { width: `${Math.max((item.valor / maximo) * 100, item.valor ? 2 : 0)}%`, backgroundColor: color ?? palette.forest }]} />
            </View>
            <Text style={styles.valor}>{formato(item.valor)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Barras horizontales partidas por otra categoría (p. ej. zona por estado). */
export function BarrasApiladas({
  items,
  seleccion,
  onSelect,
}: {
  items: { clave: string; etiqueta: string; partes: Parte[] }[];
  seleccion?: string;
  onSelect?: (clave: string) => void;
}) {
  const styles = useStyles();
  if (!items.length) return <Vacio />;
  const total = (partes: Parte[]) => partes.reduce((s, p) => s + p.valor, 0);
  const maximo = Math.max(...items.map((i) => total(i.partes)), 1);
  return (
    <View style={styles.lista}>
      {items.map((item) => {
        const elegida = seleccion === item.clave;
        const atenuada = seleccion !== undefined && !elegida;
        const suma = total(item.partes);
        return (
          <Pressable
            key={item.clave}
            disabled={!onSelect}
            accessibilityRole={onSelect ? 'button' : undefined}
            accessibilityState={onSelect ? { selected: elegida } : undefined}
            accessibilityLabel={`${item.etiqueta}: ${item.partes.map((p) => `${p.etiqueta} ${p.valor}`).join(', ')}`}
            onPress={() => onSelect?.(item.clave)}
            style={({ pressed }) => [styles.fila, elegida && styles.filaElegida, atenuada && styles.atenuada, pressed && styles.presionada]}
          >
            <Text style={[styles.etiqueta, elegida && styles.etiquetaElegida]} numberOfLines={1}>{item.etiqueta}</Text>
            <View style={styles.pista}>
              <View style={[styles.apilada, { width: `${(suma / maximo) * 100}%` }]}>
                {item.partes.filter((p) => p.valor > 0).map((p) => (
                  <View key={p.clave} style={{ flexGrow: p.valor, flexBasis: 0, backgroundColor: p.color }} />
                ))}
              </View>
            </View>
            <Text style={styles.valor}>{entero(suma)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Columnas verticales apiladas (p. ej. inspecciones por mes, confirmadas y pendientes). */
export function Columnas({
  items,
  seleccion,
  onSelect,
  alto = 170,
}: {
  items: { clave: string; etiqueta: string; partes: Parte[] }[];
  seleccion?: string;
  onSelect?: (clave: string) => void;
  alto?: number;
}) {
  const styles = useStyles();
  const total = (partes: Parte[]) => partes.reduce((s, p) => s + p.valor, 0);
  const maximo = Math.max(...items.map((i) => total(i.partes)), 1);
  if (!items.length) return <Vacio />;
  return (
    <View style={[styles.columnas, { height: alto + 40 }]}>
      {items.map((item) => {
        const suma = total(item.partes);
        const elegida = seleccion === item.clave;
        const atenuada = seleccion !== undefined && !elegida;
        return (
          <Pressable
            key={item.clave}
            disabled={!onSelect}
            accessibilityRole={onSelect ? 'button' : undefined}
            accessibilityState={onSelect ? { selected: elegida } : undefined}
            accessibilityLabel={`${item.etiqueta}: ${item.partes.map((p) => `${p.etiqueta} ${p.valor}`).join(', ')}`}
            onPress={() => onSelect?.(item.clave)}
            style={({ pressed }) => [styles.columna, elegida && styles.columnaElegida, atenuada && styles.atenuada, pressed && styles.presionada]}
          >
            <Text style={styles.columnaValor}>{suma ? entero(suma) : ''}</Text>
            <View style={[styles.columnaPila, { height: (suma / maximo) * alto }]}>
              {item.partes.filter((p) => p.valor > 0).map((p) => (
                <View key={p.clave} style={{ flexGrow: p.valor, flexBasis: 0, backgroundColor: p.color }} />
              ))}
            </View>
            <Text style={[styles.columnaEtiqueta, elegida && styles.etiquetaElegida]} numberOfLines={1}>{item.etiqueta}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  lista: { gap: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32, paddingHorizontal: 8, borderRadius: 10 },
  filaElegida: { backgroundColor: palette.forestSoft },
  atenuada: { opacity: 0.45 },
  presionada: { opacity: 0.75 },
  etiqueta: { width: '34%', color: palette.ink, fontSize: 13 },
  etiquetaElegida: { color: palette.forest, fontFamily: fonts.extraBold },
  pista: { flex: 1, height: 12, borderRadius: 6, backgroundColor: palette.canvas, overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: 6 },
  apilada: { height: '100%', flexDirection: 'row', borderRadius: 6, overflow: 'hidden' },
  valor: { minWidth: 44, color: palette.ink, fontSize: 13, fontFamily: fonts.bold, textAlign: 'right' },
  vacio: { color: palette.muted, fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muestra: { width: 11, height: 11, borderRadius: 3 },
  leyendaTexto: { color: palette.muted, fontSize: 12 },
  columnas: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, borderBottomWidth: 1, borderBottomColor: palette.line, paddingBottom: 2 },
  columna: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingTop: 4, borderRadius: 8 },
  columnaElegida: { backgroundColor: palette.forestSoft },
  columnaValor: { color: palette.ink, fontSize: 11, fontFamily: fonts.bold },
  columnaPila: { width: '62%', flexDirection: 'column-reverse', borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden' },
  columnaEtiqueta: { color: palette.muted, fontSize: 10.5 },
}));
