import { router, type Href } from 'expo-router';
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { fonts, layout } from '@/config/constants';
import { ESPACIO_FINAL, useEspaciado } from '@/hooks/use-espaciado';
import { fadeLine } from '@/shared/styles/gradient';
import { parsearNumero } from '@/shared/format';
import { getApiErrorMessage } from '@/services/api/client';
import { PrimaryButton, Screen } from '@/shared/components/FormControls';
import { Icon, type IconName } from '@/shared/components/Icon';
import { LeafWatermark } from '@/shared/components/LeafWatermark';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { crearEstilos, useTema, type Paleta } from '@/theme';

// Mismos tonos de la paleta "Campus UPC" que usan el inicio y el inventario.
export function tonosDe(palette: Paleta) {
  return {
    sano: { fondo: palette.forestSoft, texto: palette.forest },
    riesgo: { fondo: palette.amberSoft, texto: palette.amber },
    critico: { fondo: palette.redSoft, texto: palette.red },
    neutro: { fondo: palette.canvas, texto: palette.muted },
    info: { fondo: palette.skySoft, texto: palette.sky },
  };
}
export type Tono = keyof ReturnType<typeof tonosDe>;

/** Tonos (fondo y texto) de insignias, avisos y barras con los colores del tema en uso. */
export function useTonos() {
  return tonosDe(useTema().palette);
}

/** Pantalla con desplazamiento, ancho máximo y "jalar para actualizar" opcional. */
export function Page({
  children,
  maxWidth = layout.maxWidth,
  onRefresh,
  refreshing = false,
}: PropsWithChildren<{ maxWidth?: number; onRefresh?: () => void; refreshing?: boolean }>) {
  const styles = useStyles();
  const { palette } = useTema();
  const espacio = useEspaciado();
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.page, { maxWidth, paddingHorizontal: espacio.pagina, gap: espacio.separacion + 4 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.forest} colors={[palette.forest]} /> : undefined}
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
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => volver(backTo)}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <View style={styles.backIcon}><Icon name="back" size={16} color={palette.forest} /></View>
        <Text style={styles.backText}>Volver</Text>
      </Pressable>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          {eyebrow ? (
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDash} />
              <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  );
}

export function Badge({ label, tono = 'neutro' }: { label: string; tono?: Tono }) {
  const styles = useStyles();
  const tonos = useTonos();
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

/** Ícono de una tarjeta: cuadro con el tono suave y un borde fino, en lugar de un bloque sólido. */
export function IconChip({ icon, tono = 'sano', size = 34 }: { icon: IconName; tono?: Tono; size?: number }) {
  const styles = useStyles();
  const tonos = useTonos();
  return (
    <View style={[styles.iconChip, { width: size, height: size, borderRadius: Math.round(size * 0.32), backgroundColor: tonos[tono].fondo }]}>
      <Icon name={icon} size={Math.round(size * 0.53)} color={tonos[tono].texto} />
    </View>
  );
}

/** Encabezado de tarjeta: ícono, título, subtítulo opcional, acción a la derecha y una línea fina
 *  que se desvanece debajo, para separar el encabezado del contenido. */
export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title?: string;
  subtitle?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.cardHeaderWrap}>
      <View style={styles.cardHeader}>
        {icon ? <IconChip icon={icon} /> : null}
        <View style={styles.cardHeading}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {title ? <View style={styles.cardDivider} /> : null}
    </View>
  );
}

/** Tarjeta base: superficie sólida con borde fino, sombra en capas y una hoja de marca de agua en
 *  la esquina cuando tiene título. */
export function Card({
  children,
  title,
  subtitle,
  icon,
  action,
}: PropsWithChildren<{ title?: string; subtitle?: string; icon?: IconName; action?: ReactNode }>) {
  const styles = useStyles();
  const espacio = useEspaciado();
  return (
    <View style={[styles.card, { padding: espacio.tarjeta }]}>
      {title ? <LeafWatermark /> : null}
      {title || action ? <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} /> : null}
      {children}
    </View>
  );
}

export function StatGrid({ children }: PropsWithChildren) {
  const styles = useStyles();
  return <View style={styles.statGrid}>{children}</View>;
}

export function StatTile({
  label,
  value,
  hint,
  tono,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tono?: Tono;
  icon?: IconName;
}) {
  const styles = useStyles();
  const tonos = useTonos();
  const tonoMarca = tono ?? 'sano';
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        {icon ? <IconChip icon={icon} tono={tonoMarca} size={28} /> : <View style={[styles.statDot, { backgroundColor: tonos[tonoMarca].texto }]} />}
        <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
      </View>
      <Text style={[styles.statValue, tono ? { color: tonos[tono].texto } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function ProgressBar({ pct, tono = 'sano' }: { pct: number | null | undefined; tono?: Tono }) {
  const styles = useStyles();
  const tonos = useTonos();
  const ancho = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <View style={styles.barra} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ancho) }}>
      <View style={[styles.barraRelleno, { width: `${ancho}%`, backgroundColor: tonos[tono].texto }]} />
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? <Text style={styles.kvValue}>{value}</Text> : value}
    </View>
  );
}

