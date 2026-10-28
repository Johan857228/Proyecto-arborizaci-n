import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useCursos } from '@/features/courses/api';
import { useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esRevisor, gestiona } from '@/features/perfil/schemas';
import { useFicha, useGuia, useRegistrarClase } from '@/features/guias/api';
import { FilaClase } from '@/features/guias/components/GuiasScreen';
import { AREAS, claseFormSchema, textoGrados, type Guia } from '@/features/guias/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { AppHeader, Badge, Card, ErrorState, LoadingState, Notice, NumberField, Page } from '@/shared/components/UI';
import { hoyIso } from '@/shared/format';
import { crearEstilos } from '@/theme';

const SIN_CURSO = '__sin_curso__';

function Lista({ items, numerada = false }: { items: string[]; numerada?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.lista}>
      {items.map((item, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.vineta}>{numerada ? `${i + 1}.` : '•'}</Text>
          <Text style={styles.texto}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function useOpcionesCurso(institucionId: string | undefined, enabled: boolean) {
  const cursos = useCursos(institucionId, enabled && Boolean(institucionId));
  return [
    { label: 'Sin curso', value: SIN_CURSO },
    ...(cursos.data ?? []).filter((c) => c.activo).map((c) => ({ label: `${c.nombre} (${c.anio})`, value: c.id })),
  ];
}

function Ficha({ guia, institucionId }: { guia: Guia; institucionId: string | undefined }) {
  const styles = useStyles();
  const ficha = useFicha();
  const opciones = useOpcionesCurso(institucionId, true);
  const [curso, setCurso] = useState(SIN_CURSO);
  const descargar = (semilla?: number) =>
    ficha.mutate({ id: guia.id, curso_id: curso === SIN_CURSO ? null : curso, semilla, institucion_id: institucionId });
  return (
    <Card title="Ficha para imprimir" subtitle="PDF con la guía del docente, la ficha del estudiante y, en Matemáticas, la clave de respuestas." icon="download">
      <Text style={styles.meta}>Datos del colegio en la ficha: {guia.datos}.</Text>
      <SelectField<string> label="Curso (opcional, sale en la portada)" value={curso} options={opciones} onChange={setCurso} />
      {ficha.error ? <InlineMessage>{getApiErrorMessage(ficha.error)}</InlineMessage> : null}
      {ficha.data && !ficha.isPending ? (
        <InlineMessage tone="success">
          Listo: {ficha.data.nombre}, muestra n.° {ficha.data.semilla}. Cada descarga elige otros árboles; para repetir esta misma muestra usa el botón de abajo.
        </InlineMessage>
      ) : null}
      <PrimaryButton title="Descargar ficha (PDF)" icon="download" loading={ficha.isPending} onPress={() => descargar()} />
      {ficha.data ? (
        <PrimaryButton title={`Repetir la muestra n.° ${ficha.data.semilla}`} variant="secondary" compact disabled={ficha.isPending} onPress={() => descargar(ficha.data?.semilla)} />
      ) : null}
    </Card>
  );
}

function RegistrarClase({ guia, institucionId }: { guia: Guia; institucionId: string | undefined }) {
  const registrar = useRegistrarClase();
  const opciones = useOpcionesCurso(institucionId, true);
  const [fecha, setFecha] = useState(hoyIso());
  const [curso, setCurso] = useState(SIN_CURSO);
  const [asistentes, setAsistentes] = useState<number>();
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [listo, setListo] = useState(false);

  async function enviar() {
    setListo(false);
    const validado = claseFormSchema(hoyIso()).safeParse({ fecha: fecha.trim(), curso_id: curso === SIN_CURSO ? undefined : curso, asistentes, notas });
    if (!validado.success) {
      setErrores(Object.fromEntries(validado.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrores({});
    const d = validado.data;
    try {
      await registrar.mutateAsync({
        guia_id: guia.id, fecha: d.fecha, curso_id: d.curso_id ?? null, asistentes: d.asistentes ?? null,
        notas: d.notas || null, institucion_id: institucionId,
      });
      setAsistentes(undefined);
      setNotas('');
      setListo(true);
    } catch {
      // El error se muestra con registrar.error.
    }
  }

  return (
    <Card title="Registrar la clase" subtitle="Queda en la bitácora y en los indicadores del PRAE. No se guardan nombres de estudiantes." icon="calendar">
      <Field label="Fecha de la clase" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha} />
      <SelectField<string> label="Curso" value={curso} options={opciones} onChange={setCurso} />
      <NumberField label="Estudiantes que asistieron" value={asistentes} onChange={setAsistentes} help="Opcional, de 1 a 80." error={errores.asistentes} />
      <Field label="Notas" value={notas} onChangeText={setNotas} multiline maxLength={1000} placeholder="Qué funcionó, qué ajustar la próxima vez" error={errores.notas} />
      {registrar.error ? <InlineMessage>{getApiErrorMessage(registrar.error)}</InlineMessage> : null}
      {listo ? <InlineMessage tone="success">Clase registrada.</InlineMessage> : null}
      <PrimaryButton title="Registrar clase" icon="check" loading={registrar.isPending} onPress={() => void enviar()} />
    </Card>
  );
}

/** Una guía de clase: el paso a paso, la ficha para imprimir y el registro de la clase. */
export function GuiaScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida();
  const institucionId = institucion.institucionId;
  const guia = useGuia(String(id), institucionId, !perfil.isLoading);
  const revisor = esRevisor(perfil.data);
  const puedeRegistrar = gestiona(perfil.data, institucionId);
  const g = guia.data;

  return (
    <Page onRefresh={() => void guia.refetch()} refreshing={guia.isRefetching}>
      {guia.isLoading || perfil.isLoading ? (
        <LoadingState text="Cargando la guía…" />
      ) : guia.error && !g ? (
        <ErrorState error={guia.error} onRetry={() => void guia.refetch()} />
      ) : !g ? null : (
        <>
          <AppHeader eyebrow={AREAS[g.area]} title={g.titulo} subtitle={g.proposito} backTo={'/(app)/guides' as Href} />
          <View style={styles.insignias}>
            <Badge label={textoGrados(g.grados)} tono="sano" />
            <Badge label={`${g.duracion_min} minutos`} tono="neutro" />
            <Badge label={g.aplicaciones ? `Dictada ${g.aplicaciones} ${g.aplicaciones === 1 ? 'vez' : 'veces'} en tu institución` : 'Aún no dictada en tu institución'} tono={g.aplicaciones ? 'info' : 'neutro'} />
          </View>

          <Card title="Referente curricular" icon="guia">
            <Text style={styles.texto}>{g.referente}</Text>
            {g.saber11 ? <Text style={styles.meta}>{g.saber11}</Text> : null}
          </Card>
          <Notice tono="riesgo">{g.celular} {g.seguridad}</Notice>

          <Card title="Materiales" icon="tools"><Lista items={g.materiales} /></Card>
          <Card title="Paso a paso" icon="list">
            <View style={styles.momentos}>
              {g.momentos.map((m) => (
                <View key={m.titulo} style={styles.momento}>
                  <Text style={styles.momentoTitulo}>{m.titulo}</Text>
                  <Lista items={m.pasos} />
                </View>
              ))}
            </View>
          </Card>
          <Card title="Preguntas para los estudiantes" icon="review"><Lista items={g.preguntas} numerada /></Card>
          <Card title="Evidencia de aprendizaje" icon="checkCircle"><Text style={styles.texto}>{g.evidencia}</Text></Card>

          {g.laboratorio ? (
            <PrimaryButton
              title="Abrir el laboratorio de datos"
              icon="laboratorio"
              variant="secondary"
              onPress={() => router.push(`/(app)/lab?variable=${g.laboratorio?.variable}&vista=${g.laboratorio?.vista}` as Href)}
            />
          ) : null}
          {revisor && institucionId ? <Ficha guia={g} institucionId={institucionId} /> : null}
          {puedeRegistrar ? <RegistrarClase guia={g} institucionId={institucionId} /> : null}

          {g.clases.length ? (
            <Card title="Clases dictadas con esta guía" icon="calendar">
              <View style={styles.momentos}>{g.clases.map((c) => <FilaClase key={c.id} clase={c} mostrarGuia={false} />)}</View>
            </Card>
          ) : null}
        </>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  texto: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 21 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  lista: { gap: 6 },
  item: { flexDirection: 'row', gap: 8 },
  vineta: { color: palette.forest, fontSize: 14, lineHeight: 21, fontFamily: fonts.bold, minWidth: 14 },
  momentos: { gap: 14 },
  momento: { gap: 6 },
  momentoTitulo: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
}));
