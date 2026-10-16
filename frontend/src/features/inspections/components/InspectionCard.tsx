import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import type { Inspeccion } from '@/features/inspections/schemas';
import { formatFechaHora, formatNumero } from '@/shared/format';
import { Badge, RevisionBadge, StateBadge } from '@/shared/components/UI';

/** Una visita en el historial del árbol. Al tocarla se abre su detalle. */
export function InspectionCard({ inspeccion }: { inspeccion: Inspeccion }) {
  const anulada = inspeccion.estado_revision === 'anulada';
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/(app)/inspections/${inspeccion.id}` as Href)}
      style={({ pressed }) => [styles.card, anulada && styles.anulada, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.fecha}>{formatFechaHora(inspeccion.fecha)}</Text>
          <Text style={styles.quien}>
            {inspeccion.origen === 'registro' ? 'Registro inicial' : 'Seguimiento'} · {inspeccion.inspector_nombre ?? 'Usuario sin perfil'}
          </Text>
        </View>
        <StateBadge estado={inspeccion.calificacion} />
      </View>
      <View style={styles.badges}>
        <RevisionBadge estado={inspeccion.estado_revision} />
        <Badge label={`Puntaje ${formatNumero(inspeccion.puntaje_riesgo)}`} />
        {inspeccion.metodo_version ? <Badge label={`Método v${inspeccion.metodo_version}`} tono="info" /> : null}
      </View>
      <Text style={styles.medidas}>
        DAP {formatNumero(inspeccion.dap_cm)} cm · Altura {formatNumero(inspeccion.altura_m)} m · Copa {formatNumero(inspeccion.copa_m)} m · {inspeccion.etapa}
      </Text>
      {inspeccion.interferencia !== 'Ninguna' ? (
        <Text style={styles.texto}>
          Interferencia: {inspeccion.interferencia}{inspeccion.interferencia_otra ? ` (${inspeccion.interferencia_otra})` : ''}
        </Text>
      ) : null}
      <Text style={styles.texto}>
        {inspeccion.observaciones.length
          ? `Hallazgos: ${inspeccion.observaciones.map((o) => o.etiqueta).join(', ')}`
          : 'Sin hallazgos fitosanitarios'}
      </Text>
      {inspeccion.notas ? <Text style={styles.notas}>“{inspeccion.notas}”</Text> : null}
      {inspeccion.comentario_revision ? (
        <Text style={[styles.texto, anulada && styles.motivo]}>
          {anulada ? 'Motivo de anulación' : 'Comentario del revisor'}: {inspeccion.comentario_revision}
          {inspeccion.revisado_por_nombre ? ` (${inspeccion.revisado_por_nombre})` : ''}
        </Text>
      ) : null}
      {inspeccion.fotos.length ? (
        <View style={styles.fotos}>
          {inspeccion.fotos.map((foto) =>
            foto.url ? <Image key={foto.id} source={{ uri: foto.url }} style={styles.foto} contentFit="cover" /> : null,
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  anulada: { opacity: 0.7, borderStyle: 'dashed' },
  pressed: { opacity: 0.8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flex: { flex: 1 },
  fecha: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  quien: { marginTop: 2, color: palette.muted, fontSize: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  medidas: { color: palette.ink, fontSize: 13, fontWeight: '600' },
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  notas: { color: palette.ink, fontSize: 13, fontStyle: 'italic' },
  motivo: { color: palette.red },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  foto: { width: 64, height: 64, borderRadius: 6, backgroundColor: palette.line },
});
