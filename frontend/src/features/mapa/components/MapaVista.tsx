import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { fonts } from '@/config/constants';
import { COLOR_SEDE } from '@/features/mapa/capas';
import {
  acercarEn,
  aMundo,
  desplazar,
  encuadrar,
  escala,
  limitarZoom,
  mundoAPantalla,
  pantallaAMundo,
  teselasDe,
  ZOOM_MIN,
  zoomDeTeselas,
  type Camara,
  type Limites,
  type Punto,
  type Tesela,
} from '@/features/mapa/geo';
import { ATRIBUCION, ENLACE_ATRIBUCION, fuenteTesela } from '@/features/mapa/teselas';
import { Icon, type IconName } from '@/shared/components/Icon';
import { crearEstilos, useTema } from '@/theme';

/**
 * Visor de mapa propio, sin librerías nativas nuevas (no hay que reconstruir la app de
 * desarrollo): teselas con expo-image, que las guarda en disco y las sirve sin conexión, y
 * puntos como vistas.
 *
 * Todo se dibuja en una capa con coordenadas fijas (las del zoom de teselas `z`, medidas desde
 * un origen cercano). Arrastrar o pellizcar solo cambia el `transform` de esa capa; las teselas
 * y los puntos se vuelven a armar cuando cambia el nivel de zoom o se sale de la zona cubierta,
 * en el mismo render que el nuevo `transform`, así que nada parpadea.
 */
export interface PuntoMapa {
  id: string;
  lat: number;
  lng: number;
  tipo: 'arbol' | 'sede';
  color: string;
  anillo?: string | null;
  /** Número dentro del pin de la sede. */
  texto?: string;
  /** Nombre bajo el pin de la sede. */
  etiqueta?: string;
  /** Se dibuja desde este zoom de teselas (incluido) hasta `zoomHasta` (excluido). */
  zoomDesde?: number;
  zoomHasta?: number;
}

interface PuntoEnMundo extends PuntoMapa {
  mundo: Punto;
}

interface Cobertura {
  z: number;
  desde: Punto;
  hasta: Punto;
  teselas: Tesela[];
  padres: Tesela[];
}

const RADIO_ARBOL = 6;
const RADIO_SELECCION = 9;
const TOQUE_ARBOL = 18;
const TOQUE_SEDE = 24;
// Rejilla del origen de la capa: las coordenadas quedan por debajo de ~12.000 px y no pierden
// precisión al redondearse al píxel.
const REJILLA_ORIGEN = 8192;

function calcularCobertura(z: number, centro: Punto, ancho: number, alto: number): Cobertura {
  const s = escala(z);
  // 0,85 del tamaño de la pantalla a cada lado: alcanza aunque el zoom real esté medio nivel más
  // lejos y la cámara se haya corrido un cuarto de pantalla desde el centro de la cobertura.
  const desde = { x: centro.x - (ancho * 0.85) / s, y: centro.y - (alto * 0.85) / s };
  const hasta = { x: centro.x + (ancho * 0.85) / s, y: centro.y + (alto * 0.85) / s };
  return { z, desde, hasta, teselas: teselasDe(z, desde, hasta), padres: z > ZOOM_MIN ? teselasDe(z - 1, desde, hasta) : [] };
}

function visible(p: PuntoMapa, z: number) {
  return (p.zoomDesde == null || z >= p.zoomDesde) && (p.zoomHasta == null || z < p.zoomHasta);
}

const CapaTeselas = memo(function CapaTeselas({ cobertura, origen }: { cobertura: Cobertura; origen: Punto }) {
  const s = escala(cobertura.z);
  const dibujar = (t: Tesela, tam: number) => (
    <Image
      key={`${t.z}/${t.x}/${t.y}`}
      source={fuenteTesela(t)}
      cachePolicy="disk"
      allowDownscaling={false}
      contentFit="fill"
      style={{
        position: 'absolute',
        left: t.x * tam - origen.x * s,
        top: t.y * tam - origen.y * s,
        // medio píxel de más para que no se vean las uniones
        width: tam + 0.5,
        height: tam + 0.5,
      }}
    />
  );
  return (
    <>
      {cobertura.padres.map((t) => dibujar(t, 512))}
      {cobertura.teselas.map((t) => dibujar(t, 256))}
    </>
  );
});

