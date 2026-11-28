import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { INTERVALO_EN_VIVO_MS, useAnalisis, type Analisis, type ArbolAnalisis } from '@/features/analisis/api';
import { Barras, BarrasApiladas, Columnas, Leyenda } from '@/features/analisis/components/Graficos';
import {
  COLOR_ESTADO,
  COLOR_REVISION,
  DIMENSIONES,
  ESTADOS,
  ETIQUETA_DIMENSION,
  PERIODOS,
  agrupar,
  desdeDelPeriodo,
  etiquetaMes,
  filtrarArboles,
  filtrarHallazgos,
  filtrarInspecciones,
  filtrarIntervenciones,
  indicadores,
  novedades,
  porMes,
  valorArbol,
  type Dimension,
  type Filtros,
  type Indicadores,
  type Periodo,
} from '@/features/analisis/filtros';
import { DescargarInforme } from '@/features/exportar/components/DescargarInforme';
import { Dispersion } from '@/features/laboratorio/components/Graficas';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { DonutChart } from '@/shared/components/DonutChart';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  Page,
  Row,
  StatGrid,
  StatTile,
  Tabs,
} from '@/shared/components/UI';
import { formatFecha, formatNumero, formatPesos, formatPorcentaje } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

type Pagina = 'resumen' | 'riesgo' | 'inspecciones' | 'intervenciones' | 'carbono' | 'inventario';
const PAGINAS: { label: string; value: Pagina }[] = [
  { label: 'Resumen', value: 'resumen' },
  { label: 'Riesgo', value: 'riesgo' },
  { label: 'Inspecciones', value: 'inspecciones' },
  { label: 'Intervenciones', value: 'intervenciones' },
  { label: 'Medidas y carbono', value: 'carbono' },
  { label: 'Inventario', value: 'inventario' },
];
const ORDEN_ESTADO: Record<string, number> = { Crítico: 0, 'En riesgo': 1, Sano: 2 };
const FILAS_INVENTARIO = 60;
const SIN_FILTROS: Filtros = {};
const entero = (v: number) => formatNumero(v, 0);

/** Lo que ven las páginas: filas ya filtradas y sus indicadores. */
interface Vista {
  hoy: string;
  desde: string | undefined;
  arboles: ArbolAnalisis[];
  ids: Set<string>;
  inspecciones: Analisis['inspecciones'];
  intervenciones: Analisis['intervenciones'];
  hallazgos: Analisis['hallazgos'];
  k: Indicadores;
  /** Árboles con todos los filtros menos el de esa dimensión (para el gráfico que la filtra). */
  sin: (d: Dimension) => ArbolAnalisis[];
  sedes: Map<string, string>;
}
const toneladas = (v: number) => `${formatNumero(v, 1)} t`;

