import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { fonts, layout } from '@/config/constants';
import { Distribucion, EstadoArbolado, Impacto, MetasEnCurso, Recientes } from '@/features/dashboard/components/Panorama';
import { ParaHoy, usePendientesDeHoy } from '@/features/dashboard/components/ParaHoy';
import { MARGEN_TABLERO, TableroInicio } from '@/features/dashboard/components/Tablero';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { claveDeCache } from '@/features/perfil/components/Avatar';
import { useImagenPropia } from '@/features/perfil/hooks/useImagenPropia';
import { AvisoPrivacidad, useTextoAvisoPrivacidad } from '@/features/privacidad/components/AvisoPrivacidad';
import { useMiPerfil, useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { ETIQUETA_ROL, esAdmin, type MiPerfil } from '@/features/perfil/schemas';
import { useEspaciado, useCarrilSavia } from '@/hooks/use-espaciado';
import { useIsWide } from '@/hooks/use-is-wide';
import { getApiErrorMessage } from '@/services/api/client';
import { saludo } from '@/shared/format';
import { ActionSheet } from '@/shared/components/ActionSheet';
import { InlineMessage, PrimaryButton, Screen } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { FadeIn, FloatingLeaf, usePressScale } from '@/shared/components/Motion';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

/** Lápiz de la esquina del banner: cambia la foto de portada o vuelve a la del campus. */
function PortadaButton({ tienePortada, cargando, onCambiar, onQuitar }: { tienePortada: boolean; cargando: boolean; onCambiar: () => void; onQuitar: () => void }) {
  const styles = useStyles();
  const { palette } = useTema();
  const press = usePressScale(0.92);
  const [menu, setMenu] = useState(false);
  return (
    <>
      <Animated.View style={[styles.lapiz, press.style]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar foto de portada"
          disabled={cargando}
          hitSlop={8}
          onPress={() => (tienePortada ? setMenu(true) : onCambiar())}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={styles.lapizBoton}
        >
          {cargando ? <ActivityIndicator size="small" color={palette.white} /> : <Icon name="edit" size={16} color={palette.white} />}
        </Pressable>
      </Animated.View>
      <ActionSheet
        visible={menu}
        title="Foto de portada"
        onClose={() => setMenu(false)}
        actions={[
          { label: 'Cambiar foto', icon: 'gallery', onPress: onCambiar },
          { label: 'Usar la foto del campus', icon: 'trash', onPress: onQuitar, destructiva: true },
        ]}
      />
    </>
  );
}

function lugarDe(perfil: MiPerfil | undefined) {
  if (esAdmin(perfil)) return 'Todas las instituciones';
  return perfil?.institucion_nombre ?? 'Sin institución';
}

/** Portada: la foto (propia o del campus), el saludo, el rol y cuántas tareas hay hoy. En el
 *  tablero de escritorio (`compacta`) es más baja: el rol y los pendientes van en una sola línea. */
function Portada({ perfil, pendientes, totalArboles, portada, compacta = false }: {
  perfil?: MiPerfil;
  pendientes?: number;
  totalArboles?: number;
  portada: ReturnType<typeof useImagenPropia>;
  compacta?: boolean;
}) {
  const styles = useStyles();
  const { palette, gradients } = useTema();
  const isWide = useIsWide();
  const portadaUrl = perfil?.portada_url ?? null;
  const primerNombre = perfil?.nombre.split(' ')[0];
  const rolCurso = perfil ? [ETIQUETA_ROL[perfil.rol], perfil.curso_nombre ? `Curso ${perfil.curso_nombre}` : null].filter(Boolean).join(' · ') : '';
  const sinArboles = totalArboles === 0;
  return (
    <FadeIn index={0} style={[styles.portada, isWide && styles.portadaAncha, compacta && styles.portadaTablero]}>
      <Image
        source={portadaUrl ? { uri: portadaUrl, cacheKey: claveDeCache(portadaUrl) } : require('@/assets/images/login-campus-upc.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={isWide ? 'right center' : 'center'}
        transition={250}
        accessibilityLabel={portadaUrl ? 'Foto de portada' : 'Letrero Yo amo UPC en el campus'}
      />
      <View style={[styles.velo, gradient(isWide ? gradients.heroWide : gradients.heroNarrow)]} />
      <FloatingLeaf size={200} color={palette.leaf} opacity={0.14} style={{ left: -90, bottom: -110 }} />
      {perfil ? (
        <PortadaButton
          tienePortada={Boolean(portadaUrl)}
          cargando={portada.cargando}
          onCambiar={() => void portada.elegir()}
          onQuitar={() => void portada.quitar()}
        />
      ) : null}
      <View style={styles.portadaTexto}>
        <View style={styles.lugar}>
          <Icon name="location" size={13} color={palette.leaf} />
          <Text style={styles.lugarTexto} numberOfLines={1}>{lugarDe(perfil)}</Text>
        </View>
        <Text style={[styles.saludo, isWide && styles.saludoAncho, compacta && styles.saludoTablero]}>{saludo()}{primerNombre ? `, ${primerNombre}` : ''}</Text>
        <View style={compacta ? styles.lineaRol : styles.columnaRol}>
          {rolCurso ? <Text style={styles.rol}>{rolCurso}</Text> : null}
          {pendientes !== undefined ? (
            <View style={[styles.pendientes, compacta && styles.pendientesEnLinea]}>
              <View style={[styles.punto, { backgroundColor: pendientes > 0 ? palette.sun : palette.leaf }]} />
              <Text style={styles.pendientesTexto}>
                {pendientes > 0 ? `Tienes ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'} hoy` : 'Todo al día'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {sinArboles ? (
        <View style={[styles.portadaAccion, compacta && styles.portadaAccionCentrada]}>
          <PrimaryButton title="Registrar el primer árbol" icon="add" compact onPress={() => router.navigate('/(app)/trees/new' as Href)} />
        </View>
      ) : isWide && (esAdmin(perfil) || perfil?.institucion_id) ? (
        <View style={[styles.portadaAccion, compacta && styles.portadaAccionCentrada]}>
          {esAdmin(perfil)
            ? <PrimaryButton title="Ver reportes" icon="chart" compact onPress={() => router.navigate('/(app)/reports' as Href)} />
            : <PrimaryButton title="Registrar árbol" icon="add" compact onPress={() => router.navigate('/(app)/trees/new' as Href)} />}
        </View>
      ) : null}
    </FadeIn>
  );
}

function horaDe(ms: number) {
  if (!ms) return null;
  const fecha = new Date(ms);
  return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}

/** Pie que ocupa el carril del botón de Savia: el texto a la izquierda y el botón a la derecha,
 *  sin franja vacía debajo. */
function Pie({ actualizado, tablero = false }: { actualizado: number; tablero?: boolean }) {
  const styles = useStyles();
  const carril = useCarrilSavia();
  const { width } = useWindowDimensions();
  // En ventanas muy anchas el botón queda fuera de la columna de contenido.
  const libre = (width - (tablero ? layout.maxAppWidth : layout.maxWidth)) / 2 >= carril.reservaDerecha;
  const hora = horaDe(actualizado);
  // En el tablero el pie cierra la columna derecha, que ya termina MARGEN_TABLERO antes del borde.
  const alto = tablero ? carril.alto - MARGEN_TABLERO : carril.alto;
  return (
    <View style={[styles.pie, tablero && styles.pieTablero, libre ? null : { minHeight: alto, paddingRight: carril.reservaDerecha }]}>
      {/* Un solo hijo de texto, no dos pegados. Con `{expresión}Arbolado Escolar` el
          navegador junta los dos nodos de texto en uno y, cuando la hora pasa de vacía a
          tener valor, React intenta insertar delante de un nodo que ya no es hijo del
          elemento: «Failed to execute 'insertBefore' on 'Node'». */}
      <Text style={styles.pieTexto}>
        {hora ? `Datos actualizados a las ${hora} · Arbolado Escolar` : 'Arbolado Escolar'}
      </Text>
      <Text style={styles.pieTexto}>Con la Universidad Popular del Cesar</Text>
    </View>
  );
}

export function DashboardScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  const espacio = useEspaciado();
  const perfil = useMiPerfil();
  const p = perfil.data;
  const admin = esAdmin(p);
  const institucionId = admin ? undefined : p?.institucion_id ?? undefined;
  const sinInstitucion = Boolean(p && !admin && !institucionId);
  const puedeVer = perfil.isSuccess && (admin || Boolean(institucionId));
  const { stats, recentTrees } = useDashboard(institucionId, puedeVer);
  const estadisticas = puedeVer ? stats.data : undefined;
  const arboles = puedeVer ? recentTrees.data : undefined;
  const portada = useImagenPropia('portada');
  const hoy = usePendientesDeHoy(p);
  const refrescarTodo = useRefrescarTodo();
  const [refrescando, setRefrescando] = useState(false);
  const { width } = useWindowDimensions();
  const avisoPrivacidad = useTextoAvisoPrivacidad();
  const error = perfil.error ?? (puedeVer ? stats.error : null);

  // Escritorio: todo en una pantalla, sin desplazar la página.
  if (width >= layout.sidebarBreakpoint) {
    const avisos = [
      error ? <InlineMessage key="error">{getApiErrorMessage(error)}</InlineMessage> : null,
      portada.error ? <InlineMessage key="portada">{portada.error}</InlineMessage> : null,
      puedeVer && recentTrees.error ? <InlineMessage key="recientes">{getApiErrorMessage(recentTrees.error)}</InlineMessage> : null,
      p && avisoPrivacidad ? <AvisoPrivacidad key="privacidad" /> : null,
      sinInstitucion ? (
        <InlineMessage key="institucion" tone="info">
          Pide a un docente o administrador que te asigne una institución para consultar su inventario.
        </InlineMessage>
      ) : null,
    ].filter(Boolean);
    return (
      <Screen>
        <TableroInicio
          perfil={p}
          stats={estadisticas}
          cargandoStats={stats.isLoading || perfil.isLoading}
          arboles={arboles}
          cargandoArboles={recentTrees.isLoading}
          portada={<Portada perfil={p} pendientes={hoy.total} totalArboles={estadisticas?.total} portada={portada} compacta />}
          avisos={avisos}
          pie={<Pie actualizado={puedeVer ? stats.dataUpdatedAt : 0} tablero />}
        />
      </Screen>
    );
  }

  async function refrescar() {
    setRefrescando(true);
    try {
      await refrescarTodo();
    } finally {
      setRefrescando(false);
    }
  }

  const estado = <EstadoArbolado stats={estadisticas} cargando={stats.isLoading || perfil.isLoading} alcance={lugarDe(p)} />;
  const impacto = <Impacto stats={estadisticas} />;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingHorizontal: espacio.pagina, gap: espacio.separacion + 4, paddingBottom: espacio.separacion }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => void refrescar()} tintColor={palette.forest} colors={[palette.forest]} />}
      >
        <Portada perfil={p} pendientes={hoy.total} totalArboles={estadisticas?.total} portada={portada} />

        {error ? <InlineMessage>{getApiErrorMessage(error)}</InlineMessage> : null}
        {portada.error ? <InlineMessage>{portada.error}</InlineMessage> : null}
        {p ? <AvisoPrivacidad /> : null}
        {sinInstitucion ? (
          <InlineMessage tone="info">
            Pide a un docente o administrador que te asigne una institución para consultar su inventario.
          </InlineMessage>
        ) : null}

        {isWide ? (
          <FadeIn index={1} style={styles.columnas}>
            <View style={styles.columna}>{p ? <ParaHoy perfil={p} /> : null}</View>
            <View style={styles.columna}>{estado}{impacto}</View>
          </FadeIn>
        ) : (
          <>
            {p ? <FadeIn index={1}><ParaHoy perfil={p} /></FadeIn> : null}
            <FadeIn index={2}>{estado}</FadeIn>
            <FadeIn index={3}>{impacto}</FadeIn>
          </>
        )}

        {p && puedeVer ? <FadeIn index={4}><MetasEnCurso perfil={p} /></FadeIn> : null}
        <FadeIn index={5}><Distribucion stats={estadisticas} isWide={isWide} /></FadeIn>
        <FadeIn index={6}><Recientes arboles={arboles} cargando={recentTrees.isLoading} isWide={isWide} /></FadeIn>
        {puedeVer && recentTrees.error ? <InlineMessage>{getApiErrorMessage(recentTrees.error)}</InlineMessage> : null}

        <Pie actualizado={puedeVer ? stats.dataUpdatedAt : 0} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = crearEstilos(({ palette, shadows }) => ({
  contenido: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingTop: 16 },
  columnas: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  columna: { flex: 1, gap: 16 },
  portada: { gap: 14, padding: 18, paddingTop: 56, overflow: 'hidden', borderRadius: 24, backgroundColor: palette.forestDark, boxShadow: shadows.raised },
  portadaAncha: { minHeight: 220, flexDirection: 'row', alignItems: 'flex-end', padding: 32, paddingTop: 64 },
  // paddingTop explícito: en React Native el paddingTop de portadaAncha le ganaría a un paddingVertical.
  portadaTablero: { minHeight: 0, alignItems: 'center', gap: 20, paddingTop: 18, paddingBottom: 18, paddingLeft: 24, paddingRight: 66, borderRadius: 20 },
  velo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // Lápiz pequeño pero visible: vidrio oscuro con borde claro, en la esquina superior derecha.
  lapiz: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  lapizBoton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: 'rgba(8, 26, 17, 0.45)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.45)', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)' },
  portadaTexto: { flex: 1, gap: 4 },
  lugar: { alignSelf: 'flex-start', maxWidth: '85%', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.18)' },
  lugarTexto: { flexShrink: 1, color: palette.white, fontSize: 12, fontFamily: fonts.semiBold },
  saludo: { color: palette.white, fontSize: 24, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  saludoAncho: { fontSize: 30 },
  saludoTablero: { fontSize: 26 },
  columnaRol: { gap: 4 },
  lineaRol: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 4 },
  rol: { color: '#DCE9DF', fontSize: 14, fontFamily: fonts.semiBold },
  pendientes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  pendientesEnLinea: { marginTop: 0 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  pendientesTexto: { color: palette.white, fontSize: 14, fontFamily: fonts.bold },
  portadaAccion: { alignSelf: 'flex-start' },
  portadaAccionCentrada: { alignSelf: 'center' },
  pie: { justifyContent: 'center', gap: 2, marginTop: 4 },
  pieTablero: { marginTop: 0 },
  pieTexto: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
