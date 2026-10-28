import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useTiposIntervencion } from '@/features/interventions/hooks/useIntervenciones';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useReporte, type Reporte } from '@/features/reports/api';
import { formatFecha, formatMes, formatNumero, formatPesos, formatPorcentaje } from '@/shared/format';
import { fechaIso } from '@/shared/validacion';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import {
  AppHeader,
  Card,
  Cell,
  ErrorState,
  LoadingState,
  Page,
  ProgressBar,
  Row,
  StatGrid,
  StatTile,
  StateBadge,
  Tabs,
} from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const SECCIONES = ['inventario', 'riesgo', 'cobertura', 'productividad', 'intervenciones'] as const;
type Seccion = (typeof SECCIONES)[number];

function esSeccion(valor: string | undefined): valor is Seccion {
  return SECCIONES.some((s) => s === valor);
}
const GRUPOS: Record<string, string> = { follaje: 'Follaje', tronco: 'Tronco y ramas', raiz: 'Raíz', plagas: 'Plagas' };

export function ReportsScreen() {
  const styles = useStyles();
  const institucion = useInstitucionElegida();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [periodo, setPeriodo] = useState<{ desde?: string; hasta?: string }>({});
  const [error, setError] = useState<string>();
  // El inicio puede abrir una sección directamente (/reports?seccion=riesgo).
  const params = useLocalSearchParams<{ seccion?: string }>();
  const [seccion, setSeccion] = useState<Seccion>(() => (esSeccion(params.seccion) ? params.seccion : 'inventario'));
  const reporte = useReporte({ institucionId: institucion.institucionId, ...periodo });

  function aplicar() {
    setError(undefined);
    if ((desde && !fechaIso.safeParse(desde).success) || (hasta && !fechaIso.safeParse(hasta).success)) {
      setError('Usa fechas con formato AAAA-MM-DD.');
      return;
    }
    if (desde && hasta && desde > hasta) {
      setError('La fecha inicial no puede ser posterior a la final.');
      return;
    }
    setPeriodo({ desde: desde || undefined, hasta: hasta || undefined });
  }

  return (
    <Page onRefresh={() => void reporte.refetch()} refreshing={reporte.isFetching && !reporte.isLoading}>
      <AppHeader
        eyebrow="Reportes y análisis"
        title="Indicadores"
        subtitle="Inventario y riesgo se calculan como estaban al cierre del periodo, usando el historial de inspecciones."
      />
      <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} />
      <Row>
        <Cell basis={140}><Field label="Desde" value={desde} onChangeText={setDesde} placeholder="AAAA-MM-DD (1 ene)" autoCapitalize="none" /></Cell>
        <Cell basis={140}><Field label="Hasta" value={hasta} onChangeText={setHasta} placeholder="AAAA-MM-DD (hoy)" autoCapitalize="none" /></Cell>
      </Row>
      <PrimaryButton title="Aplicar periodo" variant="secondary" onPress={aplicar} />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <Tabs
        value={seccion}
        options={[
          { label: 'Inventario', value: 'inventario' },
          { label: 'Riesgo', value: 'riesgo' },
          { label: 'Cobertura', value: 'cobertura' },
          { label: 'Productividad', value: 'productividad' },
          { label: 'Intervenciones', value: 'intervenciones' },
        ]}
        onChange={setSeccion}
      />
      {reporte.isLoading ? <LoadingState text="Calculando indicadores…" /> : reporte.error || !reporte.data ? (
        <ErrorState error={reporte.error} onRetry={() => void reporte.refetch()} />
      ) : (
        <>
          <Text style={styles.texto}>
            Periodo: {formatFecha(reporte.data.periodo.desde)} a {formatFecha(reporte.data.periodo.hasta)}
          </Text>
          {seccion === 'inventario' ? <Inventario r={reporte.data} /> : null}
          {seccion === 'riesgo' ? <Riesgo r={reporte.data} /> : null}
          {seccion === 'cobertura' ? <Cobertura r={reporte.data} /> : null}
          {seccion === 'productividad' ? <Productividad r={reporte.data} /> : null}
          {seccion === 'intervenciones' ? <Intervenciones r={reporte.data} /> : null}
        </>
      )}
    </Page>
  );
}

