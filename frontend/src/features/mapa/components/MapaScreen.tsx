import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { chartColors, fonts } from '@/config/constants';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { useClasificarEspecie, useGuardarZona, useMapa, useOlvidarZona, useZonasGuardadas } from '@/features/mapa/api';
import {
  anilloDe,
  CAPAS_INICIALES,
  claseDe,
  claveEspecie,
  COLOR_ALERTA,
  COLOR_SEDE,
  COLOR_SIEMBRA,
  coloresDe,
  especiesConColor,
  leyenda,
  MODOS,
  ORIGENES,
  RIESGOS,
  type CapasVisibles,
  type ClaseLeyenda,
  type ModoColor,
} from '@/features/mapa/capas';
import { MapaVista, type PuntoMapa } from '@/features/mapa/components/MapaVista';
import { limitesVisibles, zoomDeTeselas, type Camara } from '@/features/mapa/geo';
import type { ArbolMapa, EspecieMapa, Mapa, Origen, SedeMapa } from '@/features/mapa/schemas';
import { planDeZona, ZonaMuyGrande } from '@/features/mapa/teselas';
import { getApiErrorMessage } from '@/services/api/client';
import { Casilla, ChoiceChip, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { AppHeader, Badge, Card, EmptyState, ErrorState, LoadingState, Page, StatGrid, StatTile, StateBadge, Tabs, type Tono } from '@/shared/components/UI';
import { formatFecha, formatFechaHora, formatNumero } from '@/shared/format';
import { useIsWide } from '@/hooks/use-is-wide';
import { crearEstilos, useTema } from '@/theme';

/** Desde cuántos árboles se ocultan los puntos al ver la ciudad completa (quedan las sedes). */
const MUCHOS_ARBOLES = 400;
const ZOOM_ARBOLES = 15;

const TONO_RIESGO: Record<keyof typeof RIESGOS, Tono> = { bajo: 'sano', medio: 'riesgo', alto: 'critico', inminente: 'critico' };

function Leyenda({ clases, ocultas, onCambiar }: { clases: ClaseLeyenda[]; ocultas: Set<string>; onCambiar: (clave: string) => void }) {
  const styles = useStyles();
  if (!clases.length) return null;
  return (
    <View style={styles.leyenda} accessibilityLabel="Leyenda. Toca una clase para ocultarla o mostrarla.">
      {clases.map((c) => {
        const oculta = ocultas.has(c.clave);
        return (
          <Pressable
            key={c.clave}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !oculta }}
            accessibilityLabel={`${c.etiqueta}: ${c.total}`}
            onPress={() => onCambiar(c.clave)}
            style={({ pressed }) => [styles.clase, oculta && styles.claseOculta, pressed && styles.presionado]}
          >
            <View style={[styles.punto, { backgroundColor: c.color }]} />
            <Text style={[styles.claseTexto, oculta && styles.claseTextoOculto]} numberOfLines={1}>{c.etiqueta}</Text>
            <Text style={styles.claseTotal}>{formatNumero(c.total, 0)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FichaArbol({ arbol, onCerrar }: { arbol: ArbolMapa; onCerrar: () => void }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.ficha}>
      <View style={styles.fichaTop}>
        <View style={styles.flex}>
          <Text style={styles.fichaTitulo}>{arbol.codigo ?? 'Árbol'} · {arbol.nombre_comun}</Text>
          {arbol.nombre_cientifico ? <Text style={styles.cientifico}>{arbol.nombre_cientifico}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onCerrar} hitSlop={8} style={styles.cerrar}>
          <Icon name="close" size={18} color={palette.muted} />
        </Pressable>
      </View>
      <View style={styles.insignias}>
        {arbol.estado ? <StateBadge estado={arbol.estado} /> : null}
        {arbol.riesgo ? <Badge label={`Riesgo de caída ${RIESGOS[arbol.riesgo].toLowerCase()}`} tono={TONO_RIESGO[arbol.riesgo]} /> : null}
        {arbol.alerta ? <Badge label={arbol.alerta === 'confirmada' ? 'Alerta confirmada' : 'Alerta por confirmar'} tono="critico" /> : null}
        {arbol.origen ? <Badge label={ORIGENES[arbol.origen]} tono={arbol.origen === 'nativa' ? 'sano' : 'info'} /> : null}
        {arbol.siembra ? <Badge label="Siembra reciente" tono="sano" /> : null}
      </View>
      <Text style={styles.meta}>
        {[arbol.zona, arbol.etapa, `Registrado el ${formatFecha(arbol.registrado_en)}`].filter(Boolean).join(' · ')}
      </Text>
      <PrimaryButton title="Ver ficha del árbol" icon="forward" compact variant="secondary" onPress={() => router.push(`/(app)/trees/${arbol.id}` as Href)} />
    </View>
  );
}

function FichaSede({ sede, onAcercar, onCerrar }: { sede: SedeMapa; onAcercar: () => void; onCerrar: () => void }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.ficha}>
      <View style={styles.fichaTop}>
        <View style={styles.flex}>
          <Text style={styles.fichaTitulo}>{sede.nombre ?? sede.nombre_corto}</Text>
          <Text style={styles.meta}>
            {formatNumero(sede.arboles, 0)} {sede.arboles === 1 ? 'árbol' : 'árboles'}
            {sede.alertas ? ` · ${sede.alertas} con alerta de caída abierta` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onCerrar} hitSlop={8} style={styles.cerrar}>
          <Icon name="close" size={18} color={palette.muted} />
        </Pressable>
      </View>
      <PrimaryButton title="Acercar a la sede" icon="add" compact variant="secondary" onPress={onAcercar} />
    </View>
  );
}

function Capas({ capas, onCambiar, datos }: { capas: CapasVisibles; onCambiar: (c: CapasVisibles) => void; datos: Mapa }) {
  const styles = useStyles();
  const cambiar = (clave: keyof CapasVisibles) => (valor: boolean) => onCambiar({ ...capas, [clave]: valor });
  return (
    <Card title="Capas" icon="capas">
      <Casilla checked={capas.arboles} onChange={cambiar('arboles')}>Árboles ({formatNumero(datos.resumen.total, 0)})</Casilla>
      <Casilla checked={capas.sedes} onChange={cambiar('sedes')}>Sedes con su número de árboles</Casilla>
      <Casilla checked={capas.alertas} onChange={cambiar('alertas')}>
        <Text style={{ color: COLOR_ALERTA, fontFamily: fonts.bold }}>Anillo rojo:</Text> alertas de caída abiertas ({datos.resumen.alertas})
      </Casilla>
      <Casilla checked={capas.siembras} onChange={cambiar('siembras')}>
        <Text style={{ color: COLOR_SIEMBRA, fontFamily: fonts.bold }}>Anillo verde:</Text> siembras recientes ({datos.resumen.siembras}), plántulas registradas en los últimos 12 meses
      </Casilla>
      <Casilla checked={capas.fondo} onChange={cambiar('fondo')}>Mapa base (calles y manzanas)</Casilla>
      <Text style={styles.nota}>Para trabajar en un SIG (QGIS, ArcGIS) descarga el inventario en GeoJSON o Shapefile desde Exportar datos.</Text>
    </Card>
  );
}

function Especies({ especies, editable }: { especies: EspecieMapa[]; editable: boolean }) {
  const styles = useStyles();
  const clasificar = useClasificarEspecie();
  const [todas, setTodas] = useState(false);
  const lista = todas ? especies : especies.slice(0, 8);
  const sinClasificar = especies.filter((e) => !e.origen).length;
  return (
    <Card
      title="Especies"
      subtitle={`${especies.length} ${especies.length === 1 ? 'especie' : 'especies'}${sinClasificar ? ` · ${sinClasificar} sin clasificar` : ''}`}
      icon="leaf"
    >
      {clasificar.error ? <InlineMessage>{getApiErrorMessage(clasificar.error)}</InlineMessage> : null}
      <View style={styles.lista}>
        {lista.map((e) => (
          <View key={claveEspecie(e)} style={styles.especie}>
            <View style={styles.especieTop}>
              <View style={styles.flex}>
                <Text style={styles.especieNombre}>{e.nombre_comun}</Text>
                {e.nombre_cientifico ? <Text style={styles.cientifico}>{e.nombre_cientifico}</Text> : null}
              </View>
              <Text style={styles.especieTotal}>{formatNumero(e.total, 0)}</Text>
            </View>
            {editable && e.especie_id != null ? (
              <View style={styles.chips}>
                {(['nativa', 'exotica'] as Origen[]).map((o) => (
                  <ChoiceChip
                    key={o}
                    label={ORIGENES[o]}
                    selected={e.origen === o}
                    onPress={() => clasificar.mutate({ especieId: e.especie_id as number, origen: o })}
                  />
                ))}
                {e.origen !== e.origen_sugerido ? (
                  <ChoiceChip label="Usar la lista" selected={false} onPress={() => clasificar.mutate({ especieId: e.especie_id as number, origen: null })} />
                ) : null}
              </View>
            ) : (
              <View style={styles.insignias}>
                <Badge label={e.origen ? ORIGENES[e.origen] : 'Sin clasificar'} tono={e.origen === 'nativa' ? 'sano' : e.origen === 'exotica' ? 'info' : 'neutro'} />
              </View>
            )}
          </View>
        ))}
      </View>
      {especies.length > 8 ? (
        <PrimaryButton title={todas ? 'Ver menos' : `Ver las ${especies.length}`} variant="ghost" compact onPress={() => setTodas(!todas)} />
      ) : null}
      <Text style={styles.nota}>
        {editable
          ? 'El origen sale de una lista de especies conocidas de Colombia; corrígelo aquí si tu catálogo usa otro nombre.'
          : 'El origen (nativa o exótica en Colombia) lo revisa el administrador.'}
      </Text>
    </Card>
  );
}

function SinConexion({ vista, nombre, onIr }: { vista: { camara: Camara; ancho: number; alto: number } | null; nombre: string; onIr: (lat: number, lng: number) => void }) {
  const styles = useStyles();
  const zonas = useZonasGuardadas();
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const guardar = useGuardarZona((hechas, total) => setAvance({ hechas, total }));
  const olvidar = useOlvidarZona();
  const limites = vista ? limitesVisibles(vista.camara, vista.ancho, vista.alto) : null;
  const plan = vista && limites ? planDeZona(limites, vista.camara.zoom) : null;
  const centro = limites ? { lat: (limites.norte + limites.sur) / 2, lng: (limites.este + limites.oeste) / 2 } : null;

  return (
    <Card title="Usar sin conexión" subtitle="Guarda en el teléfono el mapa base de la zona que estás viendo." icon="sinConexion">
      {plan ? (
        <Text style={styles.texto}>
          Se guardarán {plan.teselas.length} imágenes del mapa base (acercamiento {plan.zoomDesde} a {plan.zoomHasta}). Los árboles del mapa quedan guardados cada vez que lo abres con señal.
        </Text>
      ) : (
        <Text style={styles.texto}>La zona que ves es muy grande para guardarla: acerca el mapa a la sede.</Text>
      )}
      {guardar.error ? (
        <InlineMessage>{guardar.error instanceof ZonaMuyGrande ? guardar.error.message : getApiErrorMessage(guardar.error)}</InlineMessage>
      ) : null}
      {guardar.data && !guardar.isPending ? (
        <InlineMessage tone={guardar.data.fallidas ? 'warning' : 'success'}>
          {guardar.data.fallidas
            ? `Zona guardada, pero ${guardar.data.fallidas} imágenes no se pudieron descargar. Vuelve a intentarlo con mejor señal.`
            : 'Zona guardada: el mapa base se verá aunque no haya señal.'}
        </InlineMessage>
      ) : null}
      <PrimaryButton
        title={guardar.isPending && avance ? `Guardando ${avance.hechas} de ${avance.total}…` : 'Guardar esta zona'}
        icon="download"
        loading={guardar.isPending && !avance}
        disabled={!plan || !limites || !centro || guardar.isPending}
        onPress={() => {
          if (!vista || !limites || !centro) return;
          setAvance(null);
          guardar.mutate({ clave: `${centro.lat.toFixed(3)},${centro.lng.toFixed(3)}`, nombre, limites, zoom: vista.camara.zoom });
        }}
      />
      {zonas.data?.length ? (
        <View style={styles.lista}>
          {zonas.data.map((z) => (
            <View key={z.clave} style={styles.zona}>
              <View style={styles.flex}>
                <Text style={styles.especieNombre}>{z.nombre}</Text>
                <Text style={styles.meta}>Guardada el {formatFechaHora(z.guardadaEn)} · {z.teselas} imágenes</Text>
              </View>
              <PrimaryButton title="Ir" compact variant="secondary" onPress={() => onIr((z.limites.norte + z.limites.sur) / 2, (z.limites.este + z.limites.oeste) / 2)} />
              <PrimaryButton title="Quitar" compact variant="ghost" onPress={() => olvidar.mutate(z.clave)} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Mapa con capas: un visor común para el colegio, la Secretaría y la autoridad ambiental. */
export function MapaScreen() {
  const styles = useStyles();
  const isWide = useIsWide();
  const { height } = useWindowDimensions();
  const perfil = useMiPerfil();
  const admin = esAdmin(perfil.data);
  const institucion = useInstitucionElegida();
  const institucionId = institucion.institucionId;
  const mapa = useMapa(institucionId, !perfil.isLoading);
  const { arbol: arbolInicial } = useLocalSearchParams<{ arbol?: string }>();

  const [modo, setModo] = useState<ModoColor>('estado');
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [capas, setCapas] = useState<CapasVisibles>(CAPAS_INICIALES);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [enfocar, setEnfocar] = useState<{ clave: string; lat: number; lng: number } | null>(null);
  const [vista, setVista] = useState<{ camara: Camara; ancho: number; alto: number } | null>(null);
  const [inicial, setInicial] = useState<string | null>(null);

  const datos = mapa.data;
  // Abrir el mapa desde la ficha de un árbol (/map?arbol=…) lo selecciona y lo centra.
  if (datos && arbolInicial && inicial !== arbolInicial) {
    const a = datos.arboles.find((x) => x.id === arbolInicial);
    setInicial(arbolInicial);
    if (a) {
      setSeleccionado(a.id);
      setEnfocar({ clave: `arbol:${a.id}`, lat: a.lat, lng: a.lng });
    }
  }

  const clases = useMemo(() => (datos ? leyenda(datos.arboles, modo, datos.especies) : []), [datos, modo]);
  const muchos = (datos?.arboles.length ?? 0) > MUCHOS_ARBOLES;
  const puntos = useMemo<PuntoMapa[]>(() => {
    if (!datos) return [];
    const colores = coloresDe(clases);
    const conColor = especiesConColor(datos.especies);
    const arboles: PuntoMapa[] = capas.arboles
      ? datos.arboles
          .map((a) => ({ a, clase: claseDe(a, modo, conColor) }))
          .filter(({ clase }) => !ocultas.has(clase))
          .map(({ a, clase }) => ({
            id: a.id, lat: a.lat, lng: a.lng, tipo: 'arbol' as const, color: colores[clase] ?? chartColors.other,
            anillo: anilloDe(a, capas), zoomDesde: muchos ? ZOOM_ARBOLES : undefined,
          }))
      : [];
    const sedes: PuntoMapa[] = capas.sedes
      ? datos.sedes
          .filter((s) => s.lat != null && s.lng != null)
          .map((s) => ({
            id: `sede:${s.id}`, lat: s.lat as number, lng: s.lng as number, tipo: 'sede' as const, color: COLOR_SEDE,
            texto: formatNumero(s.arboles, 0), etiqueta: s.nombre_corto ?? undefined,
            // De cerca la sede taparía los árboles que tiene alrededor.
            zoomHasta: capas.arboles && s.arboles > 0 ? 17 : undefined,
          }))
      : [];
    return [...arboles, ...sedes];
  }, [datos, clases, modo, ocultas, capas, muchos]);

  const arbolElegido = seleccionado && datos ? datos.arboles.find((a) => a.id === seleccionado) : undefined;
  const sedeElegida = seleccionado?.startsWith('sede:') && datos ? datos.sedes.find((s) => `sede:${s.id}` === seleccionado) : undefined;
  const zoomTeselas = vista ? zoomDeTeselas(vista.camara.zoom) : 0;
  const aviso = muchos && capas.arboles && vista && zoomTeselas < ZOOM_ARBOLES
    ? `Acerca el mapa para ver cada uno de los ${formatNumero(datos?.resumen.total ?? 0, 0)} árboles.`
    : null;
  const altoMapa = isWide ? Math.max(440, Math.min(640, height - 240)) : Math.max(320, Math.min(520, Math.round(height * 0.55)));
  const nombreZona = sedeElegida?.nombre_corto
    ?? datos?.sedes.find((s) => s.id === (arbolElegido?.institucion_id ?? institucionId))?.nombre_corto
    ?? (datos?.sedes.length === 1 ? datos.sedes[0].nombre_corto : null)
    ?? 'Zona del mapa';

  function cambiarModo(m: ModoColor) {
    setModo(m);
    setOcultas(new Set());
  }

  function alternar(clave: string) {
    const nuevas = new Set(ocultas);
    if (nuevas.has(clave)) nuevas.delete(clave);
    else nuevas.add(clave);
    setOcultas(nuevas);
  }

  return (
    <Page onRefresh={() => void mapa.refetch()} refreshing={mapa.isRefetching}>
      <AppHeader
        eyebrow="Mapa"
        title="Mapa del arbolado"
        subtitle="Sedes y árboles por estado, riesgo de caída, especie y origen. Toca un punto para ver su ficha."
      />
      {admin ? (
        <InstitucionSelector
          value={institucionId}
          onChange={(v) => {
            institucion.setInstitucionId(v);
            setSeleccionado(null);
          }}
        />
      ) : null}

      {mapa.isLoading || perfil.isLoading ? (
        <LoadingState text="Cargando el mapa…" />
      ) : mapa.error && !datos ? (
        <ErrorState error={mapa.error} onRetry={() => void mapa.refetch()} />
      ) : !datos ? null : !datos.arboles.length && !datos.sedes.some((s) => s.lat != null) ? (
        <EmptyState title="Aún no hay nada que ubicar" text="Los árboles aparecerán aquí cuando se registren con su ubicación." />
      ) : (
        <View style={[styles.cuerpo, isWide && styles.cuerpoAncho]}>
          <View style={[styles.columnaMapa, isWide && styles.columnaMapaAncha]}>
            <Tabs<ModoColor> value={modo} onChange={cambiarModo} options={MODOS.map((m) => ({ label: m.etiqueta, value: m.valor }))} />
            <MapaVista
              puntos={puntos}
              encuadre={{ clave: datos.institucion_id ?? 'todas', limites: datos.limites }}
              enfocar={enfocar}
              seleccionado={seleccionado}
              onTocar={setSeleccionado}
              onCamara={(camara, ancho, alto) => setVista({ camara, ancho, alto })}
              fondo={capas.fondo}
              alto={altoMapa}
              aviso={aviso}
            />
            <Leyenda clases={clases} ocultas={ocultas} onCambiar={alternar} />
            {arbolElegido ? <FichaArbol arbol={arbolElegido} onCerrar={() => setSeleccionado(null)} /> : null}
            {sedeElegida && sedeElegida.lat != null && sedeElegida.lng != null ? (
              <FichaSede
                sede={sedeElegida}
                onCerrar={() => setSeleccionado(null)}
                onAcercar={() => setEnfocar({ clave: `sede:${sedeElegida.id}:${Date.now()}`, lat: sedeElegida.lat as number, lng: sedeElegida.lng as number })}
              />
            ) : null}
            <Text style={styles.nota}>
              Datos del {formatFechaHora(datos.generado_en)}. Arrastra para moverte; pellizca, usa la rueda del ratón o toca dos veces para acercar.
            </Text>
          </View>

          <View style={[styles.columnaLateral, isWide && styles.columnaLateralAncha]}>
            <Card title="Resumen" icon="chart">
              <StatGrid>
                <StatTile label="Árboles" value={formatNumero(datos.resumen.total, 0)} icon="tree" />
                <StatTile label="Especies" value={formatNumero(datos.resumen.especies, 0)} icon="leaf" tono="info" />
                <StatTile
                  label="Nativas"
                  value={datos.resumen.pct_nativas == null ? '—' : `${formatNumero(datos.resumen.pct_nativas, 0)} %`}
                  hint="de los árboles de especie clasificada"
                  icon="leaf"
                />
                <StatTile label="Alertas abiertas" value={formatNumero(datos.resumen.alertas, 0)} icon="warning" tono={datos.resumen.alertas ? 'critico' : 'neutro'} />
              </StatGrid>
            </Card>
            <Capas capas={capas} onCambiar={setCapas} datos={datos} />
            <SinConexion
              vista={vista}
              nombre={nombreZona}
              onIr={(lat, lng) => setEnfocar({ clave: `zona:${lat},${lng}:${Date.now()}`, lat, lng })}
            />
            {datos.especies.length ? <Especies especies={datos.especies} editable={datos.origen_editable} /> : null}
          </View>
        </View>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1 },
  cuerpo: { gap: 16 },
  cuerpoAncho: { flexDirection: 'row', alignItems: 'flex-start' },
  columnaMapa: { gap: 12 },
  columnaMapaAncha: { flex: 1.7, minWidth: 0 },
  columnaLateral: { gap: 16 },
  columnaLateralAncha: { flex: 1, minWidth: 300 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  claseOculta: { opacity: 0.5 },
  presionado: { transform: [{ scale: 0.97 }] },
  punto: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#FFFFFF' },
  claseTexto: { color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold, maxWidth: 180 },
  claseTextoOculto: { textDecorationLine: 'line-through' },
  claseTotal: { color: palette.muted, fontSize: 12 },
  ficha: {
    gap: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  fichaTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fichaTitulo: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
  cientifico: { color: palette.muted, fontSize: 13, fontStyle: 'italic' },
  cerrar: { padding: 4 },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  nota: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  lista: { gap: 10 },
  especie: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  especieTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  especieNombre: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  especieTotal: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  zona: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
}));
