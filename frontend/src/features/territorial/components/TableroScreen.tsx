import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { useTablero, useTerritorios } from '@/features/territorial/api';
import { TerritoriosAdmin } from '@/features/territorial/components/TerritoriosAdmin';
import { SEMAFOROS, type FilaInstitucion, type Semaforo } from '@/features/territorial/schemas';
import { ChoiceChip, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Badge, Card, EmptyState, ErrorState, LoadingState, Page, StatGrid, StatTile, useTonos } from '@/shared/components/UI';
import { formatFechaHora, formatNumero } from '@/shared/format';
import { crearEstilos } from '@/theme';

const ESTADOS_PRAE: Record<string, string> = {
  formulacion: 'En formulación', en_ejecucion: 'En ejecución', evaluacion_parcial: 'Evaluación parcial', evaluado: 'Evaluado',
};
const n = (v: number | null | undefined, d = 0) => (v == null ? '—' : formatNumero(v, d));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${formatNumero(v, 0)} %`);

function Colegio({ fila }: { fila: FilaInstitucion }) {
  const styles = useStyles();
  const tonos = useTonos();
  const sem = SEMAFOROS[fila.semaforo];
  const s = fila.siembras;
  const datos = [
    fila.prae ? `PRAE ${ESTADOS_PRAE[fila.prae.estado] ?? fila.prae.estado}${fila.prae.pct_cumplidas != null ? ` · ${pct(fila.prae.pct_cumplidas)} del plan` : ''}` : 'Sin PRAE del año',
    s ? `${n(s.sembradas)} plántulas${s.supervivencia_pct != null ? ` (${pct(s.supervivencia_pct)} viven)` : ''}` : null,
    fila.clases ? `${n(fila.clases.clases)} clases con guías` : null,
    fila.servicio_social ? `${n(fila.servicio_social.horas_aprobadas, 0)} h de servicio social` : null,
    fila.arboles ? `${n(fila.arboles.total)} árboles` : null,
  ].filter(Boolean);
  return (
    <View style={styles.colegio}>
      <View style={[styles.punto, { backgroundColor: tonos[sem.tono].texto }]} accessibilityLabel={sem.etiqueta} />
      <View style={styles.flex}>
        <View style={styles.cabeza}>
          <Text style={[styles.nombre, styles.flex]}>{fila.nombre}</Text>
          <Badge label={sem.etiqueta} tono={sem.tono} />
        </View>
        <Text style={styles.meta}>{[fila.municipio, fila.codigo_dane ? `DANE ${fila.codigo_dane}` : null].filter(Boolean).join(' · ') || 'Sin código DANE'}</Text>
        <Text style={styles.datos}>{datos.join(' · ')}</Text>
        {fila.prae?.evaluaciones_faltantes.length ? (
          <Text style={styles.meta}>Falta la evaluación de {fila.prae.evaluaciones_faltantes.map((i) => (i === 'secretaria' ? 'la Secretaría' : 'el consejo directivo')).join(' y ')}.</Text>
        ) : null}
      </View>
    </View>
  );
}

/** Tablero territorial: semáforo del PRAE de cada colegio y las cifras del año, solo agregadas. */
export function TableroScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const admin = esAdmin(perfil.data);
  const territorios = useTerritorios(!perfil.isLoading);
  const actual = new Date().getFullYear();
  const [anio, setAnio] = useState(actual);
  const [elegido, setElegido] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Semaforo | null>(null);
  const lista = territorios.data ?? [];
  // El funcionario ve su primer territorio; el administrador empieza con todas las instituciones.
  const territorioId = elegido ?? (admin ? undefined : lista[0]?.id);
  const listo = !perfil.isLoading && territorios.isSuccess && (admin || Boolean(territorioId));
  const tablero = useTablero(territorioId, anio, listo);
  const t = tablero.data?.totales;
  const filas = (tablero.data?.instituciones ?? []).filter((f) => !filtro || f.semaforo === filtro);

  return (
    <Page onRefresh={() => { void tablero.refetch(); void territorios.refetch(); }} refreshing={tablero.isRefetching}>
      <AppHeader
        eyebrow="Ley 2173 · Ley 1549"
        title="Tablero territorial"
        subtitle="El PRAE de cada colegio, las siembras, las clases y el servicio social del año, para el informe anual al MEN. Solo cifras, sin datos de estudiantes."
      />
      {admin || lista.length > 1 ? (
        <View style={styles.chips}>
          {admin ? <ChoiceChip label="Todas las instituciones" selected={!territorioId} onPress={() => setElegido(null)} /> : null}
          {lista.map((x) => <ChoiceChip key={x.id} label={x.nombre} selected={territorioId === x.id} onPress={() => setElegido(x.id)} />)}
        </View>
      ) : null}
      <View style={styles.chips}>
        {[actual, actual - 1].map((a) => <ChoiceChip key={a} label={String(a)} selected={anio === a} onPress={() => setAnio(a)} />)}
      </View>

      {perfil.isLoading || territorios.isLoading ? (
        <LoadingState text="Cargando el tablero…" />
      ) : !admin && !lista.length ? (
        <EmptyState title="Tu cuenta aún no tiene un territorio" text="El administrador de Arbolado Escolar te asigna los municipios o colegios de tu entidad." />
      ) : tablero.isLoading ? (
        <LoadingState text="Calculando las cifras de los colegios…" />
      ) : tablero.error && !tablero.data ? (
        <ErrorState error={tablero.error} onRetry={() => void tablero.refetch()} />
      ) : tablero.data && t ? (
        <>
          <Card title={tablero.data.territorio} subtitle={`${t.instituciones} colegios · cifras del ${formatFechaHora(tablero.data.generado_en)}`} icon="territorio">
            <View style={styles.semaforo}>
              {(['rojo', 'amarillo', 'verde'] as Semaforo[]).map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filtro === s }}
                  accessibilityLabel={`${SEMAFOROS[s].etiqueta}: ${t.semaforo[s]}. Toca para filtrar.`}
                  onPress={() => setFiltro(filtro === s ? null : s)}
                  style={({ pressed }) => [styles.luz, filtro === s && styles.luzElegida, pressed && styles.presionado]}
                >
                  <Badge label={SEMAFOROS[s].etiqueta} tono={SEMAFOROS[s].tono} />
                  <Text style={styles.luzNumero}>{t.semaforo[s]}</Text>
                  <Text style={styles.meta}>{SEMAFOROS[s].detalle}</Text>
                </Pressable>
              ))}
            </View>
            <StatGrid>
              <StatTile label="Plántulas sembradas" value={n(t.sembradas)} hint={`${n(t.jornadas)} jornadas · ${pct(t.supervivencia_pct)} viven · ${pct(t.pct_nativas)} nativas`} icon="siembra" tono="sano" />
              <StatTile label="Clases con guías" value={n(t.clases)} hint={`${n(t.estudiantes_en_clases)} asistencias de estudiantes`} icon="guia" tono="info" />
              <StatTile label="Servicio social" value={`${n(t.horas_servicio)} h`} hint={`${n(t.estudiantes_servicio)} estudiantes de 10.° y 11.°`} icon="school" />
              <StatTile label="Árboles monitoreados" value={n(t.arboles)} hint={`${n(t.inspectores)} personas inspeccionaron`} icon="tree" />
            </StatGrid>
          </Card>

          {tablero.data.territorio_id ? (
            <PrimaryButton
              title={`Informe anual de los PRAE ${anio}`}
              icon="download"
              onPress={() => router.push(`/(app)/territorial/informe?territorio=${tablero.data?.territorio_id}&anio=${anio}` as Href)}
            />
          ) : (
            <Text style={styles.meta}>Elige un territorio para preparar su informe anual.</Text>
          )}

          <Card title={filtro ? `Colegios: ${SEMAFOROS[filtro].etiqueta.toLowerCase()}` : 'Colegios'} subtitle="Primero los que necesitan atención." icon="building">
            {filas.length ? filas.map((f) => <Colegio key={f.id} fila={f} />) : <Text style={styles.meta}>Ningún colegio con ese filtro.</Text>}
          </Card>
        </>
      ) : null}

      {admin && territorios.data ? <TerritoriosAdmin territorios={territorios.data} /> : null}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  semaforo: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  luz: { flexGrow: 1, flexBasis: 160, gap: 6, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.tile },
  luzElegida: { borderColor: palette.forest, borderWidth: 2 },
  presionado: { opacity: 0.85 },
  luzNumero: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold },
  colegio: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  punto: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  cabeza: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  nombre: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  datos: { color: palette.ink, fontSize: 13, lineHeight: 19 },
}));
