import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { fonts, layout } from '@/config/constants';
import { AccesosRapidos, Distribucion, EstadoArbolado, Impacto, MetasEnCurso, Recientes } from '@/features/dashboard/components/Panorama';
import { ParaHoy, usePendientesDeHoy } from '@/features/dashboard/components/ParaHoy';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { claveDeCache } from '@/features/perfil/components/Avatar';
import { useImagenPropia } from '@/features/perfil/hooks/useImagenPropia';
import { AvisoPrivacidad } from '@/features/privacidad/components/AvisoPrivacidad';
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
  if (perfil?.institucion_nombre) return perfil.institucion_nombre;
  return esAdmin(perfil) ? 'Todas las instituciones' : 'Sin institución';
}

/** Portada: la foto (propia o del campus), el saludo, el rol y cuántas tareas hay hoy. */
function Portada({ perfil, pendientes, totalArboles, portada }: {
  perfil?: MiPerfil;
  pendientes?: number;
  totalArboles?: number;
  portada: ReturnType<typeof useImagenPropia>;
}) {
  const styles = useStyles();
  const { palette, gradients } = useTema();
  const isWide = useIsWide();
  const portadaUrl = perfil?.portada_url ?? null;
  const primerNombre = perfil?.nombre.split(' ')[0];
  const rolCurso = perfil ? [ETIQUETA_ROL[perfil.rol], perfil.curso_nombre ? `Curso ${perfil.curso_nombre}` : null].filter(Boolean).join(' · ') : '';
  const sinArboles = totalArboles === 0;
  return (
    <FadeIn index={0} style={[styles.portada, isWide && styles.portadaAncha]}>
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
        <Text style={[styles.saludo, isWide && styles.saludoAncho]}>{saludo()}{primerNombre ? `, ${primerNombre}` : ''}</Text>
        {rolCurso ? <Text style={styles.rol}>{rolCurso}</Text> : null}
        {pendientes !== undefined ? (
          <View style={styles.pendientes}>
            <View style={[styles.punto, { backgroundColor: pendientes > 0 ? palette.sun : palette.leaf }]} />
            <Text style={styles.pendientesTexto}>
              {pendientes > 0 ? `Tienes ${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'} hoy` : 'Todo al día'}
            </Text>
          </View>
        ) : null}
      </View>
      {sinArboles ? (
        <View style={styles.portadaAccion}>
          <PrimaryButton title="Registrar el primer árbol" icon="add" compact onPress={() => router.navigate('/(app)/trees/new' as Href)} />
        </View>
      ) : isWide && perfil ? (
        <View style={styles.portadaAccion}>
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
function Pie({ actualizado }: { actualizado: number }) {
  const styles = useStyles();
  const carril = useCarrilSavia();
  const { width } = useWindowDimensions();
  // En ventanas muy anchas el botón queda fuera de la columna de contenido.
  const libre = (width - layout.maxWidth) / 2 >= carril.reservaDerecha;
  const hora = horaDe(actualizado);
  return (
    <View style={[styles.pie, libre ? null : { minHeight: carril.alto, paddingRight: carril.reservaDerecha }]}>
      <Text style={styles.pieTexto}>{hora ? `Datos actualizados a las ${hora} · ` : ''}Arbolado Escolar</Text>
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
  const institucionId = p?.institucion_id ?? undefined;
  const { stats, recentTrees } = useDashboard(institucionId, perfil.isSuccess);
  const portada = useImagenPropia('portada');
  const hoy = usePendientesDeHoy(p);
  const refrescarTodo = useRefrescarTodo();
  const [refrescando, setRefrescando] = useState(false);
  const error = perfil.error ?? stats.error;

  async function refrescar() {
    setRefrescando(true);
    try {
      await refrescarTodo();
    } finally {
      setRefrescando(false);
    }
  }

  const estado = <EstadoArbolado stats={stats.data} cargando={stats.isLoading || perfil.isLoading} alcance={lugarDe(p)} />;
  const impacto = <Impacto stats={stats.data} />;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingHorizontal: espacio.pagina, gap: espacio.separacion + 4, paddingBottom: espacio.separacion }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => void refrescar()} tintColor={palette.forest} colors={[palette.forest]} />}
      >
        <Portada perfil={p} pendientes={hoy.total} totalArboles={stats.data?.total} portada={portada} />

        {error ? <InlineMessage>{getApiErrorMessage(error)}</InlineMessage> : null}
        {portada.error ? <InlineMessage>{portada.error}</InlineMessage> : null}
        {p ? <AvisoPrivacidad /> : null}
        {p && !p.institucion_id ? (
          <InlineMessage tone="info">
            Tu cuenta aún no tiene institución asignada. Pídele al administrador que te la asigne para entrar a un curso y aparecer en el ranking de tu institución.
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

        <FadeIn index={4}><AccesosRapidos perfil={p} /></FadeIn>
        {p ? <FadeIn index={5}><MetasEnCurso perfil={p} /></FadeIn> : null}
        <FadeIn index={6}><Distribucion stats={stats.data} isWide={isWide} /></FadeIn>
        <FadeIn index={7}><Recientes arboles={recentTrees.data} cargando={recentTrees.isLoading} isWide={isWide} /></FadeIn>
        {recentTrees.error ? <InlineMessage>{getApiErrorMessage(recentTrees.error)}</InlineMessage> : null}

        <Pie actualizado={stats.dataUpdatedAt} />
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
  velo: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // Lápiz pequeño pero visible: vidrio oscuro con borde claro, en la esquina superior derecha.
  lapiz: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  lapizBoton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: 'rgba(8, 26, 17, 0.45)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.45)', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)' },
  portadaTexto: { flex: 1, gap: 4 },
  lugar: { alignSelf: 'flex-start', maxWidth: '85%', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.18)' },
  lugarTexto: { flexShrink: 1, color: palette.white, fontSize: 12, fontFamily: fonts.semiBold },
  saludo: { color: palette.white, fontSize: 24, fontFamily: fonts.extraBold, letterSpacing: -0.5 },
  saludoAncho: { fontSize: 30 },
  rol: { color: '#DCE9DF', fontSize: 14, fontFamily: fonts.semiBold },
  pendientes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  pendientesTexto: { color: palette.white, fontSize: 14, fontFamily: fonts.bold },
  portadaAccion: { alignSelf: 'flex-start' },
  pie: { justifyContent: 'center', gap: 2, marginTop: 4 },
  pieTexto: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
