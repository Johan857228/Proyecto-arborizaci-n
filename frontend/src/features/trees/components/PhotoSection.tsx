import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import type { FotoLocal } from '@/features/trees/types';
import { InlineMessage, PrimaryButton, Section, Surface } from '@/shared/components/FormControls';
import { crearEstilos } from '@/theme';

export function photoLabel(tipo: FotoLocal['tipo']) {
  if (tipo === 'completo') return 'Vista general';
  if (tipo === 'detalle') return 'Detalle';
  return 'Foto adicional';
}

export function PhotoSection({
  photos,
  error,
  onPick,
  onRemove,
  help,
}: {
  photos: FotoLocal[];
  error?: string;
  onPick: (tipo: FotoLocal['tipo']) => void;
  onRemove: (photo: FotoLocal) => void;
  help: string;
}) {
  const styles = useStyles();
  const adicionales = photos.filter((photo) => photo.tipo === 'adicional').length;
  return (
    <Section title="Fotografías">
      <Text style={styles.helper}>{help}</Text>
      <View style={styles.actions}>
        <View style={styles.cell}>
          <PrimaryButton
            title={photos.some((photo) => photo.tipo === 'completo') ? 'Cambiar foto general' : 'Agregar foto general'}
            onPress={() => onPick('completo')}
            variant="secondary"
          />
        </View>
        <View style={styles.cell}>
          <PrimaryButton
            title={photos.some((photo) => photo.tipo === 'detalle') ? 'Cambiar foto de detalle' : 'Agregar foto de detalle'}
            onPress={() => onPick('detalle')}
            variant="secondary"
          />
        </View>
        <View style={styles.cell}>
          <PrimaryButton
            title={`Agregar foto adicional (${adicionales}/3)`}
            onPress={() => onPick('adicional')}
            disabled={adicionales >= 3}
            variant="secondary"
          />
        </View>
      </View>
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      {photos.map((photo) => (
        <Surface key={`${photo.tipo}-${photo.uri}`}>
          <View style={styles.row}>
            <Image source={{ uri: photo.uri }} style={styles.thumbnail} contentFit="cover" />
            <View style={styles.description}>
              <Text style={styles.title}>{photoLabel(photo.tipo)}</Text>
              <Text style={styles.helper} numberOfLines={1}>{photo.name}</Text>
              <Text style={styles.remove} accessibilityRole="button" onPress={() => onRemove(photo)}>
                Quitar foto
              </Text>
            </View>
          </View>
        </Surface>
      ))}
    </Section>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  helper: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexGrow: 1, flexBasis: 200 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbnail: { width: 76, height: 76, borderRadius: 8, backgroundColor: palette.line },
  description: { flex: 1, gap: 5 },
  title: { color: palette.ink, fontWeight: '800' },
  remove: { color: palette.red, fontSize: 13, fontWeight: '700', paddingTop: 3 },
}));
