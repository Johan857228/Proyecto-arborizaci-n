import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Animated from 'react-native-reanimated';

import { fonts } from '@/config/constants';
import { Icon, type IconName } from '@/shared/components/Icon';
import { LeafWatermark } from '@/shared/components/LeafWatermark';
import { FadeIn, usePressScale } from '@/shared/components/Motion';
import { useEspaciado } from '@/hooks/use-espaciado';
import { fadeLine, gradient } from '@/shared/styles/gradient';
import { findOption } from '@/shared/utils/forms';
import { crearEstilos, useTema, type Paleta } from '@/theme';

export function Screen({ children }: PropsWithChildren) {
  const styles = useStyles();
  return <View style={styles.screen}>{children}</View>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  const styles = useStyles();
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Heading({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{children}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Field({
  label,
  error,
  hint,
  ...props
}: { label: string; error?: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  const styles = useStyles();
  const { palette } = useTema();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        placeholderTextColor={palette.placeholder}
        selectionColor={palette.forest}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          focused && styles.focused,
          error && styles.invalid,
        ]}
      />
      {error ? <FieldError message={error} /> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function FieldError({ message }: { message: string }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.fieldError}>
      <Icon name="error" size={14} color={palette.red} />
      <Text style={styles.fieldErrorText}>{message}</Text>
    </View>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Seleccionar',
  error,
}: {
  label: string;
  value: T | undefined;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
}) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.pickerWrap, error && styles.invalid]}>
        <Picker
          style={Platform.OS === 'web' ? styles.webPicker : styles.nativePicker}
          dropdownIconColor={palette.muted}
          selectedValue={value ?? ''}
          onValueChange={(next) => {
            const selectedOption = findOption(options, next);
            if (selectedOption) onChange(selectedOption.value);
          }}
        >
          <Picker.Item label={placeholder} value="" />
          {options.map((option) => (
            <Picker.Item key={String(option.value)} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  icon,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  compact?: boolean;
}) {
  const hoverStyles = useHoverStyles();
  const styles = useStyles();
  const { palette } = useTema();
  // El botón principal es un degradado verde oscuro en los dos temas: su texto siempre es blanco.
  const textColor = variant === 'primary' ? palette.white : variant === 'ghost' ? palette.forest : palette.ink;
  const press = usePressScale();
  const [hovered, setHovered] = useState(false);
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || loading}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={[
          styles.button,
          variant === 'primary' && styles.primaryButton,
          compact && styles.compactButton,
          variant === 'secondary' && styles.secondaryButton,
          variant === 'ghost' && styles.ghostButton,
          hovered && !disabled && !loading && hoverStyles[variant],
          (disabled || loading) && styles.disabledButton,
        ]}>
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : icon ? (
          <Icon name={icon} size={compact ? 18 : 20} color={textColor} />
        ) : null}
        <Text style={[styles.buttonText, compact && styles.compactButtonText, { color: textColor }]}>
          {loading ? 'Procesando…' : title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// Cambio de color al pasar el cursor (solo en web/escritorio).
const useHoverStyles = crearEstilos(({ palette, oscuro }) => ({
  primary: gradient(oscuro ? 'linear-gradient(135deg, #1B7A41 0%, #0E3A24 100%)' : 'linear-gradient(135deg, #166534 0%, #0B2E1D 100%)'),
  secondary: { backgroundColor: palette.canvas, borderColor: palette.forestSoft },
  ghost: { backgroundColor: palette.forestSoft },
}));

/** Sección de formulario: tarjeta con encabezado (ícono, paso, título y descripción), línea fina
 *  que se desvanece y la hoja de marca de agua en la esquina. */
export function Section({
  title,
  description,
  icon,
  step,
  children,
}: PropsWithChildren<{ title: string; description?: string; icon?: IconName; step?: number }>) {
  const styles = useStyles();
  const { palette } = useTema();
  const espacio = useEspaciado();
  return (
    <FadeIn index={step ?? 0} style={[styles.section, { padding: espacio.tarjeta }]}>
      <LeafWatermark />
      <View style={styles.sectionTop}>
        <View style={styles.sectionHeader}>
          {icon ? (
            <View style={styles.sectionIcon}>
              <Icon name={icon} size={20} color={palette.forest} />
            </View>
          ) : null}
          <View style={styles.sectionHeading}>
            {step ? <Text style={styles.sectionStep}>Paso {step}</Text> : null}
            <Text style={styles.sectionTitle}>{title}</Text>
            {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
          </View>
        </View>
        <View style={styles.sectionDivider} />
      </View>
      {children}
    </FadeIn>
  );
}

export function Surface({ children }: PropsWithChildren) {
  const styles = useStyles();
  const espacio = useEspaciado();
  return <View style={[styles.surface, { padding: Math.min(espacio.tarjeta, 16) }]}>{children}</View>;
}

function messageTonesDe(palette: Paleta) {
  return {
    error: { icon: 'error', color: palette.red, background: palette.redSoft },
    warning: { icon: 'warning', color: palette.amber, background: palette.amberSoft },
    info: { icon: 'info', color: palette.forest, background: palette.forestSoft },
    success: { icon: 'checkCircle', color: palette.forest, background: palette.forestSoft },
  } as const satisfies Record<string, { icon: IconName; color: string; background: string }>;
}

export function InlineMessage({
  children,
  tone = 'error',
}: PropsWithChildren<{ tone?: keyof ReturnType<typeof messageTonesDe> }>) {
  const styles = useStyles();
  const { palette } = useTema();
  const style = messageTonesDe(palette)[tone];
  return (
    <View style={[styles.message, { backgroundColor: style.background }]} accessibilityRole="alert">
      <View style={[styles.messageBar, { backgroundColor: style.color }]} />
      <Icon name={style.icon} size={18} color={style.color} />
      <Text style={[styles.messageText, { color: tone === 'info' ? palette.ink : style.color }]}>{children}</Text>
    </View>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selectedChip, pressed && styles.pressed]}
    >
      {selected ? <Icon name="check" size={16} color={palette.forest} /> : null}
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = crearEstilos(({ palette, gradients, card, oscuro }) => ({
  screen: { flex: 1, backgroundColor: 'transparent' },
  eyebrow: { color: palette.forest, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 1.2 },
  heading: { gap: 6 },
  title: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold, lineHeight: 34, letterSpacing: -0.4 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  fieldWrap: { gap: 7, marginBottom: 14 },
  label: { color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 14, color: palette.ink, backgroundColor: palette.paper, fontSize: 16 },
  multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
  // Borde verde y halo suave al enfocar; en web reemplaza el contorno azul del navegador.
  focused: { borderColor: palette.forest, boxShadow: oscuro ? '0 0 0 3px rgba(92, 201, 138, 0.18)' : '0 0 0 3px rgba(27, 107, 74, 0.15)', outlineWidth: 0 },
  invalid: { borderColor: palette.red },
  fieldError: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldErrorText: { flex: 1, color: palette.red, fontSize: 13, lineHeight: 18 },
  hint: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  pickerWrap: { borderWidth: 1, borderColor: palette.line, borderRadius: 14, backgroundColor: palette.paper, overflow: 'hidden' },
  // En web el Picker es un <select> nativo: se quita su borde y se iguala al alto, la letra y el relleno de los campos de texto.
  webPicker: { height: 48, paddingHorizontal: 13, borderWidth: 0, backgroundColor: 'transparent', color: palette.ink, fontSize: 16, fontFamily: 'System', cursor: 'pointer' },
  nativePicker: { color: palette.ink },
  button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 18, backgroundColor: palette.forest, boxShadow: oscuro ? '0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 18px rgba(0, 0, 0, 0.35)' : '0 1px 2px rgba(15, 61, 38, 0.14), 0 8px 18px rgba(22, 101, 52, 0.25)' },
  primaryButton: gradient(gradients.canopy),
  compactButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10 },
  buttonText: { fontSize: 16, fontFamily: fonts.bold },
  compactButtonText: { fontSize: 14 },
  secondaryButton: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, boxShadow: 'none' },
  ghostButton: { backgroundColor: 'transparent', boxShadow: 'none', paddingHorizontal: 8 },
  disabledButton: { opacity: 0.55 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  section: { overflow: 'hidden', gap: 16, ...card },
  sectionTop: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sectionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.forestSoft },
  sectionHeading: { flex: 1, gap: 2 },
  sectionStep: { color: palette.forest, fontSize: 11, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 1 },
  sectionTitle: { color: palette.ink, fontSize: 17, fontFamily: fonts.bold },
  sectionDescription: { marginTop: 2, color: palette.muted, fontSize: 13, lineHeight: 19 },
  sectionDivider: { height: 1, ...fadeLine(palette.hairline) },
  surface: { ...card, borderRadius: 18 },
  message: { overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11, paddingLeft: 15, paddingRight: 12, borderRadius: 12 },
  messageBar: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3 },
  messageText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  chip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: palette.line, borderRadius: 999, paddingHorizontal: 14, backgroundColor: palette.paper },
  selectedChip: { borderColor: palette.forest, backgroundColor: palette.forestSoft },
  chipText: { color: palette.ink, fontWeight: '500', fontSize: 13 },
  selectedChipText: { color: palette.forest, fontFamily: fonts.bold },
}));
