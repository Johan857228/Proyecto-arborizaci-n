import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { InspectionCard } from '@/features/inspections/components/InspectionCard';
import { useHistorial } from '@/features/inspections/hooks/useInspecciones';
import {
  useIntervencionesArbol,
  useRecomendacionesArbol,
} from '@/features/interventions/hooks/useIntervenciones';
import { ETIQUETA_ESTADO_INTERVENCION, ETIQUETA_RESULTADO } from '@/features/interventions/schemas';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { gestiona } from '@/features/perfil/schemas';
import { photoLabel } from '@/features/trees/components/PhotoSection';
import { useArbol, useCalculos, useSubirFotoArbol } from '@/features/trees/hooks/useArbol';
import { usePhotoPicker } from '@/features/trees/hooks/usePhotoPicker';
import type { FotoLocal } from '@/features/trees/types';
import { getApiErrorMessage } from '@/services/api/client';
import { useAvisos } from '@/shared/avisos';
import { formatFecha, formatFechaHora, formatNumero, formatPesos } from '@/shared/format';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  KeyValue,
  LoadingState,
  Notice,
  Page,
  RevisionBadge,
  Row,
  StateBadge,
  Cell,
} from '@/shared/components/UI';

const AVISOS: Record<string, { texto: string; tono: 'sano' | 'riesgo' }> = {
  registrado: {
    texto: 'Árbol registrado. Su primera inspección quedó pendiente de revisión por un docente.',
    tono: 'sano',
  },
  fotos: {
    texto: 'El árbol quedó registrado, pero no se pudo subir toda la evidencia. Agrega las fotos que faltan abajo.',
    tono: 'riesgo',
  },
  inspeccion: { texto: 'Inspección guardada. Quedó pendiente de revisión.', tono: 'sano' },
  intervencion: { texto: 'Intervención guardada.', tono: 'sano' },
};

