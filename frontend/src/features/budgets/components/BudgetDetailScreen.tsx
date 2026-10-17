import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import {
  presupuestoFormSchema,
  useGuardarPresupuesto,
  usePresupuesto,
  type Presupuesto,
  type PresupuestoFormInput,
} from '@/features/budgets/api';
import { PresupuestoCampos, PresupuestoCard } from '@/features/budgets/components/BudgetsScreen';
import { useTiposIntervencion } from '@/features/interventions/hooks/useIntervenciones';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { formatMes, formatPesos } from '@/shared/format';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Card, ConfirmButton, ErrorState, LoadingState, Notice, Page, ProgressBar } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

export function BudgetDetailScreen({ presupuestoId }: { presupuestoId: string }) {
  const styles = useStyles();
  const consulta = usePresupuesto(presupuestoId);
  const perfil = useMiPerfil();
  const tipos = useTiposIntervencion();
  if (consulta.isLoading) return <Page><LoadingState /></Page>;
  if (consulta.error || !consulta.data) {
    return <Page><AppHeader title="Presupuesto" /><ErrorState error={consulta.error} onRetry={() => void consulta.refetch()} /></Page>;
  }
  const p = consulta.data;
  const nombreTipo = (codigo: string) => tipos.data?.find((t) => t.codigo === codigo)?.nombre ?? codigo;
  const maxMes = Math.max(1, ...p.resumen.por_mes.map((m) => m.ejecutado));

  return (
    <Page onRefresh={() => void consulta.refetch()} refreshing={consulta.isFetching && !consulta.isLoading}>
      <AppHeader eyebrow="Presupuesto" title={p.nombre} subtitle={p.notas ?? undefined} backTo={'/(app)/budgets' as Href} />
      <PresupuestoCard presupuesto={p} detalle />

      <Card title="Por tipo de intervención">
        {p.resumen.por_tipo.length ? p.resumen.por_tipo.map((t) => (
          <View key={t.tipo_codigo} style={styles.fila}>
            <Text style={styles.nombre}>{nombreTipo(t.tipo_codigo)}</Text>
            <Text style={styles.texto}>
              Ejecutado {formatPesos(t.ejecutado)} ({t.ejecutadas}) · Comprometido {formatPesos(t.comprometido)} ({t.programadas})
            </Text>
          </View>
        )) : <Text style={styles.texto}>Sin gastos ni compromisos en este periodo.</Text>}
      </Card>

      <Card title="Gasto ejecutado por mes">
        {p.resumen.por_mes.length ? p.resumen.por_mes.map((m) => (
          <View key={m.mes} style={styles.mes}>
            <View style={styles.mesHeader}>
              <Text style={styles.nombre}>{formatMes(m.mes)}</Text>
              <Text style={styles.texto}>{formatPesos(m.ejecutado)}</Text>
            </View>
            <ProgressBar pct={(m.ejecutado * 100) / maxMes} tono="info" />
          </View>
        )) : <Text style={styles.texto}>Aún no hay intervenciones ejecutadas en el periodo.</Text>}
      </Card>

      {esAdmin(perfil.data) ? <EditarPresupuesto presupuesto={p} /> : null}
    </Page>
  );
}

function EditarPresupuesto({ presupuesto }: { presupuesto: Presupuesto }) {
  const { editar, borrar } = useGuardarPresupuesto();
  const [mensaje, setMensaje] = useState<string>();
  const [error, setError] = useState<string>();
  const { control, handleSubmit } = useForm<PresupuestoFormInput>({
    resolver: zodResolver(presupuestoFormSchema),
    defaultValues: {
      nombre: presupuesto.nombre,
      fecha_inicio: presupuesto.fecha_inicio,
      fecha_fin: presupuesto.fecha_fin,
      monto_asignado: presupuesto.monto_asignado,
      notas: presupuesto.notas ?? '',
    },
  });

  const guardar = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await editar.mutateAsync({ id: presupuesto.id, cambios: { ...v, nombre: v.nombre.trim(), notas: v.notas.trim() || null } });
      setMensaje('Presupuesto actualizado.');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  async function eliminar() {
    try {
      await borrar.mutateAsync(presupuesto.id);
      router.replace('/(app)/budgets' as Href);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <Card title="Editar (administrador)">
      {mensaje ? <Notice tono="sano">{mensaje}</Notice> : null}
      <PresupuestoCampos control={control} />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar cambios" loading={editar.isPending} onPress={() => void guardar()} />
      <ConfirmButton
        title="Eliminar presupuesto"
        confirmTitle="¿Eliminar este presupuesto? Las intervenciones no se borran."
        loading={borrar.isPending}
        onConfirm={() => void eliminar()}
      />
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  fila: { gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: palette.line },
  nombre: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  texto: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  mes: { gap: 4 },
  mesHeader: { flexDirection: 'row', justifyContent: 'space-between' },
}));
