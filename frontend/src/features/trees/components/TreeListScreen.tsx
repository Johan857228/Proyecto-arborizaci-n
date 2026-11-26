import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fonts, layout } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useMiPerfil, useUsuarios } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor } from '@/features/perfil/schemas';
import { RiesgoBadge } from '@/features/riesgo/components/RiesgoBadge';
import { abreAlerta } from '@/features/riesgo/reglas';
import { useColaStore } from '@/features/sincronizacion/colaStore';
import { treeKeys } from '@/features/trees/hooks/useCreateTree';
import type { FiltrosInventario, Zona } from '@/features/trees/types';
import { treesService } from '@/features/trees/services/treesService';
import { nombresDeZonas, useZonas } from '@/features/zonas/api';
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
import { ErrorState, Notice, RevisionBadge } from '@/shared/components/UI';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

const PAGE_SIZE = 50;
const TODAS = '__todas__';
// Espera tras la última tecla antes de buscar en el servidor.
const ESPERA_BUSQUEDA_MS = 400;

/** El texto ya escrito, pero solo cuando la persona deja de teclear un momento. */
function useTextoEstable(texto: string) {
  const [estable, setEstable] = useState(texto);
  useEffect(() => {
    const espera = setTimeout(() => setEstable(texto), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(espera);
  }, [texto]);
  return estable;
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

/** Ancho al que una tarjeta se lee cómoda: nombre, zona y las tres medidas. */
const ANCHO_TARJETA = 268;
const SEPARACION = 14;

/**
 * Cuántas tarjetas caben en [ancho], el espacio que la lista ocupa de verdad.
 *
 * Se mide la fila en pantalla en vez de mirar el ancho de la ventana: así vale
 * igual con el carril de accesos rápidos, con otro margen o cuando se baja el
 * zoom del navegador, que es cuando más sitio sobra. En una pantalla normal
 * salen cuatro —doce de un vistazo sin bajar—, y al alejar el zoom se van
 * repartiendo solas en vez de dejar franjas vacías a los lados.
 */
function columnasPara(ancho: number) {
  if (ancho <= 0) return 1;
  const caben = Math.floor((ancho + SEPARACION) / (ANCHO_TARJETA + SEPARACION));
  // Un tope alto, pero tope: pasadas diez por fila la foto queda tan pequeña
  // que ya no se distingue un árbol de otro.
  return Math.max(1, Math.min(10, caben));
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
        <View style={[styles.coverVeil, gradient('linear-gradient(180deg, rgba(8, 24, 15, 0.3) 0%, rgba(8, 24, 15, 0) 28%, rgba(8, 24, 15, 0) 48%, rgba(8, 24, 15, 0.78) 100%)')]} />
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
      {tree.riesgo_caida && abreAlerta(tree.riesgo_caida) ? <RiesgoBadge categoria={tree.riesgo_caida} /> : null}
      </View>
    </Pressable>
  );
}

export default function TreeListScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  const [anchoLista, setAnchoLista] = useState(0);
  const columnas = columnasPara(anchoLista);
  const espacio = useEspaciado();
  const catalogs = useCatalogs();
  const perfil = useMiPerfil();
  const miId = perfil.data?.usuario_id;
  const admin = esAdmin(perfil.data);
  const revisor = esRevisor(perfil.data);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const busqueda = useTextoEstable(search.trim());
  // El inicio abre el inventario ya filtrado por estado (/trees?estado=critico); al borrar un
  // árbol, la ficha vuelve aquí con su código (/trees?borrado=IE001-0003).
  const { estado: estadoInicial, borrado } = useLocalSearchParams<{ estado?: string; borrado?: string }>();
  const [estado, setEstado] = useState<EstadoArbol | undefined>(() =>
    estadoInicial === 'sano' || estadoInicial === 'riesgo' || estadoInicial === 'critico' ? estadoInicial : undefined,
  );
  const [institution, setInstitution] = useState<string>();
  const [species, setSpecies] = useState<string>();
  const [zone, setZone] = useState<Zona>();
  const [registradoPor, setRegistradoPor] = useState<string>();
  // Las zonas y los alumnos son los de la institución elegida (o la propia).
  const institucionPropia = perfil.data?.institucion_id ?? undefined;
  const institucionInventario = admin ? institution : institucionPropia;
  const institucionDeFiltros = institucionInventario ?? institucionPropia;
  const puedeVer = perfil.isSuccess && (admin || Boolean(institucionPropia));
  const zonas = useZonas(institucionDeFiltros);
  const usuarios = useUsuarios(institucionDeFiltros, revisor && puedeVer);
  const alumnos = (usuarios.data ?? [])
    .filter((u) => u.rol === 'estudiante')
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));
  const filters = useMemo<FiltrosInventario>(() => ({
    ...(estado ? { estado } : {}),
    ...(institucionInventario ? { institucionId: institucionInventario } : {}),
    ...(species ? { especie: species } : {}),
    ...(zone ? { zona: zone } : {}),
    ...(busqueda ? { q: busqueda } : {}),
    ...(registradoPor ? { registradoPor } : {}),
  }), [estado, institucionInventario, species, zone, busqueda, registradoPor]);
  const inventory = useInfiniteQuery({
    queryKey: treeKeys.list(filters),
    queryFn: ({ pageParam }) => treesService.getAll({
      ...filters,
      limite: PAGE_SIZE,
      desplazamiento: pageParam,
    }),
    initialPageParam: 0,
    enabled: puedeVer,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
  });

  // Sin conexión y sin copia guardada en el teléfono, la consulta queda en pausa: no es un inventario vacío.
  const sinDatosSinConexion = inventory.isPending && inventory.fetchStatus === 'paused';
  // Los árboles guardados sin conexión aparecen en la lista cuando se envían.
  const arbolesEnTelefono = useColaStore((estado) => estado.registros.filter((r) => r.tipo === 'arbol' && !r.registroId).length);
  // La búsqueda la hace el servidor sobre todo el inventario, no solo sobre lo ya cargado.
  const trees = inventory.data?.pages.flat() ?? [];
  // Con filtros o búsqueda activos, una lista vacía significa "sin coincidencias", no "inventario vacío".
  const filtering = Boolean(estado || (admin && institution) || species || zone || registradoPor || search.trim());

  function clearFilters() {
    setSearch('');
    setEstado(undefined);
    setInstitution(undefined);
    setSpecies(undefined);
    setZone(undefined);
    setRegistradoPor(undefined);
  }

  function cambiarInstitucion(valor: string | undefined) {
    setInstitution(valor);
    // Las zonas y los alumnos cambian con la institución.
    setZone(undefined);
    if (registradoPor !== miId) setRegistradoPor(undefined);
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
    ...nombresDeZonas(zonas.data).map((value) => ({ label: value, value })),
  ];
  const alumnoOptions = [
    { label: 'Todos los alumnos', value: TODAS },
    ...alumnos.map((u) => ({ label: u.activo ? u.nombre : `${u.nombre} (inactivo)`, value: u.usuario_id })),
  ];
  const misRegistros = Boolean(miId) && registradoPor === miId;

  if (!puedeVer) {
    return (
      <Screen>
        <View style={[styles.content, { paddingHorizontal: espacio.pagina }]}>
          <Text style={styles.title}>Inventario de árboles</Text>
          {perfil.isLoading ? <ActivityIndicator color={palette.forest} /> : perfil.isSuccess ? (
            <>
              <Notice tono="info">Pide a un docente o administrador que te asigne una institución para ver su inventario.</Notice>
              <PrimaryButton title="Actualizar perfil" variant="secondary" compact loading={perfil.isFetching} onPress={() => void perfil.refetch()} />
            </>
          ) : (
            <ErrorState error={perfil.error} onRetry={() => void perfil.refetch()} />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: espacio.pagina, gap: espacio.separacion + 4 }]} keyboardShouldPersistTaps="handled">
        <FadeIn index={0} style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>GESTIÓN AMBIENTAL</Text>
            <Text style={styles.title}>Inventario de árboles</Text>
            <Text style={styles.subtitle}>
              Busca los árboles {admin ? 'de todas las instituciones' : 'de tu institución'} y filtra por estado, especie o zona.
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
            {admin ? (
              <View style={styles.filter}>
                <SelectField
                  label="Institución"
                  value={institution ?? TODAS}
                  options={institutionOptions}
                  onChange={(value) => cambiarInstitucion(value === TODAS ? undefined : value)}
                  error={catalogs.error ? getApiErrorMessage(catalogs.error) : undefined}
                />
              </View>
            ) : null}
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
                onChange={(value) => setZone(value === TODAS ? undefined : value)}
              />
            </View>
            {revisor ? (
              <View style={styles.filter}>
                <SelectField
                  label="Alumno que lo registró"
                  value={registradoPor && !misRegistros ? registradoPor : TODAS}
                  options={alumnoOptions}
                  onChange={(value) => setRegistradoPor(value === TODAS ? undefined : value)}
                  error={usuarios.error ? getApiErrorMessage(usuarios.error) : undefined}
                />
              </View>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stateFilters}>
            {miId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: misRegistros }}
                onPress={() => setRegistradoPor(misRegistros ? undefined : miId)}
                style={[styles.stateFilter, misRegistros && styles.stateFilterSelected]}
              >
                <Text style={[styles.stateFilterText, misRegistros && styles.stateFilterTextSelected]}>Mis registros</Text>
              </Pressable>
            ) : null}
            {miId ? <View style={styles.separador} /> : null}
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
            {inventory.isLoading ? 'Cargando…' : sinDatosSinConexion ? 'Sin conexión' : `${trees.length} ${trees.length === 1 ? 'árbol' : 'árboles'}`}
          </Text>
          {filtering ? (
            <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clear}>
              <Icon name="close" size={16} color={palette.forest} />
              <Text style={styles.clearText}>Limpiar filtros</Text>
            </Pressable>
          ) : null}
        </View>

        {borrado ? <Notice tono="info">Se borró el árbol {borrado} con todo su historial.</Notice> : null}

        {arbolesEnTelefono > 0 ? (
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/(app)/sync' as Href)}>
            <Notice tono="info">
              {arbolesEnTelefono === 1 ? 'Un árbol guardado' : `${arbolesEnTelefono} árboles guardados`} en este teléfono sin conexión: aparecerán aquí cuando se envíen. Toca para ver los registros por enviar.
            </Notice>
          </Pressable>
        ) : null}

        {inventory.isLoading ? (
          <View style={styles.message}>
            <ActivityIndicator color={palette.forest} />
            <Text style={styles.messageText}>Cargando inventario desde el servidor…</Text>
          </View>
        ) : sinDatosSinConexion ? (
          <ErrorState error={undefined} onRetry={() => void inventory.refetch()} />
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
          <View onLayout={(e) => setAnchoLista(e.nativeEvent.layout.width)}>
            <Grid
              items={trees}
              columns={columnas}
              gap={SEPARACION}
              keyOf={(tree) => tree.id}
              renderItem={(tree) => (
                <FadeIn index={2 + trees.indexOf(tree)}>
                  <TreeCard tree={tree} />
                </FadeIn>
              )}
            />
          </View>
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
  content: { width: '100%', maxWidth: layout.maxAppWidth, alignSelf: 'center', padding: 20, paddingTop: 20, paddingBottom: ESPACIO_FINAL, gap: 18 },
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
  stateFilters: { alignItems: 'center', gap: 8 },
  separador: { width: 1, height: 22, marginHorizontal: 2, backgroundColor: palette.line },
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
  cover: { height: 150, backgroundColor: palette.forestSoft },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coverEmptyText: { color: palette.forestDark, fontSize: 12, fontFamily: fonts.semiBold },
  coverVeil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  coverTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  coverBottom: { position: 'absolute', left: 12, right: 12, bottom: 10 },
  cardBody: { gap: 8, padding: 12 },
  treeName: { color: palette.white, fontSize: 16, fontFamily: fonts.extraBold, letterSpacing: -0.2 },
  scientificName: { marginTop: 1, color: '#DCE9DF', fontSize: 11, fontStyle: 'italic' },
  codeChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.92)' },
  code: { color: palette.forestDark, fontSize: 12, fontFamily: fonts.extraBold, letterSpacing: 0.6 },
  details: { flexDirection: 'row', gap: 12 },
  detail: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flex: 1, minWidth: 0 },
  detailLabel: { color: palette.muted, fontSize: 11 },
  detailValue: { marginTop: 1, color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  measures: { flexDirection: 'row', gap: 6 },
  measure: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 10, backgroundColor: palette.tile },
  measureValue: { color: palette.ink, fontSize: 13, fontFamily: fonts.extraBold },
  measureLabel: { marginTop: 1, color: palette.muted, fontSize: 10 },
  inspection: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  inspectionText: { color: palette.muted, fontSize: 11 },
}));