export function LoadingState({ text = 'Cargando…' }: { text?: string }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.state}>
      <ActivityIndicator color={palette.forest} />
      <Text style={styles.stateText}>{text}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.state}>
      <IconChip icon="error" tono="critico" size={40} />
      <Text style={styles.errorTitle}>No se pudo cargar la información</Text>
      <Text style={styles.stateText}>{getApiErrorMessage(error)}</Text>
      {onRetry ? <PrimaryButton title="Reintentar" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.state}>
      <LeafWatermark size={110} />
      <IconChip icon="leaf" size={40} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.stateText}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function Notice({ children, tono = 'info' }: PropsWithChildren<{ tono?: Tono }>) {
  const styles = useStyles();
  const tonos = useTonos();
  return (
    <View style={[styles.notice, { backgroundColor: tonos[tono].fondo }]} accessibilityRole="alert">
      <View style={[styles.noticeBar, { backgroundColor: tonos[tono].texto }]} />
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
  const styles = useStyles();
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
  const styles = useStyles();
  const { palette } = useTema();
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
        placeholderTextColor={palette.placeholder}
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
  const styles = useStyles();
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
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
}

export function Cell({ children, basis = 200 }: PropsWithChildren<{ basis?: number }>) {
  const styles = useStyles();
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
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.navCard, pressed && styles.pressed]}
    >
      {icon ? <IconChip icon={icon} size={40} /> : null}
      <View style={styles.navBody}>
        <View style={styles.navHeader}>
          <Text style={styles.navTitle}>{title}</Text>
          {badge !== undefined && badge !== 0 ? (
            <View style={styles.navBadge}><Text style={styles.navBadgeText}>{badge}</Text></View>
          ) : null}
        </View>
        <Text style={styles.navText}>{text}</Text>
      </View>
      <View style={styles.navArrow}><Icon name="chevronRight" size={16} color={palette.forest} /></View>
    </Pressable>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  page: { width: '100%', alignSelf: 'center', padding: 20, paddingTop: 20, paddingBottom: ESPACIO_FINAL, gap: 16 },
  pressed: { opacity: 0.75 },
  header: { gap: 10, marginBottom: 4 },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingRight: 12 },
  backIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.paper },
  backText: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 },
  headerText: { flexGrow: 3, flexShrink: 1, flexBasis: 320, gap: 6 },
  headerRight: { flexGrow: 1, flexBasis: 180, maxWidth: 320 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrowDash: { width: 18, height: 2, borderRadius: 1, backgroundColor: palette.leaf },
  eyebrow: { color: palette.forest, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1.4 },
  title: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 12, fontFamily: fonts.bold },
  iconChip: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.hairline },
  card: { overflow: 'hidden', padding: 20, gap: 14, ...card },
  cardHeaderWrap: { gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeading: { flex: 1, gap: 2 },
  cardTitle: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
  cardSubtitle: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  cardDivider: { height: 1, ...fadeLine(palette.hairline) },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: 140, minHeight: 92, justifyContent: 'space-between', gap: 8, padding: 14, ...card, borderRadius: 18 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statValue: { color: palette.ink, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  statLabel: { flex: 1, color: palette.muted, fontSize: 12, fontFamily: fonts.semiBold },
  statHint: { color: palette.muted, fontSize: 11 },
  barra: { height: 8, borderRadius: 4, backgroundColor: palette.line, overflow: 'hidden' },
  barraRelleno: { height: 8, borderRadius: 4 },
  kv: { flexGrow: 1, flexBasis: 150, gap: 3 },
  kvLabel: { color: palette.muted, fontSize: 11, fontFamily: fonts.semiBold, letterSpacing: 0.3 },
  kvValue: { color: palette.ink, fontSize: 14, fontFamily: fonts.semiBold },
  state: { overflow: 'hidden', alignItems: 'center', gap: 10, padding: 24, ...card },
  stateText: { maxWidth: 420, color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  errorTitle: { color: palette.red, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  emptyTitle: { color: palette.ink, fontSize: 16, fontFamily: fonts.extraBold, textAlign: 'center' },
  notice: { overflow: 'hidden', paddingVertical: 11, paddingLeft: 16, paddingRight: 12, borderRadius: 12 },
  noticeBar: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3 },
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
  navCard: { flexGrow: 1, flexBasis: 250, minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, ...card, borderRadius: 18 },
  navBody: { flex: 1, gap: 4 },
  navHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navTitle: { flexShrink: 1, color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  navText: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  navArrow: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.canvas },
  navBadge: { minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 12, backgroundColor: palette.amber },
  navBadgeText: { color: palette.paper, fontSize: 12, fontFamily: fonts.extraBold, textAlign: 'center' },
}));
