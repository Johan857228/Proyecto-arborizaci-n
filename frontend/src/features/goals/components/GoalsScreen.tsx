import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { Text, View } from 'react-native';

import {
  ETIQUETA_ESTADO_META,
  metaFormSchema,
  useGuardarMeta,
  useIndicadoresMeta,
  useMetas,
  type IndicadorInfo,
  type Meta,
  type MetaForm,
} from '@/features/goals/api';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha, formatNumero, formatPesos } from '@/shared/format';
import { Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  ConfirmButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  NumberField,
  Page,
  ProgressBar,
  Row,
  type Tono,
} from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const TONO_ESTADO: Record<Meta['estado'], Tono> = { por_iniciar: 'neutro', en_curso: 'info', cumplida: 'sano', no_cumplida: 'critico' };

function valorConUnidad(valor: number, unidad: string) {
  if (unidad === 'COP') return formatPesos(valor);
  if (unidad === '%') return `${formatNumero(valor, 1)} %`;
  return `${formatNumero(valor)} ${unidad}`;
}

export function GoalsScreen() {
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida();
  const metas = useMetas(institucion.institucionId);
  const indicadores = useIndicadoresMeta();
  const admin = esAdmin(perfil.data);

  return (
    <Page onRefresh={() => void metas.refetch()} refreshing={metas.isFetching && !metas.isLoading}>
      <AppHeader
        eyebrow="Fase 2"
        title="Metas institucionales"
        subtitle="Una meta por indicador y periodo. El avance se calcula con los mismos indicadores de Reportes."
      />
      <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} />
      {admin && institucion.institucionId && indicadores.data ? (
        <NuevaMeta institucionId={institucion.institucionId} indicadores={indicadores.data} />
      ) : null}
      {admin && !institucion.institucionId ? <Notice>Elige una institución para registrar metas.</Notice> : null}
      {metas.isLoading ? <LoadingState /> : metas.error ? (
        <ErrorState error={metas.error} onRetry={() => void metas.refetch()} />
      ) : !metas.data?.length ? (
        <EmptyState title="No hay metas registradas" text={admin ? 'Registra la primera con el botón de arriba.' : 'El administrador las registra.'} />
      ) : (
        metas.data.map((m) => <MetaCard key={m.id} meta={m} admin={admin} />)
      )}
    </Page>
  );
}

function MetaCard({ meta: m, admin }: { meta: Meta; admin: boolean }) {
  const styles = useStyles();
  const [editando, setEditando] = useState(false);
  return (
    <Card title={m.indicador_nombre} action={<Badge label={ETIQUETA_ESTADO_META[m.estado]} tono={TONO_ESTADO[m.estado]} />}>
      <Text style={styles.texto}>
        {formatFecha(m.fecha_inicio)} a {formatFecha(m.fecha_fin)} · {m.sentido === 'mayor' ? 'alcanzar al menos' : 'no superar'} {valorConUnidad(m.valor_meta, m.unidad)}
      </Text>
      {m.descripcion ? <Text style={styles.texto}>{m.descripcion}</Text> : null}
      <View style={styles.avance}>
        <Text style={styles.valor}>{valorConUnidad(m.valor_actual, m.unidad)}</Text>
        <Text style={styles.texto}>avance {formatNumero(m.avance_pct, 1)} %</Text>
      </View>
      <ProgressBar pct={m.avance_pct} tono={TONO_ESTADO[m.estado]} />
      {admin ? (
        editando ? <EditarMeta meta={m} onListo={() => setEditando(false)} /> : (
          <PrimaryButton title="Editar meta" variant="secondary" onPress={() => setEditando(true)} />
        )
      ) : null}
    </Card>
  );
}

