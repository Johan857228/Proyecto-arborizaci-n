import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useMapa } from '@/features/mapa/api';
import { COLOR_ESTADO } from '@/features/mapa/capas';
import { MapaVista, type PoligonoMapa, type PuntoMapa } from '@/features/mapa/components/MapaVista';
import type { LatLng } from '@/features/mapa/geo';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import {
  ESTILO_TIPO,
  TIPOS_ZONA,
  useEditarZonas,
  useZonas,
  type TipoZona,
  type ZonaInstitucion,
  type ZonasInstitucion,
} from '@/features/zonas/api';
import { useIsWide } from '@/hooks/use-is-wide';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { Icon, type IconName } from '@/shared/components/Icon';
import { AppHeader, Card, ConfirmButton, EmptyState, ErrorState, LoadingState, Notice, Page } from '@/shared/components/UI';
import { crearEstilos, useTema } from '@/theme';

/** El contorno que se está dibujando: de qué zona y las esquinas tocadas hasta ahora. */
interface Dibujo {
  zona: ZonaInstitucion;
  puntos: LatLng[];
}

function cuantos(zona: ZonaInstitucion) {
  const partes = [
    `${zona.arboles} ${zona.arboles === 1 ? 'árbol' : 'árboles'}`,
    zona.cursos ? `${zona.cursos} ${zona.cursos === 1 ? 'curso' : 'cursos'}` : null,
  ];
  return partes.filter(Boolean).join(' · ');
}

function Accion({ icono, etiqueta, color, onPress }: { icono: IconName; etiqueta: string; color: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={etiqueta} hitSlop={6} onPress={onPress} style={styles.accion}>
      <Icon name={icono} size={16} color={color} />
    </Pressable>
  );
}

function ElegirTipo({ valor, onCambiar }: { valor: TipoZona; onCambiar: (tipo: TipoZona) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.chips}>
      {TIPOS_ZONA.map((tipo) => (
        <ChoiceChip key={tipo} label={ESTILO_TIPO[tipo].etiqueta} selected={valor === tipo} onPress={() => onCambiar(tipo)} />
      ))}
    </View>
  );
}

/** Plano del colegio: las zonas dibujadas sobre el mapa (o la foto satelital) y los árboles en su
 *  punto GPS, pintados según su estado. Dibujando, cada toque marca una esquina. */
