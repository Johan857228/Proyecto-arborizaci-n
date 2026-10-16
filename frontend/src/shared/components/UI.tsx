import { router, type Href } from 'expo-router';
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fonts, layout, palette, shadows } from '@/config/constants';
import { parsearNumero } from '@/shared/format';
import { getApiErrorMessage } from '@/services/api/client';
import { PrimaryButton, Screen } from '@/shared/components/FormControls';
import { Icon, type IconName } from '@/shared/components/Icon';
import { StatusBadge } from '@/shared/components/StatusBadge';

// Mismos tonos de la paleta "Campus UPC" que usan el inicio y el inventario.
export const tonos = {
  sano: { fondo: palette.forestSoft, texto: palette.forest },
  riesgo: { fondo: palette.amberSoft, texto: palette.amber },
  critico: { fondo: palette.redSoft, texto: palette.red },
  neutro: { fondo: palette.canvas, texto: palette.muted },
  info: { fondo: palette.skySoft, texto: palette.sky },
};
export type Tono = keyof typeof tonos;

/** Pantalla con desplazamiento, ancho máximo y "jalar para actualizar" opcional. */
export function Page({
  children,
  maxWidth = layout.maxWidth,
  onRefresh,
  refreshing = false,
}: PropsWithChildren<{ maxWidth?: number; onRefresh?: () => void; refreshing?: boolean }>) {
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.page, { maxWidth }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
    </Screen>
  );
}

export function volver(destino: Href = '/(app)' as Href) {
  if (router.canGoBack()) router.back();
  else router.replace(destino);
}

export function AppHeader({
  title,
  eyebrow,
  subtitle,
  right,
  backTo,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  right?: ReactNode;
  backTo?: Href;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => volver(backTo)}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Icon name="back" size={18} color={palette.forest} />
        <Text style={styles.backText}>Volver</Text>
      </Pressable>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  );
}

export function Badge({ label, tono = 'neutro' }: { label: string; tono?: Tono }) {
  return (
    <View style={[styles.badge, { backgroundColor: tonos[tono].fondo }]}>
      <Text style={[styles.badgeText, { color: tonos[tono].texto }]}>{label}</Text>
    </View>
  );
}

export function StateBadge({ estado }: { estado: 'sano' | 'riesgo' | 'critico' }) {
  return <StatusBadge estado={estado} />;
}

const REVISION = {
  pendiente: { label: 'Pendiente de revisión', tono: 'riesgo' },
  confirmada: { label: 'Confirmada', tono: 'sano' },
  anulada: { label: 'Anulada', tono: 'critico' },
} as const;
export function RevisionBadge({ estado }: { estado: 'pendiente' | 'confirmada' | 'anulada' }) {
  return <Badge label={REVISION[estado].label} tono={REVISION[estado].tono} />;
}

export function Card({ children, title, action }: PropsWithChildren<{ title?: string; action?: ReactNode }>) {
  return (
    <View style={styles.card}>
      {title || action ? (
        <View style={styles.cardHeader}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function StatGrid({ children }: PropsWithChildren) {
  return <View style={styles.statGrid}>{children}</View>;
}

export function StatTile({ label, value, hint, tono }: { label: string; value: string | number; hint?: string; tono?: Tono }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tono ? { color: tonos[tono].texto } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function ProgressBar({ pct, tono = 'sano' }: { pct: number | null | undefined; tono?: Tono }) {
  const ancho = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <View style={styles.barra} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ancho) }}>
      <View style={[styles.barraRelleno, { width: `${ancho}%`, backgroundColor: tonos[tono].texto }]} />
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? <Text style={styles.kvValue}>{value}</Text> : value}
    </View>
  );
}

