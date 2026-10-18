import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chartColors, fonts } from '@/config/constants';
import type { Estadisticas } from '@/features/dashboard/types';
import { useMetas } from '@/features/goals/api';
import { modulosPara } from '@/features/modules/modulos';
import { useCuentasSinInstitucion } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, type MiPerfil } from '@/features/perfil/schemas';
import { formatFecha, formatNumero } from '@/shared/format';
import { DonutChart, type DonutSlice } from '@/shared/components/DonutChart';
import { Icon, type IconName } from '@/shared/components/Icon';
import { AnimatedNumber } from '@/shared/components/Motion';
import { StatusBadge, useEstadosArbol } from '@/shared/components/StatusBadge';
import { Card, IconChip, KeyValue, ProgressBar, RevisionBadge, Tabs } from '@/shared/components/UI';
import { gradient } from '@/shared/styles/gradient';
import type { ArbolResumen, EstadoArbol } from '@/shared/types/entities';
import { crearEstilos, useTema } from '@/theme';

const numberFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const ESTADOS: EstadoArbol[] = ['sano', 'riesgo', 'critico'];
const ETAPAS = ['Plántula', 'Juvenil', 'Adulto', 'Senescente'] as const;

function formatMass(kg: number) {
  return kg >= 1000 ? `${numberFormat.format(kg / 1000)} t` : `${numberFormat.format(kg)} kg`;
}

function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/** Las 4 categorías más grandes con color propio y el resto en "Otras" (gris). `total` es el total
 *  real: el backend solo manda las especies más frecuentes, así que "Otras" sale de la diferencia. */
function topConOtras(items: { key: string; label: string; value: number }[], total?: number): DonutSlice[] {
  const ordenados = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const principales = ordenados.slice(0, chartColors.categorical.length);
  const suma = principales.reduce((s, item) => s + item.value, 0);
  const resto = total !== undefined ? total - suma : ordenados.slice(chartColors.categorical.length).reduce((s, item) => s + item.value, 0);
  return [
    ...principales.map((item, index) => ({ ...item, color: chartColors.categorical[index] })),
    ...(resto > 0 ? [{ key: 'otras', label: 'Otras', value: resto, color: chartColors.other }] : []),
  ];
}