function CamposMeta({ control, indicadores, fijo }: {
  control: Control<MetaForm>;
  indicadores?: IndicadorInfo[];
  fijo?: boolean;
}) {
  const styles = useStyles();
  const indicador = useWatch({ control, name: 'indicador' });
  const info = indicadores?.find((i) => i.codigo === indicador);
  return (
    <>
      {!fijo && indicadores ? (
        <Controller name="indicador" control={control} render={({ field, fieldState }) => (
          <SelectField
            label="Indicador"
            value={field.value}
            options={indicadores.map((i) => ({ label: `${i.nombre} (${i.unidad})`, value: i.codigo }))}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )} />
      ) : null}
      {info ? (
        <Text style={styles.texto}>
          {info.sentido === 'mayor' ? 'Se cumple al alcanzar o superar el valor.' : 'Se cumple si al cierre no se supera el valor.'}
        </Text>
      ) : null}
      <Row>
        <Cell basis={140}>
          <Controller name="fecha_inicio" control={control} render={({ field, fieldState }) => (
            <Field label="Desde" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="AAAA-MM-DD"
              autoCapitalize="none" error={fieldState.error?.message} />
          )} />
        </Cell>
        <Cell basis={140}>
          <Controller name="fecha_fin" control={control} render={({ field, fieldState }) => (
            <Field label="Hasta" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="AAAA-MM-DD"
              autoCapitalize="none" error={fieldState.error?.message} />
          )} />
        </Cell>
        <Cell basis={140}>
          <Controller name="valor_meta" control={control} render={({ field, fieldState }) => (
            <NumberField label={`Valor meta${info ? ` (${info.unidad})` : ''}`} value={field.value} onChange={field.onChange}
              onBlur={field.onBlur} error={fieldState.error?.message} />
          )} />
        </Cell>
      </Row>
      <Controller name="descripcion" control={control} render={({ field, fieldState }) => (
        <Field label="Descripción (opcional)" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
      )} />
    </>
  );
}

function NuevaMeta({ institucionId, indicadores }: { institucionId: string; indicadores: IndicadorInfo[] }) {
  const { crear } = useGuardarMeta();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string>();
  const anio = new Date().getFullYear();
  const { control, handleSubmit, reset } = useForm<MetaForm>({
    resolver: zodResolver(metaFormSchema),
    mode: 'onChange',
    defaultValues: { indicador: 'cobertura_inspeccion_pct', fecha_inicio: `${anio}-01-01`, fecha_fin: `${anio}-12-31`, valor_meta: undefined, descripcion: '' },
  });
  if (!abierto) return <PrimaryButton title="＋ Nueva meta" onPress={() => setAbierto(true)} />;

  const enviar = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await crear.mutateAsync({ ...v, descripcion: v.descripcion.trim() || null, institucion_id: institucionId });
      reset();
      setAbierto(false);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  return (
    <Card title="Nueva meta">
      <CamposMeta control={control} indicadores={indicadores} />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar meta" loading={crear.isPending} onPress={() => void enviar()} />
      <PrimaryButton title="Cancelar" variant="secondary" onPress={() => setAbierto(false)} />
    </Card>
  );
}

function EditarMeta({ meta, onListo }: { meta: Meta; onListo: () => void }) {
  const styles = useStyles();
  const { editar, borrar } = useGuardarMeta();
  const [error, setError] = useState<string>();
  const { control, handleSubmit } = useForm<MetaForm>({
    resolver: zodResolver(metaFormSchema),
    mode: 'onChange',
    defaultValues: {
      indicador: meta.indicador,
      fecha_inicio: meta.fecha_inicio,
      fecha_fin: meta.fecha_fin,
      valor_meta: meta.valor_meta,
      descripcion: meta.descripcion ?? '',
    },
  });

  const guardar = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await editar.mutateAsync({
        id: meta.id,
        cambios: { fecha_inicio: v.fecha_inicio, fecha_fin: v.fecha_fin, valor_meta: v.valor_meta, descripcion: v.descripcion.trim() || null },
      });
      onListo();
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  async function eliminar() {
    try {
      await borrar.mutateAsync(meta.id);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <View style={styles.editar}>
      <CamposMeta control={control} fijo />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar cambios" loading={editar.isPending} onPress={() => void guardar()} />
      <PrimaryButton title="Cancelar" variant="secondary" onPress={onListo} />
      <ConfirmButton title="Eliminar meta" confirmTitle="¿Eliminar esta meta?" loading={borrar.isPending} onConfirm={() => void eliminar()} />
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  avance: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  valor: { color: palette.ink, fontSize: 20, fontWeight: '900' },
  editar: { gap: 4, marginTop: 6 },
}));
