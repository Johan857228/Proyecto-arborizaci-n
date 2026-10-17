import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

/** La URL firmada cambia en cada consulta; sin su token sirve de clave estable para la caché. */
export function claveDeCache(url: string) {
  return url.split('?')[0];
}

function iniciales(nombre: string | undefined) {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  const letras = partes.length > 1 ? `${partes[0][0]}${partes[partes.length - 1][0]}` : (partes[0]?.slice(0, 2) ?? 'A');
  return letras.toUpperCase();
}

/** Foto de perfil redonda; sin foto muestra las iniciales sobre el verde lima de la marca. */
export function Avatar({ url, nombre, size = 34 }: { url?: string | null; nombre?: string; size?: number }) {
  const styles = useStyles();
  const { gradients } = useTema();
  const forma = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return (
      <Image
        source={{ uri: url, cacheKey: claveDeCache(url) }}
        style={[styles.foto, forma]}
        contentFit="cover"
        transition={150}
        accessibilityLabel="Foto de perfil"
      />
    );
  }
  return (
    <View style={[styles.iniciales, forma, gradient(gradients.lime)]}>
      <Text style={[styles.texto, { fontSize: Math.round(size * 0.38) }]}>{iniciales(nombre)}</Text>
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  foto: { backgroundColor: palette.line },
  iniciales: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.leaf },
  texto: { color: palette.forestDark, fontFamily: fonts.extraBold },
}));