function PlanoColegio({ datos, dibujo, setDibujo, resaltada, onElegirZona }: {
  datos: ZonasInstitucion;
  dibujo: Dibujo | null;
  setDibujo: (d: Dibujo | null) => void;
  resaltada: string | null;
  onElegirZona: (id: string | null) => void;
}) {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  const mapa = useMapa(datos.institucion_id);
  const { dibujar } = useEditarZonas();
  const [satelite, setSatelite] = useState(false);
  const [arbolElegido, setArbolElegido] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const arboles = useMemo(() => (mapa.data?.arboles ?? []).filter((a) => a.institucion_id === datos.institucion_id), [mapa.data, datos.institucion_id]);
  const dibujadas = datos.zonas.filter((z) => z.contorno && z.contorno.length >= 3);

  const poligonos = useMemo<PoligonoMapa[]>(() => {
    const lista: PoligonoMapa[] = dibujadas
      .filter((z) => z.id !== dibujo?.zona.id)
      .map((z) => ({
        id: z.id ?? z.nombre,
        puntos: (z.contorno ?? []).map(([lat, lng]) => ({ lat, lng })),
        color: ESTILO_TIPO[z.tipo].color,
        etiqueta: z.nombre,
        resaltado: z.id === resaltada,
      }));
    if (dibujo) {
      lista.push({ id: 'dibujo', puntos: dibujo.puntos, color: ESTILO_TIPO[dibujo.zona.tipo].color, abierto: dibujo.puntos.length < 3 });
      if (dibujo.puntos.length >= 3) lista.push({ id: 'dibujo-esquinas', puntos: dibujo.puntos, color: ESTILO_TIPO[dibujo.zona.tipo].color, abierto: true });
    }
    return lista;
  }, [dibujadas, dibujo, resaltada]);

  const puntos = useMemo<PuntoMapa[]>(() => arboles.map((a) => ({
    id: a.id, lat: a.lat, lng: a.lng, tipo: 'arbol', color: COLOR_ESTADO[a.estado ?? 'sin_dato'],
  })), [arboles]);

  // Encuadre: los árboles y las zonas dibujadas; si no hay nada, la sede.
  const limites = useMemo(() => {
    const lugares = [
      ...arboles.map((a) => ({ lat: a.lat, lng: a.lng })),
      ...dibujadas.flatMap((z) => (z.contorno ?? []).map(([lat, lng]) => ({ lat, lng }))),
    ];
    if (!lugares.length) return mapa.data?.limites ?? null;
    return {
      sur: Math.min(...lugares.map((p) => p.lat)), norte: Math.max(...lugares.map((p) => p.lat)),
      oeste: Math.min(...lugares.map((p) => p.lng)), este: Math.max(...lugares.map((p) => p.lng)),
    };
  }, [arboles, dibujadas, mapa.data?.limites]);

  const elegido = arboles.find((a) => a.id === arbolElegido);

  async function guardar() {
    if (!dibujo?.zona.id) return;
    setError(undefined);
    try {
      await dibujar.mutateAsync({ id: dibujo.zona.id, contorno: dibujo.puntos.map((p) => [p.lat, p.lng]) });
      onElegirZona(dibujo.zona.id);
      setDibujo(null);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  const tiposEnPlano = TIPOS_ZONA.filter((tipo) => dibujadas.some((z) => z.tipo === tipo));

  return (
    <Card title="Plano del colegio" subtitle="Las zonas dibujadas y cada árbol en el punto donde se registró." icon="map">
      <View style={styles.vista}>
        <ChoiceChip label="Mapa" selected={!satelite} onPress={() => setSatelite(false)} />
        <ChoiceChip label="Satélite" selected={satelite} onPress={() => setSatelite(true)} />
      </View>
      {dibujo ? (
        <Notice tono="info">
          Toca el plano en cada esquina de «{dibujo.zona.nombre}», en orden, siguiendo el borde.{' '}
          {dibujo.puntos.length ? `Llevas ${dibujo.puntos.length} ${dibujo.puntos.length === 1 ? 'esquina' : 'esquinas'}.` : 'Acércate con los botones o pellizcando.'}
        </Notice>
      ) : null}
      {mapa.isLoading ? <LoadingState text="Cargando el plano…" /> : (
        <MapaVista
          puntos={puntos}
          poligonos={poligonos}
          encuadre={{ clave: `zonas-${datos.institucion_id}`, limites }}
          seleccionado={arbolElegido}
          onTocar={(id) => {
            setArbolElegido(id);
            if (!id) onElegirZona(null);
          }}
          onTocarLugar={dibujo ? (lugar) => setDibujo({ ...dibujo, puntos: [...dibujo.puntos, lugar] }) : undefined}
          satelite={satelite}
          alto={isWide ? 460 : 340}
        />
      )}
      {dibujo ? (
        <View style={styles.botones}>
          <View style={styles.flex}>
            <PrimaryButton title="Guardar zona" icon="check" disabled={dibujo.puntos.length < 3} loading={dibujar.isPending} onPress={() => void guardar()} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton
              title="Deshacer esquina"
              icon="back"
              variant="secondary"
              disabled={!dibujo.puntos.length}
              onPress={() => setDibujo({ ...dibujo, puntos: dibujo.puntos.slice(0, -1) })}
            />
          </View>
          <View style={styles.flex}>
            <PrimaryButton title="Cancelar" variant="ghost" onPress={() => { setDibujo(null); setError(undefined); }} />
          </View>
        </View>
      ) : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}

      {elegido && !dibujo ? (
        <Pressable accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${elegido.id}` as Href)} style={styles.elegido}>
          <View style={[styles.punto, { backgroundColor: COLOR_ESTADO[elegido.estado ?? 'sin_dato'] }]} />
          <View style={styles.flex}>
            <Text style={styles.nombre}>{elegido.codigo ?? 'Árbol'} · {elegido.nombre_comun}</Text>
            <Text style={styles.detalle}>{elegido.zona ?? 'Sin zona'} · toca para ver su ficha</Text>
          </View>
          <Icon name="chevronRight" size={18} color={palette.muted} />
        </Pressable>
      ) : null}

      <View style={styles.leyenda}>
        {tiposEnPlano.map((tipo) => (
          <View key={tipo} style={styles.leyendaItem}>
            <View style={[styles.cuadro, { backgroundColor: ESTILO_TIPO[tipo].color }]} />
            <Text style={styles.detalle}>{ESTILO_TIPO[tipo].etiqueta}</Text>
          </View>
        ))}
        {[['sano', 'Sano'], ['riesgo', 'En riesgo'], ['critico', 'Crítico']].map(([clave, etiqueta]) => (
          <View key={clave} style={styles.leyendaItem}>
            <View style={[styles.punto, { backgroundColor: COLOR_ESTADO[clave] }]} />
            <Text style={styles.detalle}>Árbol {etiqueta.toLowerCase()}</Text>
          </View>
        ))}
      </View>
      {!dibujadas.length && !dibujo ? (
        <Text style={styles.detalle}>
          {datos.puede_editar
            ? 'Todavía no hay zonas en el plano. Toca el ícono de mapa de una zona para dibujarla.'
            : 'Todavía no hay zonas dibujadas. Las dibuja un docente de la institución.'}
        </Text>
      ) : null}
    </Card>
  );
}

/** Una zona de la lista: nombre, tipo y conteos; quien gestiona la institución la edita, la
 *  dibuja en el plano o la borra. */
function FilaZona({ zona, datos, resaltada, onElegir, onDibujar }: {
  zona: ZonaInstitucion;
  datos: ZonasInstitucion;
  resaltada: boolean;
  onElegir: () => void;
  onDibujar: () => void;
}) {
  const styles = useStyles();
  const { palette } = useTema();
  const { editar, dibujar, borrar } = useEditarZonas();
  const [modo, setModo] = useState<'ver' | 'editar' | 'borrar'>('ver');
  const [nombre, setNombre] = useState(zona.nombre);
  const [tipo, setTipo] = useState<TipoZona>(zona.tipo);
  const otras = datos.zonas.filter((z) => z.nombre !== zona.nombre).map((z) => z.nombre);
  const [destino, setDestino] = useState<string>();
  const [error, setError] = useState<string>();
  const enPlano = Boolean(zona.contorno && zona.contorno.length >= 3);
  const estilo = ESTILO_TIPO[zona.tipo];

  async function guardar() {
    setError(undefined);
    if (!zona.id) return;
    try {
      await editar.mutateAsync({ id: zona.id, ...(nombre.trim() !== zona.nombre ? { nombre: nombre.trim() } : {}), ...(tipo !== zona.tipo ? { tipo } : {}) });
      setModo('ver');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  async function quitarDelPlano() {
    setError(undefined);
    if (!zona.id) return;
    try {
      await dibujar.mutateAsync({ id: zona.id, contorno: null });
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  async function eliminar() {
    setError(undefined);
    if (!zona.id) return;
    try {
      await borrar.mutateAsync({ id: zona.id, moverA: zona.arboles > 0 ? destino : undefined });
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <View style={[styles.fila, resaltada && styles.filaResaltada]}>
      <View style={styles.filaTop}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${zona.nombre} en el plano`} onPress={onElegir} style={styles.filaInfo}>
          <View style={[styles.icono, { backgroundColor: `${estilo.color}22` }]}><Icon name="location" size={16} color={estilo.color} /></View>
          <View style={styles.flex}>
            <Text style={styles.nombre}>{zona.nombre}</Text>
            <Text style={styles.detalle}>{estilo.etiqueta} · {cuantos(zona)} · {enPlano ? 'en el plano' : 'sin dibujar'}</Text>
          </View>
        </Pressable>
        {datos.puede_editar && modo === 'ver' ? (
          <View style={styles.acciones}>
            <Accion icono="map" etiqueta={`Dibujar ${zona.nombre} en el plano`} color={palette.forest} onPress={onDibujar} />
            <Accion icono="edit" etiqueta={`Editar ${zona.nombre}`} color={palette.forest} onPress={() => setModo('editar')} />
            <Accion icono="trash" etiqueta={`Borrar ${zona.nombre}`} color={palette.red} onPress={() => setModo('borrar')} />
          </View>
        ) : null}
      </View>

      {modo === 'editar' ? (
        <View style={styles.editor}>
          <Field label="Nombre" value={nombre} maxLength={60} onChangeText={setNombre} />
          <Text style={styles.etiqueta}>Tipo</Text>
          <ElegirTipo valor={tipo} onCambiar={setTipo} />
          {nombre.trim() !== zona.nombre && (zona.arboles || zona.cursos) ? (
            <Text style={styles.detalle}>Sus árboles y los cursos que la tienen asignada pasan al nombre nuevo.</Text>
          ) : null}
          <View style={styles.botones}>
            <View style={styles.flex}>
              <PrimaryButton title="Guardar" loading={editar.isPending} disabled={nombre.trim().length < 2} onPress={() => void guardar()} />
            </View>
            <View style={styles.flex}>
              <PrimaryButton title="Cancelar" variant="secondary" onPress={() => { setModo('ver'); setNombre(zona.nombre); setTipo(zona.tipo); setError(undefined); }} />
            </View>
          </View>
          {enPlano ? <PrimaryButton title="Quitar del plano" icon="close" variant="ghost" loading={dibujar.isPending} onPress={() => void quitarDelPlano()} /> : null}
        </View>
      ) : null}

      {modo === 'borrar' ? (
        <View style={styles.editor}>
          {zona.arboles > 0 ? (
            <SelectField
              label={`Pasar sus ${zona.arboles} ${zona.arboles === 1 ? 'árbol' : 'árboles'} a`}
              value={destino}
              placeholder="Elige otra zona"
              options={otras.map((n) => ({ label: n, value: n }))}
              onChange={setDestino}
            />
          ) : null}
          {zona.cursos > 0 ? <Text style={styles.detalle}>Los cursos que la tienen asignada dejarán de tenerla.</Text> : null}
          <ConfirmButton
            title={`Borrar «${zona.nombre}»`}
            confirmTitle={zona.arboles > 0 && destino ? `¿Borrar «${zona.nombre}» y pasar sus árboles a «${destino}»?` : `¿Borrar «${zona.nombre}»?`}
            disabled={zona.arboles > 0 && !destino}
            loading={borrar.isPending}
            onConfirm={() => void eliminar()}
          />
          <PrimaryButton title="Cancelar" variant="ghost" onPress={() => { setModo('ver'); setError(undefined); }} />
        </View>
      ) : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
    </View>
  );
}

function NuevaZona({ institucionId }: { institucionId: string }) {
  const styles = useStyles();
  const { crear } = useEditarZonas();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoZona>('patio');
  const [error, setError] = useState<string>();

  async function agregar() {
    setError(undefined);
    try {
      await crear.mutateAsync({ institucionId, nombre: nombre.trim(), tipo });
      setNombre('');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <View style={styles.nueva}>
      <Field label="Nueva zona" value={nombre} maxLength={60} placeholder="Ej.: Cancha múltiple, Biblioteca, Bloque B" onChangeText={setNombre} onSubmitEditing={() => void agregar()} />
      <Text style={styles.etiqueta}>Tipo</Text>
      <ElegirTipo valor={tipo} onCambiar={setTipo} />
      <PrimaryButton title="Agregar zona" icon="add" loading={crear.isPending} disabled={nombre.trim().length < 2} onPress={() => void agregar()} />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
    </View>
  );
}

/** Zonas de la sede: las define un docente de la institución o el administrador, se dibujan en el
 *  plano del colegio y aparecen al registrar árboles, al filtrar el inventario y en los cursos. */
export function ZonasScreen() {
  const styles = useStyles();
  const isWide = useIsWide();
  const perfil = useMiPerfil();
  const catalogs = useCatalogs();
  const admin = esAdmin(perfil.data);
  const [elegida, setElegida] = useState<string>();
  const [dibujo, setDibujo] = useState<Dibujo | null>(null);
  const [resaltada, setResaltada] = useState<string | null>(null);
  const institucionId = elegida ?? perfil.data?.institucion_id ?? undefined;
  const zonas = useZonas(institucionId);
  const datos = zonas.data;

  return (
    <Page>
      <AppHeader
        eyebrow="Gestión institucional"
        title="Zonas de la sede"
        subtitle="El plano del colegio y sus zonas (patios, canchas, salones, biblioteca). Al registrar un árbol, la app elige sola la zona donde cae su GPS."
        backTo={'/(app)/modules' as Href}
      />

      {admin ? (
        <SelectField
          label="Institución"
          value={institucionId}
          placeholder="Elige una institución"
          options={(catalogs.data?.instituciones ?? []).map((i) => ({ label: i.nombre, value: i.id }))}
          onChange={(valor) => { setElegida(valor); setDibujo(null); setResaltada(null); }}
        />
      ) : null}

      {!institucionId ? (
        perfil.isLoading ? <LoadingState /> : (
          <EmptyState
            title={admin ? 'Elige una institución' : 'Tu cuenta no tiene institución'}
            text={admin ? 'Cada institución tiene sus propias zonas.' : 'Cuando un administrador te asigne una institución verás aquí sus zonas.'}
          />
        )
      ) : zonas.isLoading ? <LoadingState text="Cargando zonas…" /> : zonas.error || !datos ? (
        <ErrorState error={zonas.error} onRetry={() => void zonas.refetch()} />
      ) : (
        <>
          {!datos.editable ? (
            <Notice tono="riesgo">
              Estas son las zonas de siempre. Para que cada colegio tenga las suyas y pueda dibujarlas, el administrador de Supabase debe aplicar la migración 016.
            </Notice>
          ) : !datos.puede_editar ? (
            <Notice tono="info">Solo un docente de esta institución o un administrador puede cambiar o dibujar las zonas.</Notice>
          ) : null}
          <View style={[styles.columnas, isWide && styles.columnasAnchas]}>
            <View style={isWide ? styles.columnaPlano : undefined}>
              <PlanoColegio datos={datos} dibujo={dibujo} setDibujo={setDibujo} resaltada={resaltada} onElegirZona={setResaltada} />
            </View>
            <View style={isWide ? styles.columnaLista : undefined}>
              <Card title={`${datos.zonas.length} ${datos.zonas.length === 1 ? 'zona' : 'zonas'}`} subtitle="Además está «Otra», para escribir una zona que no esté en la lista." icon="location">
                <View style={styles.lista}>
                  {datos.zonas.map((zona) => (
                    <FilaZona
                      key={zona.id ?? zona.nombre}
                      zona={zona}
                      datos={datos}
                      resaltada={zona.id === resaltada}
                      onElegir={() => setResaltada(zona.id)}
                      onDibujar={() => { setDibujo({ zona, puntos: [] }); setResaltada(zona.id); }}
                    />
                  ))}
                </View>
                {datos.puede_editar ? <NuevaZona institucionId={datos.institucion_id} /> : null}
              </Card>
            </View>
          </View>
        </>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1, minWidth: 0 },
  columnas: { gap: 16 },
  columnasAnchas: { flexDirection: 'row', alignItems: 'flex-start' },
  columnaPlano: { flex: 3, minWidth: 0 },
  columnaLista: { flex: 2, minWidth: 0 },
  vista: { flexDirection: 'row', gap: 8 },
  lista: { gap: 8 },
  fila: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: palette.tile, borderWidth: 1, borderColor: 'transparent' },
  filaResaltada: { borderColor: palette.forest },
  filaTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filaInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  icono: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  nombre: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  detalle: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  etiqueta: { color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  acciones: { flexDirection: 'row', gap: 6 },
  accion: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  editor: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nueva: { gap: 8, marginTop: 6 },
  elegido: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: palette.tile },
  punto: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#FFFFFF' },
  cuadro: { width: 14, height: 14, borderRadius: 4, opacity: 0.8 },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
}));
