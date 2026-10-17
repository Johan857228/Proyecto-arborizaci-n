import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { lineaBiotica } from '@/features/inspections/bioticos';
import { ReviewActions } from '@/features/inspections/components/ReviewActions';
import { usePendientes } from '@/features/inspections/hooks/useInspecciones';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esRevisor } from '@/features/perfil/schemas';
import { photoLabel } from '@/features/trees/components/PhotoSection';
import { formatFechaHora, formatNumero } from '@/shared/format';
import { PrimaryButton } from '@/shared/components/FormControls';
import { PhotoGallery } from '@/shared/components/PhotoGallery';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  Page,
  Row,
  StateBadge,
} from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

export function ReviewScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida({ soloPropiaSiNoAdmin: true });
  const [pagina, setPagina] = useState(0);
  const [ultimo, setUltimo] = useState<string>();
  const habilitado = esRevisor(perfil.data);
  const pendientes = usePendientes(institucion.institucionId, pagina, habilitado);

  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (!habilitado) {
    return (
      <Page>
        <AppHeader title="Revisión de inspecciones" />
        <Notice tono="riesgo">Esta sección es para docentes y administradores.</Notice>
      </Page>
    );
  }
  const total = pendientes.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / 20));

  return (
    <Page onRefresh={() => void pendientes.refetch()} refreshing={pendientes.isFetching && !pendientes.isLoading}>
      <AppHeader
        eyebrow="Validación"
        title="Inspecciones pendientes"
        subtitle="Revisa hallazgos, medidas y fotos. Confirma lo que es correcto o anula con un motivo lo que no lo es. No puedes revisar tus propias inspecciones."
      />
      <InstitucionSelector
        value={institucion.institucionId}
        onChange={(v) => { institucion.setInstitucionId(v); setPagina(0); }}
        disabled={institucion.bloqueada}
      />
      {ultimo ? <Notice tono="sano">{ultimo}</Notice> : null}
      <Text style={styles.total}>{pendientes.isLoading ? 'Cargando…' : `${total} pendiente(s)`}</Text>

      {pendientes.isLoading ? <LoadingState /> : pendientes.error ? (
        <ErrorState error={pendientes.error} onRetry={() => void pendientes.refetch()} />
      ) : !pendientes.data?.items.length ? (
        <EmptyState title="No hay inspecciones pendientes" text="Todo está al día." />
      ) : (
        pendientes.data.items.map((i) => (
          <Card key={i.id}>
            <View style={styles.header}>
              <View style={styles.flex}>
                <Text
                  style={styles.codigo}
                  accessibilityRole="link"
                  onPress={() => router.push(`/(app)/inspections/${i.id}` as Href)}
                >
                  {i.codigo} · {i.nombre_comun}
                </Text>
                <Text style={styles.meta}>
                  {i.origen === 'registro' ? 'Registro inicial' : 'Seguimiento'} · {formatFechaHora(i.fecha)} · {i.inspector_nombre ?? 'Usuario sin perfil'}
                </Text>
                <Text style={styles.meta}>{i.nombre_corto} · {i.zona}</Text>
              </View>
              <StateBadge estado={i.calificacion} />
            </View>
            <View style={styles.badges}>
              <Badge label={`Puntaje ${formatNumero(i.puntaje_riesgo)}`} />
              {i.interferencia !== 'Ninguna' ? <Badge label={i.interferencia} tono="riesgo" /> : null}
            </View>
            <Text style={styles.texto}>
              DAP {formatNumero(i.dap_cm)} cm · Altura {formatNumero(i.altura_m)} m · Copa {formatNumero(i.copa_m)} m · {i.etapa}
            </Text>
            <Text style={styles.texto}>
              {i.observaciones.length ? `Hallazgos: ${i.observaciones.map((o) => o.etiqueta).join(', ')}` : 'Sin hallazgos'}
            </Text>
            {lineaBiotica(i) ? <Text style={styles.texto}>Agentes bióticos. {lineaBiotica(i)}</Text> : null}
            {i.notas ? <Text style={styles.notas}>“{i.notas}”</Text> : null}
            {i.advertencias.length ? <Text style={styles.aviso}>{i.advertencias.join(' · ')}</Text> : null}
            {i.fotos.length ? (
              <PhotoGallery
                compacta
                tamano={88}
                maxMiniaturas={5}
                fotos={i.fotos.map((f) => ({
                  id: f.id,
                  url: f.url,
                  titulo: photoLabel(f.tipo),
                  detalle: `${i.codigo} · ${formatFechaHora(i.fecha)}`,
                }))}
              />
            ) : <Text style={styles.aviso}>Sin fotos</Text>}
            {i.puede_revisar ? (
              <ReviewActions
                inspeccionId={i.id}
                onDone={(accion) => setUltimo(`${i.codigo}: inspección ${accion === 'confirmar' ? 'confirmada' : 'anulada'}.`)}
              />
            ) : (
              <Text style={styles.aviso}>{i.motivo_no_revisable}</Text>
            )}
          </Card>
        ))
      )}

      {total > 20 ? (
        <Row>
          <Cell basis={140}>
            <PrimaryButton title="Anteriores" variant="secondary" disabled={pagina === 0} onPress={() => setPagina((p) => Math.max(0, p - 1))} />
          </Cell>
          <Cell basis={140}>
            <PrimaryButton title="Siguientes" variant="secondary" disabled={pagina + 1 >= paginas} onPress={() => setPagina((p) => p + 1)} />
          </Cell>
        </Row>
      ) : null}
      {total > 20 ? <Text style={styles.total}>Página {pagina + 1} de {paginas}</Text> : null}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  total: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  header: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  flex: { flex: 1 },
  codigo: { color: palette.forest, fontSize: 15, fontWeight: '900' },
  meta: { color: palette.muted, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  texto: { color: palette.ink, fontSize: 13, lineHeight: 18 },
  notas: { color: palette.ink, fontSize: 13, fontStyle: 'italic' },
  aviso: { color: palette.amber, fontSize: 12, fontWeight: '700' },
}));
