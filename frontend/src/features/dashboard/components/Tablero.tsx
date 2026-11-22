import { router, type Href } from 'expo-router';
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts } from '@/config/constants';
import {
  BarrasInstituciones,
  EstadoContenido,
  FilaArbol,
  ImpactoContenido,
  Medidas,
  MetasEnCurso,
  useDistribucion,
} from '@/features/dashboard/components/Panorama';
import { ParaHoy, tieneParaHoy } from '@/features/dashboard/components/ParaHoy';
import type { ArbolResumen, Estadisticas } from '@/features/dashboard/types';
import { modulosPara } from '@/features/modules/modulos';
import { useCuentasSinInstitucion } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, type MiPerfil } from '@/features/perfil/schemas';
import { DonutChart } from '@/shared/components/DonutChart';
import { Icon, type IconName } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';
import { IconChip } from '@/shared/components/UI';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

/** Desde este ancho el inicio se arma como tablero de una sola pantalla, sin desplazamiento. */
export const ANCHO_TABLERO = 1100;
/** Ancho máximo del tablero; en monitores más anchos queda centrado. */
export const ANCHO_MAXIMO_TABLERO = 1680;
/** Por debajo de este alto los paneles ya no caben: la página se desplaza en vez de aplastarlos. */
const ALTO_MINIMO = 600;
/** Relleno inferior del tablero (el carril del botón de Savia se mide desde el borde). */
export const MARGEN_TABLERO = 14;
/** Máximo de instituciones con barra; el resto queda en Reportes. */
const MAX_INSTITUCIONES = 4;

/** Orden del riel: primero lo que más se usa en el colegio y después lo de gestión. */
const ORDEN_RIEL = ['mapa', 'alertas', 'laboratorio', 'privacidad', 'siembras', 'servicio', 'reportes', 'especies', 'intervenciones', 'guias', 'cursos', 'prae'];

function Enlace({ texto, href }: { texto: string; href: Href }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={styles.enlace} hitSlop={8}>
      <Text style={styles.enlaceTexto}>{texto}</Text>
      <Icon name="chevronRight" size={15} color={palette.forest} />
    </Pressable>
  );
}

/** Tarjeta compacta del tablero: ícono, título y enlace en una sola línea, sin subtítulo. */
function Panel({ titulo, icono, accion, style, children }: PropsWithChildren<{
  titulo: string;
  icono: IconName;
  accion?: { texto: string; href: Href };
  style?: StyleProp<ViewStyle>;
}>) {
  const styles = useStyles();
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.panelEncabezado}>
        <IconChip icon={icono} size={26} />
        <Text style={styles.panelTitulo} numberOfLines={1}>{titulo}</Text>
        {accion ? <Enlace texto={accion.texto} href={accion.href} /> : null}
      </View>
      {children}
    </View>
  );
}

/** Columna angosta con los módulos (ícono y nombre corto). Si no caben todos, la columna se
 *  desplaza sola y un desvanecido abajo avisa que hay más; "Todos" abre la pantalla de Módulos. */
