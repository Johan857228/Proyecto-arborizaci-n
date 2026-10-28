import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, gestiona } from '@/features/perfil/schemas';
import { useAniosPrae, useCopiarPrae, useCrearPrae, usePrae } from '@/features/prae/api';
import { EvaluacionTab } from '@/features/prae/components/EvaluacionTab';
import { EvidenciasTab } from '@/features/prae/components/EvidenciasTab';
import { InformeTab } from '@/features/prae/components/InformeTab';
import { PlanTab } from '@/features/prae/components/PlanTab';
import { ProyectoTab } from '@/features/prae/components/ProyectoTab';
import { ESTADOS_PRAE, INSTANCIAS, nuevoPraeSchema, TEMAS, type AnioPrae, type Prae, type Tema } from '@/features/prae/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Badge, Card, EmptyState, ErrorState, LoadingState, Page, ProgressBar, Tabs } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

type Vista = 'proyecto' | 'plan' | 'evidencias' | 'evaluacion' | 'informe';

function CrearPrae({ institucionId, anio, anterior }: { institucionId: string; anio: number; anterior?: AnioPrae }) {
  const styles = useStyles();
  const crear = useCrearPrae();
  const copiar = useCopiarPrae();
  const [tema, setTema] = useState<Tema>();
  const [temaOtro, setTemaOtro] = useState('');
  const [titulo, setTitulo] = useState('');
  const [problema, setProblema] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});

  async function enviar() {
    const validado = nuevoPraeSchema.safeParse({ tema, tema_otro: temaOtro, titulo, problema });
    if (!validado.success) {
      setErrores(Object.fromEntries(validado.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrores({});
    const d = validado.data;
    crear.mutate({ institucion_id: institucionId, anio, tema: d.tema, tema_otro: d.tema === 'otro' ? d.tema_otro : null, titulo: d.titulo, problema: d.problema });
  }

  return (
    <>
      {anterior ? (
        <Card title={`Empezar a partir del PRAE ${anterior.anio}`} subtitle={anterior.titulo} icon="refresh">
          <Text style={styles.texto}>Copia el problema, el diagnóstico, los objetivos, el comité y el plan de acción (con las fechas corridas y las acciones pendientes). No copia evidencias ni evaluaciones.</Text>
          {copiar.error ? <InlineMessage>{getApiErrorMessage(copiar.error)}</InlineMessage> : null}
          <PrimaryButton title={`Copiar al ${anio}`} icon="refresh" loading={copiar.isPending} onPress={() => copiar.mutate({ id: anterior.id, anio })} />
        </Card>
      ) : null}
      <Card title={`Crear el PRAE ${anio}`} subtitle="Sobre el problema ambiental que la comunidad educativa identificó: residuos, agua, energía, arbolado…" icon="add">
        <Text style={styles.etiqueta}>Tema</Text>
        <View style={styles.chips}>
          {TEMAS.map((t) => <ChoiceChip key={t.valor} label={t.etiqueta} selected={tema === t.valor} onPress={() => setTema(t.valor)} />)}
        </View>
        {errores.tema ? <InlineMessage>{errores.tema}</InlineMessage> : null}
        {tema === 'otro' ? <Field label="¿Cuál?" value={temaOtro} onChangeText={setTemaOtro} maxLength={80} error={errores.tema_otro} /> : null}
        <Field label="Título del proyecto" value={titulo} onChangeText={setTitulo} maxLength={150} placeholder="Ej.: Colegio sin plástico de un solo uso" error={errores.titulo} />
        <Field label="Problema ambiental" value={problema} onChangeText={setProblema} multiline maxLength={2000}
          placeholder="Qué pasa, dónde y a quién afecta" error={errores.problema} />
        {crear.error ? <InlineMessage>{getApiErrorMessage(crear.error)}</InlineMessage> : null}
        <PrimaryButton title="Crear PRAE" icon="check" loading={crear.isPending} onPress={() => void enviar()} />
      </Card>
    </>
  );
}

function Estado({ prae }: { prae: Prae }) {
  const styles = useStyles();
  const r = prae.resumen_acciones;
  const estado = ESTADOS_PRAE[prae.estado];
  const tema = prae.tema === 'otro' && prae.tema_otro ? prae.tema_otro : TEMAS.find((t) => t.valor === prae.tema)?.etiqueta;
  return (
    <Card title={prae.titulo} subtitle={`PRAE ${prae.anio} · ${tema}`} icon="leaf">
      <View style={styles.insignias}>
        <Badge label={estado.etiqueta} tono={estado.tono} />
        <Badge label={`${prae.evidencias.length} ${prae.evidencias.length === 1 ? 'evidencia' : 'evidencias'}`} tono="neutro" />
        {prae.acciones.some((a) => a.vencida) ? <Badge label="Hay acciones vencidas" tono="critico" /> : null}
      </View>
      {r.total ? (
        <>
          <ProgressBar pct={r.pct_cumplidas ?? 0} />
          <Text style={styles.meta}>{r.cumplida} de {r.total - r.cancelada} acciones cumplidas · {r.en_curso} en curso · {r.pendiente} pendientes</Text>
        </>
      ) : null}
      {prae.evaluaciones_faltantes.length ? (
        <Text style={styles.meta}>Falta la evaluación de: {prae.evaluaciones_faltantes.map((i) => INSTANCIAS[i]).join(' y ')}.</Text>
      ) : null}
    </Card>
  );
}

/** PRAE digital: el expediente del año del Proyecto Ambiental Escolar, su plan, evidencias,
 *  evaluaciones e informe. Lo ve toda la institución; lo editan sus docentes. */
export function PraeScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida();
  const actual = new Date().getFullYear();
  const [anio, setAnio] = useState(actual);
  const [vista, setVista] = useState<Vista>('proyecto');
  const institucionId = institucion.institucionId;
  const prae = usePrae(institucionId, anio, Boolean(institucionId));
  const anios = useAniosPrae(institucionId, Boolean(institucionId));
  const admin = esAdmin(perfil.data);
  const puedeCrear = Boolean(institucionId) && gestiona(perfil.data, institucionId);
  const opcionesAnio = [...new Set([actual + 1, actual, ...(anios.data ?? []).map((a) => a.anio)])].sort((a, b) => b - a);
  const anterior = (anios.data ?? []).filter((a) => a.anio < anio).sort((a, b) => b.anio - a.anio)[0];

  return (
    <Page onRefresh={() => void prae.refetch()} refreshing={prae.isRefetching}>
      <AppHeader
        eyebrow="Proyecto Ambiental Escolar"
        title="PRAE"
        subtitle="El expediente del año: problema, diagnóstico, objetivos, plan de acción, evidencias y la evaluación anual del consejo directivo y la Secretaría."
      />
      {admin ? <InstitucionSelector value={institucionId} onChange={institucion.setInstitucionId} permitirTodas={false} /> : null}
      <View style={styles.chips}>
        {opcionesAnio.map((a) => {
          const estado = anios.data?.find((x) => x.anio === a)?.estado;
          return <ChoiceChip key={a} label={estado ? `${a} · ${ESTADOS_PRAE[estado].etiqueta}` : String(a)} selected={anio === a} onPress={() => setAnio(a)} />;
        })}
      </View>

      {!institucionId ? (
        <EmptyState title="Elige una institución" />
      ) : prae.isLoading ? (
        <LoadingState />
      ) : prae.error ? (
        <ErrorState error={prae.error} onRetry={() => void prae.refetch()} />
      ) : !prae.data ? (
        puedeCrear ? <CrearPrae institucionId={institucionId} anio={anio} anterior={anterior} /> : (
          <EmptyState title={`Aún no hay PRAE ${anio}`} text="Los docentes de la institución lo crean y lo mantienen al día." />
        )
      ) : (
        <>
          <Estado prae={prae.data} />
          <Tabs<Vista>
            value={vista}
            onChange={setVista}
            options={[
              { label: 'Proyecto', value: 'proyecto' },
              { label: `Plan (${prae.data.acciones.length})`, value: 'plan' },
              { label: `Evidencias (${prae.data.evidencias.length})`, value: 'evidencias' },
              { label: 'Evaluación', value: 'evaluacion' },
              { label: 'Informe', value: 'informe' },
            ]}
          />
          {vista === 'proyecto' ? <ProyectoTab prae={prae.data} /> : null}
          {vista === 'plan' ? <PlanTab prae={prae.data} /> : null}
          {vista === 'evidencias' ? <EvidenciasTab prae={prae.data} /> : null}
          {vista === 'evaluacion' ? <EvaluacionTab prae={prae.data} /> : null}
          {vista === 'informe' ? <InformeTab prae={prae.data} /> : null}
        </>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  etiqueta: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
