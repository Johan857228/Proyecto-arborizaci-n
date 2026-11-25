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
import { DescargarInforme } from '@/features/exportar/components/DescargarInforme';
import { ANCHO_RIEL } from '@/features/modules/components/RielModulos';
import type { MiPerfil } from '@/features/perfil/schemas';
import { DonutChart } from '@/shared/components/DonutChart';
import { Icon, type IconName } from '@/shared/components/Icon';
import { FadeIn } from '@/shared/components/Motion';
import { IconChip } from '@/shared/components/UI';
import { crearEstilos, useTema } from '@/theme';

/** Desde este ancho el inicio se arma como tablero de una sola pantalla, sin desplazamiento. Es el
 *  mismo ancho desde el que la app muestra el riel de módulos a la izquierda. */
export const ANCHO_TABLERO = ANCHO_RIEL;
/** Ancho máximo del tablero; en monitores más anchos queda centrado. */
export const ANCHO_MAXIMO_TABLERO = 1680;
/** Por debajo de este alto los paneles ya no caben: la página se desplaza en vez de aplastarlos. */
const ALTO_MINIMO = 600;
/** Relleno inferior del tablero (el carril del botón de Savia se mide desde el borde). */
export const MARGEN_TABLERO = 14;
/** Máximo de instituciones con barra; el resto queda en Reportes. */
const MAX_INSTITUCIONES = 4;

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

/** Inicio en escritorio: portada y resumen en el centro, distribución a la derecha (los módulos van
 *  en el riel de la izquierda, que pone el marco de la app). Todo cabe en la ventana; lo que no
 *  alcanza se desplaza dentro de su propio panel. */
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
              <DescargarInforme institucionId={perfil.institucion_id ?? undefined} compacto />
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
    paddingLeft: 14,
    paddingRight: 16,
    paddingTop: 14,
    paddingBottom: MARGEN_TABLERO,
  },
  centro: { flex: 1, minWidth: 0, gap: 12 },
  derecha: { width: 330, gap: 12 },
  fila: { flexDirection: 'row', gap: 12 },
  filaFlexible: { flex: 1, minHeight: 150, flexDirection: 'row', gap: 12 },
  avisos: { flexDirection: 'row', gap: 12 },
  paraHoy: { gap: 12 },
  lista: { gap: 6 },
  detalle: { color: palette.muted, fontSize: 12, lineHeight: 17 },

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
