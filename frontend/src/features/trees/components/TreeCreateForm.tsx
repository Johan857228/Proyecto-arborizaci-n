import { useState } from 'react';
import { Controller, useController } from 'react-hook-form';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts, layout, palette } from '@/config/constants';
import { useTreeCreateForm } from '@/features/trees/hooks/useTreeCreateForm';
import type { Catalogos } from '@/features/catalogs/types';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';
import { useIsWide } from '@/hooks/use-is-wide';
import { ObservationPicker } from '@/features/trees/components/ObservationPicker';
import {
  Field,
  Heading,
  InlineMessage,
  PrimaryButton,
  Screen,
  Section,
  SelectField,
} from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { parseDecimal, sanitizeDecimal } from '@/shared/utils/forms';

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

function PhotoSlot({
  title,
  caption,
  photo,
  disabled = false,
  onPick,
  onRemove,
}: {
  title: string;
  caption: string;
  photo?: FotoLocal;
  disabled?: boolean;
  onPick: () => void;
  onRemove?: () => void;
}) {
  if (photo) {
    return (
      <View style={styles.slotFilled}>
        <Image source={{ uri: photo.uri }} style={styles.slotImage} contentFit="cover" />
        <View style={styles.slotFooter}>
          <View style={styles.slotFooterText}>
            <Text style={styles.slotTitle}>{title}</Text>
            <Text style={styles.slotCaption} numberOfLines={1}>{photo.name}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar ${title}`} onPress={onPick} style={styles.slotAction}>
            <Icon name="refresh" size={16} color={palette.forest} />
          </Pressable>
          {onRemove ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${title}`} onPress={onRemove} style={styles.slotAction}>
              <Icon name="close" size={16} color={palette.red} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPick}
      style={({ pressed }) => [styles.slotEmpty, disabled && styles.slotDisabled, pressed && styles.pressed]}
    >
      <View style={styles.slotIcon}><Icon name="addPhoto" size={24} color={palette.forest} /></View>
      <Text style={styles.slotTitle}>{title}</Text>
      <Text style={styles.slotCaption}>{caption}</Text>
    </Pressable>
  );
}

