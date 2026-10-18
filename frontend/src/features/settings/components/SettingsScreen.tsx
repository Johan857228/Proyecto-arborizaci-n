import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { SedesDane } from '@/features/exportar/components/SedesDane';
import { useEditarTipoIntervencion, useTiposIntervencion } from '@/features/interventions/hooks/useIntervenciones';
import { MAX_COSTO, type TipoIntervencion } from '@/features/interventions/schemas';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor } from '@/features/perfil/schemas';
import {
  parametrosFormSchema,
  useGuardarConfiguracion,
  useMetodos,
  useParametros,
  type Metodo,
  type Parametros,
  type ParametrosForm,
} from '@/features/settings/api';
import { SimulacionResultado } from '@/features/settings/components/SimulacionResultado';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha, formatNumero, formatPesos } from '@/shared/format';
import { InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  EmptyState,
  ErrorState,
  KeyValue,
  LoadingState,
  Notice,
  NumberField,
  Page,
  Row,
  Tabs,
} from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

export function SettingsScreen() {
  const perfil = useMiPerfil();
  // Exportar datos enlaza directo a las sedes (/settings?vista=sedes).
  const params = useLocalSearchParams<{ vista?: string }>();
  const [vista, setVista] = useState<'parametros' | 'metodos' | 'costos' | 'sedes'>(params.vista === 'sedes' ? 'sedes' : 'parametros');
  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (!esRevisor(perfil.data)) {
    return <Page><AppHeader title="Configuración" /><Notice tono="riesgo">Esta sección es para docentes y administradores.</Notice></Page>;
  }
  const admin = esAdmin(perfil.data);
  return (
    <Page>
      <AppHeader
        eyebrow="Configuración"
        title="Método de cálculo y parámetros"
        subtitle={admin
          ? 'Define cómo se califica el riesgo de cada inspección y los parámetros de cada institución.'
          : 'Consulta cómo se califica el riesgo. Solo el administrador puede cambiarlo.'}
      />
      <Tabs
        value={vista}
        options={[
          { label: 'Parámetros', value: 'parametros' },
          { label: 'Versiones del método', value: 'metodos' },
          { label: 'Costos de referencia', value: 'costos' },
          { label: 'Sedes y código DANE', value: 'sedes' },
        ]}
        onChange={setVista}
      />
      {vista === 'parametros' ? <ParametrosVista admin={admin} /> : null}
      {vista === 'metodos' ? <MetodosVista admin={admin} /> : null}
      {vista === 'costos' ? <CostosVista admin={admin} /> : null}
      {vista === 'sedes' ? <SedesDane admin={admin} /> : null}
    </Page>
  );
}

function ParametrosVista({ admin }: { admin: boolean }) {
  const styles = useStyles();
  const parametros = useParametros();
  const metodos = useMetodos();
  if (parametros.isLoading || metodos.isLoading) return <LoadingState />;
  if (parametros.error) return <ErrorState error={parametros.error} onRetry={() => void parametros.refetch()} />;
  if (metodos.error) return <ErrorState error={metodos.error} onRetry={() => void metodos.refetch()} />;
  return (
    <>
      <Text style={styles.texto}>
        La versión del método se aplica a las inspecciones nuevas; las anteriores conservan la versión con que se calificaron.
        Los puntos se recalculan con los valores vigentes.
      </Text>
      {(parametros.data ?? []).map((p) => (
        <ParametrosInstitucion key={p.institucion_id} parametros={p} metodos={metodos.data ?? []} admin={admin} />
      ))}
    </>
  );
}

