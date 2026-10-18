import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useBorrarEvidencia, useCrearEvidencia } from '@/features/prae/api';
import { crearEvidenciaFormSchema, nulo, TIPOS_EVIDENCIA, type Evidencia, type Prae, type TipoEvidencia } from '@/features/prae/schemas';
import { usePhotoPicker } from '@/features/trees/hooks/usePhotoPicker';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { Badge, Card, ConfirmButton, EmptyState } from '@/shared/components/UI';
import { formatFecha, hoyIso } from '@/shared/format';
import { crearEstilos } from '@/theme';

function FilaEvidencia({ evidencia, accion, editable }: { evidencia: Evidencia; accion?: string; editable: boolean }) {
  const styles = useStyles();
  const borrar = useBorrarEvidencia();
  return (
    <View style={styles.fila}>
      {evidencia.foto_url ? <Image source={{ uri: evidencia.foto_url }} style={styles.foto} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
      <View style={styles.filaTexto}>
        <Text style={styles.titulo}>{evidencia.titulo}</Text>
        <Text style={styles.meta}>{formatFecha(evidencia.fecha)}{accion ? ` · ${accion}` : ''}</Text>
        {evidencia.descripcion ? <Text style={styles.texto}>{evidencia.descripcion}</Text> : null}
        {evidencia.url ? (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(evidencia.url as string)}>
            <Text style={styles.enlace} numberOfLines={1}>{evidencia.url}</Text>
          </Pressable>
        ) : null}
        <View style={styles.insignias}>
          <Badge label={TIPOS_EVIDENCIA[evidencia.tipo]} tono="info" />
          {evidencia.tipo === 'foto' && !evidencia.foto_url ? <Badge label="Falta la foto" tono="riesgo" /> : null}
        </View>
        {borrar.error ? <InlineMessage>{getApiErrorMessage(borrar.error)}</InlineMessage> : null}
        {editable ? <ConfirmButton title="Quitar" confirmTitle="¿Quitar esta evidencia?" loading={borrar.isPending} onConfirm={() => borrar.mutate(evidencia.id)} /> : null}
      </View>
    </View>
  );
}

function NuevaEvidencia({ prae }: { prae: Prae }) {
  const styles = useStyles();
  const crear = useCrearEvidencia();
  const fotos = usePhotoPicker();
  const [tipo, setTipo] = useState<TipoEvidencia>('foto');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [url, setUrl] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [accionId, setAccionId] = useState<string>();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string>();
  const foto = fotos.photos.find((f) => f.tipo === 'completo');

  async function agregar() {
    setMensaje(undefined);
    const validado = crearEvidenciaFormSchema(hoyIso()).safeParse({ tipo, titulo, descripcion, url, fecha: fecha.trim() });
    const nuevos: Record<string, string> = validado.success ? {} : Object.fromEntries(validado.error.issues.map((i) => [String(i.path[0]), i.message]));
    if (tipo === 'foto' && !foto) nuevos.foto = 'Toma o elige la foto.';
    setErrores(nuevos);
    if (!validado.success || (tipo === 'foto' && !foto)) return;
    try {
      const { fotoError } = await crear.mutateAsync({
        praeId: prae.id,
        datos: { tipo, titulo: validado.data.titulo, descripcion: nulo(validado.data.descripcion), url: tipo === 'enlace' ? validado.data.url : null, fecha: validado.data.fecha, accion_id: accionId ?? null },
        foto: tipo === 'foto' ? foto : undefined,
      });
      setTitulo('');
      setDescripcion('');
      setUrl('');
      if (foto) fotos.removePhoto(foto);
      setMensaje(fotoError ? `Evidencia guardada, pero la foto no se pudo subir: ${getApiErrorMessage(fotoError)}` : 'Evidencia agregada.');
    } catch {
      // El error se muestra con crear.error.
    }
  }

  return (
    <Card title="Agregar evidencia" subtitle="Fotos de las jornadas, enlaces a actas o videos, o notas con datos." icon="add">
      <View style={styles.insignias}>
        {(Object.keys(TIPOS_EVIDENCIA) as TipoEvidencia[]).map((t) => <ChoiceChip key={t} label={TIPOS_EVIDENCIA[t]} selected={tipo === t} onPress={() => setTipo(t)} />)}
      </View>
      <Field label="Título" value={titulo} onChangeText={setTitulo} maxLength={150} placeholder="Ej.: Jornada de limpieza del caño" error={errores.titulo} />
      <Field label="Fecha" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha} />
      {tipo === 'enlace' ? <Field label="Enlace" value={url} onChangeText={setUrl} placeholder="https://" autoCapitalize="none" keyboardType="url" error={errores.url} /> : null}
      <Field label={tipo === 'nota' ? 'Nota' : 'Descripción (opcional)'} value={descripcion} onChangeText={setDescripcion} multiline maxLength={1000} />
      {prae.acciones.length ? (
        <SelectField label="Acción del plan (opcional)" value={accionId} placeholder="Ninguna"
          options={prae.acciones.map((a) => ({ label: a.titulo, value: a.id }))} onChange={setAccionId} />
      ) : null}
      {tipo === 'foto' ? (
        <View style={styles.evidencia}>
          {foto ? <Image source={{ uri: foto.uri }} style={styles.foto} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
          <PrimaryButton title={foto ? 'Cambiar foto' : 'Tomar o elegir foto'} icon="camera" variant="secondary" compact onPress={() => void fotos.pickPhoto('completo')} />
        </View>
      ) : null}
      {errores.foto || fotos.photoError ? <InlineMessage>{errores.foto ?? fotos.photoError}</InlineMessage> : null}
      {crear.error ? <InlineMessage>{getApiErrorMessage(crear.error)}</InlineMessage> : null}
      {mensaje ? <InlineMessage tone={mensaje === 'Evidencia agregada.' ? 'success' : 'warning'}>{mensaje}</InlineMessage> : null}
      <PrimaryButton title="Agregar evidencia" icon="check" loading={crear.isPending} onPress={() => void agregar()} />
    </Card>
  );
}

/** Evidencias del PRAE (fotos, enlaces y notas), con la acción del plan a la que corresponden. */
export function EvidenciasTab({ prae }: { prae: Prae }) {
  const styles = useStyles();
  const acciones = Object.fromEntries(prae.acciones.map((a) => [a.id, a.titulo]));
  const ordenadas = [...prae.evidencias].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <>
      <Card title="Evidencias" subtitle={`${prae.evidencias.length} registradas`} icon="camera">
        {ordenadas.length ? (
          <View style={styles.lista}>
            {ordenadas.map((e) => <FilaEvidencia key={e.id} evidencia={e} accion={e.accion_id ? acciones[e.accion_id] : undefined} editable={prae.puede_editar} />)}
          </View>
        ) : (
          <EmptyState title="Aún no hay evidencias" />
        )}
      </Card>
      {prae.puede_editar ? <NuevaEvidencia prae={prae} /> : null}
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  lista: { gap: 12 },
  fila: { flexDirection: 'row', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  filaTexto: { flex: 1, minWidth: 0, gap: 4 },
  foto: { width: 72, height: 72, borderRadius: 12, backgroundColor: palette.line },
  titulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  texto: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  enlace: { color: palette.forest, fontSize: 13, fontFamily: fonts.semiBold },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  evidencia: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
}));
