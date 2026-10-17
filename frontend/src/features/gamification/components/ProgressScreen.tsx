import { useState } from 'react';
import { Text, View } from 'react-native';

import { useMiProgreso, useRanking, type FiltroRanking, type Progreso } from '@/features/gamification/api';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { fechaIso } from '@/shared/validacion';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  ProgressBar,
  Row,
  StatGrid,
  StatTile,
  Tabs,
} from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

export function ProgressScreen() {
  const progreso = useMiProgreso();
  return (
    <Page onRefresh={() => void progreso.refetch()} refreshing={progreso.isFetching && !progreso.isLoading}>
      <AppHeader
        eyebrow="Gamificación"
        title="Mi progreso y rankings"
        subtitle="Cada inspección confirmada suma puntos; registrar un árbol nuevo suma un extra. Las pendientes suman cuando un docente las confirma."
      />
      {progreso.isLoading ? <LoadingState /> : progreso.error || !progreso.data ? (
        <ErrorState error={progreso.error} onRetry={() => void progreso.refetch()} />
      ) : (
        <MiProgreso progreso={progreso.data} />
      )}
      <Rankings />
    </Page>
  );
}

function MiProgreso({ progreso: p }: { progreso: Progreso }) {
  const styles = useStyles();
  return (
    <>
      <Card title={`Nivel: ${p.nivel.nombre}`} action={<Badge label={`${p.puntos} puntos`} tono="sano" />}>
        <ProgressBar pct={p.nivel.progreso_pct} />
        <Text style={styles.texto}>
          {p.nivel.siguiente ? `Te faltan ${p.nivel.faltan} puntos para llegar a ${p.nivel.siguiente}.` : 'Llegaste al nivel máximo.'}
          {p.posicion_institucion ? ` Vas en el puesto ${p.posicion_institucion.posicion} de ${p.posicion_institucion.de} en tu institución.` : ''}
        </Text>
      </Card>
      <StatGrid>
        <StatTile label="Racha actual (semanas)" value={p.racha.actual} hint={`mejor racha: ${p.racha.mejor}`} tono="info" />
        <StatTile label="Inspecciones confirmadas" value={p.resumen.confirmadas} hint={`${p.resumen.pendientes} pendientes`} tono="sano" />
        <StatTile label="Árboles registrados" value={p.resumen.arboles_registrados} />
        <StatTile label="Anuladas" value={p.resumen.anuladas} tono={p.resumen.anuladas ? 'riesgo' : undefined} />
      </StatGrid>
      <Card title="Logros">
        <View style={styles.logros}>
          {p.logros.map((l) => (
            <View key={l.codigo} style={[styles.logro, l.obtenido ? styles.logroObtenido : null]}>
              <Text style={[styles.logroNombre, l.obtenido ? styles.logroNombreObtenido : null]}>
                {l.obtenido ? '★ ' : ''}{l.nombre}
              </Text>
              <Text style={styles.texto}>{l.descripcion}</Text>
              {!l.obtenido ? (
                <>
                  <ProgressBar pct={(l.progreso * 100) / l.meta} tono="info" />
                  <Text style={styles.chico}>{l.progreso} de {l.meta}</Text>
                </>
              ) : null}
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

function Rankings() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida();
  const [tipo, setTipo] = useState<FiltroRanking['tipo']>('individual');
  const [rol, setRol] = useState<FiltroRanking['rol']>('estudiante');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [periodo, setPeriodo] = useState<{ desde?: string; hasta?: string }>({});
  const [error, setError] = useState<string>();
  const ranking = useRanking({ tipo, institucionId: institucion.institucionId, rol, ...periodo });

  function aplicar() {
    setError(undefined);
    if ((desde && !fechaIso.safeParse(desde).success) || (hasta && !fechaIso.safeParse(hasta).success)) {
      setError('Usa fechas con formato AAAA-MM-DD.');
      return;
    }
    setPeriodo({ desde: desde || undefined, hasta: hasta || undefined });
  }

  const propio = tipo === 'individual' ? perfil.data?.usuario_id : perfil.data?.curso_id;

  return (
    <Card title="Ranking">
      <Tabs value={tipo} options={[{ label: 'Individual', value: 'individual' }, { label: 'Por curso', value: 'curso' }]} onChange={setTipo} />
      <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} />
      {tipo === 'individual' ? (
        <Tabs
          value={rol}
          options={[{ label: 'Estudiantes', value: 'estudiante' }, { label: 'Docentes', value: 'docente' }, { label: 'Todos', value: 'todos' }]}
          onChange={setRol}
        />
      ) : null}
      <Row>
        <Cell basis={140}><Field label="Desde (opcional)" value={desde} onChangeText={setDesde} placeholder="AAAA-MM-DD" autoCapitalize="none" /></Cell>
        <Cell basis={140}><Field label="Hasta (opcional)" value={hasta} onChangeText={setHasta} placeholder="AAAA-MM-DD" autoCapitalize="none" /></Cell>
      </Row>
      <PrimaryButton title="Aplicar periodo" variant="secondary" onPress={aplicar} />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      {ranking.isLoading ? <LoadingState /> : ranking.error || !ranking.data ? (
        <ErrorState error={ranking.error} onRetry={() => void ranking.refetch()} />
      ) : !ranking.data.filas.length ? (
        <EmptyState title="Sin participantes" text="No hay personas o cursos con este filtro." />
      ) : (
        <>
          {ranking.data.filas.map((f) => (
            <View key={f.id} style={[styles.fila, f.id === propio ? styles.filaPropia : null]}>
              <Text style={styles.posicion}>{f.posicion}</Text>
              <View style={styles.flex}>
                <Text style={styles.nombre}>{f.nombre}{f.id === propio ? ' (tú)' : ''}</Text>
                <Text style={styles.chico}>
                  {tipo === 'individual'
                    ? `${f.nivel ?? ''}${f.curso_nombre ? ` · ${f.curso_nombre}` : ''} · ${f.inspecciones_confirmadas} confirmadas`
                    : `${f.integrantes ?? 0} integrantes · promedio ${f.promedio_por_integrante ?? 0} · ${f.inspecciones_confirmadas} confirmadas`}
                </Text>
              </View>
              <Text style={styles.puntos}>{f.puntos}</Text>
            </View>
          ))}
          {ranking.data.mi_posicion && !ranking.data.filas.some((f) => f.id === propio) ? (
            <Text style={styles.texto}>Tu posición: {ranking.data.mi_posicion.posicion} con {ranking.data.mi_posicion.puntos} puntos.</Text>
          ) : null}
        </>
      )}
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  chico: { color: palette.muted, fontSize: 11 },
  logros: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  logro: { flexGrow: 1, flexBasis: 200, gap: 4, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: palette.line },
  logroObtenido: { borderColor: palette.forest, backgroundColor: palette.tile },
  logroNombre: { color: palette.muted, fontSize: 14, fontWeight: '900' },
  logroNombreObtenido: { color: palette.forest },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: palette.line },
  filaPropia: { backgroundColor: palette.tile, borderRadius: 6 },
  posicion: { width: 28, color: palette.forest, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  flex: { flex: 1 },
  nombre: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  puntos: { color: palette.ink, fontSize: 16, fontWeight: '900' },
}));
