import { Text, View } from 'react-native';

import { Icon } from '@/shared/components/Icon';
import { crearEstilos, useTema } from '@/theme';

/** Recordatorio junto a cada botón de foto: las fotos son de árboles, no de personas (muchos
 *  estudiantes son menores de edad). Los metadatos de las fotos se quitan en el servidor. */
export function AvisoFotos() {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.aviso} accessibilityRole="text">
      <Icon name="info" size={16} color={palette.sky} />
      <Text style={styles.texto}>Fotografía solo el árbol: evita que aparezcan rostros de personas.</Text>
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: palette.skySoft },
  texto: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17 },
}));
