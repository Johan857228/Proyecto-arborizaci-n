import { useState } from 'react';
import { Text, View } from 'react-native';

import { useRevisar } from '@/features/inspections/hooks/useInspecciones';
import { anularSchema, confirmarSchema } from '@/features/inspections/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Cell, Row } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

/** Confirmar (comentario opcional) o anular (motivo obligatorio) una inspección pendiente. */
export function ReviewActions({ inspeccionId, onDone }: { inspeccionId: string; onDone?: (accion: 'confirmar' | 'anular') => void }) {
  const styles = useStyles();
  const revisar = useRevisar();
  const [modo, setModo] = useState<'confirmar' | 'anular' | null>(null);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string>();

  async function enviar(accion: 'confirmar' | 'anular') {
    setError(undefined);
    const validacion = accion === 'anular'
      ? anularSchema.safeParse({ motivo: texto })
      : confirmarSchema.safeParse({ comentario: texto });
    if (!validacion.success) {
      setError(validacion.error.issues[0].message);
      return;
    }
    try {
      await revisar.mutateAsync({ inspeccionId, accion, texto: texto.trim() });
      setModo(null);
      setTexto('');
      onDone?.(accion);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  if (modo === null) {
    return (
      <View style={styles.box}>
        <Row>
          <Cell basis={150}><PrimaryButton title="Confirmar" onPress={() => setModo('confirmar')} /></Cell>
          <Cell basis={150}><PrimaryButton title="Anular" variant="secondary" onPress={() => setModo('anular')} /></Cell>
        </Row>
        {error ? <InlineMessage>{error}</InlineMessage> : null}
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{modo === 'confirmar' ? 'Confirmar inspección' : 'Anular inspección'}</Text>
      <Text style={styles.help}>
        {modo === 'confirmar'
          ? 'Los datos pasan a ser válidos y quien la registró recibe sus puntos.'
          : 'El árbol vuelve a tomar su estado de la inspección válida anterior. Explica el motivo.'}
      </Text>
      <Field
        label={modo === 'confirmar' ? 'Comentario (opcional)' : 'Motivo de la anulación'}
        value={texto}
        onChangeText={setTexto}
        multiline
        placeholder={modo === 'confirmar' ? 'Observaciones para quien inspeccionó' : 'Ej.: las medidas no corresponden al árbol de la foto'}
      />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <Row>
        <Cell basis={150}>
          <PrimaryButton
            title={modo === 'confirmar' ? 'Confirmar' : 'Anular'}
            loading={revisar.isPending}
            onPress={() => void enviar(modo)}
          />
        </Cell>
        <Cell basis={150}>
          <PrimaryButton title="Cancelar" variant="secondary" onPress={() => { setModo(null); setError(undefined); }} />
        </Cell>
      </Row>
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  box: { gap: 8 },
  title: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  help: { color: palette.muted, fontSize: 13, lineHeight: 18 },
}));
