import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useRegistrarActividad } from '@/features/servicio/api';
import { crearActividadFormSchema, MAX_HORAS_DIA, TIPOS_ACTIVIDAD, type TipoActividad } from '@/features/servicio/schemas';
import { useCaptureLocation } from '@/features/trees/hooks/useCaptureLocation';
import { usePhotoPicker } from '@/features/trees/hooks/usePhotoPicker';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Card } from '@/shared/components/UI';
import { hoyIso } from '@/shared/format';
import { parseDecimal, sanitizeDecimal } from '@/shared/utils/forms';
import { crearEstilos } from '@/theme';

type Errores = Partial<Record<'tipo' | 'fecha' | 'horas' | 'descripcion' | 'foto', string>>;

/** El estudiante registra una actividad de servicio social con su foto de evidencia. Queda
 *  pendiente hasta que un docente la apruebe. */
export function ActividadForm({ noPermitidas }: { noPermitidas: string }) {
  const styles = useStyles();
  const registrar = useRegistrarActividad();
  const fotos = usePhotoPicker();
  const gps = useCaptureLocation();
  const [tipo, setTipo] = useState<TipoActividad>();
  const [fecha, setFecha] = useState(hoyIso());
  const [horas, setHoras] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [mensaje, setMensaje] = useState<string>();
  const foto = fotos.photos.find((f) => f.tipo === 'completo');
  const ayuda = TIPOS_ACTIVIDAD.find((t) => t.valor === tipo)?.ayuda;

  async function enviar() {
    setMensaje(undefined);
    const validado = crearActividadFormSchema(hoyIso()).safeParse({ tipo, fecha: fecha.trim(), horas: parseDecimal(horas), descripcion });
    const nuevos: Errores = validado.success ? {} : Object.fromEntries(validado.error.issues.map((i) => [i.path[0], i.message]));
    if (!foto) nuevos.foto = 'Toma una foto de la actividad: es la evidencia para el docente.';
    setErrores(nuevos);
    if (!validado.success || !foto) return;
    try {
      const { fotoError } = await registrar.mutateAsync({
        datos: { ...validado.data, lat: gps.location?.lat ?? null, lng: gps.location?.lng ?? null },
        foto,
      });
      setTipo(undefined);
      setHoras('');
      setDescripcion('');
      if (foto) fotos.removePhoto(foto);
      setMensaje(
        fotoError
          ? `Actividad registrada, pero la foto no se pudo subir (${getApiErrorMessage(fotoError)}). Sin foto el docente no puede aprobarla.`
          : 'Actividad registrada: queda pendiente de que un docente la apruebe.',
      );
    } catch {
      // El error se muestra con registrar.error.
    }
  }

  return (
    <Card title="Registrar actividad" subtitle="Siembra, riego, jornadas… Tus inspecciones confirmadas ya cuentan solas." icon="add">
      <View style={styles.chips}>
        {TIPOS_ACTIVIDAD.map((t) => (
          <ChoiceChip key={t.valor} label={t.etiqueta} selected={tipo === t.valor} onPress={() => setTipo(t.valor)} />
        ))}
      </View>
      {ayuda ? <Text style={styles.ayuda}>{ayuda}</Text> : null}
      {errores.tipo ? <InlineMessage>{errores.tipo}</InlineMessage> : null}
      <View style={styles.fila}>
        <View style={styles.celda}>
          <Field label="Fecha" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha} />
        </View>
        <View style={styles.celda}>
          <Field
            label="Horas"
            value={horas}
            onChangeText={(v) => setHoras(sanitizeDecimal(v))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="Ej.: 2 o 1,5"
            hint={`En medias horas, máximo ${MAX_HORAS_DIA} por día.`}
            error={errores.horas}
          />
        </View>
      </View>
      <Field
        label="Qué hiciste"
        value={descripcion}
        onChangeText={setDescripcion}
        multiline
        maxLength={500}
        placeholder="Ej.: Regamos los 12 árboles de la zona deportiva con el curso."
        error={errores.descripcion}
      />
      <View style={styles.evidencia}>
        {foto ? <Image source={{ uri: foto.uri }} style={styles.foto} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
        <View style={styles.evidenciaBotones}>
          <PrimaryButton title={foto ? 'Cambiar foto' : 'Tomar foto de evidencia'} icon="camera" variant="secondary" compact onPress={() => void fotos.pickPhoto('completo')} />
          <PrimaryButton
            title={gps.location ? `Ubicación ±${Math.round(gps.location.accuracy ?? 0)} m` : 'Agregar ubicación (opcional)'}
            icon="myLocation"
            variant="ghost"
            compact
            loading={gps.loading}
            onPress={() => void gps.capture()}
          />
        </View>
      </View>
      {errores.foto || fotos.photoError ? <InlineMessage>{errores.foto ?? fotos.photoError}</InlineMessage> : null}
      {gps.error ? <InlineMessage tone="warning">{gps.error}</InlineMessage> : null}
      <Text style={styles.nota}>Por seguridad no se registran {noPermitidas}.</Text>
      {registrar.error ? <InlineMessage>{getApiErrorMessage(registrar.error)}</InlineMessage> : null}
      {mensaje ? <InlineMessage tone={mensaje.startsWith('Actividad registrada:') ? 'success' : 'warning'}>{mensaje}</InlineMessage> : null}
      <PrimaryButton title="Registrar actividad" icon="check" loading={registrar.isPending} onPress={() => void enviar()} />
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ayuda: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  celda: { flexGrow: 1, flexBasis: 160 },
  evidencia: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  evidenciaBotones: { flex: 1, gap: 6 },
  foto: { width: 72, height: 72, borderRadius: 12, backgroundColor: palette.line },
  nota: { color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: fonts.semiBold },
}));