function Encabezado({ titulo, accion }: { titulo: string; accion?: { texto: string; href: Href } }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.encabezado}>
      <View style={styles.raya} />
      <Text style={styles.titulo}>{titulo}</Text>
      {accion ? (
        <Pressable accessibilityRole="link" onPress={() => router.push(accion.href)} style={styles.enlace} hitSlop={8}>
          <Text style={styles.enlaceTexto}>{accion.texto}</Text>
          <Icon name="chevronRight" size={16} color={palette.forest} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Total, reparto sano/riesgo/crítico y tres casillas que abren el inventario filtrado. */
export function EstadoArbolado({ stats, cargando, alcance }: { stats?: Estadisticas; cargando: boolean; alcance: string }) {
  const styles = useStyles();
  const estados = useEstadosArbol();
  const conteo: Record<EstadoArbol, number> = {
    sano: stats?.por_estado.sano ?? 0,
    riesgo: stats?.por_estado.riesgo ?? 0,
    critico: stats?.por_estado.critico ?? 0,
  };
  const evaluados = conteo.sano + conteo.riesgo + conteo.critico;
  return (
    <Card title="Estado del arbolado" subtitle={`${alcance} · según la última inspección de cada árbol`} icon="tree">
      <View style={styles.totalFila}>
        {cargando ? <Text style={styles.total}>—</Text> : <AnimatedNumber value={stats?.total ?? 0} style={styles.total} />}
        <Text style={styles.totalTexto}>{stats?.total === 1 ? 'árbol registrado' : 'árboles registrados'}</Text>
      </View>
      <View style={styles.barra}>
        {ESTADOS.map((estado) => (conteo[estado] > 0 ? <View key={estado} style={{ flex: conteo[estado], backgroundColor: estados[estado].color }} /> : null))}
      </View>
      <View style={styles.casillas}>
        {ESTADOS.map((estado) => (
          <Pressable
            key={estado}
            accessibilityRole="link"
            accessibilityLabel={`Ver árboles en estado ${estados[estado].label}`}
            onPress={() => router.push(`/(app)/trees?estado=${estado}` as Href)}
            style={({ pressed }) => [styles.casilla, { backgroundColor: estados[estado].background }, pressed && styles.pressed]}
          >
            <Text style={[styles.casillaValor, { color: estados[estado].color }]}>{cargando ? '—' : conteo[estado]}</Text>
            <Text style={styles.casillaTexto}>{estados[estado].label}</Text>
            <Text style={[styles.casillaPct, { color: estados[estado].color }]}>{evaluados ? `${porcentaje(conteo[estado], evaluados)}%` : '—'}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

/** CO₂, O₂ y biomasa: la cifra que un colegio pone en su PRAE y una entidad en su informe. */
export function Impacto({ stats }: { stats?: Estadisticas }) {
  const styles = useStyles();
  const { palette } = useTema();
  const ambiental = stats?.totales_ambientales;
  const items: { key: string; label: string; value: number | undefined; icon: IconName; color: string; background: string }[] = [
    { key: 'co2', label: 'CO₂ capturado', value: ambiental?.co2_kg, icon: 'co2', color: palette.forest, background: palette.forestSoft },
    { key: 'o2', label: 'O₂ producido', value: ambiental?.o2_kg, icon: 'air', color: palette.sky, background: palette.skySoft },
    { key: 'biomasa', label: 'Biomasa', value: ambiental?.biomasa_total_kg, icon: 'biomass', color: palette.clay, background: palette.claySoft },
  ];
  return (
    <Card title="Impacto ambiental" subtitle="Estimado con las medidas registradas" icon="leaf">
      <View style={styles.impacto}>
        {items.map((item) => (
          <View key={item.key} style={[styles.impactoItem, { backgroundColor: item.background }]}>
            <View style={[styles.impactoIcono, { backgroundColor: item.color }]}>
              <Icon name={item.icon} size={16} color={palette.paper} />
            </View>
            {item.value == null ? (
              <Text style={styles.impactoValor}>—</Text>
            ) : (
              <AnimatedNumber value={item.value} format={formatMass} duration={1400} style={[styles.impactoValor, { color: item.color }]} />
            )}
            <Text style={styles.impactoTexto}>{item.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Cuadrícula de íconos con los módulos (sin descripción); la lista completa está en Módulos. */
export function AccesosRapidos({ perfil }: { perfil?: MiPerfil }) {
  const styles = useStyles();
  const cuentas = useCuentasSinInstitucion(esAdmin(perfil));
  const modulos = modulosPara(perfil).filter((m) => m.clave !== 'revision' && m.clave !== 'progreso');
  return (
    <View style={styles.bloque}>
      <Encabezado titulo="Accesos rápidos" accion={{ texto: 'Ver todos', href: '/(app)/modules' as Href }} />
      <View style={styles.accesos}>
        {modulos.map((modulo) => (
          <Pressable
            key={modulo.clave}
            accessibilityRole="link"
            accessibilityLabel={modulo.titulo}
            onPress={() => router.push(modulo.href)}
            style={({ pressed }) => [styles.acceso, pressed && styles.pressed]}
          >
            <View>
              <IconChip icon={modulo.icono} size={46} />
              {modulo.clave === 'usuarios' && cuentas > 0 ? (
                <View style={styles.accesoBadge}><Text style={styles.accesoBadgeTexto}>{cuentas}</Text></View>
              ) : null}
            </View>
            <Text style={styles.accesoTexto} numberOfLines={1}>{modulo.corto}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Hasta 2 metas en curso (la más próxima a vencer primero). Sin metas, no ocupa espacio; al
 *  administrador le invita a crear la primera. */
export function MetasEnCurso({ perfil }: { perfil: MiPerfil }) {
  const styles = useStyles();
  const metas = useMetas(perfil.institucion_id ?? undefined, { staleTime: 5 * 60_000 });
  const enCurso = (metas.data ?? []).filter((m) => m.estado === 'en_curso').sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin)).slice(0, 2);
  if (!enCurso.length) {
    if (!esAdmin(perfil) || metas.isLoading || metas.error) return null;
    return (
      <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/goals' as Href)} style={({ pressed }) => [styles.invitacion, pressed && styles.pressed]}>
        <IconChip icon="flag" size={40} />
        <View style={styles.flex}>
          <Text style={styles.invitacionTitulo}>Define la primera meta</Text>
          <Text style={styles.detalle}>Árboles registrados, % de árboles sanos, CO₂ capturado…</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Card title="Metas en curso" icon="flag" action={(
      <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/goals' as Href)} style={styles.enlace} hitSlop={8}>
        <Text style={styles.enlaceTexto}>Ver metas</Text>
      </Pressable>
    )}>
      <View style={styles.lista}>
        {enCurso.map((meta) => (
          <View key={meta.id} style={styles.meta}>
            <View style={styles.metaTop}>
              <Text style={styles.metaNombre} numberOfLines={1}>{meta.indicador_nombre}</Text>
              <Text style={styles.detalle}>{formatNumero(meta.valor_actual, 1)} / {formatNumero(meta.valor_meta, 1)} {meta.unidad}</Text>
            </View>
            <ProgressBar pct={meta.avance_pct} />
            <Text style={styles.detalle}>Vence el {formatFecha(meta.fecha_fin)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

type Pestana = 'especies' | 'etapas' | 'medidas' | 'instituciones';

/** Distribución: en el teléfono, una tarjeta con pestañas; en pantalla ancha, las donas en columnas. */
export function Distribucion({ stats, isWide }: { stats?: Estadisticas; isWide: boolean }) {
  const styles = useStyles();
  const [pestana, setPestana] = useState<Pestana>('especies');
  const especies = topConOtras((stats?.especies_frecuentes ?? []).map((i) => ({ key: i.nombre_comun, label: i.nombre_comun, value: i.total })), stats?.total);
  const etapas: DonutSlice[] = ETAPAS.map((etapa, index) => ({ key: etapa, label: etapa, value: stats?.por_etapa[etapa] ?? 0, color: chartColors.etapas[index] }));
  const instituciones = [...(stats?.por_institucion ?? [])].sort((a, b) => b.total - a.total);
  const maximo = instituciones[0]?.total ?? 0;
  const varias = instituciones.length > 1;

  const medidas = (
    <View style={styles.medidas}>
      <KeyValue label="DAP promedio" value={stats?.promedios.dap_cm != null ? `${formatNumero(stats.promedios.dap_cm, 1)} cm` : '—'} />
      <KeyValue label="Altura promedio" value={stats?.promedios.altura_m != null ? `${formatNumero(stats.promedios.altura_m, 1)} m` : '—'} />
      <KeyValue label="Copa promedio" value={stats?.promedios.copa_m != null ? `${formatNumero(stats.promedios.copa_m, 1)} m` : '—'} />
    </View>
  );
  const barras = (
    <View style={styles.lista}>
      {instituciones.map((inst) => (
        <View key={inst.prefijo} style={styles.instFila}>
          <View style={styles.metaTop}>
            <Text style={styles.metaNombre} numberOfLines={1}>{inst.nombre_corto}</Text>
            <Text style={styles.detalle}>{inst.total}</Text>
          </View>
          <View style={styles.instBarra}><View style={[styles.instRelleno, { width: `${maximo ? (inst.total / maximo) * 100 : 0}%` }]} /></View>
        </View>
      ))}
    </View>
  );

  if (isWide) {
    return (
      <View style={styles.bloque}>
        <Encabezado titulo="Distribución del arbolado" accion={{ texto: 'Reportes', href: '/(app)/reports' as Href }} />
        <View style={styles.columnas}>
          <View style={styles.columna}><Card title="Especies" icon="tree"><DonutChart slices={especies} centerLabel="árboles" size={150} thickness={20} /></Card></View>
          <View style={styles.columna}><Card title="Etapa de desarrollo" icon="trending"><DonutChart slices={etapas} centerLabel="árboles" size={150} thickness={20} delay={450} />{medidas}</Card></View>
          <View style={styles.columna}><Card title="Por institución" icon="building">{varias ? barras : <DonutChart slices={topConOtras(instituciones.map((i) => ({ key: i.prefijo, label: i.nombre_corto, value: i.total })))} centerLabel="árboles" size={150} thickness={20} delay={600} />}</Card></View>
        </View>
      </View>
    );
  }

  const opciones: { label: string; value: Pestana }[] = [
    { label: 'Especies', value: 'especies' },
    { label: 'Etapas', value: 'etapas' },
    { label: 'Medidas', value: 'medidas' },
    ...(varias ? [{ label: 'Instituciones', value: 'instituciones' as const }] : []),
  ];
  return (
    <View style={styles.bloque}>
      <Encabezado titulo="Distribución del arbolado" accion={{ texto: 'Reportes', href: '/(app)/reports' as Href }} />
      <Card>
        <Tabs value={pestana} options={opciones} onChange={setPestana} />
        {pestana === 'especies' ? <DonutChart slices={especies} centerLabel="árboles" size={140} thickness={18} /> : null}
        {pestana === 'etapas' ? <DonutChart slices={etapas} centerLabel="árboles" size={140} thickness={18} /> : null}
        {pestana === 'medidas' ? medidas : null}
        {pestana === 'instituciones' ? barras : null}
      </Card>
    </View>
  );
}

function TarjetaArbol({ arbol }: { arbol: ArbolResumen }) {
  const styles = useStyles();
  const { palette, gradients } = useTema();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Ver ficha de ${arbol.codigo}`}
      onPress={() => router.push(`/(app)/trees/${arbol.id}` as Href)}
      style={({ pressed }) => [styles.tarjeta, pressed && styles.pressed]}
    >
      {arbol.foto_url ? (
        <Image source={{ uri: arbol.foto_url }} style={styles.tarjetaFoto} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.tarjetaFoto, styles.glifo, gradient(gradients.lime)]}><Icon name="tree" size={26} color={palette.forestDark} /></View>
      )}
      <View style={styles.tarjetaCuerpo}>
        <Text style={styles.metaNombre} numberOfLines={1}>{arbol.codigo}</Text>
        <Text style={styles.detalle} numberOfLines={1}>{arbol.nombre_comun} · {arbol.zona}</Text>
        <StatusBadge estado={arbol.estado} />
        {arbol.ultima_revision === 'pendiente' ? <RevisionBadge estado="pendiente" /> : null}
      </View>
    </Pressable>
  );
}

/** Últimos registros: carrusel en el teléfono y lista en pantalla ancha. */
export function Recientes({ arboles, cargando, isWide }: { arboles?: ArbolResumen[]; cargando: boolean; isWide: boolean }) {
  const styles = useStyles();
  const { palette } = useTema();
  const estados = useEstadosArbol();
  const lista = arboles ?? [];
  if (!cargando && lista.length === 0) return null;
  return (
    <View style={styles.bloque}>
      <Encabezado titulo="Últimos registros" accion={{ texto: 'Ver inventario', href: '/(app)/trees' as Href }} />
      {cargando ? <Text style={styles.detalle}>Cargando registros…</Text> : null}
      {isWide ? (
        <Card>
          <View style={styles.lista}>
            {lista.map((arbol) => (
              <Pressable
                key={arbol.id}
                accessibilityRole="link"
                accessibilityLabel={`Ver ficha de ${arbol.codigo}`}
                onPress={() => router.push(`/(app)/trees/${arbol.id}` as Href)}
                style={({ pressed }) => [styles.filaArbol, pressed && styles.pressed]}
              >
                <View style={[styles.acento, { backgroundColor: estados[arbol.estado].color }]} />
                {arbol.foto_url ? <Image source={{ uri: arbol.foto_url }} style={styles.miniatura} contentFit="cover" transition={150} /> : <View style={[styles.miniatura, styles.glifo]}><Icon name="tree" size={20} color={palette.forest} /></View>}
                <View style={styles.flex}>
                  <Text style={styles.metaNombre}>{arbol.codigo}</Text>
                  <Text style={styles.detalle} numberOfLines={1}>{arbol.nombre_comun} · {arbol.zona}</Text>
                </View>
                <StatusBadge estado={arbol.estado} />
                <Text style={styles.detalle}>{formatFecha(arbol.registrado_en)}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={152} decelerationRate="fast" contentContainerStyle={styles.carrusel}>
          {lista.map((arbol) => <TarjetaArbol key={arbol.id} arbol={arbol} />)}
          <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/trees' as Href)} style={({ pressed }) => [styles.tarjeta, styles.verTodo, pressed && styles.pressed]}>
            <IconChip icon="list" size={44} />
            <Text style={styles.enlaceTexto}>Ver inventario</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  bloque: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  raya: { width: 18, height: 3, borderRadius: 2, backgroundColor: palette.leaf },
  titulo: { flex: 1, color: palette.ink, fontSize: 20, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  enlaceTexto: { color: palette.forest, fontSize: 13, fontFamily: fonts.bold },
  detalle: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.8 },
  lista: { gap: 10 },
  totalFila: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  total: { color: palette.ink, fontSize: 36, fontFamily: fonts.extraBold, letterSpacing: -1 },
  totalTexto: { color: palette.muted, fontSize: 14, fontFamily: fonts.semiBold },
  barra: { height: 8, flexDirection: 'row', gap: 2, overflow: 'hidden', borderRadius: 4, backgroundColor: palette.line },
  casillas: { flexDirection: 'row', gap: 8 },
  casilla: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14 },
  casillaValor: { fontSize: 22, fontFamily: fonts.extraBold },
  casillaTexto: { color: palette.ink, fontSize: 12, fontFamily: fonts.semiBold },
  casillaPct: { fontSize: 12, fontFamily: fonts.bold },
  impacto: { flexDirection: 'row', gap: 8 },
  impactoItem: { flex: 1, gap: 4, padding: 10, borderRadius: 14 },
  impactoIcono: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  impactoValor: { color: palette.ink, fontSize: 16, fontFamily: fonts.extraBold },
  impactoTexto: { color: palette.muted, fontSize: 11, lineHeight: 15 },
  accesos: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, ...card, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 6 },
  acceso: { width: '25%', alignItems: 'center', gap: 6 },
  accesoTexto: { maxWidth: '100%', color: palette.ink, fontSize: 12, fontFamily: fonts.semiBold, textAlign: 'center' },
  accesoBadge: { position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: palette.amber },
  accesoBadgeTexto: { color: palette.paper, fontSize: 11, fontFamily: fonts.extraBold },
  invitacion: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, ...card, borderRadius: 18, borderStyle: 'dashed', borderColor: palette.placeholder },
  invitacionTitulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { gap: 6 },
  metaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  metaNombre: { flexShrink: 1, color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  medidas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 },
  instFila: { gap: 4 },
  instBarra: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: palette.line },
  instRelleno: { height: 8, borderRadius: 4, backgroundColor: palette.forest },
  columnas: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  columna: { flex: 1 },
  carrusel: { gap: 12, paddingRight: 4 },
  tarjeta: { width: 140, overflow: 'hidden', ...card, borderRadius: 18 },
  tarjetaFoto: { width: '100%', height: 92, backgroundColor: palette.forestSoft },
  tarjetaCuerpo: { gap: 4, padding: 10, alignItems: 'flex-start' },
  glifo: { alignItems: 'center', justifyContent: 'center' },
  verTodo: { alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 190 },
  filaArbol: { minHeight: 60, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 14, paddingRight: 12, borderRadius: 14, backgroundColor: palette.tile },
  acento: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
  miniatura: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.forestSoft },
}));
