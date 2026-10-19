import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esRevisor } from '@/features/perfil/schemas';
import { siembrasService, useBorrarJornada, useDescargaSiembras, useEditarJornada, useJornada } from '@/features/siembras/api';
import { Asistentes } from '@/features/siembras/components/Asistentes';
import { PlantaFila } from '@/features/siembras/components/PlantaFila';
import { RegistrarPlanta } from '@/features/siembras/components/RegistrarPlanta';
import { ResumenSiembras } from '@/features/siembras/components/ResumenSiembras';
import { ORGANIZADORES, type JornadaDetalle } from '@/features/siembras/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Badge, Card, ConfirmButton, EmptyState, ErrorState, LoadingState, Page } from '@/shared/components/UI';
import { formatFecha } from '@/shared/format';
import { crearEstilos } from '@/theme';

type Filtro = 'todas' | 'por_controlar' | 'vivas' | 'muertas';
const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'por_controlar', etiqueta: 'Por controlar' },
  { valor: 'vivas', etiqueta: 'Vivas' },
  { valor: 'muertas', etiqueta: 'Muertas' },
];

function Plantas({ jornada }: { jornada: JornadaDetalle }) {
  const styles = useStyles();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const visibles = jornada.siembras.filter((s) =>
    filtro === 'todas' ? true
      : filtro === 'por_controlar' ? s.siguiente != null && s.siguiente.estado !== 'proximo'
        : filtro === 'vivas' ? s.estado === 'viva' : s.estado === 'muerta');
  return (
    <Card title={`Plántulas (${jornada.siembras.length})`} subtitle="Cualquier persona de la institución puede registrar los controles." icon="siembra">
      {jornada.siembras.length ? (
        <>
          <View style={styles.chips}>
            {FILTROS.map((f) => <ChoiceChip key={f.valor} label={f.etiqueta} selected={filtro === f.valor} onPress={() => setFiltro(f.valor)} />)}
          </View>
          {visibles.length ? visibles.map((s) => <PlantaFila key={s.id} siembra={s} editable={jornada.puede_editar} />) : <Text style={styles.meta}>Ninguna con ese filtro.</Text>}
        </>
      ) : (
        <EmptyState title="Aún no hay plántulas" text={jornada.puede_editar ? 'Regístralas abajo, una por una, con el GPS.' : 'Los docentes las registran el día de la siembra.'} />
      )}
    </Card>
  );
}

/** Una jornada de siembra: supervivencia, plántulas con sus controles, asistentes y exportación. */
export function JornadaScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const perfil = useMiPerfil();
  const jornada = useJornada(String(id));
  const editar = useEditarJornada();
  const borrar = useBorrarJornada();
  const descarga = useDescargaSiembras();
  const j = jornada.data;

  return (
    <Page onRefresh={() => void jornada.refetch()} refreshing={jornada.isRefetching}>
      {jornada.isLoading ? (
        <LoadingState text="Cargando la jornada…" />
      ) : jornada.error && !j ? (
        <ErrorState error={jornada.error} onRetry={() => void jornada.refetch()} />
      ) : !j ? null : (
        <>
          <AppHeader
            eyebrow="Jornada de siembra"
            title={j.nombre}
            subtitle={[formatFecha(j.fecha), j.lugar, `Organiza: ${ORGANIZADORES[j.organizador]}`, j.patrocinador ? `Patrocina: ${j.patrocinador}` : null].filter(Boolean).join(' · ')}
            backTo={'/(app)/plantings' as Href}
          />
          <View style={styles.chips}>
            {j.oficial ? <Badge label="Jornada oficial" tono="info" /> : <Badge label="Jornada del colegio" tono="neutro" />}
            {j.area_de_vida ? <Badge label={`Área de Vida: ${j.area_de_vida}`} tono="sano" /> : null}
            {j.puede_editar ? (
              <PrimaryButton
                title={j.oficial ? 'Marcar como del colegio' : 'Marcar como oficial'}
                compact
                variant="ghost"
                loading={editar.isPending}
                onPress={() => editar.mutate({ id: j.id, cambios: { oficial: !j.oficial } })}
              />
            ) : null}
          </View>
          {editar.error ? <InlineMessage>{getApiErrorMessage(editar.error)}</InlineMessage> : null}

          <Card title="Supervivencia" icon="chart"><ResumenSiembras resumen={j.resumen} /></Card>
          <Plantas jornada={j} />
          {j.puede_editar ? <RegistrarPlanta jornada={j} /> : null}
          {j.puede_editar ? <Asistentes jornada={j} /> : (
            <Text style={styles.meta}>{j.asistentes.total} {j.asistentes.total === 1 ? 'persona asistió' : 'personas asistieron'} a la jornada.</Text>
          )}

          {esRevisor(perfil.data) && j.siembras.length ? (
            <Card title="Exportar esta jornada" subtitle="GeoJSON o CSV de las plántulas, sin nombres de personas." icon="download">
              {descarga.error ? <InlineMessage>{getApiErrorMessage(descarga.error)}</InlineMessage> : null}
              {descarga.data && !descarga.isPending ? <InlineMessage tone="success">Listo: {descarga.data.nombre}.</InlineMessage> : null}
              <View style={styles.chips}>
                <PrimaryButton title="GeoJSON" icon="download" variant="secondary" loading={descarga.isPending}
                  onPress={() => descarga.mutate(() => siembrasService.exportar({ formato: 'geojson', jornada_id: j.id }))} />
                <PrimaryButton title="CSV" icon="download" variant="secondary" disabled={descarga.isPending}
                  onPress={() => descarga.mutate(() => siembrasService.exportar({ formato: 'csv', jornada_id: j.id }))} />
              </View>
            </Card>
          ) : null}

          {j.puede_editar && !j.siembras.length ? (
            <>
              {borrar.error ? <InlineMessage>{getApiErrorMessage(borrar.error)}</InlineMessage> : null}
              <ConfirmButton
                title="Borrar jornada"
                confirmTitle="¿Borrar esta jornada sin plántulas?"
                loading={borrar.isPending}
                onConfirm={() => borrar.mutate(j.id, { onSuccess: () => router.replace('/(app)/plantings' as Href) })}
              />
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