function RielAccesos({ perfil }: { perfil?: MiPerfil }) {
  const styles = useStyles();
  const { palette } = useTema();
  const cuentas = useCuentasSinInstitucion(esAdmin(perfil));
  const [altoVisible, setAltoVisible] = useState(0);
  const [altoContenido, setAltoContenido] = useState(0);
  const [desplazado, setDesplazado] = useState(0);
  const quedanMas = altoContenido - altoVisible - desplazado > 4;
  const modulos = modulosPara(perfil)
    .filter((m) => m.clave !== 'revision' && m.clave !== 'progreso')
    .map((modulo, indice) => {
      const posicion = ORDEN_RIEL.indexOf(modulo.clave);
      return { modulo, orden: posicion >= 0 ? posicion : ORDEN_RIEL.length + indice };
    })
    .sort((a, b) => a.orden - b.orden)
    .map(({ modulo }) => modulo);
  return (
    <View style={styles.riel}>
      <Text style={styles.rielTitulo}>Accesos rápidos</Text>
      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.rielLista}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onLayout={(evento) => setAltoVisible(evento.nativeEvent.layout.height)}
          onContentSizeChange={(_, alto) => setAltoContenido(alto)}
          onScroll={(evento) => setDesplazado(evento.nativeEvent.contentOffset.y)}
        >
          {modulos.map((modulo) => (
            <Pressable
              key={modulo.clave}
              accessibilityRole="link"
              accessibilityLabel={modulo.titulo}
              onPress={() => router.push(modulo.href)}
              style={({ pressed }) => [styles.rielItem, pressed && styles.pressed]}
            >
              <View>
                <IconChip icon={modulo.icono} size={28} />
                {modulo.clave === 'usuarios' && cuentas > 0 ? (
                  <View style={styles.insignia}><Text style={styles.insigniaTexto}>{cuentas}</Text></View>
                ) : null}
              </View>
              <Text style={styles.rielTexto} numberOfLines={1}>{modulo.corto}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {quedanMas ? <View style={[styles.rielDesvanecido, gradient(`linear-gradient(180deg, ${palette.paper}00 0%, ${palette.paper} 85%)`)]} /> : null}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Ver todos los módulos"
        onPress={() => router.push('/(app)/modules' as Href)}
        style={({ pressed }) => [styles.rielTodos, pressed && styles.pressed]}
      >
        <Icon name="modules" size={16} color={palette.forest} />
        <Text style={styles.enlaceTexto}>Todos</Text>
      </Pressable>
    </View>
  );
}

/** Inicio en escritorio: accesos a la izquierda, portada y resumen en el centro, distribución a
 *  la derecha. Todo cabe en la ventana; lo que no alcanza se desplaza dentro de su propio panel. */
export function TableroInicio({ perfil, stats, cargandoStats, arboles, cargandoArboles, portada, avisos, pie }: {
  perfil?: MiPerfil;
  stats?: Estadisticas;
  cargandoStats: boolean;
  arboles?: ArbolResumen[];
  cargandoArboles: boolean;
  portada: ReactNode;
  avisos: ReactNode[];
  pie: ReactNode;
}) {
  const styles = useStyles();
  const { especies, etapas, instituciones, varias } = useDistribucion(stats);
  const otras = instituciones.length - MAX_INSTITUCIONES;
  const lista = arboles ?? [];
  // Alto real disponible bajo la barra superior. El tablero recibe una altura fija: así los paneles
  // con desplazamiento propio no empujan la página con su contenido.
  const [alto, setAlto] = useState(0);
  const cabe = alto === 0 || alto >= ALTO_MINIMO;
  // Con pantalla alta sobra espacio en la columna derecha: las donas crecen un poco.
  const dona = alto >= 820 ? { size: 140, thickness: 18 } : { size: 112, thickness: 16 };

  const tablero = (
    <View style={[styles.tablero, cabe ? styles.llenar : { height: ALTO_MINIMO }]}>
      <FadeIn index={0} style={styles.columnaRiel}>
        <RielAccesos perfil={perfil} />
      </FadeIn>

      <View style={styles.centro}>
        {portada}
        {avisos.length ? (
          <View style={styles.avisos}>
            {avisos.map((aviso, indice) => <View key={indice} style={styles.flex}>{aviso}</View>)}
          </View>
        ) : null}

        <FadeIn index={1} style={styles.filaFlexible}>
          {perfil && tieneParaHoy(perfil) ? (
            <ScrollView style={styles.flex} contentContainerStyle={styles.paraHoy} showsVerticalScrollIndicator={false}>
              <ParaHoy perfil={perfil} sinTitulo />
              <MetasEnCurso perfil={perfil} />
            </ScrollView>
          ) : null}
          <Panel titulo="Últimos registros" icono="list" accion={{ texto: 'Ver inventario', href: '/(app)/trees' as Href }} style={styles.flex}>
            <ScrollView style={styles.flex} contentContainerStyle={styles.lista} showsVerticalScrollIndicator={false}>
              {cargandoArboles ? <Text style={styles.detalle}>Cargando registros…</Text> : null}
              {!cargandoArboles && lista.length === 0 ? <Text style={styles.detalle}>Todavía no hay árboles registrados.</Text> : null}
              {lista.map((arbol) => <FilaArbol key={arbol.id} arbol={arbol} compacta />)}
            </ScrollView>
          </Panel>
        </FadeIn>

        <FadeIn index={2} style={styles.fila}>
          <Panel titulo="Impacto ambiental" icono="leaf" style={styles.flex}>
            <ImpactoContenido stats={stats} lista />
          </Panel>
          <Panel titulo="Estado del arbolado" icono="tree" style={styles.flex}>
            <EstadoContenido stats={stats} cargando={cargandoStats} compacto />
          </Panel>
          {varias ? (
            <Panel titulo="Por institución" icono="building" accion={{ texto: 'Reportes', href: '/(app)/reports' as Href }} style={styles.flex}>
              <BarrasInstituciones instituciones={instituciones.slice(0, MAX_INSTITUCIONES)} />
              {otras > 0 ? <Text style={styles.detalle}>Y {otras} {otras === 1 ? 'institución más' : 'instituciones más'} en Reportes.</Text> : null}
            </Panel>
          ) : null}
        </FadeIn>
      </View>

      <FadeIn index={3} style={styles.derecha}>
        <View style={styles.encabezado}>
          <View style={styles.raya} />
          <Text style={styles.encabezadoTexto}>Distribución del arbolado</Text>
        </View>
        <Panel titulo="Especies" icono="tree" style={[styles.flex, styles.panelGrafico]}>
          <View style={styles.centrado}>
            <DonutChart slices={especies} centerLabel="árboles" size={dona.size} thickness={dona.thickness} compacto />
          </View>
        </Panel>
        <Panel titulo="Etapa de desarrollo" icono="trending" style={[styles.flex, styles.panelGrafico]}>
          <View style={styles.centrado}>
            <DonutChart slices={etapas} centerLabel="árboles" size={dona.size} thickness={dona.thickness} delay={450} compacto />
          </View>
          <Medidas stats={stats} enFila />
        </Panel>
        {pie}
      </FadeIn>
    </View>
  );

  return (
    <View style={styles.flex} onLayout={(evento) => setAlto(evento.nativeEvent.layout.height)}>
      {cabe ? tablero : <ScrollView style={styles.flex} showsVerticalScrollIndicator={false}>{tablero}</ScrollView>}
    </View>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.8 },
  llenar: { flex: 1 },
  tablero: {
    width: '100%',
    maxWidth: ANCHO_MAXIMO_TABLERO,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: MARGEN_TABLERO,
  },
  columnaRiel: { width: 84 },
  centro: { flex: 1, minWidth: 0, gap: 12 },
  derecha: { width: 330, gap: 12 },
  fila: { flexDirection: 'row', gap: 12 },
  filaFlexible: { flex: 1, minHeight: 150, flexDirection: 'row', gap: 12 },
  avisos: { flexDirection: 'row', gap: 12 },
  paraHoy: { gap: 12 },
  lista: { gap: 6 },
  detalle: { color: palette.muted, fontSize: 12, lineHeight: 17 },

  riel: { flex: 1, gap: 4, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 4, ...card, borderRadius: 18 },
  rielTitulo: { color: palette.muted, fontSize: 9.5, lineHeight: 12, fontFamily: fonts.bold, letterSpacing: 0.6, textAlign: 'center', textTransform: 'uppercase' },
  rielLista: { flexGrow: 1, justifyContent: 'space-between' },
  rielItem: { alignItems: 'center', gap: 2, paddingVertical: 2, borderRadius: 12 },
  rielTexto: { maxWidth: '100%', color: palette.ink, fontSize: 10.5, lineHeight: 13, fontFamily: fonts.semiBold, textAlign: 'center' },
  rielDesvanecido: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, pointerEvents: 'none' },
  rielTodos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 7, borderTopWidth: 1, borderTopColor: palette.line },
  insignia: { position: 'absolute', top: -5, right: -8, minWidth: 17, height: 17, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: palette.amber },
  insigniaTexto: { color: palette.paper, fontSize: 10, fontFamily: fonts.extraBold },

  panel: { overflow: 'hidden', gap: 10, padding: 14, ...card, borderRadius: 18 },
  panelGrafico: { minHeight: 0 },
  panelEncabezado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitulo: { flex: 1, color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  centrado: { flex: 1, justifyContent: 'center' },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  enlaceTexto: { color: palette.forest, fontSize: 12, fontFamily: fonts.bold },

  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 },
  raya: { width: 16, height: 3, borderRadius: 2, backgroundColor: palette.leaf },
  encabezadoTexto: { flex: 1, color: palette.ink, fontSize: 15, fontFamily: fonts.extraBold, letterSpacing: -0.2 },
}));
