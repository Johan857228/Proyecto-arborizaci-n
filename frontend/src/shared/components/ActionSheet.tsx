import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/config/constants';
import { useIsWide } from '@/hooks/use-is-wide';
import { Icon, type IconName } from '@/shared/components/Icon';
import { crearEstilos, useTema } from '@/theme';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

export interface Accion {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Acciones que quitan algo: se muestran en rojo. */
  destructiva?: boolean;
}

/** Menú de acciones: hoja inferior en el teléfono y tarjeta centrada en pantallas anchas. Se
 *  cierra al tocar fuera o al elegir una acción. */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: Accion[];
  onClose: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.overlay, isWide ? styles.overlayWide : styles.overlayPhone]}>
        <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" />
        </Animated.View>
        <Animated.View
          entering={isWide ? FadeInDown.duration(220).easing(EASE_OUT) : SlideInDown.duration(280).easing(EASE_SHEET)}
          style={[styles.sheet, isWide ? styles.sheetWide : [styles.sheetPhone, { paddingBottom: Math.max(insets.bottom, 12) }]]}
        >
          {isWide ? null : <View style={styles.grabber} />}
          <Text style={styles.title}>{title}</Text>
          <View style={styles.actions}>
            {actions.map((accion) => {
              const color = accion.destructiva ? palette.red : palette.ink;
              return (
                <Pressable
                  key={accion.label}
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    accion.onPress();
                  }}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                >
                  <View style={[styles.actionIcon, accion.destructiva && styles.actionIconDanger]}>
                    <Icon name={accion.icon} size={18} color={accion.destructiva ? palette.red : palette.forest} />
                  </View>
                  <Text style={[styles.actionText, { color }]}>{accion.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = crearEstilos(({ palette, shadows }) => ({
  overlay: { flex: 1 },
  overlayPhone: { justifyContent: 'flex-end' },
  overlayWide: { justifyContent: 'center', alignItems: 'center', padding: 28 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8, 24, 15, 0.45)' },
  fill: { flex: 1 },
  sheet: { gap: 12, padding: 16, backgroundColor: palette.paper, boxShadow: shadows.raised },
  sheetPhone: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetWide: { width: 380, borderRadius: 22 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: palette.line },
  title: { paddingHorizontal: 4, color: palette.ink, fontSize: 17, fontFamily: fonts.extraBold },
  actions: { gap: 4 },
  action: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, borderRadius: 14 },
  actionIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.forestSoft },
  actionIconDanger: { backgroundColor: palette.redSoft },
  actionText: { flex: 1, fontSize: 15, fontFamily: fonts.semiBold },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.canvas },
  cancelText: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  pressed: { opacity: 0.7 },
}));
