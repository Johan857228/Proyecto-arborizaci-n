import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { palette } from '@/config/constants';

export function Screen({ children }: PropsWithChildren) {
  return <View style={styles.screen}>{children}</View>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Heading({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
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
  ...props
}: { label: string; error?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#89948D"
        style={[styles.input, props.multiline && styles.multiline, error && styles.invalid]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.pickerWrap, error && styles.invalid]}>
        <Picker
          style={Platform.OS === 'web' ? styles.webPicker : undefined}
          selectedValue={value ?? ''}
          onValueChange={(next) => {
            const selectedOption = options.find((option) => option.value === next);
            if (selectedOption) onChange(selectedOption.value);
          }}
        >
          <Picker.Item label={placeholder} value="" />
          {options.map((option) => (
            <Picker.Item key={String(option.value)} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondaryButton,
        (disabled || loading) && styles.disabledButton,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>
        {loading ? 'Procesando…' : title}
      </Text>
    </Pressable>
  );
}

export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Surface({ children }: PropsWithChildren) {
  return <View style={styles.surface}>{children}</View>;
}

export function InlineMessage({ children, tone = 'error' }: PropsWithChildren<{ tone?: 'error' | 'info' }>) {
  return <Text style={tone === 'error' ? styles.error : styles.info}>{children}</Text>;
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
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.selectedChip]}>
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  eyebrow: { color: palette.forest, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  heading: { gap: 6 },
  title: { color: palette.ink, fontSize: 28, fontWeight: '800', lineHeight: 34 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 21 },
  fieldWrap: { gap: 7, marginBottom: 14 },
  label: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 8, color: palette.ink, backgroundColor: palette.paper, fontSize: 16 },
  multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' },
  invalid: { borderColor: palette.red },
  pickerWrap: { borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.paper, overflow: 'hidden' },
  // En web el Picker es un <select> nativo: se quita su borde y se iguala al alto, la letra y el relleno de los campos de texto.
  webPicker: { height: 48, paddingHorizontal: 13, borderWidth: 0, backgroundColor: 'transparent', color: palette.ink, fontSize: 16, fontFamily: 'System', cursor: 'pointer' },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 18, backgroundColor: palette.forest },
  buttonText: { color: palette.paper, fontSize: 16, fontWeight: '800' },
  secondaryButton: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  secondaryButtonText: { color: palette.ink },
  disabledButton: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
  section: { gap: 12, marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: palette.line },
  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  surface: { padding: 16, borderRadius: 8, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  error: { color: palette.red, fontSize: 13, lineHeight: 18 },
  info: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  chip: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 20, paddingHorizontal: 13, backgroundColor: palette.paper },
  selectedChip: { borderColor: palette.forest, backgroundColor: '#E6EFDF' },
  chipText: { color: palette.ink, fontWeight: '600', fontSize: 13 },
  selectedChipText: { color: palette.forest, fontWeight: '800' },
});