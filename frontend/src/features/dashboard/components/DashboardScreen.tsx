import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { chartColors, fonts, gradients, layout, palette, shadows } from '@/config/constants';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { useMiProgreso } from '@/features/gamification/api';
import { modulosPara } from '@/features/modules/modulos';
import { useCuentasSinInstitucion, useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { ETIQUETA_ROL, esAdmin, esRevisor } from '@/features/perfil/schemas';
import { useIsWide } from '@/hooks/use-is-wide';
import { getApiErrorMessage } from '@/services/api/client';
import { saludo } from '@/shared/format';
import { DonutChart, type DonutSlice } from '@/shared/components/DonutChart';
import { InlineMessage, PrimaryButton, Screen } from '@/shared/components/FormControls';
import { Grid } from '@/shared/components/Grid';
import { Icon, type IconName } from '@/shared/components/Icon';
import { AnimatedNumber, FadeIn, FloatingLeaf, Shimmer, usePressScale } from '@/shared/components/Motion';
import { StatusBadge, estadoArbol } from '@/shared/components/StatusBadge';
import { Badge, NavCard, ProgressBar, RevisionBadge } from '@/shared/components/UI';
import { gradient } from '@/shared/styles/gradient';
import type { EstadoArbol } from '@/shared/types/entities';

const numberFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

function formatMass(kg: number) {
  return kg >= 1000 ? `${numberFormat.format(kg / 1000)} t` : `${numberFormat.format(kg)} kg`;
}

const estadoIcon: Record<EstadoArbol, IconName> = { sano: 'checkCircle', riesgo: 'warning', critico: 'error' };
const ETAPAS = ['Plántula', 'Juvenil', 'Adulto', 'Senescente'] as const;

/** Las 4 categorías más grandes con color propio; el resto se agrupa en "Otras" (gris). */
function topConOtras(items: { key: string; label: string; value: number }[]): DonutSlice[] {
  const ordenados = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const principales = ordenados.slice(0, chartColors.categorical.length);
  const resto = ordenados.slice(chartColors.categorical.length).reduce((sum, item) => sum + item.value, 0);
  return [
    ...principales.map((item, index) => ({ ...item, color: chartColors.categorical[index] })),
    ...(resto > 0 ? [{ key: 'otras', label: 'Otras', value: resto, color: chartColors.other }] : []),
  ];
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function Card({ title, icon, action, children }: { title: string; icon: IconName; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, gradient(gradients.canopy)]}><Icon name={icon} size={18} color={palette.paper} /></View>
        <Text style={styles.cardTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function HeroButton({ title, icon, onPress, variant }: { title: string; icon: IconName; onPress: () => void; variant: 'solid' | 'outline' }) {
  const solid = variant === 'solid';
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.heroButton, solid ? styles.heroButtonSolid : styles.heroButtonOutline]}
      >
        {solid ? <Shimmer /> : null}
        <Icon name={icon} size={18} color={solid ? palette.forestDark : palette.paper} />
        <Text style={[styles.heroButtonText, { color: solid ? palette.forestDark : palette.paper }]}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function DashboardScreen() {
  const isWide = useIsWide();
  const { stats, recentTrees } = useDashboard();
  const perfil = useMiPerfil();
  const progreso = useMiProgreso();
  const data = stats.data;
  const revisor = esRevisor(perfil.data);
  const primerNombre = perfil.data?.nombre.split(' ')[0];
  const pendientes = data?.inspecciones_pendientes ?? 0;
  const modulos = modulosPara(perfil.data);
  const cuentasNuevas = useCuentasSinInstitucion(esAdmin(perfil.data));
  const counts: Record<EstadoArbol, number> = {
    sano: data?.por_estado.sano ?? 0,
    riesgo: data?.por_estado.riesgo ?? 0,
    critico: data?.por_estado.critico ?? 0,
  };
  const totalEstados = counts.sano + counts.riesgo + counts.critico;

  const metrics: { key: string; label: string; value: number; icon: IconName; color: string; background: string }[] = [
    { key: 'total', label: 'Árboles registrados', value: data?.total ?? 0, icon: 'tree', color: palette.forestDark, background: '#E1EDDF' },
    { key: 'sano', label: 'Sanos', value: counts.sano, icon: 'checkCircle', color: palette.forest, background: palette.forestSoft },
    { key: 'riesgo', label: 'En riesgo', value: counts.riesgo, icon: 'warning', color: palette.amber, background: palette.amberSoft },
    { key: 'critico', label: 'Críticos', value: counts.critico, icon: 'error', color: palette.red, background: palette.redSoft },
  ];

  const distribucion: { key: string; title: string; icon: IconName; centerLabel: string; slices: DonutSlice[] }[] = [
    {
      key: 'especies',
      title: 'Especies registradas',
      icon: 'tree',
      centerLabel: 'árboles',
      slices: topConOtras((data?.especies_frecuentes ?? []).map((item) => ({ key: item.nombre_comun, label: item.nombre_comun, value: item.total }))),
    },
    {
      key: 'etapas',
      title: 'Etapa de desarrollo',
      icon: 'trending',
      centerLabel: 'árboles',
      slices: ETAPAS.map((etapa, index) => ({ key: etapa, label: etapa, value: data?.por_etapa[etapa] ?? 0, color: chartColors.etapas[index] })),
    },
    {
      key: 'instituciones',
      title: 'Por institución',
      icon: 'building',
      centerLabel: 'árboles',
      slices: topConOtras((data?.por_institucion ?? []).map((item) => ({ key: item.prefijo, label: item.nombre_corto, value: item.total }))),
    },
  ];

  const ambiental = data?.totales_ambientales;
  const impact: { key: string; label: string; value: number | undefined; icon: IconName; color: string; background: string }[] = [
    { key: 'co2', label: 'CO₂ capturado', value: ambiental?.co2_kg, icon: 'co2', color: palette.forest, background: palette.forestSoft },
    { key: 'o2', label: 'O₂ producido', value: ambiental?.o2_kg, icon: 'air', color: palette.sky, background: palette.skySoft },
    { key: 'biomasa', label: 'Biomasa total', value: ambiental?.biomasa_total_kg, icon: 'biomass', color: palette.clay, background: palette.claySoft },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeIn index={0} style={styles.pageHeader}>
          <Text style={styles.greeting}>{saludo()}{primerNombre ? `, ${primerNombre}` : ''}</Text>
          <Text style={styles.pageSubtitle}>Este es el estado del arbolado de tu institución.</Text>
          {perfil.data ? (
            <View style={styles.badges}>
              <Badge label={ETIQUETA_ROL[perfil.data.rol]} tono="info" />
              {perfil.data.institucion_nombre ? <Badge label={perfil.data.institucion_nombre} /> : null}
              {perfil.data.curso_nombre ? <Badge label={`Curso ${perfil.data.curso_nombre}`} /> : null}
            </View>
          ) : null}
        </FadeIn>
        {perfil.error ? <InlineMessage>{getApiErrorMessage(perfil.error)}</InlineMessage> : null}
        {perfil.data && !perfil.data.institucion_id ? (
          <InlineMessage tone="info">
            Tu cuenta aún no tiene institución asignada. Pídele al administrador que te la asigne para entrar a un curso y aparecer en el ranking de tu institución.
          </InlineMessage>
        ) : null}

        <FadeIn index={1} style={[styles.hero, isWide && styles.heroWide]}>
          {/* Foto del campus con un velo verde para que el texto se lea bien. */}
          <Image
            source={require('@/assets/images/login-campus-upc.jpg')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition={isWide ? 'right center' : 'center'}
            accessibilityLabel="Letrero Yo amo UPC en el campus"
          />
          <View style={[styles.heroVeil, gradient(isWide ? gradients.heroWide : gradients.heroNarrow)]} />
          <FloatingLeaf size={220} color={palette.leaf} opacity={0.14} style={{ left: -90, bottom: -110 }} />
          <View style={styles.heroCopy}>
            <View style={styles.heroPlace}>
              <Icon name="location" size={14} color={palette.leaf} />
              <Text style={styles.heroPlaceText}>Campus UPC · Valledupar</Text>
            </View>
            <Text style={styles.heroEyebrow}>INVENTARIO VIVO</Text>
            <Text style={[styles.heroTitle, isWide && styles.heroTitleWide]}>El campus también crece.</Text>
            <Text style={styles.heroCaption}>Cada árbol registrado suma conocimiento y cuidado para la comunidad educativa.</Text>
          </View>
          <View style={[styles.heroActions, isWide && styles.heroActionsWide]}>
            <HeroButton title="Registrar árbol" icon="add" variant="solid" onPress={() => router.navigate('/(app)/trees/new' as Href)} />
            <HeroButton title="Ver inventario" icon="list" variant="outline" onPress={() => router.navigate('/(app)/trees' as Href)} />
          </View>
        </FadeIn>

        {stats.error ? <InlineMessage>{getApiErrorMessage(stats.error)}</InlineMessage> : null}

        <Grid
          items={metrics}
          columns={isWide ? 4 : 2}
          keyOf={(metric) => metric.key}
          renderItem={(metric) => (
            <FadeIn index={2 + metrics.indexOf(metric)} style={[styles.metric, gradient(`linear-gradient(160deg, ${metric.background} 0%, #FFFFFF 60%)`)]}>
              <View style={[styles.metricIcon, { backgroundColor: metric.color }]}>
                <Icon name={metric.icon} size={20} color={palette.paper} />
              </View>
              {stats.isLoading ? (
                <Text style={styles.metricValue}>—</Text>
              ) : (
                <AnimatedNumber value={metric.value} style={styles.metricValue} />
              )}
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </FadeIn>
          )}
        />

        <FadeIn index={6} style={[styles.columns, isWide && styles.columnsWide]}>
          {revisor ? (
            <View style={[styles.column, isWide && styles.columnWide]}>
              <Card title="Revisión de inspecciones" icon="review">
                <Text style={styles.activityValue}>{stats.isLoading ? '—' : pendientes}</Text>
                <Text style={styles.activityText}>
                  {pendientes === 1 ? 'inspección espera revisión' : 'inspecciones esperan revisión'}. Al confirmarlas
                  cuentan en los reportes y suman puntos a quien las hizo.
                </Text>
                <PrimaryButton
                  title={pendientes > 0 ? 'Revisar ahora' : 'Ver revisión'}
                  icon="review"
                  variant={pendientes > 0 ? 'primary' : 'secondary'}
                  compact
                  onPress={() => router.navigate('/(app)/review' as Href)}
                />
              </Card>
            </View>
          ) : null}
          <View style={[styles.column, isWide && styles.columnWide]}>
            <Card
              title="Tu progreso"
              icon="trophy"
              action={(
                <Pressable accessibilityRole="link" onPress={() => router.navigate('/(app)/progress' as Href)} style={styles.cardAction}>
                  <Text style={styles.cardActionText}>Ver detalle</Text>
                  <Icon name="chevronRight" size={16} color={palette.forest} />
                </Pressable>
              )}
            >
              {progreso.data ? (
                <>
                  <Text style={styles.activityTitle}>{progreso.data.nivel.nombre} · {progreso.data.puntos} puntos</Text>
                  <ProgressBar pct={progreso.data.nivel.progreso_pct} />
                  <Text style={styles.activityText}>
                    {progreso.data.nivel.siguiente
                      ? `${progreso.data.nivel.faltan} puntos para ${progreso.data.nivel.siguiente}`
                      : 'Nivel máximo alcanzado'}
                    {` · Racha: ${progreso.data.racha.actual} semana(s)`}
                    {progreso.data.resumen.pendientes ? ` · ${progreso.data.resumen.pendientes} inspección(es) esperando revisión` : ''}
                  </Text>
                </>
              ) : progreso.error ? (
                <InlineMessage>{getApiErrorMessage(progreso.error)}</InlineMessage>
              ) : (
                <Text style={styles.activityText}>Cargando tu progreso…</Text>
              )}
            </Card>
          </View>
        </FadeIn>

        <FadeIn index={7} style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Módulos</Text>
          <Text style={styles.sectionCaption}>Inspecciones, mantenimiento, cursos, reportes y gestión de la institución.</Text>
        </FadeIn>
        <FadeIn index={8} style={styles.modules}>
          {modulos.map((modulo) => (
            <NavCard
              key={modulo.clave}
              title={modulo.titulo}
              text={modulo.texto}
              href={modulo.href}
              icon={modulo.icono}
              badge={modulo.clave === 'revision' ? pendientes : modulo.clave === 'usuarios' ? cuentasNuevas : undefined}
            />
          ))}
        </FadeIn>

        <FadeIn index={9} style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Distribución del arbolado</Text>
          <Text style={styles.sectionCaption}>Pasa el cursor o toca una porción para ver su detalle.</Text>
        </FadeIn>
        <Grid
          items={distribucion}
          columns={isWide ? 3 : 1}
          gap={20}
          keyOf={(chart) => chart.key}
          renderItem={(chart) => (
            <FadeIn index={10 + distribucion.indexOf(chart)} style={styles.chartCard}>
              <Card title={chart.title} icon={chart.icon}>
                <DonutChart slices={chart.slices} centerLabel={chart.centerLabel} size={150} thickness={20} delay={400 + distribucion.indexOf(chart) * 150} />
              </Card>
            </FadeIn>
          )}
        />

        <FadeIn index={13} style={[styles.columns, isWide && styles.columnsWide]}>
          <View style={[styles.column, isWide && styles.columnWide]}>
            <Card title="Salud del arbolado" icon="trending">
              <DonutChart
                centerLabel={totalEstados === 1 ? 'árbol evaluado' : 'árboles evaluados'}
                slices={(Object.keys(counts) as EstadoArbol[]).map((estado) => ({
                  key: estado,
                  label: estadoArbol[estado].label,
                  value: counts[estado],
                  color: estadoArbol[estado].color,
                  icon: estadoIcon[estado],
                }))}
              />
            </Card>

            <Card title="Impacto ambiental" icon="leaf">
              <View style={styles.impact}>
                {impact.map((item) => (
                  <View key={item.key} style={[styles.impactItem, { backgroundColor: item.background }]}>
                    <View style={[styles.impactIcon, { backgroundColor: item.color }]}>
                      <Icon name={item.icon} size={18} color={palette.paper} />
                    </View>
                    {item.value == null ? (
                      <Text style={styles.impactValue}>—</Text>
                    ) : (
                      <AnimatedNumber value={item.value} format={formatMass} duration={1400} style={[styles.impactValue, { color: item.color }]} />
                    )}
                    <Text style={styles.impactLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.note}>Estimaciones calculadas con las medidas registradas de cada árbol.</Text>
            </Card>
          </View>

          <View style={[styles.column, isWide && styles.columnWide]}>
            <Card
              title="Registros recientes"
              icon="calendar"
              action={(
                <Pressable accessibilityRole="link" onPress={() => router.navigate('/(app)/trees' as Href)} style={styles.cardAction}>
                  <Text style={styles.cardActionText}>Ver todo</Text>
                  <Icon name="chevronRight" size={16} color={palette.forest} />
                </Pressable>
              )}
            >
              {recentTrees.isLoading ? <Text style={styles.helper}>Cargando registros…</Text> : null}
              {recentTrees.error ? <InlineMessage>{getApiErrorMessage(recentTrees.error)}</InlineMessage> : null}
              {(recentTrees.data ?? []).map((tree, index) => (
                <FadeIn key={tree.id} index={14 + index} style={index > 0 ? styles.treeRowDivider : undefined}>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Ver ficha de ${tree.codigo}`}
                    onPress={() => router.push(`/(app)/trees/${tree.id}` as Href)}
                    style={({ pressed }) => [styles.treeRow, pressed && styles.pressed]}
                  >
                    {tree.foto_url ? (
                      <Image source={{ uri: tree.foto_url }} style={styles.treeThumb} contentFit="cover" transition={150} />
                    ) : (
                      <View style={[styles.treeGlyph, gradient(gradients.lime)]}><Icon name="tree" size={20} color={palette.forestDark} /></View>
                    )}
                    <View style={styles.treeInfo}>
                      <Text style={styles.treeCode}>{tree.codigo}</Text>
                      <Text style={styles.treeSpecies} numberOfLines={1}>{tree.nombre_comun} · {tree.zona}</Text>
                      {tree.ultima_revision === 'pendiente' ? <RevisionBadge estado="pendiente" /> : null}
                    </View>
                    <View style={styles.treeMeta}>
                      <StatusBadge estado={tree.estado} />
                      <Text style={styles.treeDate}>{formatDate(tree.registrado_en)}</Text>
                    </View>
                  </Pressable>
                </FadeIn>
              ))}
              {!recentTrees.isLoading && !recentTrees.error && recentTrees.data?.length === 0 ? (
                <View style={styles.empty}>
                  <Icon name="tree" size={28} color={palette.muted} />
                  <Text style={styles.helper}>Aún no hay árboles registrados en este inventario.</Text>
                </View>
              ) : null}
            </Card>
          </View>
        </FadeIn>

        <Text style={styles.footer}>Universidad Popular del Cesar · Valledupar</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 20 },
  pageHeader: { gap: 4 },
  greeting: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.6 },
  pageSubtitle: { color: palette.muted, fontSize: 15 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  activityValue: { color: palette.ink, fontSize: 30, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  activityTitle: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
  activityText: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  modules: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  hero: { gap: 20, padding: 24, paddingTop: 140, overflow: 'hidden', borderRadius: 24, backgroundColor: palette.forestDark, boxShadow: shadows.raised },
  heroVeil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  heroPlace: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.18)' },
  heroPlaceText: { color: palette.paper, fontSize: 12, fontFamily: fonts.semiBold },
  heroWide: { minHeight: 280, flexDirection: 'row', alignItems: 'flex-end', padding: 36, paddingTop: 72 },
  heroCopy: { flex: 1, gap: 8 },
  heroEyebrow: { color: palette.leaf, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1.5 },
  heroTitle: { color: palette.paper, fontSize: 28, fontFamily: fonts.extraBold, lineHeight: 34, letterSpacing: -0.6 },
  heroTitleWide: { fontSize: 34, lineHeight: 40 },
  heroCaption: { maxWidth: 440, color: '#DCE9DF', fontSize: 14, lineHeight: 21 },
  heroActions: { gap: 10 },
  heroActionsWide: { flexDirection: 'row' },
  heroButton: { minHeight: 46, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 12 },
  heroButtonSolid: { backgroundColor: palette.leaf },
  heroButtonOutline: { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)' },
  heroButtonText: { fontSize: 15, fontFamily: fonts.bold },
  pressed: { opacity: 0.8 },
  metric: { gap: 4, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, boxShadow: shadows.card },
  metricIcon: { width: 38, height: 38, marginBottom: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  metricValue: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  metricLabel: { color: palette.muted, fontSize: 13, fontWeight: '500' },
  sectionHeading: { gap: 2, marginTop: 4 },
  sectionTitle: { color: palette.ink, fontSize: 20, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
  sectionCaption: { color: palette.muted, fontSize: 13 },
  chartCard: { flex: 1 },
  columns: { gap: 20 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { gap: 20 },
  columnWide: { flex: 1 },
  card: { gap: 16, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, boxShadow: shadows.card },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.forestSoft },
  cardTitle: { flex: 1, color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
  cardAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardActionText: { color: palette.forest, fontSize: 13, fontFamily: fonts.bold },
  impact: { flexDirection: 'row', gap: 10 },
  impactItem: { flex: 1, gap: 6, padding: 14, borderRadius: 14 },
  impactIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  impactValue: { fontSize: 18, fontFamily: fonts.extraBold },
  impactLabel: { color: palette.muted, fontSize: 12, lineHeight: 16 },
  note: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  treeRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  treeRowDivider: { borderTopWidth: 1, borderTopColor: palette.line },
  treeGlyph: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.forestSoft },
  treeThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: palette.forestSoft },
  treeInfo: { flex: 1, minWidth: 0 },
  treeCode: { color: palette.ink, fontFamily: fonts.bold, fontSize: 14 },
  treeSpecies: { marginTop: 2, color: palette.muted, fontSize: 13 },
  treeMeta: { alignItems: 'flex-end', gap: 4 },
  treeDate: { color: palette.muted, fontSize: 11 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  helper: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footer: { marginTop: 4, color: palette.muted, fontSize: 12, textAlign: 'center' },
});