export function LoadingState({ text = 'Cargando…' }: { text?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={palette.forest} />
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <Text style={styles.errorTitle}>No se pudo cargar la información</Text>
      <Text style={styles.stateText}>{getApiErrorMessage(error)}</Text>
      {onRetry ? <PrimaryButton title="Reintentar" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={styles.state}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.stateText}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function Notice({ children, tono = 'info' }: PropsWithChildren<{ tono?: Tono }>) {
  return (
    <View style={[styles.notice, { backgroundColor: tonos[tono].fondo }]} accessibilityRole="alert">
      <Text style={[styles.noticeText, { color: tonos[tono].texto }]}>{children}</Text>
    </View>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Campo numérico: conserva lo que se escribe (p. ej. "8," o "8.") y entrega un número,
 *  undefined si está vacío o NaN si no es un número válido. Acepta coma decimal. */
export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  help,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (value: number | undefined) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  help?: string;
}) {
  const [texto, setTexto] = useState(value == null || Number.isNaN(value) ? '' : String(value));
  const [emitido, setEmitido] = useState<number | undefined | null>(value);
  if (!Object.is(value, emitido)) {
    // El valor cambió desde fuera (p. ej. al reiniciar el formulario)
    setEmitido(value);
    setTexto(value == null || Number.isNaN(value) ? '' : String(value));
  }
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={texto}
        onChangeText={(nuevo) => {
          const numero = parsearNumero(nuevo);
          setTexto(nuevo);
          setEmitido(numero);
          onChange(numero);
        }}
        onBlur={onBlur}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor="#89948D"
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {help && !error ? <Text style={styles.help}>{help}</Text> : null}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/** Botón de dos pasos para acciones que no se pueden deshacer. */
export function ConfirmButton({
  title,
  confirmTitle = '¿Confirmas?',
  onConfirm,
  loading = false,
  disabled = false,
}: {
  title: string;
  confirmTitle?: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [preguntando, setPreguntando] = useState(false);
  if (!preguntando) {
    return <PrimaryButton title={title} variant="secondary" disabled={disabled} loading={loading} onPress={() => setPreguntando(true)} />;
  }
  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmText}>{confirmTitle}</Text>
      <View style={styles.confirmActions}>
        <View style={styles.flex}>
          <PrimaryButton title="Sí" loading={loading} onPress={() => { setPreguntando(false); onConfirm(); }} />
        </View>
        <View style={styles.flex}>
          <PrimaryButton title="Cancelar" variant="secondary" onPress={() => setPreguntando(false)} />
        </View>
      </View>
    </View>
  );
}

export function Row({ children }: PropsWithChildren) {
  return <View style={styles.row}>{children}</View>;
}

export function Cell({ children, basis = 200 }: PropsWithChildren<{ basis?: number }>) {
  return <View style={[styles.cell, { flexBasis: basis }]}>{children}</View>;
}

export function NavCard({
  title,
  text,
  href,
  badge,
  icon,
}: {
  title: string;
  text: string;
  href: Href;
  badge?: string | number;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.navCard, pressed && styles.pressed]}
    >
      <View style={styles.navHeader}>
        {icon ? (
          <View style={styles.navIcon}><Icon name={icon} size={18} color={palette.forest} /></View>
        ) : null}
        <Text style={styles.navTitle}>{title}</Text>
        {badge !== undefined && badge !== 0 ? (
          <View style={styles.navBadge}><Text style={styles.navBadgeText}>{badge}</Text></View>
        ) : null}
      </View>
      <Text style={styles.navText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', alignSelf: 'center', padding: 20, paddingTop: 24, paddingBottom: 48, gap: 16 },
  pressed: { opacity: 0.75 },
  header: { gap: 10, marginBottom: 4 },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingRight: 12 },
  backText: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 },
  headerText: { flexGrow: 3, flexShrink: 1, flexBasis: 320, gap: 6 },
  headerRight: { flexGrow: 1, flexBasis: 180, maxWidth: 320 },
  eyebrow: { color: palette.forest, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1.4 },
  title: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 12, fontFamily: fonts.bold },
  card: { padding: 20, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, boxShadow: shadows.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold, flexShrink: 1 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: 150, minHeight: 84, justifyContent: 'center', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, boxShadow: shadows.card },
  statValue: { color: palette.ink, fontSize: 24, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  statLabel: { marginTop: 3, color: palette.muted, fontSize: 13, fontWeight: '500' },
  statHint: { marginTop: 2, color: palette.muted, fontSize: 11 },
  barra: { height: 8, borderRadius: 4, backgroundColor: palette.line, overflow: 'hidden' },
  barraRelleno: { height: 8, borderRadius: 4 },
  kv: { flexGrow: 1, flexBasis: 150, gap: 3 },
  kvLabel: { color: palette.muted, fontSize: 11 },
  kvValue: { color: palette.ink, fontSize: 14, fontFamily: fonts.semiBold },
  state: { alignItems: 'center', gap: 10, padding: 28, borderWidth: 1, borderColor: palette.line, borderRadius: 20, backgroundColor: palette.paper, boxShadow: shadows.card },
  stateText: { maxWidth: 420, color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  errorTitle: { color: palette.red, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  emptyTitle: { color: palette.ink, fontSize: 16, fontFamily: fonts.extraBold, textAlign: 'center' },
  notice: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12 },
  noticeText: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  tabs: { gap: 8, paddingBottom: 2 },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  tabSelected: { borderColor: palette.forest, backgroundColor: palette.forest },
  tabText: { color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  tabTextSelected: { color: palette.paper },
  field: { gap: 7, marginBottom: 14 },
  fieldLabel: { color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 14, color: palette.ink, backgroundColor: palette.paper, fontSize: 16 },
  inputError: { borderColor: palette.red },
  help: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  fieldError: { color: palette.red, fontSize: 13, lineHeight: 18 },
  confirm: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.canvas },
  confirmText: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  confirmActions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  // En pantallas angostas las celdas bajan a otra línea: rowGap separa los botones apilados.
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 10 },
  cell: { flexGrow: 1 },
  navCard: { flexGrow: 1, flexBasis: 250, minHeight: 96, padding: 18, gap: 8, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, boxShadow: shadows.card },
  navHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.forestSoft },
  navTitle: { flex: 1, color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
  navText: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  navBadge: { minWidth: 26, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 13, backgroundColor: palette.amber },
  navBadgeText: { color: palette.paper, fontSize: 12, fontFamily: fonts.extraBold, textAlign: 'center' },
});
