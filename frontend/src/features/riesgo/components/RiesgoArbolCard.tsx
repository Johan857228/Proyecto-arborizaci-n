import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useRiesgoArbol } from '@/features/riesgo/api';
import { RiesgoBadge } from '@/features/riesgo/components/RiesgoBadge';
import { RutaEmergencia } from '@/features/riesgo/components/RutaEmergencia';
import { abreAlerta } from '@/features/riesgo/reglas';
import { Icon } from '@/shared/components/Icon';
import { Badge, Card } from '@/shared/components/UI';
import { formatFecha } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

/** Riesgo de caída en la ficha del árbol: el último tamizaje vigente y, si hay, su alerta. */
export function RiesgoArbolCard({ arbolId, institucionId }: { arbolId: string; institucionId: string }) {
  const styles = useStyles();
  const { palette } = useTema();
  const riesgo = useRiesgoArbol(arbolId);
  if (!riesgo.data) return null;
  const { tamizaje, alerta } = riesgo.data;
  if (!tamizaje) {
    return (
      <Card title="Riesgo de caída" icon="warning">
        <Text style={styles.texto}>Aún no tiene tamizaje de riesgo de caída. Se hace en la próxima inspección.</Text>
      </Card>
    );
  }
  const categoria = alerta?.categoria ?? tamizaje.categoria;
  return (
    <>
      <Card title="Riesgo de caída" subtitle={`Tamizaje del ${formatFecha(tamizaje.creado_en)}`} icon="warning">
        <View style={styles.insignias}>
          <RiesgoBadge categoria={tamizaje.categoria} />
          {alerta ? <Badge label={alerta.estado === 'por_confirmar' ? 'Alerta por confirmar' : 'Alerta confirmada'} tono="critico" /> : null}
        </View>
        {tamizaje.motivos.length ? <Text style={styles.texto}>{tamizaje.motivos.join(' · ')}</Text> : null}
        <Text style={styles.texto}><Text style={styles.negrita}>Qué hacer: </Text>{tamizaje.accion}</Text>
        {alerta ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/alerts' as Href)} style={styles.enlace}>
            <Text style={styles.enlaceTexto}>Ver la alerta</Text>
            <Icon name="chevronRight" size={16} color={palette.forest} />
          </Pressable>
        ) : null}
        <Text style={styles.nota}>Tamizaje visual hecho por la comunidad educativa, no un dictamen técnico.</Text>
      </Card>
      {abreAlerta(categoria) && alerta ? <RutaEmergencia categoria={alerta.categoria} institucionId={institucionId} /> : null}
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  negrita: { fontFamily: fonts.bold },
  nota: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  enlace: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2 },
  enlaceTexto: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold },
}));
