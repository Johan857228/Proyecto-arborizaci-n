import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { ReviewActions } from '@/features/inspections/components/ReviewActions';
import { useInspeccion, useSubirFotoInspeccion } from '@/features/inspections/hooks/useInspecciones';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esRevisor } from '@/features/perfil/schemas';
import { photoLabel } from '@/features/trees/components/PhotoSection';
import { usePhotoPicker } from '@/features/trees/hooks/usePhotoPicker';
import type { FotoLocal } from '@/features/trees/types';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFechaHora, formatNumero } from '@/shared/format';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  ErrorState,
  KeyValue,
  LoadingState,
  Notice,
  Page,
  RevisionBadge,
  Row,
  StateBadge,
} from '@/shared/components/UI';

export function InspectionDetailScreen({ inspeccionId, aviso }: { inspeccionId: string; aviso?: string }) {
  const consulta = useInspeccion(inspeccionId);
  const perfil = useMiPerfil();
  const userId = useAuthStore((state) => state.session?.user_id);
  const [resultado, setResultado] = useState<string>();

  if (consulta.isLoading) return <Page><LoadingState /></Page>;
  if (consulta.error || !consulta.data) {
    return <Page><AppHeader title="Inspección" /><ErrorState error={consulta.error} onRetry={() => void consulta.refetch()} /></Page>;
  }
  const i = consulta.data;
  const esInspector = Boolean(userId) && i.inspector_id === userId;

  return (
    <Page onRefresh={() => void consulta.refetch()} refreshing={consulta.isFetching && !consulta.isLoading}>
      <AppHeader
        eyebrow={`${i.nombre_corto} · ${i.zona}`}
        title={`Inspección de ${i.codigo}`}
        subtitle={`${i.nombre_comun} · ${i.origen === 'registro' ? 'registro inicial' : 'seguimiento'} del ${formatFechaHora(i.fecha)}`}
      />
      {aviso === 'fotos' ? (
        <Notice tono="riesgo">La inspección quedó guardada, pero alguna foto no se pudo subir. Agrégala abajo.</Notice>
      ) : null}
      {resultado ? <Notice tono="sano">{resultado}</Notice> : null}

      <View style={styles.badges}>
        <StateBadge estado={i.calificacion} />
        <RevisionBadge estado={i.estado_revision} />
        <Badge label={`Puntaje ${formatNumero(i.puntaje_riesgo)}`} />
        {i.metodo_version ? <Badge label={`Método v${i.metodo_version}`} tono="info" /> : null}
      </View>

      <PrimaryButton title="Ver ficha del árbol" variant="secondary" onPress={() => router.push(`/(app)/trees/${i.arbol_id}` as Href)} />

      {i.estado_revision === 'pendiente' && esRevisor(perfil.data) ? (
        <Card title="Revisión">
          {i.puede_revisar ? (
            <ReviewActions
              inspeccionId={i.id}
              onDone={(accion) => setResultado(accion === 'confirmar' ? 'Inspección confirmada.' : 'Inspección anulada.')}
            />
          ) : (
            <Text style={styles.texto}>{i.motivo_no_revisable}</Text>
          )}
        </Card>
      ) : null}

      <Card title="Datos de la visita">
        <View style={styles.kvs}>
          <KeyValue label="Inspector" value={i.inspector_nombre ?? 'Usuario sin perfil'} />
          <KeyValue label="DAP" value={`${formatNumero(i.dap_cm)} cm`} />
          <KeyValue label="Altura" value={`${formatNumero(i.altura_m)} m`} />
          <KeyValue label="Copa" value={`${formatNumero(i.copa_m)} m`} />
          <KeyValue label="Etapa" value={i.etapa} />
          <KeyValue label="Interferencia" value={`${i.interferencia}${i.interferencia_otra ? ` (${i.interferencia_otra})` : ''}`} />
          <KeyValue
            label="Ubicación"
            value={i.lat != null && i.lng != null
              ? `${i.lat.toFixed(6)}, ${i.lng.toFixed(6)}${i.precision_gps_m != null ? ` (±${formatNumero(i.precision_gps_m, 1)} m)` : ''}`
              : 'No se capturó'}
          />
        </View>
        <Text style={styles.subtitulo}>Hallazgos</Text>
        <Text style={styles.texto}>
          {i.observaciones.length ? i.observaciones.map((o) => o.etiqueta).join(', ') : 'Sin hallazgos fitosanitarios.'}
        </Text>
        {i.notas ? <><Text style={styles.subtitulo}>Notas</Text><Text style={styles.texto}>{i.notas}</Text></> : null}
        {i.advertencias.length ? <Notice tono="riesgo">{i.advertencias.join(' · ')}</Notice> : null}
      </Card>

      {i.estado_revision !== 'pendiente' ? (
        <Card title="Revisión">
          <Text style={styles.texto}>
            {i.estado_revision === 'confirmada' ? 'Confirmada' : 'Anulada'} por {i.revisado_por_nombre ?? 'un revisor'} el {formatFechaHora(i.revisado_en)}.
          </Text>
          {i.comentario_revision ? <Text style={styles.texto}>“{i.comentario_revision}”</Text> : null}
        </Card>
      ) : null}

      <Card title="Cálculos con esta inspección">
        <View style={styles.kvs}>
          <KeyValue label="Biomasa total" value={`${formatNumero(i.biomasa_total_kg)} kg`} />
          <KeyValue label="Carbono" value={`${formatNumero(i.carbono_kg)} kg`} />
          <KeyValue label="CO₂" value={`${formatNumero(i.co2_kg)} kg`} />
          <KeyValue label="O₂" value={`${formatNumero(i.o2_kg)} kg`} />
        </View>
      </Card>

      <Card title="Fotografías">
        {i.fotos.length ? (
          <View style={styles.fotos}>
            {i.fotos.map((foto) => (
              <View key={foto.id} style={styles.fotoBox}>
                {foto.url ? <Image source={{ uri: foto.url }} style={styles.foto} contentFit="cover" /> : <View style={styles.foto} />}
                <Text style={styles.fotoLabel}>{photoLabel(foto.tipo)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.texto}>Esta inspección no tiene fotos.</Text>
        )}
        {esInspector && i.estado_revision === 'pendiente' && i.origen === 'seguimiento' ? (
          <SubirFotos inspeccionId={i.id} existentes={i.fotos.map((f) => f.tipo)} />
        ) : null}
      </Card>
    </Page>
  );
}

function SubirFotos({ inspeccionId, existentes }: { inspeccionId: string; existentes: FotoLocal['tipo'][] }) {
  const picker = usePhotoPicker();
  const subir = useSubirFotoInspeccion(inspeccionId);
  const [error, setError] = useState<string>();
  const adicionales = existentes.filter((t) => t === 'adicional').length;

  async function enviar(foto: FotoLocal) {
    setError(undefined);
    try {
      await subir.mutateAsync(foto);
      picker.removePhoto(foto);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <View style={styles.subir}>
      <Row>
        {!existentes.includes('completo') ? (
          <Cell basis={160}><PrimaryButton title="Agregar foto general" variant="secondary" onPress={() => void picker.pickPhoto('completo')} /></Cell>
        ) : null}
        {!existentes.includes('detalle') ? (
          <Cell basis={160}><PrimaryButton title="Agregar foto de detalle" variant="secondary" onPress={() => void picker.pickPhoto('detalle')} /></Cell>
        ) : null}
        {adicionales < 3 ? (
          <Cell basis={160}><PrimaryButton title={`Foto adicional (${adicionales}/3)`} variant="secondary" onPress={() => void picker.pickPhoto('adicional')} /></Cell>
        ) : null}
      </Row>
      {picker.photos.map((foto) => (
        <View key={foto.uri} style={styles.pendiente}>
          <Image source={{ uri: foto.uri }} style={styles.fotoChica} contentFit="cover" />
          <Text style={[styles.texto, styles.flex]}>{photoLabel(foto.tipo)} lista para subir</Text>
          <View style={styles.boton}><PrimaryButton title="Subir" loading={subir.isPending} onPress={() => void enviar(foto)} /></View>
        </View>
      ))}
      {picker.photoError ? <InlineMessage>{picker.photoError}</InlineMessage> : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kvs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  subtitulo: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  texto: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fotoBox: { gap: 4 },
  foto: { width: 140, height: 140, borderRadius: 8, backgroundColor: palette.line },
  fotoLabel: { color: palette.muted, fontSize: 11 },
  subir: { gap: 8 },
  pendiente: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fotoChica: { width: 52, height: 52, borderRadius: 6, backgroundColor: palette.line },
  flex: { flex: 1 },
  boton: { width: 110 },
});