function ParametrosInstitucion({ parametros: p, metodos, admin }: { parametros: Parametros; metodos: Metodo[]; admin: boolean }) {
  const styles = useStyles();
  const { parametros: guardar } = useGuardarConfiguracion();
  const [mensaje, setMensaje] = useState<string>();
  const [error, setError] = useState<string>();
  const { control, handleSubmit } = useForm<ParametrosForm>({
    resolver: zodResolver(parametrosFormSchema),
    mode: 'onChange',
    defaultValues: {
      metodo_id: p.metodo_id ?? '',
      dias_revisita: p.dias_revisita,
      precision_gps_max_m: p.precision_gps_max_m,
      puntos_inspeccion: p.puntos_inspeccion,
      puntos_arbol_nuevo: p.puntos_arbol_nuevo,
    },
  });

  const enviar = handleSubmit(async (v) => {
    setError(undefined);
    setMensaje(undefined);
    try {
      await guardar.mutateAsync({ institucionId: p.institucion_id, datos: v });
      setMensaje('Parámetros guardados.');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  if (!admin) {
    return (
      <Card title={p.institucion_nombre}>
        <View style={styles.kvs}>
          <KeyValue label="Método vigente" value={`v${p.metodo_version} · ${p.metodo_nombre}`} />
          <KeyValue label="Revisita cada" value={`${p.dias_revisita} días`} />
          <KeyValue label="Precisión GPS máxima" value={`${formatNumero(p.precision_gps_max_m)} m`} />
          <KeyValue label="Puntos por inspección" value={p.puntos_inspeccion} />
          <KeyValue label="Puntos por árbol nuevo" value={p.puntos_arbol_nuevo} />
        </View>
        {!p.configurado ? <Text style={styles.texto}>Usa los valores por defecto.</Text> : null}
      </Card>
    );
  }

  return (
    <Card title={p.institucion_nombre} action={p.configurado ? undefined : <Badge label="Valores por defecto" tono="riesgo" />}>
      <Controller name="metodo_id" control={control} render={({ field, fieldState }) => (
        <SelectField
          label="Versión del método"
          value={field.value || undefined}
          options={metodos.map((m) => ({ label: `v${m.version} · ${m.nombre}`, value: m.id }))}
          onChange={field.onChange}
          error={fieldState.error?.message}
        />
      )} />
      <Row>
        {([
          ['dias_revisita', 'Revisitar cada (días)'],
          ['precision_gps_max_m', 'Precisión GPS máxima (m)'],
          ['puntos_inspeccion', 'Puntos por inspección confirmada'],
          ['puntos_arbol_nuevo', 'Puntos extra por árbol nuevo'],
        ] as const).map(([name, label]) => (
          <Cell key={name} basis={180}>
            <Controller name={name} control={control} render={({ field, fieldState }) => (
              <NumberField label={label} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
            )} />
          </Cell>
        ))}
      </Row>
      {mensaje ? <InlineMessage tone="info">{mensaje}</InlineMessage> : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar parámetros" loading={guardar.isPending} onPress={() => void enviar()} />
    </Card>
  );
}

function MetodosVista({ admin }: { admin: boolean }) {
  const styles = useStyles();
  const metodos = useMetodos();
  const { simular } = useGuardarConfiguracion();
  const [simulado, setSimulado] = useState<string>();
  if (metodos.isLoading) return <LoadingState />;
  if (metodos.error) return <ErrorState error={metodos.error} onRetry={() => void metodos.refetch()} />;
  return (
    <>
      {admin ? (
        <PrimaryButton title="＋ Nueva versión del método" onPress={() => router.push('/(app)/settings/method-new' as Href)} />
      ) : null}
      {!metodos.data?.length ? <EmptyState title="No hay métodos" text="Aplica la migración 001 en Supabase." /> : null}
      {(metodos.data ?? []).map((m) => (
        <Card
          key={m.id}
          title={`v${m.version} · ${m.nombre}`}
          action={m.instituciones.length ? <Badge label={`En uso: ${m.instituciones.join(', ')}`} tono="sano" /> : undefined}
        >
          {m.descripcion ? <Text style={styles.texto}>{m.descripcion}</Text> : null}
          <View style={styles.kvs}>
            <KeyValue label="Follaje" value={formatNumero(m.peso_follaje)} />
            <KeyValue label="Tronco" value={formatNumero(m.peso_tronco)} />
            <KeyValue label="Raíz" value={formatNumero(m.peso_raiz)} />
            <KeyValue label="Plagas" value={formatNumero(m.peso_plagas)} />
            <KeyValue label="Interferencia" value={formatNumero(m.peso_interferencia)} />
            <KeyValue label="Umbral riesgo" value={formatNumero(m.umbral_riesgo)} />
            <KeyValue label="Umbral crítico" value={formatNumero(m.umbral_critico)} />
            <KeyValue label="Densidad por defecto" value={`${formatNumero(m.densidad_madera_defecto, 3)} g/cm³`} />
            <KeyValue label="Factor raíz" value={formatNumero(m.factor_raiz, 3)} />
            <KeyValue label="Fracción de carbono" value={formatNumero(m.fraccion_carbono, 3)} />
          </View>
          {Object.keys(m.pesos_observacion).length ? (
            <Text style={styles.texto}>
              Pesos propios: {Object.entries(m.pesos_observacion).map(([c, p]) => `${c} = ${formatNumero(p)}`).join(', ')}
            </Text>
          ) : null}
          <Text style={styles.texto}>Creada el {formatFecha(m.creado_en)}</Text>
          <PrimaryButton
            title="Vista previa con los árboles actuales"
            variant="secondary"
            loading={simular.isPending && simulado === m.id}
            onPress={() => { setSimulado(m.id); simular.mutate({ metodo_id: m.id }); }}
          />
          {simulado === m.id && simular.data ? <SimulacionResultado simulacion={simular.data} /> : null}
          {simulado === m.id && simular.error ? <InlineMessage>{getApiErrorMessage(simular.error)}</InlineMessage> : null}
        </Card>
      ))}
    </>
  );
}

function CostosVista({ admin }: { admin: boolean }) {
  const styles = useStyles();
  const tipos = useTiposIntervencion();
  if (tipos.isLoading) return <LoadingState />;
  if (tipos.error) return <ErrorState error={tipos.error} onRetry={() => void tipos.refetch()} />;
  return (
    <>
      <Text style={styles.texto}>
        Los costos de referencia (COP) se usan para estimar las intervenciones recomendadas, las proyecciones del presupuesto y los escenarios.
      </Text>
      {(tipos.data ?? []).map((t) => <CostoTipo key={t.codigo} tipo={t} admin={admin} />)}
    </>
  );
}

function CostoTipo({ tipo, admin }: { tipo: TipoIntervencion; admin: boolean }) {
  const styles = useStyles();
  const editar = useEditarTipoIntervencion();
  const [costo, setCosto] = useState<number | undefined>(tipo.costo_referencia);
  const [error, setError] = useState<string>();
  const invalido = costo === undefined || Number.isNaN(costo) || costo < 0 || costo > MAX_COSTO;

  async function guardar() {
    if (invalido) return;
    setError(undefined);
    try {
      await editar.mutateAsync({ codigo: tipo.codigo, costo });
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <Card title={tipo.nombre}>
      {tipo.descripcion ? <Text style={styles.texto}>{tipo.descripcion}</Text> : null}
      {admin ? (
        <Row>
          <Cell basis={180}>
            <NumberField label="Costo de referencia (COP)" value={costo} onChange={setCosto}
              error={invalido ? `Escribe un valor entre 0 y ${formatPesos(MAX_COSTO)}.` : error} />
          </Cell>
          <Cell basis={120}>
            <PrimaryButton title="Guardar" disabled={invalido || costo === tipo.costo_referencia} loading={editar.isPending} onPress={() => void guardar()} />
          </Cell>
        </Row>
      ) : (
        <Text style={styles.costo}>{formatPesos(tipo.costo_referencia)}</Text>
      )}
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  kvs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  costo: { color: palette.ink, fontSize: 16, fontWeight: '900' },
}));
