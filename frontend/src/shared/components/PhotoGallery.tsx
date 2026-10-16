import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, palette } from '@/config/constants';
import { Icon } from '@/shared/components/Icon';
import { gradient } from '@/shared/styles/gradient';

export interface FotoGaleria {
  id: string;
  url: string | null;
  /** Qué muestra la foto, p. ej. "Vista general". */
  titulo: string;
  /** Contexto corto: visita y fecha. */
  detalle?: string;
}

const ESPACIO = 10;

/**
 * Fotos en cuadrícula; al tocar una se abre a pantalla completa para pasar entre ellas
 * (deslizando en el teléfono, con flechas o teclado en el computador).
 * `compacta` muestra miniaturas pequeñas sin texto, para listas como el historial o la revisión.
 */
export function PhotoGallery({
  fotos,
  compacta = false,
  tamano = 72,
  maxMiniaturas = 6,
  vacio,
}: {
  fotos: FotoGaleria[];
  compacta?: boolean;
  /** Lado de cada miniatura en la versión compacta. */
  tamano?: number;
  /** En la versión compacta, a partir de cuántas se resume el resto con "+N". */
  maxMiniaturas?: number;
  vacio?: string;
}) {
  const [ancho, setAncho] = useState(0);
  const [abierta, setAbierta] = useState<number | null>(null);

  if (!fotos.length) {
    return vacio ? <Text style={styles.vacio}>{vacio}</Text> : null;
  }

  if (compacta) {
    const visibles = fotos.slice(0, maxMiniaturas);
    const resto = fotos.length - visibles.length;
    return (
      <View style={styles.filaCompacta}>
        {visibles.map((foto, indice) => {
          const ultima = resto > 0 && indice === visibles.length - 1;
          return (
            <Miniatura
              key={foto.id}
              foto={foto}
              lado={tamano}
              radio={10}
              onPress={() => setAbierta(indice)}
              cubierta={ultima ? `+${resto + 1}` : undefined}
            />
          );
        })}
        <Visor fotos={fotos} indice={abierta} onCambiar={setAbierta} onCerrar={() => setAbierta(null)} />
      </View>
    );
  }

  const columnas = ancho < 420 ? 2 : ancho < 720 ? 3 : 4;
  const lado = ancho ? Math.floor((ancho - ESPACIO * (columnas - 1)) / columnas) : 0;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)} style={styles.cuadricula}>
      {lado > 0
        ? fotos.map((foto, indice) => (
            <Miniatura key={foto.id} foto={foto} lado={lado} radio={16} conTexto onPress={() => setAbierta(indice)} />
          ))
        : null}
      <Visor fotos={fotos} indice={abierta} onCambiar={setAbierta} onCerrar={() => setAbierta(null)} />
    </View>
  );
}

