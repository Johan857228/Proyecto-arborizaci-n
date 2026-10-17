import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';

import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import type { Catalogos } from '@/features/catalogs/types';
import { payloadBiotico, valoresBioticosIniciales } from '@/features/inspections/bioticos';
import { BioticAgentsFields } from '@/features/inspections/components/BioticAgentsFields';
import { useRegistrarInspeccion } from '@/features/inspections/hooks/useInspecciones';
import {
  crearInspeccionFormSchema,
  etapas,
  interferencias,
  type InspeccionFormInput,
  type InspeccionPayload,
} from '@/features/inspections/schemas';
import { PhotoSection } from '@/features/trees/components/PhotoSection';
import { useArbol } from '@/features/trees/hooks/useArbol';
import { useCaptureLocation } from '@/features/trees/hooks/useCaptureLocation';
import { usePhotoPicker } from '@/features/trees/hooks/usePhotoPicker';
import type { ArbolDetalle } from '@/features/trees/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { useAvisos } from '@/shared/avisos';
import { ChoiceChip, Field, InlineMessage, PrimaryButton, Section, SelectField } from '@/shared/components/FormControls';
import { AppHeader, Cell, ErrorState, LoadingState, NumberField, Page, Row } from '@/shared/components/UI';
import { DISTANCIA_INSTITUCION_MAX_KM, PRECISION_GPS_MAX_M, distanceKm } from '@/shared/utils/geo';
import { crearEstilos } from '@/theme';

const GRUPOS: Record<string, string> = { follaje: 'Follaje', tronco: 'Tronco y ramas', raiz: 'Raíz', plagas: 'Plagas' };

export function InspectionFormScreen({ arbolId }: { arbolId: string }) {
  const arbol = useArbol(arbolId);
  const catalogos = useCatalogs();
  if (arbol.isLoading || catalogos.isLoading) return <Page><LoadingState /></Page>;
  if (arbol.error || !arbol.data) return <Page><ErrorState error={arbol.error} onRetry={() => void arbol.refetch()} /></Page>;
  if (catalogos.error || !catalogos.data) {
    return <Page><ErrorState error={catalogos.error} onRetry={() => void catalogos.refetch()} /></Page>;
  }
  return <Formulario arbol={arbol.data} catalogos={catalogos.data} />;
}