const CapaPuntos = memo(function CapaPuntos({
  puntos,
  cobertura,
  origen,
  seleccionado,
}: {
  puntos: PuntoEnMundo[];
  cobertura: Cobertura;
  origen: Punto;
  seleccionado: string | null;
}) {
  const styles = useStyles();
  const s = escala(cobertura.z);
  const dentro = (w: Punto) => w.x >= cobertura.desde.x && w.x <= cobertura.hasta.x && w.y >= cobertura.desde.y && w.y <= cobertura.hasta.y;
  const lista = puntos.filter((p) => visible(p, cobertura.z) && dentro(p.mundo));
  // El seleccionado va de último para quedar encima.
  lista.sort((a, b) => Number(a.id === seleccionado) - Number(b.id === seleccionado) || Number(a.tipo === 'sede') - Number(b.tipo === 'sede'));
  return (
    <>
      {lista.map((p) => {
        const x = (p.mundo.x - origen.x) * s;
        const y = (p.mundo.y - origen.y) * s;
        const elegido = p.id === seleccionado;
        if (p.tipo === 'sede') {
          return (
            <View key={p.id} style={[styles.sede, { left: x - 70, top: y - 16 }]}>
              <View style={[styles.sedePin, elegido && styles.sedePinElegido]}>
                <Text style={styles.sedeTexto} numberOfLines={1}>{p.texto}</Text>
              </View>
              {p.etiqueta && cobertura.z >= 12 ? <Text style={styles.sedeEtiqueta} numberOfLines={1}>{p.etiqueta}</Text> : null}
            </View>
          );
        }
        const r = elegido ? RADIO_SELECCION : RADIO_ARBOL;
        const anillo = elegido ? '#13261C' : p.anillo;
        const margen = anillo ? 4 : 0;
        return (
          <View
            key={p.id}
            style={[
              styles.anillo,
              {
                left: x - r - margen,
                top: y - r - margen,
                width: 2 * (r + margen),
                height: 2 * (r + margen),
                borderRadius: r + margen,
                borderColor: anillo ?? 'transparent',
                borderWidth: anillo ? 2.5 : 0,
              },
            ]}
          >
            <View style={{ width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: p.color, borderWidth: 1.5, borderColor: '#FFFFFF' }} />
          </View>
        );
      })}
    </>
  );
});

function BotonMapa({ icono, etiqueta, onPress }: { icono: IconName; etiqueta: string; onPress: () => void }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.boton, pressed && styles.botonPresionado]}
    >
      <Icon name={icono} size={20} color={palette.ink} />
    </Pressable>
  );
}

interface Gesto {
  inicio: Camara;
  toques: number;
  p0: Punto;
  d0: number;
  origenPagina: Punto;
  t0: number;
  movio: boolean;
}

function toquesDe(e: GestureResponderEvent, origen: Punto): Punto[] {
  const lista = e.nativeEvent.touches?.length ? e.nativeEvent.touches : [e.nativeEvent];
  return lista.slice(0, 2).map((t) => ({ x: t.pageX - origen.x, y: t.pageY - origen.y }));
}

