import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { fonts, palette, shadows } from '@/config/constants';
import { InlineMessage, PrimaryButton, Screen } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';

/**
 * Confirmación del registro dentro de la app. Reemplaza a Alert.alert, que en web no muestra nada
 * y dejaba al usuario en el formulario sin saber si el árbol se guardó.
 */
export function RegistrationSuccess({
  codigo,
  nombreComun,
  photoWarning,
  onRegisterAnother,
  onViewTree,
  onViewInventory,
}: {
  codigo: string;
  nombreComun: string;
  photoWarning?: string;
  onRegisterAnother: () => void;
  onViewTree: () => void;
  onViewInventory: () => void;
}) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeIn style={styles.card}>
          <Animated.View entering={ZoomIn.delay(200).springify().damping(11)} style={[styles.badge, photoWarning ? styles.badgeWarning : null]}>
            <Icon name={photoWarning ? 'warning' : 'checkCircle'} size={36} color={photoWarning ? palette.amber : palette.forest} />
          </Animated.View>
          <Text style={styles.title}>{photoWarning ? 'Árbol guardado, falta una foto' : 'Árbol registrado'}</Text>
          <Text style={styles.subtitle}>
            El registro ya forma parte del inventario institucional y quedó como su primera inspección,
            pendiente de revisión por un docente.
          </Text>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Código asignado</Text>
            <Text style={styles.code}>{codigo}</Text>
            <Text style={styles.species}>{nombreComun}</Text>
          </View>
          {photoWarning ? <InlineMessage tone="warning">{photoWarning}</InlineMessage> : null}
          <View style={styles.actions}>
            <PrimaryButton title="Registrar otro árbol" icon="add" onPress={onRegisterAnother} />
            <PrimaryButton title="Ver ficha del árbol" icon="tree" variant="secondary" onPress={onViewTree} />
            <PrimaryButton title="Ver inventario" icon="list" variant="ghost" onPress={onViewInventory} />
          </View>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'center', gap: 14, padding: 28, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, boxShadow: shadows.raised },
  badge: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 36, backgroundColor: palette.forestSoft },
  badgeWarning: { backgroundColor: palette.amberSoft },
  title: { color: palette.ink, fontSize: 24, fontFamily: fonts.extraBold, textAlign: 'center', letterSpacing: -0.4 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  summary: { alignSelf: 'stretch', alignItems: 'center', gap: 4, paddingVertical: 16, borderRadius: 14, backgroundColor: palette.canvas },
  summaryLabel: { color: palette.muted, fontSize: 12, fontFamily: fonts.semiBold, textTransform: 'uppercase', letterSpacing: 1 },
  code: { color: palette.forestDark, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: 1 },
  species: { color: palette.ink, fontSize: 15 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 4 },
});