/** Hace cuánto llegaron los datos, en palabras ("hace 12 s"). Se refresca solo cada 5 segundos. */
function useHace(momento: number) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  if (!momento) return '';
  const s = Math.max(0, Math.round((ahora - momento) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return `hace ${m} min`;
}

/** Lo que llegó desde la carga anterior (árboles, inspecciones…), visible unos segundos. */
function useNovedades(datos: Analisis | undefined) {
  const anterior = useRef<Analisis | undefined>(undefined);
  const [mensaje, setMensaje] = useState<string>();
  useEffect(() => {
    if (!datos) return;
    const cambios = novedades(anterior.current, datos);
    anterior.current = datos;
    if (!cambios.length) return;
    setMensaje(`Llegaron datos nuevos: ${cambios.join(', ')}.`);
    const id = setTimeout(() => setMensaje(undefined), 12_000);
    return () => clearTimeout(id);
  }, [datos]);
  return mensaje;
}

function Panel({ titulo, subtitulo, children }: PropsWithChildren<{ titulo: string; subtitulo?: string }>) {
  return (
    <Cell basis={420}>
      <Card title={titulo} subtitle={subtitulo}>{children}</Card>
    </Cell>
  );
}

export function AnalisisScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida();
  const habilitado = perfil.isSuccess && Boolean(perfil.data?.institucion_id || esAdmin(perfil.data));
  const consulta = useAnalisis(institucion.institucionId, habilitado);
  const [pagina, setPagina] = useState<Pagina>('resumen');
  // Los filtros son de una institución: al cambiar de institución se empieza sin filtros.
  const [elegidos, setElegidos] = useState<{ institucion?: string; filtros: Filtros }>({ filtros: SIN_FILTROS });
  const filtros = elegidos.institucion === institucion.institucionId ? elegidos.filtros : SIN_FILTROS;
  const setFiltros = (cambio: (f: Filtros) => Filtros) =>
    setElegidos((e) => ({ institucion: institucion.institucionId, filtros: cambio(e.institucion === institucion.institucionId ? e.filtros : SIN_FILTROS) }));
  const [periodo, setPeriodo] = useState<Periodo>('365');
  const datos = consulta.data;
  const hace = useHace(consulta.dataUpdatedAt);
  const llegaron = useNovedades(datos);

  const alternar = (d: Dimension) => (valor: string) =>
    setFiltros((f) => {
      const siguiente = { ...f };
      if (f[d] === valor) delete siguiente[d];
      else siguiente[d] = valor;
      return siguiente;
    });

  const vista = useMemo((): Vista | undefined => {
    if (!datos) return undefined;
    const hoy = datos.generado_en.slice(0, 10);
    const desde = desdeDelPeriodo(hoy, periodo);
    const arboles = filtrarArboles(datos.arboles, filtros);
    const ids = new Set(arboles.map((a) => a.id));
    const inspecciones = filtrarInspecciones(datos.inspecciones, ids, filtros, desde);
    const intervenciones = filtrarIntervenciones(datos.intervenciones, ids, filtros, desde);
    const sin = (d: Dimension) => filtrarArboles(datos.arboles, filtros, d);
    return {
      hoy,
      desde,
      arboles,
      ids,
      inspecciones,
      intervenciones,
      hallazgos: filtrarHallazgos(datos.hallazgos, ids, filtros, desde),
      k: indicadores(arboles, inspecciones, intervenciones),
      sin,
      sedes: new Map(datos.sedes.map((s) => [s.id, s.nombre])),
    };
  }, [datos, filtros, periodo]);

  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (perfil.data && !habilitado) {
    return (
      <Page>
        <AppHeader title="Análisis" />
        <Notice tono="riesgo">Tu cuenta aún no tiene institución asignada. Cuando un docente o el administrador te la asigne, aquí verás el análisis del arbolado de tu colegio.</Notice>
      </Page>
    );
  }

  const activos = DIMENSIONES.filter((d) => filtros[d] !== undefined);
  const textoFiltro = (d: Dimension, valor: string) =>
    d === 'sede' ? vista?.sedes.get(valor) ?? valor : d === 'mes' ? etiquetaMes(valor) : valor;

  return (
    <Page maxWidth={1400} onRefresh={() => void consulta.refetch()} refreshing={consulta.isFetching && !consulta.isLoading}>
      <AppHeader
        eyebrow="Seguimiento"
        title="Análisis"
        subtitle="Tablero interactivo con los datos en vivo, como en Power BI: toca una barra, una porción o un mes para filtrar todo lo demás. Se actualiza solo mientras está abierto."
        right={(
          <View style={styles.vivo} accessibilityLabel={`Datos en vivo, actualizados ${hace}`}>
            <View style={[styles.punto, consulta.isFetching && styles.puntoCargando]} />
            <Text style={styles.vivoTexto}>En vivo{hace ? ` · ${hace}` : ''}</Text>
          </View>
        )}
      />
      {esAdmin(perfil.data) ? <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} /> : null}
      {llegaron ? <InlineMessage tone="success">{llegaron}</InlineMessage> : null}

      {consulta.isLoading ? <LoadingState text="Preparando el análisis…" /> : consulta.error && !datos ? (
        <ErrorState error={consulta.error} onRetry={() => void consulta.refetch()} />
      ) : !datos || !vista ? null : datos.arboles.length === 0 ? (
        <EmptyState title="Todavía no hay árboles registrados" text="Cuando se registre el primero, el análisis aparece aquí solo." />
      ) : (
        <>
          <View style={styles.controles}>
            <Tabs value={pagina} options={PAGINAS} onChange={setPagina} />
            <View style={styles.periodo}>
              <Text style={styles.periodoTexto}>Inspecciones e intervenciones de</Text>
              <Tabs value={periodo} options={PERIODOS.map((p) => ({ label: p.etiqueta, value: p.valor }))} onChange={setPeriodo} />
            </View>
          </View>

          {activos.length ? (
            <View style={styles.filtros}>
              <Icon name="tune" size={16} color={palette.muted} />
              {activos.map((d) => (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar el filtro ${ETIQUETA_DIMENSION[d]}: ${textoFiltro(d, filtros[d] as string)}`}
                  onPress={() => alternar(d)(filtros[d] as string)}
                  style={({ pressed }) => [styles.chip, pressed && styles.presionado]}
                >
                  <Text style={styles.chipTexto}>{ETIQUETA_DIMENSION[d]}: {textoFiltro(d, filtros[d] as string)}</Text>
                  <Icon name="close" size={14} color={palette.forest} />
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" onPress={() => setFiltros(() => SIN_FILTROS)} style={({ pressed }) => [styles.limpiar, pressed && styles.presionado]}>
                <Text style={styles.limpiarTexto}>Quitar filtros</Text>
              </Pressable>
            </View>
          ) : null}

          {pagina === 'resumen' ? <Resumen datos={datos} vista={vista} filtros={filtros} alternar={alternar} /> : null}
          {pagina === 'riesgo' ? <Riesgo vista={vista} filtros={filtros} alternar={alternar} /> : null}
          {pagina === 'inspecciones' ? <Inspecciones datos={datos} vista={vista} filtros={filtros} alternar={alternar} /> : null}
          {pagina === 'intervenciones' ? <Intervenciones datos={datos} vista={vista} filtros={filtros} alternar={alternar} /> : null}
          {pagina === 'carbono' ? <Carbono vista={vista} filtros={filtros} alternar={alternar} /> : null}
          {pagina === 'inventario' ? <Inventario arboles={vista.arboles} /> : null}

          <Text style={styles.nota}>
            {datos.alcance} · datos al {formatFecha(vista.hoy)} · se actualizan cada {INTERVALO_EN_VIVO_MS / 1000} segundos. El estado de cada árbol es el de su última inspección no anulada; las cifras coinciden con Reportes y con el informe descargable.
          </Text>
          <DescargarInforme institucionId={institucion.institucionId} />
        </>
      )}
    </Page>
  );
}

interface PropsPagina {
  vista: Vista;
  filtros: Filtros;
  alternar: (d: Dimension) => (valor: string) => void;
}

function slicesEstado(arboles: ArbolAnalisis[]) {
  return ESTADOS.map((e) => ({ key: e, label: e, value: arboles.filter((a) => a.estado === e).length, color: COLOR_ESTADO[e] }));
}

function zonasPorEstado(arboles: ArbolAnalisis[]) {
  return agrupar(arboles, (a) => valorArbol(a, 'zona'), { maximo: 12, otras: 'Otras zonas' }).map((z) => ({
    clave: z.clave,
    etiqueta: z.etiqueta,
    partes: ESTADOS.map((e) => ({
      clave: e,
      etiqueta: e,
      color: COLOR_ESTADO[e],
      valor: z.clave === '__otras__'
        ? 0
        : arboles.filter((a) => valorArbol(a, 'zona') === z.clave && a.estado === e).length,
    })),
  })).filter((z) => z.clave !== '__otras__');
}

function mesesConRevision(datos: Analisis, vista: Vista, filtros: Filtros) {
  const base = filtrarInspecciones(datos.inspecciones, vista.ids, filtros, vista.desde, 'mes');
  return porMes(base, vista.hoy).map((m) => ({
    clave: m.clave,
    etiqueta: m.etiqueta,
    partes: [
      { clave: 'c', etiqueta: 'Confirmadas', valor: m.confirmadas, color: COLOR_REVISION.Confirmada },
      { clave: 'p', etiqueta: 'Pendientes', valor: m.pendientes, color: COLOR_REVISION.Pendiente },
    ],
  }));
}

function Resumen({ datos, vista, filtros, alternar }: PropsPagina & { datos: Analisis }) {
  const { k } = vista;
  return (
    <>
      <StatGrid>
        <StatTile label="Árboles" value={entero(k.total)} icon="tree" />
        <StatTile label="En riesgo o críticos" value={formatPorcentaje(k.pctRiesgo)} tono={k.criticos ? 'critico' : 'riesgo'} icon="warning" />
        <StatTile label="Prioritarios" value={entero(k.prioritarios)} hint="Críticos o con interferencia" tono="critico" icon="flag" />
        <StatTile label="Sin inspección reciente" value={entero(k.sinRevisita)} tono="riesgo" icon="calendar" />
        <StatTile label="Especies" value={entero(k.especies)} hint={k.pctNativas == null ? undefined : `${formatPorcentaje(k.pctNativas)} nativas`} icon="leaf" />
        <StatTile label="CO2 almacenado" value={toneladas(k.co2T)} icon="air" />
        <StatTile label="Inspecciones" value={entero(k.inspecciones)} hint={`${entero(k.pendientes)} pendientes de revisión`} tono="info" icon="review" />
        <StatTile label="Cobertura" value={formatPorcentaje(k.cobertura)} hint="Árboles con inspección válida en el periodo" tono="info" icon="checkCircle" />
      </StatGrid>
      <Row>
        <Panel titulo="Estado del arbolado" subtitulo="Toca un estado para filtrar">
          <DonutChart slices={slicesEstado(vista.sin('estado'))} centerLabel="árboles" seleccion={filtros.estado} onSelect={alternar('estado')} />
        </Panel>
        <Panel titulo="Especies" subtitulo="Las 10 con más árboles">
          <Barras items={agrupar(vista.sin('especie'), (a) => valorArbol(a, 'especie'), { maximo: 10 })} seleccion={filtros.especie} onSelect={alternar('especie')} />
        </Panel>
      </Row>
      <Row>
        <Panel titulo="Estado por zona">
          <Leyenda partes={ESTADOS.map((e) => ({ etiqueta: e, color: COLOR_ESTADO[e] }))} />
          <BarrasApiladas items={zonasPorEstado(vista.sin('zona'))} seleccion={filtros.zona} onSelect={alternar('zona')} />
        </Panel>
        <Panel titulo="Inspecciones por mes" subtitulo="Últimos 12 meses, sin las anuladas. Toca un mes para verlo solo.">
          <Leyenda partes={[{ etiqueta: 'Confirmadas', color: COLOR_REVISION.Confirmada }, { etiqueta: 'Pendientes', color: COLOR_REVISION.Pendiente }]} />
          <Columnas items={mesesConRevision(datos, vista, filtros)} seleccion={filtros.mes} onSelect={alternar('mes')} />
        </Panel>
      </Row>
      {datos.sedes.length > 1 ? (
        <Row>
          <Panel titulo="Por sede">
            <Barras
              items={agrupar(vista.sin('sede'), (a) => a.sede_id, { etiqueta: (id) => vista.sedes.get(id) ?? id })}
              seleccion={filtros.sede}
              onSelect={alternar('sede')}
            />
          </Panel>
        </Row>
      ) : null}
    </>
  );
}

function ListaArboles({ arboles, detalle }: { arboles: ArbolAnalisis[]; detalle: (a: ArbolAnalisis) => string }) {
  const styles = useStyles();
  const [todos, setTodos] = useState(false);
  if (!arboles.length) return <Text style={styles.vacio}>No hay árboles en esta lista con los filtros elegidos.</Text>;
  const visibles = todos ? arboles : arboles.slice(0, 12);
  return (
    <View style={styles.lista}>
      {visibles.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="link"
          onPress={() => router.push(`/(app)/trees/${a.id}` as Href)}
          style={({ pressed }) => [styles.filaArbol, pressed && styles.presionado]}
        >
          <View style={[styles.marca, { backgroundColor: COLOR_ESTADO[a.estado] ?? '#8C8A83' }]} />
          <View style={styles.flex}>
            <Text style={styles.codigo}>{a.codigo ?? 'Sin código'} · {a.especie ?? 'Sin especie'}</Text>
            <Text style={styles.detalle} numberOfLines={1}>{detalle(a)}</Text>
          </View>
          <Badge label={a.estado} tono={a.estado === 'Crítico' ? 'critico' : a.estado === 'En riesgo' ? 'riesgo' : 'sano'} />
        </Pressable>
      ))}
      {arboles.length > visibles.length ? (
        <PrimaryButton title={`Ver los ${arboles.length}`} variant="ghost" compact onPress={() => setTodos(true)} />
      ) : null}
    </View>
  );
}

function Riesgo({ vista, filtros, alternar }: PropsPagina) {
  const { k } = vista;
  const prioritarios = vista.arboles
    .filter((a) => a.prioritario)
    .sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || (b.puntaje ?? 0) - (a.puntaje ?? 0));
  const sinRevisita = vista.arboles.filter((a) => a.revisita_pendiente).sort((a, b) => (b.dias_desde ?? 99999) - (a.dias_desde ?? 99999));
  return (
    <>
      <StatGrid>
        <StatTile label="Críticos" value={entero(k.criticos)} tono="critico" icon="warning" />
        <StatTile label="En riesgo" value={entero(k.riesgo)} tono="riesgo" icon="warning" />
        <StatTile label="Prioritarios" value={entero(k.prioritarios)} tono="critico" icon="flag" />
        <StatTile label="Puntaje de riesgo promedio" value={formatNumero(k.puntaje, 2)} icon="chart" />
        <StatTile label="Sin inspección reciente" value={entero(k.sinRevisita)} tono="riesgo" icon="calendar" />
      </StatGrid>
      <Row>
        <Panel titulo="Estado del arbolado">
          <DonutChart slices={slicesEstado(vista.sin('estado'))} centerLabel="árboles" seleccion={filtros.estado} onSelect={alternar('estado')} />
        </Panel>
        <Panel titulo="Interferencia con infraestructura" subtitulo="Según la última inspección válida">
          <Barras
            items={agrupar(vista.sin('interferencia'), (a) => valorArbol(a, 'interferencia'))}
            seleccion={filtros.interferencia}
            onSelect={alternar('interferencia')}
            color="#B45309"
          />
        </Panel>
      </Row>
      <Row>
        <Panel titulo="Árboles prioritarios" subtitulo="Del más urgente al menos urgente. Toca uno para abrirlo.">
          <ListaArboles
            arboles={prioritarios}
            detalle={(a) => [a.zona, a.interferencia && a.interferencia !== 'Ninguna' ? a.interferencia : null, a.puntaje != null ? `puntaje ${formatNumero(a.puntaje, 2)}` : null].filter(Boolean).join(' · ')}
          />
        </Panel>
        <Panel titulo="Sin inspección reciente" subtitulo="Pasó la ventana de revisita sin una inspección válida">
          <ListaArboles
            arboles={sinRevisita}
            detalle={(a) => [a.zona, a.ultima_inspeccion ? `última: ${formatFecha(a.ultima_inspeccion)} (hace ${entero(a.dias_desde ?? 0)} días)` : 'sin inspecciones válidas'].filter(Boolean).join(' · ')}
          />
        </Panel>
      </Row>
    </>
  );
}

function Inspecciones({ datos, vista, filtros, alternar }: PropsPagina & { datos: Analisis }) {
  const { k } = vista;
  const porCurso = filtrarInspecciones(datos.inspecciones, vista.ids, filtros, vista.desde, 'curso');
  const validas = vista.inspecciones.filter((i) => i.revision !== 'Anulada');
  return (
    <>
      <StatGrid>
        <StatTile label="Inspecciones" value={entero(k.inspecciones)} icon="review" />
        <StatTile label="Confirmadas" value={entero(k.confirmadas)} tono="sano" icon="checkCircle" />
        <StatTile label="Pendientes de revisión" value={entero(k.pendientes)} tono="riesgo" icon="review" />
        <StatTile label="Anuladas" value={entero(k.anuladas)} tono="neutro" icon="close" />
        <StatTile label="Revisadas" value={formatPorcentaje(k.pctRevisadas)} tono="info" icon="chart" />
        <StatTile label="Horas hasta la revisión" value={formatNumero(k.horasRevision, 1)} hint="Promedio" icon="calendar" />
      </StatGrid>
      <Row>
        <Panel titulo="Inspecciones por mes" subtitulo="Toca un mes para verlo solo">
          <Leyenda partes={[{ etiqueta: 'Confirmadas', color: COLOR_REVISION.Confirmada }, { etiqueta: 'Pendientes', color: COLOR_REVISION.Pendiente }]} />
          <Columnas items={mesesConRevision(datos, vista, filtros)} seleccion={filtros.mes} onSelect={alternar('mes')} />
        </Panel>
        <Panel titulo="Por curso" subtitulo="Curso de quien hizo la inspección">
          <Barras items={agrupar(porCurso, (i) => i.curso)} seleccion={filtros.curso} onSelect={alternar('curso')} color="#0369A1" />
        </Panel>
      </Row>
      <Row>
        <Panel titulo="Hallazgos más frecuentes" subtitulo="Sin los de inspecciones anuladas">
          <Barras items={agrupar(vista.hallazgos, (h) => h.hallazgo, { maximo: 10, otras: 'Otros' })} color="#F59E0B" />
        </Panel>
        <Panel titulo="Calificación de las inspecciones" subtitulo="Sin las anuladas">
          <DonutChart
            slices={ESTADOS.map((e) => ({ key: e, label: e, value: validas.filter((i) => i.calificacion === e).length, color: COLOR_ESTADO[e] }))}
            centerLabel="inspecciones"
          />
        </Panel>
      </Row>
    </>
  );
}

function Intervenciones({ datos, vista, filtros, alternar }: PropsPagina & { datos: Analisis }) {
  const styles = useStyles();
  const { k } = vista;
  const porTipo = filtrarIntervenciones(datos.intervenciones, vista.ids, filtros, vista.desde, 'tipo');
  const codigos = new Map(datos.arboles.map((a) => [a.id, a]));
  const programadas = vista.intervenciones
    .filter((v) => v.estado === 'Programada')
    .sort((a, b) => (a.fecha_programada ?? '9999').localeCompare(b.fecha_programada ?? '9999'));
  return (
    <>
      <StatGrid>
        <StatTile label="Ejecutadas" value={entero(k.ejecutadas)} tono="sano" icon="checkCircle" />
        <StatTile label="Programadas" value={entero(k.programadas)} tono="info" icon="calendar" />
        <StatTile label="Vencidas" value={entero(k.vencidas)} tono="critico" icon="warning" />
        <StatTile label="Costo ejecutado" value={formatPesos(k.costoEjecutado)} icon="wallet" />
        <StatTile label="Costo programado" value={formatPesos(k.costoProgramado)} icon="wallet" />
        <StatTile label="Ejecutadas con éxito" value={formatPorcentaje(k.eficacia)} tono="sano" icon="trending" />
      </StatGrid>
      <Row>
        <Panel titulo="Por tipo" subtitulo="Toca un tipo para filtrar">
          <Barras items={agrupar(porTipo, (v) => v.tipo ?? 'Sin tipo')} seleccion={filtros.tipo} onSelect={alternar('tipo')} color="#1BAF7A" />
        </Panel>
        <Panel titulo="Por estado">
          <Barras items={agrupar(vista.intervenciones, (v) => v.estado ?? 'Sin estado')} color="#0369A1" />
        </Panel>
      </Row>
      <Row>
        <Panel titulo="Programadas" subtitulo="De la más próxima a la más lejana">
          {!programadas.length ? <Text style={styles.vacio}>No hay intervenciones programadas con estos filtros.</Text> : (
            <View style={styles.lista}>
              {programadas.slice(0, 30).map((v, n) => {
                const arbol = codigos.get(v.arbol_id);
                return (
                  <Pressable
                    key={`${v.arbol_id}-${n}`}
                    accessibilityRole="link"
                    onPress={() => router.push(`/(app)/trees/${v.arbol_id}` as Href)}
                    style={({ pressed }) => [styles.filaArbol, pressed && styles.presionado]}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.codigo}>{v.tipo ?? 'Sin tipo'} · {arbol?.codigo ?? 'Árbol'}</Text>
                      <Text style={styles.detalle}>{formatFecha(v.fecha_programada)} · {formatPesos(v.costo_estimado)}</Text>
                    </View>
                    {v.vencida ? <Badge label="Vencida" tono="critico" /> : <Badge label="Al día" tono="info" />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Panel>
      </Row>
    </>
  );
}

function Carbono({ vista, filtros, alternar }: PropsPagina) {
  const styles = useStyles();
  const { k } = vista;
  const conMedidas = vista.arboles.filter((a) => a.dap != null && a.altura != null);
  const clases = vista.sin('clase_dap');
  const ordenClase = new Map(clases.map((a) => [valorArbol(a, 'clase_dap') ?? '', a.clase_dap_orden ?? 99]));
  const porClase = agrupar(clases, (a) => valorArbol(a, 'clase_dap'))
    .sort((a, b) => (ordenClase.get(a.clave) ?? 99) - (ordenClase.get(b.clave) ?? 99));
  return (
    <>
      <StatGrid>
        <StatTile label="CO2 almacenado" value={toneladas(k.co2T)} icon="air" />
        <StatTile label="Biomasa" value={toneladas(k.biomasaT)} icon="biomass" />
        <StatTile label="Carbono" value={toneladas(k.carbonoT)} icon="leaf" />
        <StatTile label="Área de copa" value={`${entero(k.areaCopa)} m²`} icon="tree" />
        <StatTile label="DAP promedio" value={`${formatNumero(k.dap, 1)} cm`} icon="ruler" />
        <StatTile label="Altura promedio" value={`${formatNumero(k.altura, 1)} m`} icon="height" />
      </StatGrid>
      <Row>
        <Panel titulo="CO2 por especie" subtitulo="Toneladas guardadas en la madera">
          <Barras
            items={agrupar(vista.sin('especie'), (a) => valorArbol(a, 'especie'), { valor: (a) => (a.co2_kg ?? 0) / 1000, maximo: 10 })}
            seleccion={filtros.especie}
            onSelect={alternar('especie')}
            formato={toneladas}
            color="#1BAF7A"
          />
        </Panel>
        <Panel titulo="Clases de diámetro (DAP)" subtitulo="Toca una clase para filtrar">
          <Barras items={porClase} seleccion={filtros.clase_dap} onSelect={alternar('clase_dap')} color="#0369A1" />
        </Panel>
      </Row>
      <Row>
        <Panel titulo="DAP y altura" subtitulo={`${entero(conMedidas.length)} árboles con las dos medidas`}>
          <Dispersion puntos={conMedidas.map((a) => ({ id: a.id, x: a.dap as number, y: a.altura as number }))} recta={null} alto={260} />
        </Panel>
        <Panel titulo="Origen de las especies" subtitulo="Nativas o exóticas en Colombia">
          <Barras items={agrupar(vista.sin('origen'), (a) => a.origen)} seleccion={filtros.origen} onSelect={alternar('origen')} color="#166534" />
        </Panel>
      </Row>
      <Text style={styles.nota}>El CO2 es lo que cada árbol ha guardado en su madera durante su vida, calculado con el método de su última inspección válida. No es lo que captura en un año.</Text>
    </>
  );
}

const ORDENES = [
  { label: 'Código', value: 'codigo' },
  { label: 'Estado', value: 'estado' },
  { label: 'Más CO2', value: 'co2' },
  { label: 'Más días sin inspección', value: 'dias' },
] as const;
type Orden = (typeof ORDENES)[number]['value'];

function Inventario({ arboles }: { arboles: ArbolAnalisis[] }) {
  const styles = useStyles();
  const [texto, setTexto] = useState('');
  const [orden, setOrden] = useState<Orden>('codigo');
  const [cuantos, setCuantos] = useState(FILAS_INVENTARIO);
  const buscado = texto.trim().toLocaleLowerCase('es');
  const lista = arboles
    .filter((a) => !buscado || [a.codigo, a.especie, a.nombre_cientifico, a.zona].some((v) => v?.toLocaleLowerCase('es').includes(buscado)))
    .sort((a, b) => {
      if (orden === 'estado') return (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || (a.codigo ?? '').localeCompare(b.codigo ?? '');
      if (orden === 'co2') return (b.co2_kg ?? -1) - (a.co2_kg ?? -1);
      if (orden === 'dias') return (b.dias_desde ?? 99999) - (a.dias_desde ?? 99999);
      return (a.codigo ?? '').localeCompare(b.codigo ?? '', 'es', { numeric: true });
    });
  return (
    <Card title="Inventario" subtitle={`${entero(lista.length)} de ${entero(arboles.length)} árboles con los filtros elegidos`}>
      <Field label="Buscar" value={texto} onChangeText={setTexto} placeholder="Código, especie o zona" autoCapitalize="none" />
      <Tabs value={orden} options={ORDENES.map((o) => ({ label: o.label, value: o.value }))} onChange={setOrden} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tablaScroll}>
        <View style={styles.tabla}>
          <View style={[styles.tablaFila, styles.tablaEncabezado]}>
            {['Código', 'Especie', 'Zona', 'Estado', 'DAP (cm)', 'Altura (m)', 'CO2 (kg)', 'Última inspección'].map((t, i) => (
              <Text key={t} style={[styles.celda, styles.celdaEncabezado, ANCHOS[i], i >= 4 && i <= 6 && styles.derecha]}>{t}</Text>
            ))}
          </View>
          {lista.slice(0, cuantos).map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="link"
              onPress={() => router.push(`/(app)/trees/${a.id}` as Href)}
              style={({ pressed }) => [styles.tablaFila, pressed && styles.presionado]}
            >
              <Text style={[styles.celda, styles.celdaFuerte, ANCHOS[0]]}>{a.codigo ?? '—'}</Text>
              <Text style={[styles.celda, ANCHOS[1]]} numberOfLines={1}>{a.especie ?? '—'}</Text>
              <Text style={[styles.celda, ANCHOS[2]]} numberOfLines={1}>{a.zona ?? '—'}</Text>
              <View style={[styles.celdaEstado, ANCHOS[3]]}>
                <View style={[styles.marcaChica, { backgroundColor: COLOR_ESTADO[a.estado] ?? '#8C8A83' }]} />
                <Text style={styles.celda}>{a.estado}</Text>
              </View>
              <Text style={[styles.celda, ANCHOS[4], styles.derecha]}>{formatNumero(a.dap, 1)}</Text>
              <Text style={[styles.celda, ANCHOS[5], styles.derecha]}>{formatNumero(a.altura, 1)}</Text>
              <Text style={[styles.celda, ANCHOS[6], styles.derecha]}>{formatNumero(a.co2_kg, 0)}</Text>
              <Text style={[styles.celda, ANCHOS[7]]}>{formatFecha(a.ultima_inspeccion)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {lista.length > cuantos ? (
        <PrimaryButton title={`Ver ${entero(Math.min(FILAS_INVENTARIO, lista.length - cuantos))} más`} variant="secondary" compact onPress={() => setCuantos((c) => c + FILAS_INVENTARIO)} />
      ) : null}
    </Card>
  );
}

const ANCHOS = [{ width: 110 }, { width: 160 }, { width: 150 }, { width: 110 }, { width: 80 }, { width: 80 }, { width: 80 }, { width: 130 }];

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1, minWidth: 0 },
  presionado: { opacity: 0.75 },
  vivo: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: palette.forestSoft },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1BAF7A' },
  puntoCargando: { backgroundColor: palette.sun },
  vivoTexto: { color: palette.forest, fontSize: 12, fontFamily: fonts.bold },
  controles: { gap: 8 },
  periodo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  periodoTexto: { color: palette.muted, fontSize: 12, fontFamily: fonts.semiBold },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: palette.forestSoft, borderWidth: 1, borderColor: palette.forest },
  chipTexto: { color: palette.forest, fontSize: 13, fontFamily: fonts.bold },
  limpiar: { paddingHorizontal: 10, paddingVertical: 7 },
  limpiarTexto: { color: palette.muted, fontSize: 13, fontFamily: fonts.semiBold, textDecorationLine: 'underline' },
  nota: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  vacio: { color: palette.muted, fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  lista: { gap: 6 },
  filaArbol: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: palette.tile },
  marca: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  codigo: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  detalle: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  tablaScroll: { flexGrow: 1 },
  tabla: { flexGrow: 1, minWidth: 900 },
  tablaFila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
  tablaEncabezado: { backgroundColor: palette.tile, borderRadius: 10, borderBottomWidth: 0 },
  celda: { color: palette.ink, fontSize: 13 },
  celdaFuerte: { fontFamily: fonts.bold },
  celdaEncabezado: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold },
  celdaEstado: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marcaChica: { width: 9, height: 9, borderRadius: 3 },
  derecha: { textAlign: 'right' },
}));