function Formulario({ arbol, catalogos }: { arbol: ArbolDetalle; catalogos: Catalogos }) {
  const styles = useStyles();
  const schema = useMemo(() => crearInspeccionFormSchema(catalogos), [catalogos]);
  const gps = useCaptureLocation();
  const fotos = usePhotoPicker();
  const registrar = useRegistrarInspeccion(arbol.id);
  const avisar = useAvisos((state) => state.avisar);
  const [error, setError] = useState<string>();
  const { control, handleSubmit, setValue, formState: { errors } } = useForm<InspeccionFormInput>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      gps_confirmado: false,
      lat: null,
      lng: null,
      precision_gps_m: null,
      // Se parte de las medidas vigentes para que solo se corrija lo que cambió.
      dap_cm: arbol.dap_cm,
      altura_m: arbol.altura_m,
      copa_m: arbol.copa_m,
      etapa: etapas.find((e) => e === arbol.etapa) ?? 'Adulto',
      interferencia: interferencias.find((i) => i === arbol.interferencia) ?? 'Ninguna',
      interferencia_otra: arbol.interferencia_otra ?? '',
      observaciones: [],
      notas: '',
      // Los agentes bióticos se registran según lo que se ve en esta visita.
      ...valoresBioticosIniciales,
    },
  });
  const interferencia = useWatch({ control, name: 'interferencia' });
  const observaciones = useWatch({ control, name: 'observaciones' }) ?? [];
  // Avisos que no bloquean: precisión baja o punto lejos de la institución del árbol.
  const institucion = catalogos.instituciones.find((item) => item.id === arbol.institucion_id);
  const ubicacion = gps.location;
  const precisionBaja = ubicacion?.accuracy != null && ubicacion.accuracy > PRECISION_GPS_MAX_M;
  const distancia = ubicacion && institucion ? distanceKm(ubicacion, institucion) : null;

  async function capturar() {
    const valor = await gps.capture();
    if (!valor) return;
    setValue('lat', valor.lat, { shouldValidate: true });
    setValue('lng', valor.lng, { shouldValidate: true });
    setValue('precision_gps_m', valor.accuracy == null ? null : Math.round(valor.accuracy * 10) / 10);
    setValue('gps_confirmado', true, { shouldValidate: true });
  }

  function alternar(codigo: string) {
    setValue(
      'observaciones',
      observaciones.includes(codigo) ? observaciones.filter((c) => c !== codigo) : [...observaciones, codigo],
      { shouldValidate: true },
    );
  }

  const enviar = handleSubmit(async (valores) => {
    setError(undefined);
    if (!fotos.photos.some((foto) => foto.tipo === 'completo')) {
      setError('Agrega una fotografía general del árbol como evidencia de la visita.');
      return;
    }
    const payload: InspeccionPayload = {
      lat: valores.lat ?? null,
      lng: valores.lng ?? null,
      precision_gps_m: valores.precision_gps_m ?? null,
      dap_cm: valores.dap_cm,
      altura_m: valores.altura_m,
      copa_m: valores.copa_m,
      etapa: valores.etapa,
      interferencia: valores.interferencia,
      interferencia_otra: valores.interferencia === 'Otra infraestructura' ? valores.interferencia_otra?.trim() || null : null,
      observaciones: valores.observaciones,
      notas: valores.notas?.trim() ? valores.notas.trim() : null,
      ...payloadBiotico(valores),
    };
    try {
      const resultado = await registrar.mutateAsync({ payload, fotos: fotos.photos });
      if (resultado.fotosFallidas > 0) {
        router.replace(`/(app)/inspections/${resultado.inspeccionId}?aviso=fotos` as Href);
      } else {
        // Se vuelve a la ficha que ya estaba abierta (sin duplicarla en el historial).
        avisar(arbol.id, 'inspeccion');
        router.dismissTo(`/(app)/trees/${arbol.id}` as Href);
      }
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  const porGrupo = Object.entries(GRUPOS).map(([grupo, titulo]) => ({
    titulo,
    items: catalogos.observaciones.filter((o) => o.grupo === grupo),
  }));

  return (
    <Page maxWidth={720}>
      <AppHeader
        eyebrow="Inspección de seguimiento"
        title={`${arbol.codigo} · ${arbol.nombre_comun}`}
        subtitle="Registra lo que observas hoy. Las medidas vienen de la última inspección: corrige solo lo que cambió. Un docente revisará la inspección."
      />

      <Section title="Ubicación (opcional)">
        <Text style={styles.helper}>Captura el GPS si estás junto al árbol: ayuda a verificar la visita.</Text>
        <PrimaryButton
          title={gps.loading ? 'Obteniendo ubicación…' : 'Capturar ubicación GPS'}
          onPress={() => void capturar()}
          loading={gps.loading}
          variant="secondary"
        />
        {gps.location ? (
          <Text style={styles.helper}>
            {gps.location.lat.toFixed(6)}, {gps.location.lng.toFixed(6)}
            {gps.location.accuracy == null ? '' : ` · precisión ${Math.round(gps.location.accuracy)} m`}
          </Text>
        ) : null}
        {precisionBaja && ubicacion?.accuracy != null ? (
          <InlineMessage tone="warning">
            Precisión baja del GPS (±{Math.round(ubicacion.accuracy)} m). Si puedes, acércate a un lugar despejado y vuelve a capturar.
          </InlineMessage>
        ) : null}
        {distancia != null && distancia > DISTANCIA_INSTITUCION_MAX_KM && institucion ? (
          <InlineMessage tone="warning">
            La ubicación está a {distancia.toFixed(1)} km de {institucion.nombre_corto}. Verifica que estés junto al árbol.
          </InlineMessage>
        ) : null}
        {gps.error ? <InlineMessage>{gps.error}</InlineMessage> : null}
        {errors.gps_confirmado?.message ? <InlineMessage>{errors.gps_confirmado.message}</InlineMessage> : null}
      </Section>

      <Section title="Medidas">
        <Row>
          {([
            ['dap_cm', 'Diámetro del tronco (cm)', 'Máximo 500 cm (5 m)'],
            ['altura_m', 'Altura (m)', 'Máximo 25 m'],
            ['copa_m', 'Diámetro de copa (m)', 'Máximo 40 m'],
          ] as const).map(([name, label, help]) => (
            <Cell key={name}>
              <Controller
                name={name}
                control={control}
                render={({ field, fieldState }) => (
                  <NumberField label={label} help={help} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
                )}
              />
            </Cell>
          ))}
        </Row>
        <Row>
          <Cell>
            <Controller
              name="etapa"
              control={control}
              render={({ field, fieldState }) => (
                <SelectField label="Etapa de desarrollo" value={field.value} options={etapas.map((v) => ({ label: v, value: v }))}
                  onChange={field.onChange} error={fieldState.error?.message} />
              )}
            />
          </Cell>
          <Cell>
            <Controller
              name="interferencia"
              control={control}
              render={({ field, fieldState }) => (
                <SelectField label="Interferencia" value={field.value} options={interferencias.map((v) => ({ label: v, value: v }))}
                  onChange={field.onChange} error={fieldState.error?.message} />
              )}
            />
          </Cell>
        </Row>
        {interferencia === 'Otra infraestructura' ? (
          <Controller
            name="interferencia_otra"
            control={control}
            render={({ field, fieldState }) => (
              <Field label="Describe la interferencia" maxLength={120} value={field.value ?? ''} onChangeText={field.onChange}
                onBlur={field.onBlur} error={fieldState.error?.message} />
            )}
          />
        ) : null}
      </Section>

      <Section title="Hallazgos fitosanitarios">
        <Text style={styles.helper}>Marca solo lo que veas hoy. Si no marcas nada, el árbol se registra sin hallazgos.</Text>
        {errors.observaciones?.message ? <InlineMessage>{errors.observaciones.message}</InlineMessage> : null}
        {porGrupo.map((grupo) => grupo.items.length ? (
          <View key={grupo.titulo} style={styles.grupo}>
            <Text style={styles.grupoTitulo}>{grupo.titulo}</Text>
            <View style={styles.chips}>
              {grupo.items.map((o) => (
                <ChoiceChip key={o.codigo} label={o.etiqueta} selected={observaciones.includes(o.codigo)} onPress={() => alternar(o.codigo)} />
              ))}
            </View>
          </View>
        ) : null)}
        <BioticAgentsFields control={control} codigoArbol={arbol.codigo} />
        <Controller
          name="notas"
          control={control}
          render={({ field, fieldState }) => (
            <Field label="Notas (opcional)" value={field.value ?? ''} onChangeText={field.onChange} onBlur={field.onBlur}
              multiline placeholder="Cambios desde la última visita, contexto, etc." error={fieldState.error?.message} />
          )}
        />
      </Section>

      <PhotoSection
        photos={fotos.photos}
        error={fotos.photoError}
        onPick={(tipo) => void fotos.pickPhoto(tipo)}
        onRemove={fotos.removePhoto}
        help={observaciones.length
          ? 'Agrega la foto general (obligatoria) y una de detalle del hallazgo.'
          : 'Agrega la foto general (obligatoria). Puedes sumar una de detalle y hasta tres adicionales.'}
      />

      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar inspección" loading={registrar.isPending} onPress={() => void enviar()} />
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  helper: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  grupo: { gap: 6 },
  grupoTitulo: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