export function TreeDetailScreen({ arbolId, aviso: avisoRuta }: { arbolId: string; aviso?: string }) {
  const avisoGuardado = useAvisos((state) => state.avisos[arbolId]);
  const limpiarAviso = useAvisos((state) => state.limpiar);
  const aviso = avisoGuardado ?? avisoRuta;
  // El aviso se muestra mientras la ficha esté abierta y se descarta al salir.
  useEffect(() => () => limpiarAviso(arbolId), [arbolId, limpiarAviso]);
  const arbol = useArbol(arbolId);
  const calculos = useCalculos(arbolId);
  const historial = useHistorial(arbolId);
  const intervenciones = useIntervencionesArbol(arbolId);
  const recomendaciones = useRecomendacionesArbol(arbolId);
  const perfil = useMiPerfil();
  const userId = useAuthStore((state) => state.session?.user_id);

  if (arbol.isLoading) return <Page><LoadingState text="Cargando ficha del árbol…" /></Page>;
  if (arbol.error || !arbol.data) {
    return (
      <Page>
        <AppHeader title="Ficha del árbol" backTo={'/(app)/trees' as Href} />
        <ErrorState error={arbol.error} onRetry={() => void arbol.refetch()} />
      </Page>
    );
  }
  const a = arbol.data;
  const puedeIntervenir = gestiona(perfil.data, a.institucion_id);
  const esRegistrante = Boolean(userId) && a.registrado_por === userId;
  const refrescando = arbol.isFetching || historial.isFetching;

  return (
    <Page
      onRefresh={() => {
        void arbol.refetch();
        void historial.refetch();
        void calculos.refetch();
        void intervenciones.refetch();
        void recomendaciones.refetch();
      }}
      refreshing={refrescando && !arbol.isLoading}
    >
      <AppHeader
        eyebrow={`${a.nombre_corto} · ${a.zona}${a.zona_otra ? ` (${a.zona_otra})` : ''}`}
        title={`${a.codigo} · ${a.nombre_comun}`}
        subtitle={a.nombre_cientifico}
        backTo={'/(app)/trees' as Href}
      />
      {aviso && AVISOS[aviso] ? <Notice tono={AVISOS[aviso].tono}>{AVISOS[aviso].texto}</Notice> : null}

      <View style={styles.badges}>
        <StateBadge estado={a.estado} />
        {a.ultima_revision ? <RevisionBadge estado={a.ultima_revision} /> : null}
        {a.puntaje_riesgo != null ? <Badge label={`Puntaje de riesgo ${formatNumero(a.puntaje_riesgo)}`} /> : null}
      </View>

      <Row>
        <Cell>
          <PrimaryButton title="Registrar inspección" onPress={() => router.push(`/(app)/trees/${a.id}/inspect` as Href)} />
        </Cell>
        {puedeIntervenir ? (
          <Cell>
            <PrimaryButton
              title="Registrar intervención"
              variant="secondary"
              onPress={() => router.push(`/(app)/trees/${a.id}/intervention` as Href)}
            />
          </Cell>
        ) : null}
      </Row>

      <Card title="Estado actual">
        <Text style={styles.helper}>
          Según la última inspección válida{a.ultima_inspeccion_en ? ` (${formatFechaHora(a.ultima_inspeccion_en)})` : ''}.
          {a.n_inspecciones != null ? ` ${a.n_inspecciones} inspección(es) válidas en el historial.` : ''}
        </Text>
        <View style={styles.kvs}>
          <KeyValue label="DAP" value={`${formatNumero(a.dap_cm)} cm`} />
          <KeyValue label="Altura" value={`${formatNumero(a.altura_m)} m`} />
          <KeyValue label="Diámetro de copa" value={`${formatNumero(a.copa_m)} m`} />
          <KeyValue label="Etapa" value={a.etapa} />
          <KeyValue
            label="Interferencia"
            value={`${a.interferencia}${a.interferencia_otra ? ` (${a.interferencia_otra})` : ''}`}
          />
          <KeyValue label="Registrado" value={formatFecha(a.registrado_en)} />
        </View>
        <Text style={styles.subtitulo}>Hallazgos</Text>
        <Text style={styles.texto}>
          {a.observaciones.length ? a.observaciones.map((o) => o.etiqueta).join(', ') : 'Sin hallazgos fitosanitarios.'}
        </Text>
      </Card>

      <Card title="Cálculos ambientales">
        {calculos.isLoading ? <LoadingState /> : calculos.error || !calculos.data ? (
          <InlineMessage>{getApiErrorMessage(calculos.error)}</InlineMessage>
        ) : (
          <>
            <View style={styles.kvs}>
              <KeyValue label="Biomasa total" value={`${formatNumero(calculos.data.biomasa_total_kg)} kg`} />
              <KeyValue label="Carbono" value={`${formatNumero(calculos.data.carbono_kg)} kg`} />
              <KeyValue label="CO₂ equivalente" value={`${formatNumero(calculos.data.co2_kg)} kg`} />
              <KeyValue label="O₂ equivalente" value={`${formatNumero(calculos.data.o2_kg)} kg`} />
            </View>
            <Text style={styles.nota}>{calculos.data.metodo} {calculos.data.advertencia}</Text>
          </>
        )}
      </Card>

      <FotosRegistro arbolId={a.id} fotos={a.fotos} puedeSubir={esRegistrante} />

      <Card title="Recomendaciones">
        {recomendaciones.isLoading ? <LoadingState /> : recomendaciones.error ? (
          <InlineMessage>{getApiErrorMessage(recomendaciones.error)}</InlineMessage>
        ) : recomendaciones.data?.length ? (
          recomendaciones.data.map((r) => (
            <View key={r.tipo_codigo} style={styles.item}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>{r.tipo_nombre}</Text>
                <Badge
                  label={`Prioridad ${r.prioridad_nombre}`}
                  tono={r.prioridad === 3 ? 'critico' : r.prioridad === 2 ? 'riesgo' : 'neutro'}
                />
              </View>
              <Text style={styles.texto}>{r.motivo} · costo de referencia {formatPesos(r.costo_referencia)}</Text>
              {puedeIntervenir ? (
                <Text
                  style={styles.link}
                  accessibilityRole="link"
                  onPress={() => router.push(`/(app)/trees/${a.id}/intervention?tipo=${r.tipo_codigo}` as Href)}
                >
                  Programar esta intervención
                </Text>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.texto}>No hay acciones pendientes para este árbol.</Text>
        )}
      </Card>

      <Card title="Intervenciones">
        {intervenciones.isLoading ? <LoadingState /> : intervenciones.error ? (
          <InlineMessage>{getApiErrorMessage(intervenciones.error)}</InlineMessage>
        ) : intervenciones.data?.length ? (
          intervenciones.data.map((i) => (
            <View key={i.id} style={styles.item}>
              <View style={styles.itemHeader}>
                <Text
                  style={[styles.itemTitle, styles.link]}
                  accessibilityRole="link"
                  onPress={() => router.push(`/(app)/interventions/${i.id}` as Href)}
                >
                  {i.tipo_nombre ?? i.tipo_codigo}
                </Text>
                <Badge
                  label={ETIQUETA_ESTADO_INTERVENCION[i.estado]}
                  tono={i.estado === 'ejecutada' ? 'sano' : i.estado === 'programada' ? 'info' : 'neutro'}
                />
              </View>
              <Text style={styles.texto}>
                {i.estado === 'ejecutada'
                  ? `Ejecutada el ${formatFecha(i.fecha_ejecucion)} · ${formatPesos(i.costo_real)} · ${i.resultado ? ETIQUETA_RESULTADO[i.resultado] : ''}`
                  : i.estado === 'programada'
                    ? `Programada para el ${formatFecha(i.fecha_programada)} · estimado ${formatPesos(i.costo_estimado)}`
                    : 'Cancelada'}
                {` · Responsable: ${i.responsable}`}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.texto}>Aún no hay intervenciones registradas.</Text>
        )}
      </Card>

      <Text style={styles.seccion}>Historial de inspecciones</Text>
      {historial.isLoading ? <LoadingState /> : historial.error ? (
        <ErrorState error={historial.error} onRetry={() => void historial.refetch()} />
      ) : historial.data?.length ? (
        historial.data.map((inspeccion) => <InspectionCard key={inspeccion.id} inspeccion={inspeccion} />)
      ) : (
        <EmptyState title="Sin inspecciones" text="Registra la primera inspección de este árbol." />
      )}
    </Page>
  );
}

function FotosRegistro({
  arbolId,
  fotos,
  puedeSubir,
}: {
  arbolId: string;
  fotos: { id: string; tipo: FotoLocal['tipo']; url: string | null }[];
  puedeSubir: boolean;
}) {
  const picker = usePhotoPicker();
  const subir = useSubirFotoArbol(arbolId);
  const [error, setError] = useState<string>();
  const tiene = (tipo: FotoLocal['tipo']) => fotos.some((foto) => foto.tipo === tipo);
  const adicionales = fotos.filter((foto) => foto.tipo === 'adicional').length;

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
    <Card title="Fotos de registro">
      {fotos.length ? (
        <View style={styles.fotos}>
          {fotos.map((foto) => (
            <View key={foto.id} style={styles.fotoBox}>
              {foto.url ? <Image source={{ uri: foto.url }} style={styles.foto} contentFit="cover" /> : <View style={styles.foto} />}
              <Text style={styles.fotoLabel}>{photoLabel(foto.tipo)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.texto}>Este árbol no tiene fotos de registro.</Text>
      )}
      {puedeSubir ? (
        <>
          <Row>
            {!tiene('completo') ? (
              <Cell basis={160}><PrimaryButton title="Agregar foto general" variant="secondary" onPress={() => void picker.pickPhoto('completo')} /></Cell>
            ) : null}
            {!tiene('detalle') ? (
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
              <View style={styles.boton}>
                <PrimaryButton title="Subir" loading={subir.isPending} onPress={() => void enviar(foto)} />
              </View>
            </View>
          ))}
          {picker.photoError ? <InlineMessage>{picker.photoError}</InlineMessage> : null}
          {error ? <InlineMessage>{error}</InlineMessage> : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kvs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  helper: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  subtitulo: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  texto: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  nota: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  seccion: { marginTop: 6, color: palette.ink, fontSize: 18, fontWeight: '900' },
  item: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.line },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemTitle: { color: palette.ink, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  link: { color: palette.forest, fontSize: 13, fontWeight: '800' },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fotoBox: { gap: 4 },
  foto: { width: 120, height: 120, borderRadius: 8, backgroundColor: palette.line },
  fotoLabel: { color: palette.muted, fontSize: 11 },
  pendiente: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fotoChica: { width: 52, height: 52, borderRadius: 6, backgroundColor: palette.line },
  flex: { flex: 1 },
  boton: { width: 110 },
});
