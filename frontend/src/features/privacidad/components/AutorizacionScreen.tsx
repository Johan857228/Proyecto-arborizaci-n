import { zodResolver } from '@hookform/resolvers/zod';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esRevisor } from '@/features/perfil/schemas';
import { useFirmar, useSubirFormato, type FotoFormato } from '@/features/privacidad/api';
import { POLITICA_VERSION } from '@/features/privacidad/components/PoliticaDatos';
import { ETIQUETA_PARENTESCO, PARENTESCOS, firmaSchema, type FirmaInput, type FirmaValores } from '@/features/privacidad/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Casilla, ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Card, Page, Tabs, volver } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

type Metodo = 'firma_app' | 'documento';
const TIPOS: Record<string, FotoFormato['mimeType']> = { 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/png': 'image/png', 'image/webp': 'image/webp' };

/** Autorización del acudiente. Sin parámetros, para la propia cuenta del estudiante; con
 *  ?usuario=…&nombre=…, la registra un docente para un estudiante de su institución. */
export function AutorizacionScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ usuario?: string; nombre?: string }>();
  const perfil = useMiPerfil();
  const paraOtro = Boolean(params.usuario);
  const puedeSubir = paraOtro && esRevisor(perfil.data);
  const firmar = useFirmar();
  const subir = useSubirFormato();
  const [metodo, setMetodo] = useState<Metodo>('firma_app');
  const [foto, setFoto] = useState<FotoFormato>();
  const [fotoError, setFotoError] = useState<string>();
  const [listo, setListo] = useState(false);
  const { control, handleSubmit, getValues, trigger } = useForm<FirmaInput, unknown, FirmaValores>({
    resolver: zodResolver(firmaSchema),
    defaultValues: {
      acudiente_nombre: '', acudiente_documento: '', parentesco: undefined, acudiente_contacto: '',
      estudiante_escuchado: false, autoriza_tratamiento: false, firma: '',
    },
  });
  const estudiante = paraOtro ? (params.nombre ?? 'el estudiante') : (perfil.data?.nombre ?? 'el estudiante');

  async function elegirFoto() {
    setFotoError(undefined);
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (resultado.canceled || !resultado.assets[0]) return;
    const asset = resultado.assets[0];
    const mimeType = TIPOS[(asset.mimeType ?? 'image/jpeg').toLowerCase()];
    if (!mimeType) {
      setFotoError('Usa una foto JPG, PNG o WebP del formato firmado.');
      return;
    }
    setFoto({ uri: asset.uri, name: asset.fileName ?? `formato.${mimeType.split('/')[1]}`, mimeType });
  }

  function enviarFirma(valores: FirmaValores) {
    firmar.mutate({ valores, usuarioId: params.usuario }, { onSuccess: () => setListo(true) });
  }

  async function enviarFormato() {
    const campos = ['acudiente_nombre', 'acudiente_documento', 'parentesco', 'acudiente_contacto', 'estudiante_escuchado'] as const;
    if (!(await trigger(campos))) return;
    if (!foto) {
      setFotoError('Toma o elige la foto del formato firmado por el acudiente.');
      return;
    }
    const v = getValues();
    subir.mutate({
      datos: {
        usuarioId: params.usuario as string,
        acudiente_nombre: v.acudiente_nombre.trim().replace(/\s+/g, ' '),
        acudiente_documento: v.acudiente_documento.trim(),
        parentesco: v.parentesco as FirmaValores['parentesco'],
        acudiente_contacto: (v.acudiente_contacto ?? '').trim(),
        estudiante_escuchado: Boolean(v.estudiante_escuchado),
      },
      foto,
    }, { onSuccess: () => setListo(true) });
  }

  if (listo) {
    return (
      <Page maxWidth={640}>
        <AppHeader eyebrow="Privacidad" title="Autorización registrada" />
        <Card>
          <InlineMessage tone="success">
            Quedó registrada la autorización para {estudiante}, con la política versión {POLITICA_VERSION}.
          </InlineMessage>
          <PrimaryButton title="Volver" onPress={() => volver((paraOtro ? '/(app)/privacy/gestion' : '/(app)/privacy') as Href)} />
        </Card>
      </Page>
    );
  }

  const error = firmar.error ?? subir.error;
  return (
    <Page maxWidth={640}>
      <AppHeader
        eyebrow="Privacidad"
        title="Autorización del acudiente"
        subtitle={`Para tratar los datos de ${estudiante} en Arbolado Escolar. El acudiente debe estar presente o haber firmado el formato.`}
        backTo={(paraOtro ? '/(app)/privacy/gestion' : '/(app)/privacy') as Href}
      />
      {puedeSubir ? (
        <Tabs<Metodo>
          value={metodo}
          onChange={setMetodo}
          options={[{ label: 'Firma en la app', value: 'firma_app' }, { label: 'Subir formato firmado', value: 'documento' }]}
        />
      ) : null}

      <Card title="Datos del acudiente" icon="person">
        <Controller name="acudiente_nombre" control={control} render={({ field, fieldState }) => (
          <Field label="Nombre completo del acudiente" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoCapitalize="words" maxLength={120} error={fieldState.error?.message} />
        )} />
        <Controller name="acudiente_documento" control={control} render={({ field, fieldState }) => (
          <Field label="Número de documento" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoCapitalize="none" maxLength={20} error={fieldState.error?.message} hint="Solo se muestran los últimos 4 dígitos." />
        )} />
        <Controller name="parentesco" control={control} render={({ field, fieldState }) => (
          <View style={styles.grupo}>
            <Text style={styles.etiqueta}>Parentesco</Text>
            <View style={styles.chips}>
              {PARENTESCOS.map((p) => (
                <ChoiceChip key={p} label={ETIQUETA_PARENTESCO[p]} selected={field.value === p} onPress={() => field.onChange(p)} />
              ))}
            </View>
            {fieldState.error ? <InlineMessage>{fieldState.error.message}</InlineMessage> : null}
          </View>
        )} />
        <Controller name="acudiente_contacto" control={control} render={({ field, fieldState }) => (
          <Field label="Teléfono o correo (opcional)" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoCapitalize="none" maxLength={120} error={fieldState.error?.message} />
        )} />
        <Controller name="estudiante_escuchado" control={control} render={({ field, fieldState }) => (
          <Casilla checked={Boolean(field.value)} onChange={field.onChange} error={fieldState.error?.message}>
            Hablé con {estudiante} sobre el uso de sus datos y tuve en cuenta su opinión.
          </Casilla>
        )} />
      </Card>

      {metodo === 'firma_app' ? (
        <Card title="Firma" icon="edit">
          <Controller name="autoriza_tratamiento" control={control} render={({ field, fieldState }) => (
            <Casilla checked={Boolean(field.value)} onChange={field.onChange} error={fieldState.error?.message}>
              Autorizo el tratamiento de los datos de {estudiante} según la política de tratamiento de datos (versión {POLITICA_VERSION}), que leí.
            </Casilla>
          )} />
          <Pressable accessibilityRole="link" onPress={() => router.push('/politica' as Href)} style={styles.enlace}>
            <Text style={styles.enlaceTexto}>Leer la política</Text>
          </Pressable>
          <Controller name="firma" control={control} render={({ field, fieldState }) => (
            <Field
              label="Firma: escribe tu nombre completo"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="words"
              maxLength={120}
              error={fieldState.error?.message}
              hint="Debe ser igual al nombre del acudiente. Queda registrada con la fecha y la versión de la política."
            />
          )} />
          {error ? <InlineMessage>{getApiErrorMessage(error)}</InlineMessage> : null}
          <PrimaryButton title="Firmar autorización" icon="check" loading={firmar.isPending} onPress={handleSubmit(enviarFirma)} />
        </Card>
      ) : (
        <Card title="Formato firmado" icon="camera">
          <Text style={styles.texto}>Toma una foto clara del formato de autorización firmado por el acudiente. Solo lo podrán ver los docentes de la institución y los administradores.</Text>
          {foto ? <Image source={{ uri: foto.uri }} style={styles.vista} contentFit="contain" /> : null}
          <PrimaryButton title={foto ? 'Cambiar foto' : 'Elegir foto del formato'} icon="gallery" variant="secondary" onPress={() => void elegirFoto()} />
          {fotoError ? <InlineMessage>{fotoError}</InlineMessage> : null}
          {error ? <InlineMessage>{getApiErrorMessage(error)}</InlineMessage> : null}
          <PrimaryButton title="Guardar autorización" icon="check" loading={subir.isPending} onPress={() => void enviarFormato()} />
        </Card>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  grupo: { gap: 8, marginBottom: 14 },
  etiqueta: { color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  enlace: { alignSelf: 'flex-start' },
  enlaceTexto: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  vista: { width: '100%', height: 220, borderRadius: 12, backgroundColor: palette.tile },
}));
