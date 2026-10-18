import { Linking, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useContactos } from '@/features/riesgo/api';
import { PrimaryButton } from '@/shared/components/FormControls';
import { Card } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const PASOS: Record<'alto' | 'inminente', string[]> = {
  inminente: [
    'Aleja a las personas y acordona el área con cinta, conos o sillas. Nadie debe pasar debajo.',
    'Avisa a rectoría de inmediato.',
    'Si hay peligro inmediato o alguien resultó herido, llama al 123.',
    'Pide la visita técnica urgente de la autoridad ambiental: solo ella autoriza podar o talar.',
    'Si el árbol amenaza vías, viviendas o redes eléctricas, informa al Consejo Municipal de Gestión del Riesgo.',
  ],
  alto: [
    'Restringe el paso debajo del árbol mientras se atiende.',
    'Avisa a rectoría.',
    'Pide la visita técnica de la autoridad ambiental en los próximos días.',
    'Programa la intervención en la app y cierra la alerta cuando se haga.',
  ],
};

function llamar(numero: string) {
  void Linking.openURL(`tel:${numero.replace(/[^0-9+]/g, '')}`);
}

/** Qué hacer ante un riesgo alto o inminente, con los números para llamar. Los de la sede se
 *  configuran en Alertas → Contactos de emergencia. */
export function RutaEmergencia({ categoria, institucionId }: { categoria: 'alto' | 'inminente'; institucionId?: string }) {
  const styles = useStyles();
  const contactos = useContactos(institucionId).data;
  const sede = [
    { titulo: contactos?.rectoria_nombre || 'Rectoría', numero: contactos?.rectoria_telefono },
    { titulo: 'Gestión del riesgo del municipio', numero: contactos?.gestion_riesgo_telefono },
    { titulo: contactos?.autoridad_ambiental_nombre || 'Autoridad ambiental', numero: contactos?.autoridad_ambiental_telefono },
  ].filter((c): c is { titulo: string; numero: string } => Boolean(c.numero));

  return (
    <Card
      title={categoria === 'inminente' ? 'Qué hacer ahora' : 'Qué hacer'}
      subtitle={categoria === 'inminente' ? 'Riesgo inminente: actúa antes de seguir con otra cosa.' : 'Riesgo alto: atiéndelo en los próximos días.'}
      icon="warning"
    >
      <View style={styles.pasos}>
        {PASOS[categoria].map((paso, i) => (
          <View key={paso} style={styles.paso}>
            <Text style={styles.numero}>{i + 1}</Text>
            <Text style={styles.texto}>{paso}</Text>
          </View>
        ))}
      </View>
      <View style={styles.botones}>
        <View style={styles.boton}>
          <PrimaryButton title="Llamar al 123" icon="warning" compact onPress={() => llamar('123')} />
        </View>
        <View style={styles.boton}>
          <PrimaryButton title="Bomberos 119" variant="secondary" compact onPress={() => llamar('119')} />
        </View>
        {sede.map((c) => (
          <View key={c.titulo} style={styles.boton}>
            <PrimaryButton title={`${c.titulo}: ${c.numero}`} variant="secondary" compact onPress={() => llamar(c.numero)} />
          </View>
        ))}
      </View>
      {!sede.length ? <Text style={styles.nota}>La sede aún no tiene sus contactos de emergencia: un docente puede agregarlos en Alertas.</Text> : null}
      <Text style={styles.nota}>
        Es un tamizaje hecho por la comunidad educativa, no un dictamen técnico. La poda o tala de un árbol urbano la
        autoriza la autoridad ambiental, previa visita técnica (Decreto 1076 de 2015, art. 2.2.1.1.9.3).
      </Text>
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  pasos: { gap: 8 },
  paso: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, color: palette.paper, backgroundColor: palette.red, fontSize: 13, fontFamily: fonts.bold },
  texto: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 20 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  boton: { flexGrow: 1, flexBasis: 150 },
  nota: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