function Barras({ items, total, sufijo = '' }: { items: { nombre: string; total: number }[]; total: number; sufijo?: string }) {
  const styles = useStyles();
  if (!items.length) return <Text style={styles.texto}>Sin datos.</Text>;
  const maximo = Math.max(total, ...items.map((i) => i.total), 1);
  return (
    <View style={styles.barras}>
      {items.map((i) => (
        <View key={i.nombre} style={styles.barra}>
          <View style={styles.barraHeader}>
            <Text style={styles.barraNombre}>{i.nombre}</Text>
            <Text style={styles.texto}>{i.total}{sufijo}</Text>
          </View>
          <ProgressBar pct={(i.total * 100) / maximo} tono="info" />
        </View>
      ))}
    </View>
  );
}

function Inventario({ r }: { r: Reporte }) {
  const inv = r.inventario;
  return (
    <>
      <StatGrid>
        <StatTile label="Árboles" value={inv.total_arboles} hint={`${inv.registrados_periodo} registrados en el periodo`} />
        <StatTile label="Área de copa" value={`${formatNumero(inv.area_copa_total_m2, 0)} m²`} />
        <StatTile label="CO₂ almacenado" value={`${formatNumero(inv.totales_ambientales.co2_kg, 0)} kg`} tono="sano" />
        <StatTile label="O₂ equivalente" value={`${formatNumero(inv.totales_ambientales.o2_kg, 0)} kg`} />
        <StatTile label="Carbono" value={`${formatNumero(inv.totales_ambientales.carbono_kg, 0)} kg`} />
        <StatTile label="Biomasa" value={`${formatNumero(inv.totales_ambientales.biomasa_total_kg, 0)} kg`} />
      </StatGrid>
      <Card title="Por especie"><Barras items={inv.por_especie.slice(0, 10)} total={inv.total_arboles} /></Card>
      <Card title="Por zona"><Barras items={inv.por_zona} total={inv.total_arboles} /></Card>
      <Card title="Por etapa"><Barras items={inv.por_etapa} total={inv.total_arboles} /></Card>
    </>
  );
}

