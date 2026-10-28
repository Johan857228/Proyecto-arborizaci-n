import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { TONO_CATEGORIA } from '@/features/riesgo/components/RiesgoBadge';
import { abreAlerta, DEBAJO, evaluarTamizaje, NOMBRE_CATEGORIA, PREGUNTAS, type Tamizaje } from '@/features/riesgo/reglas';
import { ChoiceChip, InlineMessage } from '@/shared/components/FormControls';
import { useTonos } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

/**
 * Lista visual del riesgo de caída: lo que se ve del árbol y qué hay debajo. El resultado se
 * calcula en el teléfono (también sin señal) para orientar enseguida; al guardar, el servidor
 * lo confirma y, si es alto o inminente, abre una alerta para un docente.
 */
export function TamizajeFields({
  valor,
  onChange,
  alturaM,
  dapCm,
  error,
}: {
  valor: Tamizaje;
  onChange: (valor: Tamizaje) => void;
  alturaM?: number | null;
  dapCm?: number | null;
  error?: string;
}) {
  const styles = useStyles();
  const tonos = useTonos();
  const resultado = valor.debajo.length ? evaluarTamizaje(valor, alturaM, dapCm) : undefined;

  function alternarDebajo(lugar: Tamizaje['debajo'][number]) {
    onChange({
      ...valor,
      debajo: valor.debajo.includes(lugar) ? valor.debajo.filter((d) => d !== lugar) : [...valor.debajo, lugar],
    });
  }

  return (
    <View style={styles.contenedor}>
      <Text style={styles.ayuda}>
        Es un tamizaje visual, no un dictamen técnico. Mira el árbol a una distancia segura y marca lo que veas.
      </Text>
      {PREGUNTAS.map((pregunta) => (
        <View key={pregunta.clave} style={styles.pregunta}>
          <Text style={styles.titulo}>{pregunta.titulo}</Text>
          <Text style={styles.ayuda}>{pregunta.ayuda}</Text>
          <View style={styles.chips}>
            {pregunta.opciones.map((opcion) => (
              <ChoiceChip
                key={opcion.valor}
                label={opcion.etiqueta}
                selected={valor[pregunta.clave] === opcion.valor}
                onPress={() => onChange({ ...valor, [pregunta.clave]: opcion.valor })}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.pregunta}>
        <Text style={styles.titulo}>¿Qué hay debajo o al alcance si cae?</Text>
        <Text style={styles.ayuda}>Obligatorio. Marca todo lo que aplique.</Text>
        <View style={styles.chips}>
          {DEBAJO.map((lugar) => (
            <ChoiceChip key={lugar.valor} label={lugar.etiqueta} selected={valor.debajo.includes(lugar.valor)} onPress={() => alternarDebajo(lugar.valor)} />
          ))}
        </View>
        {error ? <InlineMessage>{error}</InlineMessage> : null}
      </View>

      {resultado ? (
        <View
          style={[styles.resultado, { backgroundColor: tonos[TONO_CATEGORIA[resultado.categoria]].fondo }]}
          accessibilityRole="summary"
          accessibilityLabel={`Riesgo de caída ${NOMBRE_CATEGORIA[resultado.categoria]}. ${resultado.accion}`}
        >
          <Text style={[styles.resultadoTitulo, { color: tonos[TONO_CATEGORIA[resultado.categoria]].texto }]}>
            Riesgo de caída: {NOMBRE_CATEGORIA[resultado.categoria]}
          </Text>
          {resultado.motivos.length ? <Text style={styles.resultadoTexto}>{resultado.motivos.join(' · ')}</Text> : null}
          <Text style={styles.resultadoTexto}>{resultado.accion}</Text>
          {abreAlerta(resultado.categoria) ? (
            <Text style={styles.resultadoNota}>Al guardar se abre una alerta para que un docente la confirme y se avise a rectoría.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  contenedor: { gap: 14 },
  pregunta: { gap: 6 },
  titulo: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  ayuda: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resultado: { gap: 6, padding: 14, borderRadius: 14 },
  resultadoTitulo: { fontSize: 16, fontFamily: fonts.extraBold },
  resultadoTexto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  resultadoNota: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
