import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fonts, layout } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { treeKeys } from '@/features/trees/hooks/useCreateTree';
import type { FiltrosInventario, Zona } from '@/features/trees/types';
import { treesService } from '@/features/trees/services/treesService';
import { ESPACIO_FINAL, useEspaciado } from '@/hooks/use-espaciado';
import { useIsWide } from '@/hooks/use-is-wide';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha } from '@/shared/format';
import type { ArbolResumen, EstadoArbol } from '@/shared/types/entities';
import { InlineMessage, PrimaryButton, Screen, SelectField } from '@/shared/components/FormControls';
import { Grid } from '@/shared/components/Grid';
import { Icon, type IconName } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { RevisionBadge } from '@/shared/components/UI';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

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

function Detail({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.detail}>
      <Icon name={icon} size={16} color={palette.muted} />
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function TreeCard({ tree }: { tree: ArbolResumen }) {
  const styles = useStyles();
  const { palette, gradients } = useTema();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Ver ficha de ${tree.codigo}`}
      onPress={() => router.push(`/(app)/trees/${tree.id}` as Href)}
      style={({ pressed }) => [styles.treeCard, pressed && styles.pressed]}
    >
      {/* La foto general más reciente es la portada; sin foto queda el ícono sobre el degradado. */}
      <View style={styles.cover}>
        {tree.foto_url ? (
          <Image
            source={{ uri: tree.foto_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            accessibilityLabel={`Foto de ${tree.nombre_comun} ${tree.codigo}`}
          />
        ) : (
          <View style={[styles.coverEmpty, gradient(gradients.lime)]}>
            <Icon name="tree" size={44} color={palette.forestDark} />
            <Text style={styles.coverEmptyText}>Sin foto todavía</Text>
          </View>
        )}
        <View style={[styles.coverVeil, gradient('linear-gradient(180deg, rgba(8, 24, 15, 0.25) 0%, rgba(8, 24, 15, 0) 35%, rgba(8, 24, 15, 0.8) 100%)')]} />
        <View style={styles.coverTop}>
          <View style={styles.codeChip}>
            <Text style={styles.code}>{tree.codigo}</Text>
          </View>
          <StatusBadge estado={tree.estado} />
        </View>
        <View style={styles.coverBottom}>
          <Text style={styles.treeName} numberOfLines={1}>{tree.nombre_comun}</Text>
          <Text style={styles.scientificName} numberOfLines={1}>{tree.nombre_cientifico}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
      <View style={styles.details}>
        <Detail icon="building" label="Institución" value={tree.nombre_corto} />
        <Detail icon="location" label="Zona" value={`${tree.zona}${tree.zona_otra ? ` · ${tree.zona_otra}` : ''}`} />
      </View>
      <View style={styles.measures}>
        <View style={styles.measure}>
          <Text style={styles.measureValue}>{tree.altura_m} m</Text>
          <Text style={styles.measureLabel}>Altura</Text>
        </View>
        <View style={styles.measure}>
          <Text style={styles.measureValue}>{tree.dap_cm} cm</Text>
          <Text style={styles.measureLabel}>DAP</Text>
        </View>
        <View style={styles.measure}>
          <Text style={styles.measureValue}>{tree.n_observaciones}</Text>
          <Text style={styles.measureLabel}>Observaciones</Text>
        </View>
      </View>
      {tree.ultima_inspeccion_en ? (
        <View style={styles.inspection}>
          <Icon name="calendar" size={14} color={palette.muted} />
          <Text style={styles.inspectionText}>Última inspección: {formatFecha(tree.ultima_inspeccion_en)}</Text>
          {tree.ultima_revision === 'pendiente' ? <RevisionBadge estado="pendiente" /> : null}
        </View>
      ) : null}
      </View>
    </Pressable>
  );
}

export default function TreeListScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  const espacio = useEspaciado();
  const catalogs = useCatalogs();
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  // El inicio abre el inventario ya filtrado por estado (/trees?estado=critico).
  const { estado: estadoInicial } = useLocalSearchParams<{ estado?: string }>();
  const [estado, setEstado] = useState<EstadoArbol | undefined>(() =>
    estadoInicial === 'sano' || estadoInicial === 'riesgo' || estadoInicial === 'critico' ? estadoInicial : undefined,
  );
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
  // Con filtros o búsqueda activos, una lista vacía significa "sin coincidencias", no "inventario vacío".
  const filtering = Object.keys(filters).length > 0 || searchText.length > 0;

  function clearFilters() {
    setSearch('');
    setEstado(undefined);
    setInstitution(undefined);
    setSpecies(undefined);
    setZone(undefined);
  }

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
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: espacio.pagina, gap: espacio.separacion + 4 }]} keyboardShouldPersistTaps="handled">
        <FadeIn index={0} style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>GESTIÓN AMBIENTAL</Text>
            <Text style={styles.title}>Inventario de árboles</Text>
            <Text style={styles.subtitle}>
              Consulta los registros institucionales y filtra por estado, institución, especie o zona.
              Toca un árbol para ver su ficha, su historial de inspecciones y sus intervenciones.
            </Text>
          </View>
          <View style={styles.headerAction}>
            <PrimaryButton
              title="Registrar árbol"
              icon="add"
              onPress={() => router.navigate('/(app)/trees/new' as Href)}
            />
          </View>
        </FadeIn>

        <FadeIn index={1} style={styles.toolbar}>
          <View style={styles.searchRow}>
            <View style={[styles.search, searchFocused && styles.searchFocused]}>
              <Icon name="search" size={20} color={palette.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por código, especie o zona"
                placeholderTextColor={palette.placeholder}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                accessibilityLabel="Buscar árboles"
                returnKeyType="search"
              />
              {search.length > 0 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setSearch('')}>
                  <Icon name="close" size={18} color={palette.muted} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Actualizar inventario"
              disabled={inventory.isFetching}
              onPress={() => void inventory.refetch()}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              {inventory.isFetching ? (
                <ActivityIndicator size="small" color={palette.forest} />
              ) : (
                <Icon name="refresh" size={20} color={palette.forest} />
              )}
            </Pressable>
          </View>

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
        </FadeIn>

        <View style={styles.listHeading}>
          <Text style={styles.sectionTitle}>
            {inventory.isLoading ? 'Cargando…' : `${trees.length} ${trees.length === 1 ? 'árbol' : 'árboles'}`}
          </Text>
          {filtering ? (
            <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clear}>
              <Icon name="close" size={16} color={palette.forest} />
              <Text style={styles.clearText}>Limpiar filtros</Text>
            </Pressable>
          ) : null}
        </View>

        {inventory.isLoading ? (
          <View style={styles.message}>
            <ActivityIndicator color={palette.forest} />
            <Text style={styles.messageText}>Cargando inventario desde el servidor…</Text>
          </View>
        ) : inventory.isError ? (
          <View style={styles.message}>
            <View style={[styles.messageIcon, { backgroundColor: palette.redSoft }]}>
              <Icon name="error" size={26} color={palette.red} />
            </View>
            <Text style={styles.messageTitle}>No se pudo cargar el inventario</Text>
            <Text style={styles.messageText}>{getApiErrorMessage(inventory.error)}</Text>
            <PrimaryButton title="Reintentar" icon="refresh" variant="secondary" onPress={() => void inventory.refetch()} />
          </View>
        ) : trees.length === 0 ? (
          <View style={styles.message}>
            <View style={styles.messageIcon}>
              <Icon name={filtering ? 'search' : 'tree'} size={26} color={palette.forest} />
            </View>
            <Text style={styles.messageTitle}>
              {filtering ? 'No hay coincidencias' : 'Aún no hay árboles registrados'}
            </Text>
            <Text style={styles.messageText}>
              {filtering
                ? 'Prueba con otro término o cambia los filtros.'
                : 'Registra el primer árbol para comenzar el inventario.'}
            </Text>
            {filtering ? (
              <PrimaryButton title="Limpiar filtros" icon="close" variant="secondary" onPress={clearFilters} />
            ) : (
              <PrimaryButton title="Registrar árbol" icon="add" onPress={() => router.navigate('/(app)/trees/new' as Href)} />
            )}
          </View>
        ) : (
          <Grid
            items={trees}
            columns={isWide ? 2 : 1}
            gap={16}
            keyOf={(tree) => tree.id}
            renderItem={(tree) => (
              <FadeIn index={2 + trees.indexOf(tree)}>
                <TreeCard tree={tree} />
              </FadeIn>
            )}
          />
        )}

        {inventory.hasNextPage ? (
          <PrimaryButton
            title={inventory.isFetchingNextPage ? 'Cargando…' : 'Cargar más árboles'}
            loading={inventory.isFetchingNextPage}
            onPress={() => void inventory.fetchNextPage()}
            variant="secondary"
          />
        ) : null}
        <InlineMessage tone="info">Los códigos son asignados por el sistema y se muestran como solo lectura.</InlineMessage>
      </ScrollView>
    </Screen>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: 20, paddingTop: 20, paddingBottom: ESPACIO_FINAL, gap: 18 },
  // Con espacio, el botón queda a la derecha del título; en teléfonos baja y ocupa todo el ancho.
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 },
  heading: { flexGrow: 3, flexShrink: 1, flexBasis: 360, gap: 6 },
  headerAction: { flexGrow: 1, flexBasis: 200, maxWidth: 260 },
  eyebrow: { color: palette.forest, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1.4 },
  title: { color: palette.ink, fontSize: 28, fontFamily: fonts.extraBold, letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  toolbar: { gap: 12, padding: 14, ...card },
  searchRow: { flexDirection: 'row', gap: 10 },
  search: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 12, backgroundColor: palette.tile },
  searchFocused: { borderColor: palette.forest, backgroundColor: palette.paper, boxShadow: '0 0 0 3px rgba(27, 107, 74, 0.15)' },
  searchInput: { flex: 1, minHeight: 48, color: palette.ink, fontSize: 15, outlineWidth: 0 },
  iconButton: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  pressed: { opacity: 0.75 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  filter: { flexGrow: 1, flexBasis: 220 },
  stateFilters: { gap: 8 },
  stateFilter: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  stateFilterSelected: { borderColor: palette.forest, backgroundColor: palette.forest },
  stateFilterText: { color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  stateFilterTextSelected: { color: palette.paper },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontFamily: fonts.extraBold },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearText: { color: palette.forest, fontSize: 13, fontFamily: fonts.bold },
  message: { alignItems: 'center', gap: 10, padding: 28, ...card },
  messageIcon: { width: 56, height: 56, marginBottom: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: palette.forestSoft },
  messageTitle: { color: palette.ink, fontSize: 17, fontFamily: fonts.extraBold, textAlign: 'center' },
  messageText: { maxWidth: 360, color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  treeCard: { overflow: 'hidden', ...card },
  cover: { height: 190, backgroundColor: palette.forestSoft },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coverEmptyText: { color: palette.forestDark, fontSize: 12, fontFamily: fonts.semiBold },
  coverVeil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  coverTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  coverBottom: { position: 'absolute', left: 16, right: 16, bottom: 12 },
  cardBody: { gap: 12, padding: 14 },
  treeName: { color: palette.white, fontSize: 19, fontFamily: fonts.extraBold, letterSpacing: -0.2 },
  scientificName: { marginTop: 2, color: '#DCE9DF', fontSize: 13, fontStyle: 'italic' },
  codeChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.92)' },
  code: { color: palette.forestDark, fontSize: 12, fontFamily: fonts.extraBold, letterSpacing: 0.6 },
  details: { flexDirection: 'row', gap: 12 },
  detail: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flex: 1, minWidth: 0 },
  detailLabel: { color: palette.muted, fontSize: 11 },
  detailValue: { marginTop: 1, color: palette.ink, fontSize: 14, fontFamily: fonts.semiBold },
  measures: { flexDirection: 'row', gap: 8 },
  measure: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: palette.tile },
  measureValue: { color: palette.ink, fontSize: 15, fontFamily: fonts.extraBold },
  measureLabel: { marginTop: 2, color: palette.muted, fontSize: 11 },
  inspection: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  inspectionText: { color: palette.muted, fontSize: 12 },
}));
