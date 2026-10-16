import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';

import { palette } from '@/config/constants';
import { useCrearIntervencion, useTiposIntervencion } from '@/features/interventions/hooks/useIntervenciones';
import {
  ETIQUETA_RESULTADO,
  intervencionFormSchema,
  type IntervencionFormInput,
  type IntervencionFormOutput,
  type TipoIntervencion,
} from '@/features/interventions/schemas';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { gestiona } from '@/features/perfil/schemas';
import { useArbol } from '@/features/trees/hooks/useArbol';
import type { ArbolDetalle } from '@/features/trees/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { useAvisos } from '@/shared/avisos';
import { formatPesos, hoyIso } from '@/shared/format';
import { Field, InlineMessage, PrimaryButton, Section, SelectField } from '@/shared/components/FormControls';
import { AppHeader, Cell, ErrorState, LoadingState, Notice, NumberField, Page, Row, Tabs } from '@/shared/components/UI';

export function InterventionFormScreen({ arbolId, tipoInicial }: { arbolId: string; tipoInicial?: string }) {
  const arbol = useArbol(arbolId);
  const tipos = useTiposIntervencion();
  const perfil = useMiPerfil();
  if (arbol.isLoading || tipos.isLoading || perfil.isLoading) return <Page><LoadingState /></Page>;
  if (arbol.error || !arbol.data) return <Page><ErrorState error={arbol.error} onRetry={() => void arbol.refetch()} /></Page>;
  if (tipos.error || !tipos.data) return <Page><ErrorState error={tipos.error} onRetry={() => void tipos.refetch()} /></Page>;
  if (!gestiona(perfil.data, arbol.data.institucion_id)) {
    return (
      <Page>
        <AppHeader title="Registrar intervención" />
        <Notice tono="riesgo">Solo los docentes de la institución del árbol y los administradores registran intervenciones.</Notice>
      </Page>
    );
  }
  return <Formulario arbol={arbol.data} tipos={tipos.data} tipoInicial={tipoInicial} />;
}

function Formulario({ arbol, tipos, tipoInicial }: { arbol: ArbolDetalle; tipos: TipoIntervencion[]; tipoInicial?: string }) {
  const crear = useCrearIntervencion();
  const avisar = useAvisos((state) => state.avisar);
  const [error, setError] = useState<string>();
  const inicial = tipos.find((t) => t.codigo === tipoInicial);
  const { control, handleSubmit, setValue, formState: { errors } } = useForm<IntervencionFormInput, unknown, IntervencionFormOutput>({
    resolver: zodResolver(intervencionFormSchema),
    mode: 'onChange',
    defaultValues: {
      tipo_codigo: inicial?.codigo ?? '',
      estado: 'programada',
      responsable: '',
      descripcion: '',
      fecha_programada: '',
      fecha_ejecucion: hoyIso(),
      costo_estimado: inicial?.costo_referencia,
      costo_real: undefined,
      resultado: undefined,
      resultado_detalle: '',
    },
  });
  const estado = useWatch({ control, name: 'estado' });
  const tipoCodigo = useWatch({ control, name: 'tipo_codigo' });
  const tipo = tipos.find((t) => t.codigo === tipoCodigo);

  const enviar = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await crear.mutateAsync({
        arbol_id: arbol.id,
        inspeccion_id: arbol.ultima_inspeccion_id ?? null,
        tipo_codigo: v.tipo_codigo,
        estado: v.estado,
        responsable: v.responsable,
        descripcion: v.descripcion,
        ...(v.estado === 'programada'
          ? { fecha_programada: v.fecha_programada, costo_estimado: v.costo_estimado }
          : {
              fecha_ejecucion: v.fecha_ejecucion,
              costo_real: v.costo_real,
              resultado: v.resultado,
              resultado_detalle: v.resultado_detalle,
            }),
      });
      // Se vuelve a la ficha que ya estaba abierta (sin duplicarla en el historial).
      avisar(arbol.id, 'intervencion');
      router.dismissTo(`/(app)/trees/${arbol.id}` as Href);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  return (
    <Page maxWidth={720}>
      <AppHeader
        eyebrow="Intervenciones y mantenimiento"
        title={`${arbol.codigo} · ${arbol.nombre_comun}`}
        subtitle="Programa una acción o registra una que ya se hizo, con su responsable, costo y resultado."
      />
      <Controller
        name="estado"
        control={control}
        render={({ field }) => (
          <Tabs
            value={field.value}
            options={[{ label: 'Programar', value: 'programada' }, { label: 'Ya se realizó', value: 'ejecutada' }]}
            onChange={field.onChange}
          />
        )}
      />
      <Section title="Acción">
        <Controller
          name="tipo_codigo"
          control={control}
          render={({ field, fieldState }) => (
            <SelectField
              label="Tipo de intervención"
              value={field.value || undefined}
              options={tipos.map((t) => ({ label: `${t.nombre} · ${formatPesos(t.costo_referencia)}`, value: t.codigo }))}
              onChange={(valor) => {
                field.onChange(valor);
                const elegido = tipos.find((t) => t.codigo === valor);
                if (elegido) setValue('costo_estimado', elegido.costo_referencia, { shouldValidate: true });
              }}
              error={fieldState.error?.message}
            />
          )}
        />
        {tipo?.descripcion ? <Text style={styles.helper}>{tipo.descripcion}</Text> : null}
        <Controller
          name="responsable"
          control={control}
          render={({ field, fieldState }) => (
            <Field label="Responsable" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
              placeholder="Persona, brigada o empresa" error={fieldState.error?.message} />
          )}
        />
        <Controller
          name="descripcion"
          control={control}
          render={({ field, fieldState }) => (
            <Field label="Descripción (opcional)" value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur}
              multiline error={fieldState.error?.message} />
          )}
        />
      </Section>

      {estado === 'programada' ? (
        <Section title="Programación">
          <Row>
            <Cell>
              <Controller
                name="fecha_programada"
                control={control}
                render={({ field, fieldState }) => (
                  <Field label="Fecha programada" value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur}
                    placeholder="AAAA-MM-DD" autoCapitalize="none" error={fieldState.error?.message} />
                )}
              />
            </Cell>
            <Cell>
              <Controller
                name="costo_estimado"
                control={control}
                render={({ field, fieldState }) => (
                  <NumberField label="Costo estimado (COP)" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                    help="Si lo dejas vacío se usa el costo de referencia." error={fieldState.error?.message} />
                )}
              />
            </Cell>
          </Row>
        </Section>
      ) : (
        <Section title="Ejecución">
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
                  <NumberField label="Costo real (COP)" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                    error={fieldState.error?.message} />
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
              <Field label="Detalle del resultado (opcional)" value={field.value ?? ''} onChangeText={field.onChange}
                onBlur={field.onBlur} multiline error={fieldState.error?.message} />
            )}
          />
        </Section>
      )}

      {errors.root?.message ? <InlineMessage>{errors.root.message}</InlineMessage> : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar intervención" loading={crear.isPending} onPress={() => void enviar()} />
    </Page>
  );
}

const styles = StyleSheet.create({
  helper: { color: palette.muted, fontSize: 13, lineHeight: 18 },
});
