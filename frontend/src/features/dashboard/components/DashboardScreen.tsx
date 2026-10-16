import { router, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { getApiErrorMessage } from '@/services/api/client';
import { PrimaryButton, Screen, Surface } from '@/shared/components/FormControls';

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function DashboardScreen() {
  const { stats, recentTrees } = useDashboard();
  const email = useAuthStore((state) => state.session?.email);
  const data = stats.data;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>PROYECTO ÁRBOL</Text>
            <Text style={styles.greeting}>Buenos días</Text>
            <Text style={styles.email}>{email ?? 'Sesión institucional'}</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{email?.[0]?.toUpperCase() ?? 'A'}</Text></View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>INVENTARIO VIVO</Text>
            <Text style={styles.heroTitle}>El campus{ '\n' }también crece.</Text>
            <Text style={styles.heroCaption}>Cada árbol registrado suma conocimiento y cuidado.</Text>
          </View>
          <Text style={styles.heroLeaf}>✳</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Estado del arbolado</Text>
          <Text style={styles.updated}>{stats.isFetching ? 'Actualizando' : 'Datos actuales'}</Text>
        </View>
        {stats.error ? <Text style={styles.error}>{getApiErrorMessage(stats.error)}</Text> : null}
        <View style={styles.metrics}>
          <Metric label="Árboles" value={data?.total ?? 0} />
          <Metric label="Sanos" value={data?.por_estado.sano ?? 0} tone={palette.forest} />
          <Metric label="En riesgo" value={data?.por_estado.riesgo ?? 0} tone={palette.amber} />
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            <PrimaryButton title="＋  Registrar un árbol" onPress={() => router.push('/(app)/trees/new' as Href)} />
          </View>
          <View style={styles.action}>
            <PrimaryButton
              title="Consultar inventario"
              variant="secondary"
              onPress={() => router.push('/(app)/trees' as Href)}
            />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Registros recientes</Text>
          <Text style={styles.count}>{recentTrees.data?.length ?? 0}</Text>
        </View>
        {recentTrees.isLoading ? <Text style={styles.helper}>Cargando registros…</Text> : null}
        {recentTrees.error ? <Text style={styles.error}>{getApiErrorMessage(recentTrees.error)}</Text> : null}
        {(recentTrees.data ?? []).map((tree) => (
          <Surface key={tree.id}>
            <View style={styles.treeRow}>
              <View style={styles.treeGlyph}><Text style={styles.treeGlyphText}>T</Text></View>
              <View style={styles.treeInfo}>
                <Text style={styles.treeCode}>{tree.codigo}</Text>
                <Text style={styles.treeSpecies}>{tree.nombre_comun} · {tree.zona}</Text>
              </View>
              <View style={[styles.status, tree.estado === 'critico' && styles.statusCritical, tree.estado === 'riesgo' && styles.statusRisk]}>
                <Text style={styles.statusText}>{tree.estado === 'sano' ? 'Sano' : tree.estado === 'riesgo' ? 'Riesgo' : 'Crítico'}</Text>
              </View>
            </View>
          </Surface>
        ))}
        {!recentTrees.isLoading && !recentTrees.error && recentTrees.data?.length === 0 ? (
          <Surface><Text style={styles.helper}>Aún no hay árboles registrados en este inventario.</Text></Surface>
        ) : null}
        <Text style={styles.footer}>Universidad Popular del Cesar · Valledupar</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 850, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  kicker: { color: palette.forest, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  greeting: { marginTop: 4, color: palette.ink, fontSize: 25, fontWeight: '900' },
  email: { marginTop: 3, color: palette.muted, fontSize: 13 },
  avatar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: palette.leaf },
  avatarText: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  hero: { minHeight: 178, padding: 20, overflow: 'hidden', flexDirection: 'row', borderRadius: 8, backgroundColor: palette.ink },
  heroCopy: { flex: 1, zIndex: 1 },
  heroEyebrow: { color: palette.leaf, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  heroTitle: { marginTop: 10, color: '#FFFFFF', fontSize: 29, fontWeight: '900', lineHeight: 32 },
  heroCaption: { maxWidth: 250, marginTop: 8, color: '#CFDBD2', fontSize: 13, lineHeight: 18 },
  heroLeaf: { position: 'absolute', right: 6, bottom: -44, color: '#376B4C', fontSize: 190, lineHeight: 190 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  updated: { color: palette.muted, fontSize: 11 },
  count: { color: palette.forest, fontSize: 13, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: 9 },
  metric: { flex: 1, minHeight: 84, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  metricValue: { color: palette.ink, fontSize: 25, fontWeight: '900' },
  metricLabel: { marginTop: 4, color: palette.muted, fontSize: 12, fontWeight: '600' },
  // Botones lado a lado cuando hay espacio; en teléfonos cada uno ocupa su propia fila.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: 240 },
  treeRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  treeGlyph: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF0E3' },
  treeGlyphText: { color: palette.forest, fontWeight: '900', fontSize: 17 },
  treeInfo: { flex: 1 },
  treeCode: { color: palette.ink, fontWeight: '900', fontSize: 14 },
  treeSpecies: { marginTop: 3, color: palette.muted, fontSize: 12 },
  status: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 12, backgroundColor: '#E8F0E6' },
  statusRisk: { backgroundColor: '#F7EBD9' },
  statusCritical: { backgroundColor: '#F6E4E0' },
  statusText: { color: palette.ink, fontSize: 11, fontWeight: '800' },
  helper: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  error: { color: palette.red, fontSize: 13 },
  footer: { marginTop: 12, color: palette.muted, fontSize: 11, textAlign: 'center' },
});