export function MapaVista({
  puntos,
  encuadre,
  enfocar,
  seleccionado,
  onTocar,
  onCamara,
  fondo = true,
  alto,
  aviso,
}: {
  puntos: PuntoMapa[];
  /** Al cambiar `clave` (o al medir el mapa por primera vez) se encuadran estos límites. */
  encuadre: { clave: string; limites: Limites | null };
  /** Al cambiar `clave` el mapa se acerca a ese punto. */
  enfocar?: { clave: string; lat: number; lng: number } | null;
  seleccionado: string | null;
  onTocar: (id: string | null) => void;
  /** Cámara y tamaño cuando el mapa se queda quieto (para guardar la zona que se ve). */
  onCamara?: (camara: Camara, ancho: number, alto: number) => void;
  fondo?: boolean;
  alto: number;
  aviso?: string | null;
}) {
  const styles = useStyles();
  const reducido = useReducedMotion();
  const contenedor = useRef<View>(null);
  const [tam, setTam] = useState({ ancho: 0, alto: 0 });
  const [camara, setCamara] = useState<Camara | null>(null);
  const camaraRef = useRef<Camara | null>(null);
  const tamRef = useRef(tam);
  const cuadro = useRef(0);
  const animacion = useRef(0);
  const gesto = useRef<Gesto | null>(null);
  const ultimoToque = useRef(0);
  const encuadrado = useRef<string | null>(null);
  const enfocado = useRef<string | null>(null);

  const puntosMundo = useMemo<PuntoEnMundo[]>(() => puntos.map((p) => ({ ...p, mundo: aMundo(p) })), [puntos]);

  // ----------------------------------- Cámara -----------------------------------
  function fijar(c: Camara, inmediato = false) {
    camaraRef.current = c;
    if (inmediato) {
      setCamara(c);
      return;
    }
    if (!cuadro.current) {
      cuadro.current = requestAnimationFrame(() => {
        cuadro.current = 0;
        setCamara(camaraRef.current);
      });
    }
  }

  function quieto() {
    const c = camaraRef.current;
    if (c) onCamara?.(c, tamRef.current.ancho, tamRef.current.alto);
  }

  function detenerAnimacion() {
    if (animacion.current) cancelAnimationFrame(animacion.current);
    animacion.current = 0;
  }

  function animarA(destino: Camara) {
    detenerAnimacion();
    const inicio = camaraRef.current;
    if (!inicio || reducido) {
      fijar(destino, true);
      quieto();
      return;
    }
    const t0 = Date.now();
    const duracion = 260;
    const paso = () => {
      const k = Math.min(1, (Date.now() - t0) / duracion);
      const e = 1 - (1 - k) ** 3; // ease-out
      fijar({
        zoom: inicio.zoom + (destino.zoom - inicio.zoom) * e,
        centro: { x: inicio.centro.x + (destino.centro.x - inicio.centro.x) * e, y: inicio.centro.y + (destino.centro.y - inicio.centro.y) * e },
      }, true);
      if (k < 1) animacion.current = requestAnimationFrame(paso);
      else {
        animacion.current = 0;
        quieto();
      }
    };
    animacion.current = requestAnimationFrame(paso);
  }

  function zoomEnCentro(delta: number) {
    const c = camaraRef.current;
    if (!c) return;
    animarA({ centro: c.centro, zoom: limitarZoom(Math.round(c.zoom + delta)) });
  }

  function verTodo() {
    animarA(encuadrar(encuadre.limites, tamRef.current.ancho, tamRef.current.alto));
  }

  function alMedir(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    tamRef.current = { ancho: width, alto: height };
    setTam(tamRef.current);
  }

  // Encuadre inicial y al cambiar de institución.
  useEffect(() => {
    if (tam.ancho <= 0 || tam.alto <= 0 || encuadrado.current === encuadre.clave) return;
    encuadrado.current = encuadre.clave;
    detenerAnimacion();
    fijar(encuadrar(encuadre.limites, tam.ancho, tam.alto), true);
    quieto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encuadre.clave, encuadre.limites, tam.ancho, tam.alto]);

  useEffect(() => {
    if (!enfocar || !camaraRef.current || enfocado.current === enfocar.clave) return;
    enfocado.current = enfocar.clave;
    animarA({ centro: aMundo(enfocar), zoom: Math.max(camaraRef.current.zoom, 18) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enfocar?.clave, camara != null]);

  useEffect(() => () => {
    if (cuadro.current) cancelAnimationFrame(cuadro.current);
    if (animacion.current) cancelAnimationFrame(animacion.current);
  }, []);

  // En web: rueda del ratón o del panel táctil para acercar, y sin desplazamiento del navegador.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const nodo = contenedor.current as unknown as HTMLElement | null;
    if (!nodo?.addEventListener) return;
    nodo.style.touchAction = 'none';
    nodo.style.cursor = 'grab';
    // overflow: hidden todavía deja que el navegador lo desplace por dentro (al enfocar un botón,
    // por ejemplo) y la capa quedaría corrida; clip no se puede desplazar.
    nodo.style.overflow = 'clip';
    const sinDesplazar = () => {
      if (nodo.scrollLeft || nodo.scrollTop) nodo.scrollTo(0, 0);
    };
    nodo.addEventListener('scroll', sinDesplazar);
    const rueda = (ev: WheelEvent) => {
      const c = camaraRef.current;
      if (!c) return;
      ev.preventDefault();
      detenerAnimacion();
      const caja = nodo.getBoundingClientRect();
      const delta = Math.max(-0.6, Math.min(0.6, -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0025)));
      fijar(acercarEn(c, c.zoom + delta, { x: ev.clientX - caja.left, y: ev.clientY - caja.top }, caja.width, caja.height));
      clearTimeout(finRueda);
      finRueda = setTimeout(quieto, 250);
    };
    let finRueda: ReturnType<typeof setTimeout> | undefined;
    nodo.addEventListener('wheel', rueda, { passive: false });
    return () => {
      nodo.removeEventListener('wheel', rueda);
      nodo.removeEventListener('scroll', sinDesplazar);
      clearTimeout(finRueda);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------- Gestos -----------------------------------
  function empezar(e: GestureResponderEvent) {
    const c = camaraRef.current;
    if (!c) return;
    const n = e.nativeEvent;
    const origenPagina = gesto.current?.origenPagina ?? { x: n.pageX - n.locationX, y: n.pageY - n.locationY };
    const toques = toquesDe(e, origenPagina);
    gesto.current = {
      inicio: c,
      toques: toques.length,
      p0: toques.length > 1 ? { x: (toques[0].x + toques[1].x) / 2, y: (toques[0].y + toques[1].y) / 2 } : toques[0],
      d0: toques.length > 1 ? Math.max(1, Math.hypot(toques[0].x - toques[1].x, toques[0].y - toques[1].y)) : 1,
      origenPagina,
      t0: gesto.current?.t0 ?? n.timestamp,
      movio: gesto.current?.movio ?? false,
    };
  }

  function alConceder(e: GestureResponderEvent) {
    detenerAnimacion();
    gesto.current = null;
    empezar(e);
    if (Platform.OS === 'web') {
      const nodo = contenedor.current as unknown as HTMLElement | null;
      if (nodo?.style) nodo.style.cursor = 'grabbing';
    }
    // true: el ScrollView de la página no le quita el gesto al mapa.
    return true;
  }

  function alMover(e: GestureResponderEvent) {
    const g = gesto.current;
    if (!g) return;
    const toques = toquesDe(e, g.origenPagina);
    if (toques.length !== g.toques) {
      empezar(e);
      return;
    }
    const { ancho, alto: altoMapa } = tamRef.current;
    if (toques.length > 1) {
      const f = { x: (toques[0].x + toques[1].x) / 2, y: (toques[0].y + toques[1].y) / 2 };
      const d = Math.max(1, Math.hypot(toques[0].x - toques[1].x, toques[0].y - toques[1].y));
      const zoom = limitarZoom(g.inicio.zoom + Math.log2(d / g.d0));
      const fijo = pantallaAMundo(g.inicio, g.p0, ancho, altoMapa);
      const s = escala(zoom);
      g.movio = true;
      fijar({ zoom, centro: { x: fijo.x - (f.x - ancho / 2) / s, y: fijo.y - (f.y - altoMapa / 2) / s } });
      return;
    }
    const dx = toques[0].x - g.p0.x;
    const dy = toques[0].y - g.p0.y;
    if (!g.movio && Math.hypot(dx, dy) < 6) return;
    g.movio = true;
    fijar(desplazar(g.inicio, dx, dy));
  }

  function alSoltar(e: GestureResponderEvent) {
    const g = gesto.current;
    gesto.current = null;
    if (Platform.OS === 'web') {
      const nodo = contenedor.current as unknown as HTMLElement | null;
      if (nodo?.style) nodo.style.cursor = 'grab';
    }
    if (!g) return;
    if (g.movio) {
      quieto();
      return;
    }
    // Hora del evento (no Date.now): el doble toque se mide entre eventos.
    const ahora = e.nativeEvent.timestamp;
    if (ahora - g.t0 > 500) return;
    const c = camaraRef.current;
    if (!c) return;
    const p = { x: e.nativeEvent.pageX - g.origenPagina.x, y: e.nativeEvent.pageY - g.origenPagina.y };
    // Doble toque: acercar ahí.
    if (ahora - ultimoToque.current < 300) {
      ultimoToque.current = 0;
      animarA(acercarEn(c, Math.round(c.zoom) + 1, p, tamRef.current.ancho, tamRef.current.alto));
      return;
    }
    ultimoToque.current = ahora;
    onTocar(tocado(c, p));
  }

  function tocado(c: Camara, p: Punto): string | null {
    const z = zoomDeTeselas(c.zoom);
    let mejor: { id: string; d: number } | null = null;
    for (const punto of puntosMundo) {
      if (!visible(punto, z)) continue;
      const q = mundoAPantalla(c, punto.mundo, tamRef.current.ancho, tamRef.current.alto);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= (punto.tipo === 'sede' ? TOQUE_SEDE : TOQUE_ARBOL) && (!mejor || d < mejor.d)) mejor = { id: punto.id, d };
    }
    return mejor?.id ?? null;
  }

  // ---------------------------------- Dibujo ----------------------------------
  const z = camara ? zoomDeTeselas(camara.zoom) : 0;
  const s = escala(z);
  const celdaX = Math.max(64, tam.ancho / 4);
  const celdaY = Math.max(64, tam.alto / 4);
  const qx = camara ? Math.round((camara.centro.x * s) / celdaX) : 0;
  const qy = camara ? Math.round((camara.centro.y * s) / celdaY) : 0;
  const ox = camara ? Math.round((camara.centro.x * s) / REJILLA_ORIGEN) : 0;
  const oy = camara ? Math.round((camara.centro.y * s) / REJILLA_ORIGEN) : 0;
  const cobertura = useMemo(
    () => (tam.ancho > 0 ? calcularCobertura(z, { x: (qx * celdaX) / s, y: (qy * celdaY) / s }, tam.ancho, tam.alto) : null),
    [z, qx, qy, celdaX, celdaY, s, tam.ancho, tam.alto],
  );
  const origen = useMemo(() => ({ x: (ox * REJILLA_ORIGEN) / s, y: (oy * REJILLA_ORIGEN) / s }), [ox, oy, s]);

  const sz = camara ? escala(camara.zoom) : 1;
  const transform: ViewStyle['transform'] = camara
    ? [
        { translateX: (origen.x - camara.centro.x) * sz + tam.ancho / 2 },
        { translateY: (origen.y - camara.centro.y) * sz + tam.alto / 2 },
        { scale: 2 ** (camara.zoom - z) },
      ]
    : undefined;

  return (
    <View
      ref={contenedor}
      style={[styles.mapa, { height: alto }]}
      onLayout={alMedir}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={alConceder}
      onResponderMove={alMover}
      onResponderRelease={alSoltar}
      onResponderTerminate={alSoltar}
      accessibilityLabel="Mapa. Arrastra para moverte, pellizca o usa los botones para acercar."
    >
      {camara && cobertura ? (
        <View style={[styles.capa, { transform }]}>
          {fondo ? <CapaTeselas cobertura={cobertura} origen={origen} /> : null}
          <CapaPuntos puntos={puntosMundo} cobertura={cobertura} origen={origen} seleccionado={seleccionado} />
        </View>
      ) : null}

      {aviso ? (
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>{aviso}</Text>
        </View>
      ) : null}
      <View style={styles.botones}>
        <BotonMapa icono="add" etiqueta="Acercar" onPress={() => zoomEnCentro(1)} />
        <BotonMapa icono="remove" etiqueta="Alejar" onPress={() => zoomEnCentro(-1)} />
        <BotonMapa icono="encuadrar" etiqueta="Ver todo" onPress={verTodo} />
      </View>
      {fondo ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(ENLACE_ATRIBUCION)} style={styles.atribucion}>
          <Text style={styles.atribucionTexto}>{ATRIBUCION}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  mapa: {
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    // Fondo claro siempre: el mapa base es claro también en el tema oscuro.
    backgroundColor: '#E9EEE4',
    userSelect: 'none',
  },
  // Sin tamaño: el transform gira y escala alrededor de su esquina, que es el (0, 0) de la capa.
  capa: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none' },
  anillo: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sede: { position: 'absolute', width: 140, alignItems: 'center', gap: 2 },
  sedePin: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: COLOR_SEDE,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sedePinElegido: { borderColor: '#B4DA55', borderWidth: 3 },
  sedeTexto: { color: '#FFFFFF', fontSize: 12, fontFamily: fonts.bold },
  sedeEtiqueta: {
    color: '#13261C',
    fontSize: 11,
    fontFamily: fonts.bold,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
    maxWidth: 140,
  },
  botones: { position: 'absolute', top: 10, right: 10, gap: 8 },
  boton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonPresionado: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  aviso: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 10,
    left: 10,
    right: 60,
    alignSelf: 'flex-start',
  },
  avisoTexto: {
    alignSelf: 'flex-start',
    color: '#13261C',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  atribucion: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  atribucionTexto: { color: '#13261C', fontSize: 10 },
}));
