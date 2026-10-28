import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { SuggestionRow } from '@/features/ia/components/AISuggestionsCard';
import { useAnalizarFotos, useEstadoIA } from '@/features/ia/hooks';
import { sugerenciasDeAnalisis } from '@/features/ia/sugerencias';
import { SaviaMark } from '@/features/savia/components/SaviaMark';
import { usePhotoPicker } from '@/features/trees/hooks/usePhotoPicker';
import type { FotoLocal } from '@/features/trees/types';
import { useIsWide } from '@/hooks/use-is-wide';
import { getApiErrorMessage } from '@/services/api/client';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { crearEstilos, useTema } from '@/theme';
import { AvisoFotos } from '@/shared/components/AvisoFotos';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

/** Panel de Savia: identifica un árbol a partir de una foto con la IA del backend. Solo muestra
 *  sugerencias; para guardar, la persona registra el árbol en el formulario. */
export function SaviaPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  const insets = useSafeAreaInsets();
  const estado = useEstadoIA();
  const catalogs = useCatalogs();
  const picker = usePhotoPicker();
  const analisis = useAnalizarFotos();
  const [foto, setFoto] = useState<FotoLocal>();
  const disponible = estado.data?.disponible === true;
  const sugerencias = useMemo(
    () => (analisis.data && catalogs.data ? sugerenciasDeAnalisis(analisis.data, catalogs.data) : []),
    [analisis.data, catalogs.data],
  );

  async function identificar() {
    const nueva = await picker.pickPhoto('completo');
    if (!nueva) return;
    setFoto(nueva);
    analisis.mutate({ general: nueva });
  }

  function otraFoto() {
    analisis.reset();
    setFoto(undefined);
    void identificar();
  }

  function registrar() {
    onClose();
    router.push('/trees/new' as Href);
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.overlay, isWide ? styles.overlayWide : styles.overlayPhone]}>
        <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar Savia" />
        </Animated.View>

        <Animated.View
          entering={isWide ? FadeInDown.duration(260).easing(EASE_OUT) : SlideInDown.duration(320).easing(EASE_SHEET)}
          style={[styles.sheet, isWide ? styles.sheetWide : [styles.sheetPhone, { paddingBottom: Math.max(insets.bottom, 12) }]]}
        >
          {isWide ? null : <View style={styles.grabber} />}
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <SaviaMark size={52} />
              <View style={styles.headerText}>
                <Text style={styles.title}>Savia</Text>
                <Text style={styles.subtitle}>Tu asistente de IA para el arbolado escolar</Text>
              </View>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={10} style={styles.close}>
                <Icon name="close" size={18} color={palette.muted} />
              </Pressable>
            </View>

            {!estado.isPending && !disponible ? (
              <InlineMessage tone="info">
                Savia todavía no está activada en el servidor. Pide al equipo que configure la clave de Anthropic.
              </InlineMessage>
            ) : null}

            <View style={styles.action}>
              <View style={styles.actionIcon}>
                <Icon name="camera" size={20} color={palette.forest} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Identificar un árbol</Text>
                <Text style={styles.caption}>
                  {Platform.OS === 'web' ? 'Elige' : 'Toma'} una foto del árbol completo y Savia te dice qué especie parece, en qué
                  etapa está y si tiene plagas, enfermedades o bejucos.
                </Text>
              </View>
            </View>

            {foto ? (
              <View style={styles.photoRow}>
                <Image source={{ uri: foto.uri }} style={styles.photo} contentFit="cover" accessibilityLabel="Foto que analiza Savia" />
                <Text style={[styles.caption, styles.photoCaption]}>
                  {analisis.isPending ? 'Savia está mirando tu foto… puede tardar hasta un minuto.' : 'Foto analizada.'}
                </Text>
              </View>
            ) : null}

            {picker.photoError ? <InlineMessage>{picker.photoError}</InlineMessage> : null}
            {analisis.error ? <InlineMessage>{getApiErrorMessage(analisis.error)}</InlineMessage> : null}

            {analisis.data ? (
              <View style={styles.results}>
                <Text style={styles.summary}>{analisis.data.resumen}</Text>
                {!analisis.data.es_arbol ? (
                  <InlineMessage tone="warning">La foto no parece mostrar un árbol. Prueba con otra.</InlineMessage>
                ) : null}
                {analisis.data.es_arbol && analisis.data.calidad_foto === 'mala' ? (
                  <InlineMessage tone="warning">La foto no es muy clara y Savia puede equivocarse. Si puedes, toma otra con buena luz.</InlineMessage>
                ) : null}
                {sugerencias.map((sugerencia) => (
                  <SuggestionRow key={sugerencia.id} sugerencia={sugerencia} />
                ))}
                <Text style={styles.disclaimer}>
                  Savia puede equivocarse: confirma cada dato en campo antes de registrarlo.
                </Text>
              </View>
            ) : null}

            {foto ? null : <AvisoFotos />}
            <View style={styles.buttons}>
              {analisis.data && analisis.data.es_arbol ? (
                <PrimaryButton title="Registrar este árbol" icon="add" onPress={registrar} />
              ) : null}
              <PrimaryButton
                title={foto ? 'Analizar otra foto' : Platform.OS === 'web' ? 'Elegir foto' : 'Tomar foto'}
                icon="camera"
                variant={analisis.data ? 'secondary' : 'primary'}
                loading={analisis.isPending}
                disabled={!disponible}
                onPress={() => (foto ? otraFoto() : void identificar())}
              />
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = crearEstilos(({ palette, shadows }) => ({
  overlay: { flex: 1 },
  overlayPhone: { justifyContent: 'flex-end' },
  overlayWide: { justifyContent: 'flex-end', alignItems: 'flex-end', padding: 28 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8, 24, 15, 0.45)' },
  fill: { flex: 1 },
  sheet: { backgroundColor: palette.paper, boxShadow: shadows.raised },
  sheetPhone: { maxHeight: '88%', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  sheetWide: { width: 420, maxHeight: '85%', borderRadius: 24, marginBottom: 72 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 10, backgroundColor: palette.line },
  content: { padding: 20, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: palette.ink, fontSize: 22, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: palette.canvas },
  action: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: palette.tile, borderWidth: 1, borderColor: palette.line },
  actionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.paper },
  actionText: { flex: 1, minWidth: 0, gap: 3 },
  actionTitle: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  caption: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 64, height: 64, borderRadius: 12, backgroundColor: palette.line },
  photoCaption: { flex: 1 },
  results: { gap: 10 },
  summary: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  disclaimer: { color: palette.muted, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  buttons: { gap: 10 },
}));
