import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';
import type { z } from 'zod';

import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import type { Catalogos } from '@/features/catalogs/types';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import {
  metodoCamposSchema,
  useGuardarConfiguracion,
  useMetodos,
  type Metodo,
  type MetodoCampos,
} from '@/features/settings/api';
import { SimulacionResultado } from '@/features/settings/components/SimulacionResultado';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton, Section } from '@/shared/components/FormControls';
import { AppHeader, Cell, ErrorState, LoadingState, Notice, NumberField, Page, Row } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const PESOS = [
  ['peso_follaje', 'Follaje'],
  ['peso_tronco', 'Tronco y ramas'],
  ['peso_raiz', 'Raíz'],
  ['peso_plagas', 'Plagas'],
  ['peso_interferencia', 'Interferencia con infraestructura'],
] as const;

export function MethodNewScreen() {
  const perfil = useMiPerfil();
  const metodos = useMetodos();
  const catalogos = useCatalogs();
  if (perfil.isLoading || metodos.isLoading || catalogos.isLoading) return <Page><LoadingState /></Page>;
  if (!esAdmin(perfil.data)) {
    return <Page><AppHeader title="Nueva versión del método" /><Notice tono="riesgo">Solo el administrador crea versiones del método.</Notice></Page>;
  }
  if (metodos.error) return <Page><ErrorState error={metodos.error} onRetry={() => void metodos.refetch()} /></Page>;
  if (catalogos.error || !catalogos.data) return <Page><ErrorState error={catalogos.error} onRetry={() => void catalogos.refetch()} /></Page>;
  return <Formulario base={metodos.data?.[0]} catalogos={catalogos.data} />;
}

function Formulario({ base, catalogos }: { base?: Metodo; catalogos: Catalogos }) {
  const styles = useStyles();
  const { crearMetodo, simular } = useGuardarConfiguracion();
  const [error, setError] = useState<string>();
  const { control, handleSubmit, setValue } = useForm<MetodoCampos, unknown, z.output<typeof metodoCamposSchema>>({
    resolver: zodResolver(metodoCamposSchema),
    mode: 'onChange',
    defaultValues: {
      nombre: '',
      descripcion: '',
      peso_follaje: base?.peso_follaje ?? 1,
      peso_tronco: base?.peso_tronco ?? 1,
      peso_raiz: base?.peso_raiz ?? 1,
      peso_plagas: base?.peso_plagas ?? 1,
      peso_interferencia: base?.peso_interferencia ?? 0,
      pesos_observacion: base?.pesos_observacion ?? {},
      umbral_riesgo: base?.umbral_riesgo ?? 1,
      umbral_critico: base?.umbral_critico ?? 4,
      densidad_madera_defecto: base?.densidad_madera_defecto ?? 0.6,
      factor_raiz: base?.factor_raiz ?? 0.24,
      fraccion_carbono: base?.fraccion_carbono ?? 0.47,
    },
  });
  const propios = useWatch({ control, name: 'pesos_observacion' }) ?? {};

  function pesoPropio(codigo: string, valor: number | undefined) {
    const siguiente = { ...propios };
    if (valor === undefined) delete siguiente[codigo];
    else siguiente[codigo] = valor;
    setValue('pesos_observacion', siguiente, { shouldValidate: true });
  }

  const guardar = handleSubmit(async (v) => {
    setError(undefined);
    try {
      await crearMetodo.mutateAsync(v);
      router.replace('/(app)/settings' as Href);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  const previsualizar = handleSubmit((v) => simular.mutate({ metodo: v }));

  return (
    <Page maxWidth={760}>
      <AppHeader
        eyebrow="Configuración"
        title="Nueva versión del método"
        subtitle={`Parte de la versión ${base ? `v${base.version}` : 'por defecto'}. Las versiones no se editan: cada cambio crea una nueva, y las inspecciones anteriores conservan la suya.`}
      />
      <Section title="Identificación">
        <Controller name="nombre" control={control} render={({ field, fieldState }) => (
          <Field label="Nombre" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
            placeholder="Ej.: Plagas y raíz pesan más" error={fieldState.error?.message} />
        )} />
        <Controller name="descripcion" control={control} render={({ field, fieldState }) => (
          <Field label="Descripción (opcional)" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
            multiline error={fieldState.error?.message} />
        )} />
      </Section>

      <Section title="Pesos del puntaje de riesgo">
        <Text style={styles.texto}>Cada hallazgo marcado suma el peso de su grupo (0 a 100). La interferencia suma una vez si existe.</Text>
        <Row>
          {PESOS.map(([name, label]) => (
            <Cell key={name} basis={150}>
              <Controller name={name} control={control} render={({ field, fieldState }) => (
                <NumberField label={label} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
              )} />
            </Cell>
          ))}
        </Row>
        <Text style={styles.subtitulo}>Pesos propios por hallazgo (opcional)</Text>
        <Text style={styles.texto}>Déjalo vacío para usar el peso de su grupo.</Text>
        <Row>
          {catalogos.observaciones.map((o) => {
            const valor = propios[o.codigo];
            const invalido = valor !== undefined && (Number.isNaN(valor) || valor < 0 || valor > 100);
            return (
              <Cell key={o.codigo} basis={170}>
                <NumberField label={o.etiqueta} value={valor} onChange={(v) => pesoPropio(o.codigo, v)}
                  error={invalido ? 'Entre 0 y 100.' : undefined} />
              </Cell>
            );
          })}
        </Row>
      </Section>

      <Section title="Umbrales del semáforo">
        <Row>
          <Cell basis={150}>
            <Controller name="umbral_riesgo" control={control} render={({ field, fieldState }) => (
              <NumberField label="Desde este puntaje: en riesgo" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
            )} />
          </Cell>
          <Cell basis={150}>
            <Controller name="umbral_critico" control={control} render={({ field, fieldState }) => (
              <NumberField label="Desde este puntaje: crítico" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
            )} />
          </Cell>
        </Row>
      </Section>

      <Section title="Constantes ambientales">
        <Row>
          {([
            ['densidad_madera_defecto', 'Densidad por defecto (g/cm³)'],
            ['factor_raiz', 'Factor raíz/aérea'],
            ['fraccion_carbono', 'Fracción de carbono'],
          ] as const).map(([name, label]) => (
            <Cell key={name} basis={170}>
              <Controller name={name} control={control} render={({ field, fieldState }) => (
                <NumberField label={label} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
              )} />
            </Cell>
          ))}
        </Row>
      </Section>

      <PrimaryButton title="Vista previa con los árboles actuales" variant="secondary" loading={simular.isPending} onPress={() => void previsualizar()} />
      {simular.data ? <View style={styles.preview}><SimulacionResultado simulacion={simular.data} /></View> : null}
      {simular.error ? <InlineMessage>{getApiErrorMessage(simular.error)}</InlineMessage> : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar versión" loading={crearMetodo.isPending} onPress={() => void guardar()} />
      <Text style={styles.texto}>Para usarla, asígnala a una institución en la pestaña Parámetros.</Text>
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  subtitulo: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  preview: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
}));