export function TreeCreateForm({ catalogs, submitting, submitError, onCancel, onSubmit }: Props) {
  const isWide = useIsWide();
  const form = useTreeCreateForm(catalogs, onSubmit);
  const fotoGeneral = form.photos.find((photo) => photo.tipo === 'completo');
  const fotoDetalle = form.photos.find((photo) => photo.tipo === 'detalle');
  const adicionales = form.photos.filter((photo) => photo.tipo === 'adicional');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.backAction}>
          <PrimaryButton title="Inventario" icon="back" variant="ghost" compact onPress={onCancel} />
        </View>
        <Heading subtitle="Registra el árbol con ubicación, medidas, observaciones y evidencia fotográfica.">
          Registrar árbol
        </Heading>
        <InlineMessage tone="info">
          El código institucional se asigna automáticamente al guardar. No lo escribas ni lo modifiques.
        </InlineMessage>

        <Section step={1} icon="location" title="Identificación y ubicación" description="Institución, zona del campus y coordenadas GPS.">
          <View style={styles.row}>
            <View style={styles.cell}>
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
            </View>
            <View style={styles.cell}>
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
            </View>
          </View>
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
          {form.gps.location ? (
            <View style={styles.gpsCaptured}>
              <View style={styles.gpsIcon}><Icon name="myLocation" size={20} color={palette.forest} /></View>
              <View style={styles.gpsText}>
                <Text style={styles.gpsTitle}>Ubicación capturada</Text>
                <Text style={styles.gpsCoords}>
                  {form.gps.location.lat.toFixed(6)}, {form.gps.location.lng.toFixed(6)}
                  {form.gps.location.accuracy == null
                    ? ''
                    : ` · precisión ${Math.round(form.gps.location.accuracy)} m`}
                </Text>
              </View>
              <PrimaryButton
                title="Actualizar"
                icon="refresh"
                variant="ghost"
                compact
                loading={form.gps.loading}
                onPress={() => void form.updateLocation()}
              />
            </View>
          ) : (
            <PrimaryButton
              title={form.gps.loading ? 'Obteniendo ubicación…' : 'Capturar ubicación GPS'}
              icon="myLocation"
              onPress={() => void form.updateLocation()}
              loading={form.gps.loading}
              variant="secondary"
            />
          )}
          {form.gps.error ? <InlineMessage>{form.gps.error}</InlineMessage> : null}
          {form.errors.gps_confirmado?.message ? (
            <InlineMessage>{form.errors.gps_confirmado.message}</InlineMessage>
          ) : null}
        </Section>

        <Section
          step={2}
          icon="camera"
          title="Fotografías"
          description="La foto general es obligatoria. Puedes agregar una de detalle y hasta tres adicionales."
        >
          <View style={styles.photoGrid}>
            <View style={styles.cell}>
              <PhotoSlot
                title="Vista general"
                caption="Obligatoria"
                photo={fotoGeneral}
                onPick={() => void form.pickPhoto('completo')}
                onRemove={fotoGeneral ? () => form.removePhoto(fotoGeneral) : undefined}
              />
            </View>
            <View style={styles.cell}>
              <PhotoSlot
                title="Detalle"
                caption="Opcional"
                photo={fotoDetalle}
                onPick={() => void form.pickPhoto('detalle')}
                onRemove={fotoDetalle ? () => form.removePhoto(fotoDetalle) : undefined}
              />
            </View>
            <View style={styles.cell}>
              <PhotoSlot
                title={`Adicionales (${adicionales.length}/3)`}
                caption={adicionales.length >= 3 ? 'Límite alcanzado' : 'Opcional'}
                disabled={adicionales.length >= 3}
                onPick={() => void form.pickPhoto('adicional')}
              />
            </View>
          </View>
          {adicionales.length > 0 ? (
            <View style={styles.extraPhotos}>
              {adicionales.map((photo) => (
                <View key={photo.uri} style={styles.extraPhoto}>
                  <Image source={{ uri: photo.uri }} style={styles.extraImage} contentFit="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Quitar foto adicional"
                    onPress={() => form.removePhoto(photo)}
                    style={styles.extraRemove}
                  >
                    <Icon name="close" size={14} color={palette.paper} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </Section>

        <Section step={3} icon="ruler" title="Especie y medidas" description="Medidas tomadas en campo, en centímetros y metros. La altura máxima permitida es 25 m.">
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
          <View style={styles.row}>
            <View style={styles.cell}>
              <NumericField control={form.control} name="dap_cm" label="Diámetro del tronco (cm)" error={form.errors.dap_cm?.message} />
            </View>
            <View style={styles.cell}>
              <NumericField control={form.control} name="altura_m" label="Altura (m)" hint="Máximo 25 m" error={form.errors.altura_m?.message} />
            </View>
            <View style={styles.cell}>
              <NumericField control={form.control} name="copa_m" label="Diámetro de copa (m)" error={form.errors.copa_m?.message} />
            </View>
          </View>
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

        <Section step={4} icon="leaf" title="Interferencias y observaciones" description="Infraestructura afectada y estado fitosanitario del árbol.">
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
          <View style={styles.divider} />
          <ObservationPicker
            observaciones={catalogs.observaciones}
            selected={form.observacionesActuales}
            error={form.errors.observaciones?.message}
            onToggle={form.toggleObservation}
            onClear={form.clearObservations}
          />
        </Section>

        {form.formError ? <InlineMessage>{form.formError}</InlineMessage> : null}
        {submitError ? <InlineMessage>{submitError}</InlineMessage> : null}
        <View style={[styles.actions, isWide && styles.actionsWide]}>
          <View style={isWide ? styles.actionWide : undefined}>
            <PrimaryButton title="Cancelar" variant="secondary" onPress={onCancel} />
          </View>
          <View style={isWide ? styles.actionWide : undefined}>
            <PrimaryButton
              title="Guardar árbol"
              icon="check"
              loading={submitting}
              onPress={() => void form.submit()}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function NumericField({
  control,
  name,
  label,
  error,
  hint,
}: {
  control: ReturnType<typeof useTreeCreateForm>['control'];
  name: 'dap_cm' | 'altura_m' | 'copa_m';
  label: string;
  error?: string;
  hint?: string;
}) {
  const { field } = useController({ name, control });
  // El texto escrito vive solo en el campo; al formulario llega el número ya validado (o nada si está vacío).
  const [text, setText] = useState(field.value == null ? '' : String(field.value));
  return (
    <Field
      label={label}
      value={text}
      onChangeText={(input) => {
        const clean = sanitizeDecimal(input);
        setText(clean);
        field.onChange(parseDecimal(clean));
      }}
      onBlur={field.onBlur}
      keyboardType="decimal-pad"
      inputMode="decimal"
      placeholder="0"
      hint={hint}
      error={error}
    />
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.formWidth, alignSelf: 'center', padding: 20, paddingTop: 16, paddingBottom: 40, gap: 18 },
  backAction: { alignSelf: 'flex-start', marginLeft: -8 },
  // Campos relacionados lado a lado cuando hay espacio; en teléfonos se apilan.
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  cell: { flexGrow: 1, flexBasis: 180 },
  gpsCaptured: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: palette.forestSoft },
  gpsIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: palette.paper },
  gpsText: { flex: 1, minWidth: 0 },
  gpsTitle: { color: palette.forestDark, fontSize: 14, fontFamily: fonts.bold },
  gpsCoords: { marginTop: 2, color: palette.muted, fontSize: 13 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  slotEmpty: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9CDBF', backgroundColor: '#F8FBF8' },
  slotDisabled: { opacity: 0.5 },
  slotIcon: { width: 46, height: 46, marginBottom: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.forestSoft },
  slotFilled: { overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  slotImage: { width: '100%', height: 120, backgroundColor: palette.line },
  slotFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  slotFooterText: { flex: 1, minWidth: 0 },
  slotAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.canvas },
  slotTitle: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold, textAlign: 'center' },
  slotCaption: { color: palette.muted, fontSize: 12 },
  extraPhotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  extraPhoto: { width: 84, height: 84, overflow: 'hidden', borderRadius: 12 },
  extraImage: { width: '100%', height: '100%' },
  extraRemove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(15, 42, 33, 0.7)' },
  divider: { height: 1, backgroundColor: palette.line },
  pressed: { opacity: 0.8 },
  actions: { gap: 10 },
  actionsWide: { flexDirection: 'row', justifyContent: 'flex-end' },
  actionWide: { minWidth: 180 },
});
