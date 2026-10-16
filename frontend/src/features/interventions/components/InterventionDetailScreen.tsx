import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import type { z } from 'zod';

import { palette } from '@/config/constants';
import { useEditarIntervencion, useIntervencion } from '@/features/interventions/hooks/useIntervenciones';
import {
  ETIQUETA_ESTADO_INTERVENCION,
  ETIQUETA_RESULTADO,
  ejecutarSchema,
  type EjecutarInput,
  type Intervencion,
} from '@/features/interventions/schemas';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, gestiona } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha, formatFechaHora, formatPesos, hoyIso } from '@/shared/format';
import { Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  ConfirmButton,
  ErrorState,
  KeyValue,
  LoadingState,
  Notice,
  NumberField,
  Page,
  Row,
} from '@/shared/components/UI';

export function InterventionDetailScreen({ intervencionId }: { intervencionId: string }) {
  const consulta = useIntervencion(intervencionId);
  const perfil = useMiPerfil();
  const editar = useEditarIntervencion();
  const [mensaje, setMensaje] = useState<string>();
  const [error, setError] = useState<string>();

  if (consulta.isLoading) return <Page><LoadingState /></Page>;
  if (consulta.error || !consulta.data) {
    return <Page><AppHeader title="Intervención" /><ErrorState error={consulta.error} onRetry={() => void consulta.refetch()} /></Page>;
  }
  const i = consulta.data;
  const puedeGestionar = gestiona(perfil.data, i.institucion_id);
  const puedeCorregir = i.estado === 'programada' ? puedeGestionar : esAdmin(perfil.data);

  async function cambiar(cambios: Record<string, unknown>, texto: string) {
    setError(undefined);
    try {
      await editar.mutateAsync({ id: i.id, cambios });
      setMensaje(texto);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <Page>
      <AppHeader
        eyebrow="Intervención"
        title={i.tipo_nombre ?? i.tipo_codigo}
        subtitle={`${i.codigo ?? ''} · ${i.nombre_comun ?? ''} · ${i.zona ?? ''}`}
      />
      {mensaje ? <Notice tono="sano">{mensaje}</Notice> : null}
      {error ? <Notice tono="critico">{error}</Notice> : null}
      <View style={styles.badges}>
        <Badge label={ETIQUETA_ESTADO_INTERVENCION[i.estado]} tono={i.estado === 'ejecutada' ? 'sano' : i.estado === 'programada' ? 'info' : 'neutro'} />
        {i.resultado ? <Badge label={`Resultado: ${ETIQUETA_RESULTADO[i.resultado]}`} /> : null}
      </View>
      <PrimaryButton title="Ver ficha del árbol" variant="secondary" onPress={() => router.push(`/(app)/trees/${i.arbol_id}` as Href)} />

      <Card title="Detalle">
        <View style={styles.kvs}>
          <KeyValue label="Responsable" value={i.responsable} />
          <KeyValue label="Fecha programada" value={formatFecha(i.fecha_programada)} />
          <KeyValue label="Costo estimado" value={formatPesos(i.costo_estimado)} />
          <KeyValue label="Fecha de ejecución" value={formatFecha(i.fecha_ejecucion)} />
          <KeyValue label="Costo real" value={formatPesos(i.costo_real)} />
          <KeyValue label="Actualizada" value={formatFechaHora(i.actualizado_en)} />
        </View>
        {i.descripcion ? <Text style={styles.texto}>{i.descripcion}</Text> : null}
        {i.resultado_detalle ? <Text style={styles.texto}>Resultado: {i.resultado_detalle}</Text> : null}
      </Card>

      {puedeCorregir && i.estado === 'programada' ? (
        <Card title="Registrar ejecución">
          <EjecutarForm intervencion={i} cargando={editar.isPending} onGuardar={(datos) => void cambiar({ estado: 'ejecutada', ...datos }, 'Ejecución registrada.')} />
          <ConfirmButton
            title="Cancelar esta intervención"
            confirmTitle="¿Cancelar la intervención? Ya no contará como gasto comprometido."
            loading={editar.isPending}
            onConfirm={() => void cambiar({ estado: 'cancelada' }, 'Intervención cancelada.')}
          />
        </Card>
      ) : null}
      {puedeCorregir && i.estado === 'ejecutada' ? (
        <Card title="Corregir (administrador)">
          <EjecutarForm intervencion={i} cargando={editar.isPending} onGuardar={(datos) => void cambiar(datos, 'Intervención corregida.')} />
        </Card>
      ) : null}
    </Page>
  );
}

function EjecutarForm({
  intervencion,
  cargando,
  onGuardar,
}: {
  intervencion: Intervencion;
  cargando: boolean;
  onGuardar: (datos: z.output<typeof ejecutarSchema>) => void;
}) {
  const { control, handleSubmit } = useForm<EjecutarInput, unknown, z.output<typeof ejecutarSchema>>({
    resolver: zodResolver(ejecutarSchema),
    mode: 'onChange',
    defaultValues: {
      fecha_ejecucion: intervencion.fecha_ejecucion ?? hoyIso(),
      costo_real: intervencion.costo_real ?? intervencion.costo_estimado ?? undefined,
      resultado: intervencion.resultado ?? undefined,
      resultado_detalle: intervencion.resultado_detalle ?? '',
    },
  });
  return (
    <View>
      <Row>
        <Cell>
          <Controller
            name="fecha_ejecucion"
            control={control}
            render={({ field, fieldState }) => (
              <Field label="Fecha de ejecución" value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur}
                placeholder="AAAA-MM-DD" autoCapitalize="none" error={fieldState.error?.message} />
            )}
          />
        </Cell>
        <Cell>
          <Controller
            name="costo_real"
            control={control}
            render={({ field, fieldState }) => (
              <NumberField label="Costo real (COP)" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
            )}
          />
        </Cell>
      </Row>
      <Controller
        name="resultado"
        control={control}
        render={({ field, fieldState }) => (
          <SelectField
            label="Resultado"
            value={field.value}
            options={Object.entries(ETIQUETA_RESULTADO).map(([value, label]) => ({ label, value: value as keyof typeof ETIQUETA_RESULTADO }))}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        name="resultado_detalle"
        control={control}
        render={({ field, fieldState }) => (
          <Field label="Detalle del resultado (opcional)" value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur}
            multiline error={fieldState.error?.message} />
        )}
      />
      <PrimaryButton title="Guardar" loading={cargando} onPress={() => void handleSubmit(onGuardar)()} />
      {cargando ? null : <InlineMessage tone="info">La fecha no puede ser futura.</InlineMessage>}
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kvs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
});
