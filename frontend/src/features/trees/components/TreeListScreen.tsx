import { useInfiniteQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { treeKeys } from '@/features/trees/hooks/useCreateTree';
import type { FiltrosInventario, Zona } from '@/features/trees/types';
import { treesService } from '@/features/trees/services/treesService';
import { getApiErrorMessage } from '@/services/api/client';
import type { EstadoArbol } from '@/shared/types/entities';
import { PrimaryButton, Screen, SelectField, Surface } from '@/shared/components/FormControls';

const PAGE_SIZE = 50;
const TODAS = '__todas__';
const zonas: Zona[] = [
  'Patio central',
  'Entrada principal',
  'Zona deportiva',
  'Bloques académicos',
  'Otra',
];
function isZona(value: string): value is Zona {
  return zonas.some((zona) => zona === value);
}
const estados: { label: string; value: EstadoArbol | undefined }[] = [
  { label: 'Todos', value: undefined },
  { label: 'Sanos', value: 'sano' },
  { label: 'En riesgo', value: 'riesgo' },
  { label: 'Críticos', value: 'critico' },
];
const coloresEstado: Record<EstadoArbol, string> = {
  sano: '#15803D',
  riesgo: '#B45309',
  critico: '#B91C1C',
};
const etiquetasEstado: Record<EstadoArbol, string> = {
  sano: 'Sano',
  riesgo: 'En riesgo',
  critico: 'Crítico',
};

export default function TreeListScreen() {
  const catalogs = useCatalogs();
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoArbol>();
  const [institution, setInstitution] = useState<string>();
  const [species, setSpecies] = useState<string>();
  const [zone, setZone] = useState<Zona>();
  const filters = useMemo<FiltrosInventario>(() => ({
    ...(estado ? { estado } : {}),
    ...(institution ? { institucionId: institution } : {}),
    ...(species ? { especie: species } : {}),
    ...(zone ? { zona: zone } : {}),
  }), [estado, institution, species, zone]);
  const inventory = useInfiniteQuery({
    queryKey: treeKeys.list(filters),
    queryFn: ({ pageParam }) => treesService.getAll({
      ...filters,
      limite: PAGE_SIZE,
      desplazamiento: pageParam,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
  });

  const allTrees = inventory.data?.pages.flat() ?? [];
  const searchText = search.trim().toLocaleLowerCase();
  const trees = allTrees.filter((tree) => searchText.length === 0 || [
    tree.codigo,
    tree.nombre_comun,
    tree.nombre_cientifico,
    tree.zona,
    tree.nombre_corto,
  ].some((value) => value.toLocaleLowerCase().includes(searchText)));

  const institutionOptions = [
    { label: 'Todas las instituciones', value: TODAS },
    ...(catalogs.data?.instituciones ?? []).map(({ id, nombre }) => ({ label: nombre, value: id })),
  ];
  const speciesOptions = [
    { label: 'Todas las especies', value: TODAS },
    ...(catalogs.data?.especies ?? []).map(({ nombre_comun, nombre_cientifico }) => ({
      label: `${nombre_comun} (${nombre_cientifico})`,
      value: nombre_comun,
    })),
  ];
  const zoneOptions = [
    { label: 'Todas las zonas', value: TODAS },
    ...zonas.map((value) => ({ label: value, value })),
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>GESTIÓN AMBIENTAL</Text>
            <Text style={styles.title}>Inventario de árboles</Text>
            <Text style={styles.subtitle}>
              Consulta los registros institucionales y filtra por estado, institución, especie o zona.
            </Text>
          </View>
          <View style={styles.headerAction}>
            <PrimaryButton
              title="＋ Registrar árbol"
              onPress={() => router.push('/(app)/trees/new' as Href)}
            />
          </View>
        </View>

        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>Registros cargados</Text>
            <Text style={styles.summaryNumber}>{inventory.isLoading ? '…' : trees.length}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualizar inventario"
            disabled={inventory.isFetching}
            onPress={() => void inventory.refetch()}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshText}>{inventory.isFetching ? 'Actualizando…' : 'Actualizar'}</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Buscar por código, especie o zona"
          placeholderTextColor={palette.muted}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel="Buscar árboles"
          returnKeyType="search"
        />

        <View style={styles.filters}>
          <View style={styles.filter}>
            <SelectField
              label="Institución"
              value={institution ?? TODAS}
              options={institutionOptions}
              onChange={(value) => setInstitution(value === TODAS ? undefined : value)}
              error={catalogs.error ? getApiErrorMessage(catalogs.error) : undefined}
            />
          </View>
          <View style={styles.filter}>
            <SelectField
              label="Especie"
              value={species ?? TODAS}
              options={speciesOptions}
              onChange={(value) => setSpecies(value === TODAS ? undefined : value)}
            />
          </View>
          <View style={styles.filter}>
            <SelectField
              label="Zona"
              value={zone ?? TODAS}
              options={zoneOptions}
              onChange={(value) => setZone(value === TODAS || !isZona(value) ? undefined : value)}
            />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stateFilters}>
          {estados.map((option) => {
            const selected = estado === option.value;
            return (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setEstado(option.value)}
                style={[styles.stateFilter, selected && styles.stateFilterSelected]}
              >
                <Text style={[styles.stateFilterText, selected && styles.stateFilterTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.listHeading}>
          <Text style={styles.sectionTitle}>Árboles</Text>
          <Text style={styles.count}>{trees.length} en pantalla</Text>
        </View>

        {inventory.isLoading ? (
          <View style={styles.message}>
            <ActivityIndicator color={palette.forest} />
            <Text style={styles.messageText}>Cargando inventario desde el servidor…</Text>
          </View>
        ) : inventory.isError ? (
          <View style={styles.message}>
            <Text style={styles.errorTitle}>No se pudo cargar el inventario</Text>
            <Text style={styles.messageText}>{getApiErrorMessage(inventory.error)}</Text>
            <PrimaryButton title="Reintentar" variant="secondary" onPress={() => void inventory.refetch()} />
          </View>
        ) : trees.length === 0 ? (
          <View style={styles.message}>
            <Text style={styles.emptyTitle}>
              {allTrees.length === 0 ? 'Aún no hay árboles registrados' : 'No hay coincidencias'}
            </Text>
            <Text style={styles.messageText}>
              {allTrees.length === 0
                ? 'Registra el primer árbol para comenzar el inventario.'
                : 'Prueba con otro término o cambia los filtros.'}
            </Text>
            {allTrees.length === 0 ? (
              <PrimaryButton title="Registrar árbol" onPress={() => router.push('/(app)/trees/new' as Href)} />
            ) : null}
          </View>
        ) : (
          trees.map((tree) => (
            <Surface key={tree.id}>
              <View style={styles.treeHeader}>
                <View style={styles.treeIcon}><Text style={styles.treeIconText}>T</Text></View>
                <View style={styles.treeInfo}>
                  <Text style={styles.treeName}>{tree.nombre_comun}</Text>
                  <Text style={styles.scientificName}>{tree.nombre_cientifico}</Text>
                  <Text style={styles.code}>{tree.codigo}</Text>
                </View>
                <View style={[styles.status, { backgroundColor: `${coloresEstado[tree.estado]}18` }]}>
                  <Text style={[styles.statusText, { color: coloresEstado[tree.estado] }]}>
                    {etiquetasEstado[tree.estado]}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.details}>
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>Institución</Text>
                  <Text style={styles.detailValue}>{tree.nombre_corto}</Text>
                </View>
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>Zona</Text>
                  <Text style={styles.detailValue}>{tree.zona}{tree.zona_otra ? ` · ${tree.zona_otra}` : ''}</Text>
                </View>
              </View>
              <View style={styles.metrics}>
                <Text style={styles.metric}>Altura: {tree.altura_m} m</Text>
                <Text style={styles.metric}>DAP: {tree.dap_cm} cm</Text>
                <Text style={styles.metric}>Observaciones: {tree.n_observaciones}</Text>
              </View>
            </Surface>
          ))
        )}

        {inventory.hasNextPage ? (
          <PrimaryButton
            title={inventory.isFetchingNextPage ? 'Cargando…' : 'Cargar más árboles'}
            loading={inventory.isFetchingNextPage}
            onPress={() => void inventory.fetchNextPage()}
            variant="secondary"
          />
        ) : null}
        {inventory.isFetching && !inventory.isLoading ? (
          <Text style={styles.note}>Actualizando resultados…</Text>
        ) : null}
        <Text style={styles.footer}>Los códigos son asignados por el sistema y se muestran como solo lectura.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: 850, alignSelf: 'center', gap: 14 },
  // Con espacio, el botón queda a la derecha del título; en teléfonos baja y ocupa todo el ancho.
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 },
  heading: { flexGrow: 3, flexShrink: 1, flexBasis: 360, gap: 6 },
  headerAction: { flexGrow: 1, flexBasis: 200 },
  eyebrow: { color: palette.forest, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: palette.ink, fontSize: 28, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 17, borderRadius: 8, backgroundColor: palette.ink },
  summaryLabel: { color: '#D8E9DB', fontSize: 12 },
  summaryNumber: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  refreshButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 7, backgroundColor: '#FFFFFF' },
  refreshText: { color: palette.forest, fontSize: 12, fontWeight: '800' },
  search: { minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.paper, color: palette.ink, fontSize: 15 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  filter: { flexGrow: 1, flexBasis: 220 },
  stateFilters: { gap: 8, paddingBottom: 4 },
  stateFilter: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  stateFilterSelected: { borderColor: palette.forest, backgroundColor: palette.forest },
  stateFilterText: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  stateFilterTextSelected: { color: palette.paper },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  count: { color: palette.muted, fontSize: 12 },
  message: { alignItems: 'center', gap: 10, padding: 24, borderWidth: 1, borderColor: palette.line, borderRadius: 8, backgroundColor: palette.paper },
  messageText: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  errorTitle: { color: palette.red, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  treeHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  treeIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#E6EFDF' },
  treeIconText: { color: palette.forest, fontSize: 18, fontWeight: '900' },
  treeInfo: { flex: 1 },
  treeName: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  scientificName: { marginTop: 2, color: palette.muted, fontSize: 12, fontStyle: 'italic' },
  code: { marginTop: 4, color: palette.forest, fontSize: 12, fontWeight: '900' },
  status: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 16 },
  statusText: { fontSize: 11, fontWeight: '800' },
  divider: { height: 1, marginVertical: 13, backgroundColor: palette.line },
  details: { flexDirection: 'row', gap: 12 },
  detail: { flex: 1 },
  detailLabel: { color: palette.muted, fontSize: 11 },
  detailValue: { marginTop: 3, color: palette.ink, fontSize: 13, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  metric: { color: palette.muted, fontSize: 11 },
  note: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  footer: { color: palette.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