function Riesgo({ r }: { r: Reporte }) {
  const styles = useStyles();
  const rg = r.riesgo;
  return (
    <>
      <StatGrid>
        <StatTile label="Sanos" value={rg.por_estado.sano} tono="sano" />
        <StatTile label="En riesgo" value={rg.por_estado.riesgo} tono="riesgo" />
        <StatTile label="Críticos" value={rg.por_estado.critico} tono="critico" />
        <StatTile label="En riesgo o críticos" value={formatPorcentaje(rg.pct_riesgo_o_critico)} hint={`puntaje promedio ${formatNumero(rg.puntaje_promedio)}`} />
      </StatGrid>
      <Card title="Hallazgos más frecuentes">
        <Barras items={rg.hallazgos_frecuentes.map((h) => ({ nombre: h.etiqueta, total: h.total }))} total={r.inventario.total_arboles} />
      </Card>
      <Card title="Árboles con hallazgos por grupo">
        <Barras items={rg.arboles_por_grupo.map((g) => ({ nombre: GRUPOS[g.grupo] ?? g.grupo, total: g.total }))} total={r.inventario.total_arboles} />
      </Card>
      <Card title="Interferencia con infraestructura"><Barras items={rg.por_interferencia} total={r.inventario.total_arboles} /></Card>
      <Card title={`Árboles prioritarios (${rg.total_prioritarios})`}>
        {rg.arboles_prioritarios.length ? rg.arboles_prioritarios.map((a) => (
          <View key={a.id} style={styles.fila}>
            <Text style={[styles.link, styles.flex]} accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${a.id}` as Href)}>
              {a.codigo} · {a.nombre_comun} · {a.zona}{a.interferencia && a.interferencia !== 'Ninguna' ? ` · ${a.interferencia}` : ''}
            </Text>
            <StateBadge estado={a.estado} />
          </View>
        )) : <Text style={styles.texto}>No hay árboles críticos ni con interferencias.</Text>}
      </Card>
    </>
  );
}

function Cobertura({ r }: { r: Reporte }) {
  const styles = useStyles();
  const c = r.cobertura;
  return (
    <>
      <StatGrid>
        <StatTile label="Cobertura del periodo" value={formatPorcentaje(c.cobertura_pct)} hint={`${c.arboles_inspeccionados_periodo} de ${r.inventario.total_arboles} árboles`} tono="sano" />
        <StatTile label={`Sin inspección en ${c.dias_revisita} días`} value={c.sin_inspeccion_reciente} tono={c.sin_inspeccion_reciente ? 'riesgo' : undefined} />
        <StatTile label="Inspecciones revisadas" value={formatPorcentaje(c.revision.pct_revisadas)} hint={`${c.revision.pendientes} pendientes`} />
        <StatTile label="Confirmadas de las revisadas" value={formatPorcentaje(c.revision.pct_confirmadas_de_revisadas)}
          hint={`${c.revision.confirmadas} confirmadas · ${c.revision.anuladas} anuladas`} />
      </StatGrid>
      <Card title="Cobertura">
        <ProgressBar pct={c.cobertura_pct} />
        <Text style={styles.texto}>
          Un árbol cuenta como cubierto si tiene al menos una inspección no anulada dentro del periodo.
        </Text>
      </Card>
    </>
  );
}

function Productividad({ r }: { r: Reporte }) {
  const styles = useStyles();
  const p = r.productividad;
  return (
    <>
      <StatGrid>
        <StatTile label="Inspecciones del periodo" value={p.inspecciones_periodo} hint={`${p.registros_nuevos} registros nuevos`} />
        <StatTile label="Confirmadas" value={p.confirmadas} tono="sano" />
        <StatTile label="Pendientes" value={p.pendientes} tono="riesgo" />
        <StatTile label="Tiempo medio de revisión" value={p.horas_promedio_revision == null ? '—' : `${formatNumero(p.horas_promedio_revision, 1)} h`} />
      </StatGrid>
      <Card title="Inspecciones por mes">
        <Barras items={p.por_mes.map((m) => ({ nombre: formatMes(m.mes), total: m.total }))} total={0} />
      </Card>
      <Card title="Por curso"><Barras items={p.por_curso.map((c) => ({ nombre: c.nombre, total: c.total }))} total={0} /></Card>
      <Card title="Inspectores con más registros">
        {p.por_inspector.length ? p.por_inspector.map((i) => (
          <Text key={i.usuario_id ?? i.nombre} style={styles.texto}>
            {i.nombre}: {i.total} inspecciones · {i.confirmadas} confirmadas · {i.anuladas} anuladas
          </Text>
        )) : <Text style={styles.texto}>Sin inspecciones en el periodo.</Text>}
      </Card>
    </>
  );
}

function Intervenciones({ r }: { r: Reporte }) {
  const styles = useStyles();
  const i = r.intervenciones;
  const tipos = useTiposIntervencion();
  const nombre = (codigo: string) => tipos.data?.find((t) => t.codigo === codigo)?.nombre ?? codigo;
  return (
    <>
      <StatGrid>
        <StatTile label="Ejecutadas en el periodo" value={i.ejecutadas_periodo} hint={`${i.arboles_intervenidos} árboles`} tono="sano" />
        <StatTile label="Costo ejecutado" value={formatPesos(i.costo_ejecutado_periodo)} />
        <StatTile label="Programadas" value={i.programadas} hint={`${i.programadas_vencidas} vencidas · ${formatPesos(i.costo_programado)}`} tono={i.programadas_vencidas ? 'riesgo' : 'info'} />
        <StatTile label="Eficacia" value={formatPorcentaje(i.eficacia_pct)} hint="exitosas de las ejecutadas" />
      </StatGrid>
      <Card title="Ejecutadas por tipo">
        {i.por_tipo.length ? i.por_tipo.map((t) => (
          <Text key={t.tipo_codigo} style={styles.texto}>{nombre(t.tipo_codigo)}: {t.total} · {formatPesos(t.costo)}</Text>
        )) : <Text style={styles.texto}>Sin intervenciones ejecutadas en el periodo.</Text>}
      </Card>
      <Card title="Resultados">
        <Barras
          items={[
            { nombre: 'Exitosa', total: i.por_resultado.exitosa },
            { nombre: 'Parcial', total: i.por_resultado.parcial },
            { nombre: 'Sin efecto', total: i.por_resultado.sin_efecto },
          ]}
          total={i.ejecutadas_periodo}
        />
      </Card>
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  texto: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  barras: { gap: 8 },
  barra: { gap: 4 },
  barraHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barraNombre: { color: palette.ink, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  link: { color: palette.forest, fontSize: 13, fontWeight: '800' },
  flex: { flex: 1 },
}));