function Miniatura({
  foto,
  lado,
  radio,
  conTexto = false,
  cubierta,
  onPress,
}: {
  foto: FotoGaleria;
  lado: number;
  radio: number;
  conTexto?: boolean;
  cubierta?: string;
  onPress: () => void;
}) {
  const [encima, setEncima] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver ${foto.titulo}${foto.detalle ? `, ${foto.detalle}` : ''} en grande`}
      onPress={onPress}
      onHoverIn={() => setEncima(true)}
      onHoverOut={() => setEncima(false)}
      style={({ pressed }) => [
        styles.miniatura,
        { width: lado, height: lado, borderRadius: radio },
        encima && styles.miniaturaEncima,
        pressed && styles.presionada,
      ]}
    >
      {foto.url ? (
        <Image source={{ uri: foto.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.sinImagen}><Icon name="addPhoto" size={22} color={palette.muted} /></View>
      )}
      {conTexto ? (
        <View style={[styles.pie, gradient('linear-gradient(180deg, rgba(8, 24, 15, 0) 0%, rgba(8, 24, 15, 0.82) 100%)')]}>
          <Text style={styles.pieTitulo} numberOfLines={1}>{foto.titulo}</Text>
          {foto.detalle ? <Text style={styles.pieDetalle} numberOfLines={1}>{foto.detalle}</Text> : null}
        </View>
      ) : null}
      {cubierta ? (
        <View style={styles.cubierta}><Text style={styles.cubiertaTexto}>{cubierta}</Text></View>
      ) : null}
    </Pressable>
  );
}

function Visor({
  fotos,
  indice,
  onCambiar,
  onCerrar,
}: {
  fotos: FotoGaleria[];
  indice: number | null;
  onCambiar: (indice: number) => void;
  onCerrar: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desplazamiento = useRef<ScrollView>(null);
  const tiras = useRef<ScrollView>(null);
  const actual = indice ?? 0;
  const abierta = indice !== null;
  const varias = fotos.length > 1;

  function ir(nuevo: number, animado = true) {
    const limitado = Math.max(0, Math.min(fotos.length - 1, nuevo));
    onCambiar(limitado);
    desplazamiento.current?.scrollTo({ x: limitado * width, animated: animado });
  }

  // En el computador: flechas para pasar de foto y Escape para cerrar.
  useEffect(() => {
    if (!abierta || Platform.OS !== 'web') return undefined;
    function tecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
      if (evento.key === 'ArrowRight') ir(actual + 1);
      if (evento.key === 'ArrowLeft') ir(actual - 1);
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  // La miniatura activa queda a la vista en la tira inferior.
  useEffect(() => {
    if (abierta) tiras.current?.scrollTo({ x: Math.max(0, actual * 64 - width / 2 + 32), animated: true });
  }, [abierta, actual, width]);

  function alDeslizar(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    const nuevo = Math.round(evento.nativeEvent.contentOffset.x / width);
    if (nuevo !== actual && nuevo >= 0 && nuevo < fotos.length) onCambiar(nuevo);
  }

  const foto = fotos[actual];
  const altoImagen = height - insets.top - insets.bottom - (varias ? 180 : 110);

  return (
    <Modal visible={abierta} transparent animationType="fade" onRequestClose={onCerrar} statusBarTranslucent>
      <View style={[styles.visor, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.barra}>
          <View style={styles.barraTexto}>
            <Text style={styles.contador}>{actual + 1} de {fotos.length}</Text>
            <Text style={styles.visorTitulo} numberOfLines={1}>{foto?.titulo}</Text>
            {foto?.detalle ? <Text style={styles.visorDetalle} numberOfLines={1}>{foto.detalle}</Text> : null}
          </View>
          {foto?.url ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Abrir la foto original en otra pestaña"
              onPress={() => void Linking.openURL(foto.url as string)}
              style={({ pressed }) => [styles.botonRedondo, pressed && styles.presionada]}
            >
              <Icon name="openExternal" size={20} color={palette.paper} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar galería"
            onPress={onCerrar}
            style={({ pressed }) => [styles.botonRedondo, pressed && styles.presionada]}
          >
            <Icon name="close" size={22} color={palette.paper} />
          </Pressable>
        </View>

        <ScrollView
          ref={desplazamiento}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={alDeslizar}
          onLayout={() => desplazamiento.current?.scrollTo({ x: actual * width, animated: false })}
          style={styles.carrusel}
        >
          {fotos.map((f) => (
            <View key={f.id} style={[styles.pagina, { width, height: altoImagen }]}>
              <ActivityIndicator color={palette.leaf} style={StyleSheet.absoluteFill} />
              {f.url ? (
                <Image source={{ uri: f.url }} style={styles.imagenGrande} contentFit="contain" transition={200} />
              ) : (
                <Text style={styles.visorDetalle}>Esta foto no está disponible.</Text>
              )}
            </View>
          ))}
        </ScrollView>

        {varias ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Foto anterior"
              disabled={actual === 0}
              onPress={() => ir(actual - 1)}
              style={({ pressed }) => [styles.flecha, styles.flechaIzquierda, { top: insets.top + 60 + altoImagen / 2 - 24 }, actual === 0 && styles.oculta, pressed && styles.presionada]}
            >
              <Icon name="chevronLeft" size={28} color={palette.paper} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Foto siguiente"
              disabled={actual === fotos.length - 1}
              onPress={() => ir(actual + 1)}
              style={({ pressed }) => [styles.flecha, styles.flechaDerecha, { top: insets.top + 60 + altoImagen / 2 - 24 }, actual === fotos.length - 1 && styles.oculta, pressed && styles.presionada]}
            >
              <Icon name="chevronRight" size={28} color={palette.paper} />
            </Pressable>
            <ScrollView ref={tiras} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tira}>
              {fotos.map((f, i) => (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir a ${f.titulo}`}
                  accessibilityState={{ selected: i === actual }}
                  onPress={() => ir(i)}
                  style={[styles.tiraFoto, i === actual && styles.tiraFotoActiva]}
                >
                  {f.url ? <Image source={{ uri: f.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  vacio: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  cuadricula: { flexDirection: 'row', flexWrap: 'wrap', gap: ESPACIO },
  filaCompacta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniatura: { overflow: 'hidden', backgroundColor: palette.forestSoft, borderWidth: 1, borderColor: palette.line },
  miniaturaEncima: { transform: [{ scale: 1.02 }], boxShadow: '0 10px 24px rgba(15, 61, 38, 0.18)' },
  presionada: { opacity: 0.8 },
  sinImagen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pie: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: 10, paddingBottom: 9, backgroundColor: 'rgba(8, 24, 15, 0.35)' },
  pieTitulo: { color: palette.paper, fontSize: 13, fontFamily: fonts.bold },
  pieDetalle: { marginTop: 1, color: '#DCE9DF', fontSize: 11 },
  cubierta: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8, 24, 15, 0.55)' },
  cubiertaTexto: { color: palette.paper, fontSize: 18, fontFamily: fonts.extraBold },
  visor: { flex: 1, backgroundColor: '#07130D' },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 52 },
  barraTexto: { flex: 1, minWidth: 0 },
  contador: { color: palette.leaf, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 0.6 },
  visorTitulo: { color: palette.paper, fontSize: 16, fontFamily: fonts.bold },
  visorDetalle: { color: '#C9D8CE', fontSize: 12 },
  botonRedondo: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  carrusel: { flexGrow: 0, marginTop: 8 },
  pagina: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  imagenGrande: { width: '100%', height: '100%' },
  flecha: { position: 'absolute', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  flechaIzquierda: { left: 12 },
  flechaDerecha: { right: 12 },
  oculta: { opacity: 0 },
  tira: { gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  tiraFoto: { width: 56, height: 56, overflow: 'hidden', borderRadius: 10, borderWidth: 2, borderColor: 'transparent', opacity: 0.6, backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  tiraFotoActiva: { borderColor: palette.leaf, opacity: 1 },
});
