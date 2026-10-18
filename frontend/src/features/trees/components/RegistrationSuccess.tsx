import { ScrollView, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { fonts } from '@/config/constants';
import { InlineMessage, PrimaryButton, Screen } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';
import { crearEstilos, useTema } from '@/theme';

/**
 * Confirmación del registro dentro de la app. Reemplaza a Alert.alert, que en web no muestra nada
 * y dejaba al usuario en el formulario sin saber si el árbol se guardó.
 * Sin `codigo`, el árbol quedó guardado en el teléfono (sin conexión): el código lo asigna la base
 * de datos cuando lo reciba, así que aquí no se muestra uno inventado.
 */
export function RegistrationSuccess({
  codigo,
  nombreComun,
  photoWarning,
  fotosEnCola,
  onRegisterAnother,
  onViewTree,
  onViewPending,
  onViewInventory,
}: {
  codigo?: string;
  nombreComun: string;
  photoWarning?: string;
  /** Fotos que no alcanzaron a subir por falta de señal y se enviarán solas. */
  fotosEnCola?: number;
  onRegisterAnother: () => void;
  onViewTree?: () => void;
  onViewPending: () => void;
  onViewInventory: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTema();
  const enTelefono = !codigo;
  const aviso = Boolean(photoWarning);
  const titulo = enTelefono ? 'Guardado en el teléfono' : aviso ? 'Árbol guardado, falta una foto' : 'Árbol registrado';
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeIn style={styles.card}>
          <Animated.View
            entering={ZoomIn.delay(200).springify().damping(11)}
            style={[styles.badge, aviso ? styles.badgeWarning : null, enTelefono ? styles.badgeCola : null]}
          >
            <Icon
              name={enTelefono ? 'enCola' : aviso ? 'warning' : 'checkCircle'}
              size={36}
              color={enTelefono ? palette.sky : aviso ? palette.amber : palette.forest}
            />
          </Animated.View>
          <Text style={styles.title}>{titulo}</Text>
          <Text style={styles.subtitle}>
            {enTelefono
              ? 'No hay conexión en este momento. El registro y sus fotos quedaron guardados y se enviarán solos cuando vuelva la señal; no cierres sesión hasta entonces.'
              : 'El registro ya forma parte del inventario institucional y quedó como su primera inspección, pendiente de revisión por un docente.'}
          </Text>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>{enTelefono ? 'Código del árbol' : 'Código asignado'}</Text>
            <Text style={[styles.code, enTelefono && styles.codePendiente]}>{codigo ?? 'Se asigna al enviar'}</Text>
            <Text style={styles.species}>{nombreComun}</Text>
          </View>
          {fotosEnCola ? (
            <InlineMessage tone="info">
              {fotosEnCola === 1 ? 'Una foto no alcanzó a subir' : `${fotosEnCola} fotos no alcanzaron a subir`} por falta de señal. Quedó guardada en el teléfono y se enviará sola.
            </InlineMessage>
          ) : null}
          {photoWarning ? <InlineMessage tone="warning">{photoWarning}</InlineMessage> : null}
          <View style={styles.actions}>
            <PrimaryButton title="Registrar otro árbol" icon="add" onPress={onRegisterAnother} />
            {onViewTree ? <PrimaryButton title="Ver ficha del árbol" icon="tree" variant="secondary" onPress={onViewTree} /> : null}
            {enTelefono || fotosEnCola ? (
              <PrimaryButton title="Ver registros por enviar" icon="enCola" variant="secondary" onPress={onViewPending} />
            ) : null}
            <PrimaryButton title="Ver inventario" icon="list" variant="ghost" onPress={onViewInventory} />
          </View>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

const useStyles = crearEstilos(({ palette, shadows }) => ({
  content: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'center', gap: 14, padding: 28, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, boxShadow: shadows.raised },
  badge: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 36, backgroundColor: palette.forestSoft },
  badgeWarning: { backgroundColor: palette.amberSoft },
  badgeCola: { backgroundColor: palette.skySoft },
  title: { color: palette.ink, fontSize: 24, fontFamily: fonts.extraBold, textAlign: 'center', letterSpacing: -0.4 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  summary: { alignSelf: 'stretch', alignItems: 'center', gap: 4, paddingVertical: 16, borderRadius: 14, backgroundColor: palette.canvas },
  summaryLabel: { color: palette.muted, fontSize: 12, fontFamily: fonts.semiBold, textTransform: 'uppercase', letterSpacing: 1 },
  code: { color: palette.forest, fontSize: 26, fontFamily: fonts.extraBold, letterSpacing: 1 },
  codePendiente: { color: palette.muted, fontSize: 18, letterSpacing: 0 },
  species: { color: palette.ink, fontSize: 15 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 4 },
}));
