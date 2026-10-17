import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { Text, View } from 'react-native';

import {
  presupuestoFormSchema,
  useGuardarPresupuesto,
  usePresupuestos,
  type Presupuesto,
  type PresupuestoFormInput,
} from '@/features/budgets/api';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha, formatPesos, formatPorcentaje } from '@/shared/format';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  NumberField,
  Page,
  ProgressBar,
  Row,
} from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

export function BudgetsScreen() {
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida();
  const habilitado = esRevisor(perfil.data);
  const presupuestos = usePresupuestos(institucion.institucionId, habilitado);

  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (!habilitado) {
    return <Page><AppHeader title="Presupuestos" /><Notice tono="riesgo">Los presupuestos los consultan docentes y administradores.</Notice></Page>;
  }
  return (
    <Page onRefresh={() => void presupuestos.refetch()} refreshing={presupuestos.isFetching && !presupuestos.isLoading}>
      <AppHeader
        eyebrow="Finanzas"
        title="Presupuestos"
        subtitle="Monto asignado por periodo, gasto ejecutado en intervenciones, lo comprometido en las programadas y la proyección con las recomendaciones pendientes."
      />
      <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} />
      {esAdmin(perfil.data) && institucion.institucionId ? <NuevoPresupuesto institucionId={institucion.institucionId} /> : null}
      {esAdmin(perfil.data) && !institucion.institucionId ? (
        <Notice>Elige una institución para crear un presupuesto.</Notice>
      ) : null}
      {presupuestos.isLoading ? <LoadingState /> : presupuestos.error ? (
        <ErrorState error={presupuestos.error} onRetry={() => void presupuestos.refetch()} />
      ) : !presupuestos.data?.length ? (
        <EmptyState title="No hay presupuestos registrados" />
      ) : (
        presupuestos.data.map((p) => <PresupuestoCard key={p.id} presupuesto={p} />)
      )}
    </Page>
  );
}

export function PresupuestoCard({ presupuesto: p, detalle = false }: { presupuesto: Presupuesto; detalle?: boolean }) {
  const styles = useStyles();
  const r = p.resumen;
  const tono = r.saldo_proyectado < 0 ? 'critico' : r.disponible < 0 ? 'critico' : (r.pct_ejecutado ?? 0) > 85 ? 'riesgo' : 'sano';
  return (
    <Card>
      <View style={styles.header}>
        <Text
          style={styles.titulo}
          accessibilityRole={detalle ? undefined : 'link'}
          onPress={detalle ? undefined : () => router.push(`/(app)/budgets/${p.id}` as Href)}
        >
          {p.nombre}
        </Text>
        <Badge label={r.vigente ? 'Vigente' : 'Cerrado'} tono={r.vigente ? 'info' : 'neutro'} />
      </View>
      <Text style={styles.texto}>{formatFecha(p.fecha_inicio)} a {formatFecha(p.fecha_fin)} · día {r.dias_transcurridos} de {r.dias_totales}</Text>
      <View style={styles.cifras}>
        <Cifra label="Asignado" valor={formatPesos(r.monto_asignado)} />
        <Cifra label="Ejecutado" valor={formatPesos(r.ejecutado)} />
        <Cifra label="Comprometido" valor={formatPesos(r.comprometido)} />
        <Cifra label="Disponible" valor={formatPesos(r.disponible)} alerta={r.disponible < 0} />
      </View>
      <Text style={styles.texto}>Ejecución {formatPorcentaje(r.pct_ejecutado)}</Text>
      <ProgressBar pct={r.pct_ejecutado} tono={tono} />
      <View style={styles.cifras}>
        <Cifra label="Recomendado sin programar" valor={formatPesos(r.recomendado_sin_programar)} />
        <Cifra label="Proyección total" valor={formatPesos(r.proyeccion_total)} />
        <Cifra label="Saldo proyectado" valor={formatPesos(r.saldo_proyectado)} alerta={r.saldo_proyectado < 0} />
        <Cifra label="Al ritmo actual" valor={formatPesos(r.proyeccion_ritmo_actual)} />
      </View>
      {r.saldo_proyectado < 0 ? (
        <Notice tono="critico">Si se ejecuta todo lo programado y recomendado, el presupuesto no alcanza.</Notice>
      ) : null}
    </Card>
  );
}

function Cifra({ label, valor, alerta = false }: { label: string; valor: string; alerta?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.cifra}>
      <Text style={styles.cifraLabel}>{label}</Text>
      <Text style={[styles.cifraValor, alerta && styles.alerta]}>{valor}</Text>
    </View>
  );
}

function NuevoPresupuesto({ institucionId }: { institucionId: string }) {
  const { crear } = useGuardarPresupuesto();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string>();
  const anio = new Date().getFullYear();
  const { control, handleSubmit, reset } = useForm<PresupuestoFormInput>({
    resolver: zodResolver(presupuestoFormSchema),
    defaultValues: { nombre: `Presupuesto ${anio}`, fecha_inicio: `${anio}-01-01`, fecha_fin: `${anio}-12-31`, monto_asignado: undefined, notas: '' },
  });
  if (!abierto) return <PrimaryButton title="＋ Nuevo presupuesto" onPress={() => setAbierto(true)} />;

  const enviar = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await crear.mutateAsync({ ...v, nombre: v.nombre.trim(), notas: v.notas.trim() || null, institucion_id: institucionId });
      reset();
      setAbierto(false);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  return (
    <Card title="Nuevo presupuesto">
      <PresupuestoCampos control={control} />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar presupuesto" loading={crear.isPending} onPress={() => void enviar()} />
      <PrimaryButton title="Cancelar" variant="secondary" onPress={() => setAbierto(false)} />
    </Card>
  );
}

export function PresupuestoCampos({ control }: { control: Control<PresupuestoFormInput> }) {
  return (
    <>
      <Controller name="nombre" control={control} render={({ field, fieldState }) => (
        <Field label="Nombre" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
      )} />
      <Row>
        <Cell basis={150}>
          <Controller name="fecha_inicio" control={control} render={({ field, fieldState }) => (
            <Field label="Desde" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="AAAA-MM-DD"
              autoCapitalize="none" error={fieldState.error?.message} />
          )} />
        </Cell>
        <Cell basis={150}>
          <Controller name="fecha_fin" control={control} render={({ field, fieldState }) => (
            <Field label="Hasta" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="AAAA-MM-DD"
              autoCapitalize="none" error={fieldState.error?.message} />
          )} />
        </Cell>
      </Row>
      <Controller name="monto_asignado" control={control} render={({ field, fieldState }) => (
        <NumberField label="Monto asignado (COP)" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
      )} />
      <Controller name="notas" control={control} render={({ field, fieldState }) => (
        <Field label="Notas (opcional)" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} multiline error={fieldState.error?.message} />
      )} />
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titulo: { color: palette.forest, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  texto: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  cifras: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cifra: { flexGrow: 1, flexBasis: 130, gap: 2 },
  cifraLabel: { color: palette.muted, fontSize: 11 },
  cifraValor: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  alerta: { color: palette.red },
}));
