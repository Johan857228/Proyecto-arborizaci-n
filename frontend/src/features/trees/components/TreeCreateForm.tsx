import { Controller } from 'react-hook-form';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { useTreeCreateForm } from '@/features/trees/hooks/useTreeCreateForm';
import type { Catalogos } from '@/features/catalogs/types';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';
import {
  ChoiceChip,
  Field,
  Heading,
  InlineMessage,
  PrimaryButton,
  Screen,
  Section,
  SelectField,
  Surface,
} from '@/shared/components/FormControls';

interface Props {
  catalogs: Catalogos;
  submitting: boolean;
  submitError?: string;
  onCancel: () => void;
  onSubmit: (values: ArbolCrear, photos: FotoLocal[]) => Promise<void>;
}

const zonas = ['Patio central', 'Entrada principal', 'Zona deportiva', 'Bloques académicos', 'Otra'] as const;
const etapas = ['Plántula', 'Juvenil', 'Adulto', 'Senescente'] as const;
const interferencias = [
  'Ninguna',
  'Levantamiento de pisos',
  'Afectación de muros',
  'Cables eléctricos',
  'Otra infraestructura',
] as const;

export function TreeCreateForm({ catalogs, submitting, submitError, onCancel, onSubmit }: Props) {
  const form = useTreeCreateForm(catalogs, onSubmit);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PrimaryButton title="Volver al inventario" onPress={onCancel} variant="secondary" />
        <Heading
          subtitle="Registra el árbol con ubicación, medidas, observaciones y evidencia fotográfica."
        >
          Registro de árbol
        </Heading>
        <Text style={styles.helper}>
          El código institucional se asigna automáticamente al guardar. No lo escribas ni lo modifiques.
        </Text>

        <Section title="Identificación y ubicación">
          <Controller
            name="institucion_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <SelectField
                label="Institución"
                value={field.value}
                options={catalogs.instituciones.map((item) => ({
                  label: item.nombre,
                  value: item.id,
                }))}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="zona"
            control={form.control}
            render={({ field, fieldState }) => (
              <SelectField
                label="Zona"
                value={field.value}
                options={zonas.map((value) => ({ label: value, value }))}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          {form.zonaActual === 'Otra' ? (
            <Controller
              name="zona_otra"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  label="Especifica la zona"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
          ) : null}
          <PrimaryButton
            title={form.gps.loading ? 'Obteniendo ubicación…' : 'Capturar ubicación GPS'}
            onPress={() => void form.updateLocation()}
            loading={form.gps.loading}
            variant="secondary"
          />
          {form.gps.location ? (
            <Text style={styles.helper}>
              {form.gps.location.lat.toFixed(6)}, {form.gps.location.lng.toFixed(6)}
              {form.gps.location.accuracy == null
                ? ''
                : ` · precisión ${Math.round(form.gps.location.accuracy)} m`}
            </Text>
          ) : null}
          {form.gps.error ? <InlineMessage>{form.gps.error}</InlineMessage> : null}
          {form.errors.gps_confirmado?.message ? (
            <InlineMessage>{form.errors.gps_confirmado.message}</InlineMessage>
          ) : null}
        </Section>

        <Section title="Fotografías">
          <Text style={styles.helper}>
            La fotografía general es obligatoria. Puedes agregar una de detalle y hasta tres
            adicionales.
          </Text>
          <View style={styles.photoActions}>
            <PrimaryButton
              title={form.photos.some((photo) => photo.tipo === 'completo') ? 'Cambiar foto general' : 'Agregar foto general'}
              onPress={() => void form.pickPhoto('completo')}
              variant="secondary"
            />
            <PrimaryButton
              title={form.photos.some((photo) => photo.tipo === 'detalle') ? 'Cambiar foto de detalle' : 'Agregar foto de detalle'}
              onPress={() => void form.pickPhoto('detalle')}
              variant="secondary"
            />
            <PrimaryButton
              title={`Agregar foto adicional (${form.photos.filter((photo) => photo.tipo === 'adicional').length}/3)`}
              onPress={() => void form.pickPhoto('adicional')}
              disabled={form.photos.filter((photo) => photo.tipo === 'adicional').length >= 3}
              variant="secondary"
            />
          </View>
          {form.photos.map((photo) => (
            <Surface key={`${photo.tipo}-${photo.uri}`}>
              <View style={styles.photoRow}>
                <Image source={{ uri: photo.uri }} style={styles.thumbnail} contentFit="cover" />
                <View style={styles.photoDescription}>
                  <Text style={styles.photoTitle}>{photoLabel(photo.tipo)}</Text>
                  <Text style={styles.helper} numberOfLines={1}>{photo.name}</Text>
                  <Text style={styles.remove} onPress={() => form.removePhoto(photo)}>
                    Quitar foto
                  </Text>
                </View>
              </View>
            </Surface>
          ))}
        </Section>

        <Section title="Especie y medidas">
          <Controller
            name="especie_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <SelectField
                label="Especie"
                value={field.value}
                options={catalogs.especies.map((item) => ({
                  label: `${item.nombre_comun} (${item.nombre_cientifico})`,
                  value: item.id,
                }))}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <NumericField control={form.control} name="dap_cm" label="Diámetro del tronco (cm)" error={form.errors.dap_cm?.message} />
          <NumericField control={form.control} name="altura_m" label="Altura (m)" error={form.errors.altura_m?.message} />
          <NumericField control={form.control} name="copa_m" label="Diámetro de copa (m)" error={form.errors.copa_m?.message} />
          <Controller
            name="etapa"
            control={form.control}
            render={({ field, fieldState }) => (
              <SelectField
                label="Etapa de desarrollo"
                value={field.value}
                options={etapas.map((value) => ({ label: value, value }))}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        </Section>

        <Section title="Interferencias y observaciones">
          <Controller
            name="interferencia"
            control={form.control}
            render={({ field, fieldState }) => (
              <SelectField
                label="Interferencia"
                value={field.value}
                options={interferencias.map((value) => ({ label: value, value }))}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          {form.interferenciaActual === 'Otra infraestructura' ? (
            <Controller
              name="interferencia_otra"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  label="Describe la interferencia"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
          ) : null}
          <Text style={styles.label}>Observaciones fitosanitarias</Text>
          {form.errors.observaciones?.message ? (
            <InlineMessage>{form.errors.observaciones.message}</InlineMessage>
          ) : null}
          <View style={styles.chips}>
            {catalogs.observaciones.map((observation) => (
              <ChoiceChip
                key={observation.codigo}
                label={observation.etiqueta}
                selected={form.observacionesActuales.includes(observation.codigo)}
                onPress={() => form.toggleObservation(observation.codigo)}
              />
            ))}
          </View>
        </Section>

        {form.formError ? <InlineMessage>{form.formError}</InlineMessage> : null}
        {submitError ? <InlineMessage>{submitError}</InlineMessage> : null}
        <PrimaryButton
          title="Guardar árbol"
          loading={submitting}
          onPress={() => void form.submit()}
        />
      </ScrollView>
    </Screen>
  );
}

function NumericField({
  control,
  name,
  label,
  error,
}: {
  control: ReturnType<typeof useTreeCreateForm>['control'];
  name: 'dap_cm' | 'altura_m' | 'copa_m';
  label: string;
  error?: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Field
          label={label}
          value={field.value == null ? '' : String(field.value)}
          onChangeText={(text) => field.onChange(text.trim() === '' ? undefined : Number(text))}
          onBlur={field.onBlur}
          keyboardType="decimal-pad"
          error={error}
        />
      )}
    />
  );
}

function photoLabel(tipo: FotoLocal['tipo']) {
  if (tipo === 'completo') return 'Vista general';
  if (tipo === 'detalle') return 'Detalle';
  return 'Foto adicional';
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  helper: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  photoActions: { gap: 8 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbnail: { width: 76, height: 76, borderRadius: 8, backgroundColor: palette.line },
  photoDescription: { flex: 1, gap: 5 },
  photoTitle: { color: palette.ink, fontWeight: '800' },
  remove: { color: palette.red, fontSize: 13, fontWeight: '700', paddingTop: 3 },
  label: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
