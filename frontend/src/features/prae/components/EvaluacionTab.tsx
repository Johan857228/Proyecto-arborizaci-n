import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useBorrarEvaluacion, useCrearEvaluacion } from '@/features/prae/api';
import { crearEvaluacionFormSchema, INSTANCIAS, nulo, type Evaluacion, type Instancia, type Prae } from '@/features/prae/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Card, ConfirmButton, EmptyState, NumberField } from '@/shared/components/UI';
import { formatFecha, hoyIso } from '@/shared/format';
import { crearEstilos } from '@/theme';

function FilaEvaluacion({ evaluacion, editable }: { evaluacion: Evaluacion; editable: boolean }) {
  const styles = useStyles();
  const borrar = useBorrarEvaluacion();
  const e = evaluacion;
  return (
    <View style={styles.fila}>
      <Text style={styles.titulo}>{INSTANCIAS[e.instancia]} · {formatFecha(e.fecha)}</Text>
      <Text style={styles.meta}>{[e.acta ? `Acta ${e.acta}` : null, e.cumplimiento_pct != null ? `Cumplimiento ${e.cumplimiento_pct} %` : null].filter(Boolean).join(' · ') || 'Sin acta'}</Text>
      {e.logros ? <Text style={styles.texto}><Text style={styles.negrita}>Logros: </Text>{e.logros}</Text> : null}
      {e.dificultades ? <Text style={styles.texto}><Text style={styles.negrita}>Dificultades: </Text>{e.dificultades}</Text> : null}
      {e.recomendaciones ? <Text style={styles.texto}><Text style={styles.negrita}>Recomendaciones: </Text>{e.recomendaciones}</Text> : null}
      {e.participantes ? <Text style={styles.meta}>Participantes: {e.participantes}</Text> : null}
      {borrar.error ? <InlineMessage>{getApiErrorMessage(borrar.error)}</InlineMessage> : null}
      {editable ? <ConfirmButton title="Quitar" confirmTitle="¿Quitar esta evaluación?" loading={borrar.isPending} onConfirm={() => borrar.mutate(e.id)} /> : null}
    </View>
  );
}

function NuevaEvaluacion({ prae }: { prae: Prae }) {
  const styles = useStyles();
  const crear = useCrearEvaluacion();
  const [instancia, setInstancia] = useState<Instancia | undefined>(prae.evaluaciones_faltantes[0]);
  const [fecha, setFecha] = useState(hoyIso());
  const [acta, setActa] = useState('');
  const [cumplimiento, setCumplimiento] = useState<number>();
  const [logros, setLogros] = useState('');
  const [dificultades, setDificultades] = useState('');
  const [recomendaciones, setRecomendaciones] = useState('');
  const [participantes, setParticipantes] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState(false);

  async function registrar() {
    setListo(false);
    const validado = crearEvaluacionFormSchema(hoyIso()).safeParse({
      instancia, fecha: fecha.trim(), acta, cumplimiento_pct: cumplimiento, logros, dificultades, recomendaciones, participantes,
    });
    if (!validado.success) {
      setErrores(Object.fromEntries(validado.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrores({});
    const d = validado.data;
    try {
      await crear.mutateAsync({
        praeId: prae.id,
        datos: {
          instancia: d.instancia, fecha: d.fecha, acta: nulo(d.acta), cumplimiento_pct: d.cumplimiento_pct ?? null,
          logros: nulo(d.logros), dificultades: nulo(d.dificultades), recomendaciones: nulo(d.recomendaciones), participantes: nulo(d.participantes),
        },
      });
      setActa('');
      setCumplimiento(undefined);
      setLogros('');
      setDificultades('');
      setRecomendaciones('');
      setParticipantes('');
      setListo(true);
    } catch {
      // El error se muestra con crear.error.
    }
  }

  return (
    <Card title="Registrar evaluación" icon="review">
      <View style={styles.chips}>
        {(Object.keys(INSTANCIAS) as Instancia[]).map((i) => <ChoiceChip key={i} label={INSTANCIAS[i]} selected={instancia === i} onPress={() => setInstancia(i)} />)}
      </View>
      {errores.instancia ? <InlineMessage>{errores.instancia}</InlineMessage> : null}
      <View style={styles.dos}>
        <View style={styles.celda}><Field label="Fecha de la sesión" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha} /></View>
        <View style={styles.celda}><Field label="Número de acta" value={acta} onChangeText={setActa} maxLength={60} /></View>
      </View>
      <NumberField label="Cumplimiento del plan (%)" value={cumplimiento} onChange={setCumplimiento} help="Opcional, de 0 a 100." error={errores.cumplimiento_pct} />
      <Field label="Logros" value={logros} onChangeText={setLogros} multiline maxLength={2000} error={errores.logros} />
      <Field label="Dificultades" value={dificultades} onChangeText={setDificultades} multiline maxLength={2000} />
      <Field label="Recomendaciones" value={recomendaciones} onChangeText={setRecomendaciones} multiline maxLength={2000} />
      <Field label="Participantes" value={participantes} onChangeText={setParticipantes} maxLength={500} placeholder="Ej.: Rector, 3 docentes, 2 representantes estudiantiles" />
      {crear.error ? <InlineMessage>{getApiErrorMessage(crear.error)}</InlineMessage> : null}
      {listo ? <InlineMessage tone="success">Evaluación registrada.</InlineMessage> : null}
      <PrimaryButton title="Registrar evaluación" icon="check" loading={crear.isPending} onPress={() => void registrar()} />
    </Card>
  );
}

/** Evaluaciones del PRAE. La norma pide al menos una al año del consejo directivo y de la Secretaría. */
export function EvaluacionTab({ prae }: { prae: Prae }) {
  const styles = useStyles();
  const faltan = prae.evaluaciones_faltantes.map((i) => INSTANCIAS[i]);
  return (
    <>
      {faltan.length ? (
        <InlineMessage tone="warning">
          Falta registrar la evaluación de: {faltan.join(' y ')}. El PRAE se evalúa al menos una vez al año con el consejo directivo y la Secretaría de Educación (Decreto 1743 de 1994).
        </InlineMessage>
      ) : (
        <InlineMessage tone="success">El PRAE {prae.anio} ya tiene las evaluaciones del consejo directivo y de la Secretaría de Educación.</InlineMessage>
      )}
      <Card title="Evaluaciones" icon="review">
        {prae.evaluaciones.length ? (
          <View style={styles.lista}>{prae.evaluaciones.map((e) => <FilaEvaluacion key={e.id} evaluacion={e} editable={prae.puede_editar} />)}</View>
        ) : (
          <EmptyState title="Aún no hay evaluaciones" />
        )}
      </Card>
      {prae.puede_editar ? <NuevaEvaluacion prae={prae} /> : null}
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  lista: { gap: 12 },
  fila: { gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  titulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  texto: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  negrita: { fontFamily: fonts.bold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  dos: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  celda: { flexGrow: 1, flexBasis: 160 },
}));
