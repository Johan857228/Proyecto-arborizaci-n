import { Platform } from 'react-native';

const localApiUrl = Platform.select({
  android: 'http://10.0.2.2:8000',
  default: 'http://127.0.0.1:8000',
});

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || localApiUrl;
export const SESSION_STORAGE_KEY = 'arbolado.session.v1';

// Los colores, degradados, sombras y superficies dependen del tema (claro u oscuro): están en
// '@/theme' y se leen con useTema() o crearEstilos().

// Colores de gráficos, validados con el script de la skill dataviz (validate_palette.js):
// - categorical: 4 primeros tonos de su paleta de referencia; pasan separación para daltonismo (ΔE 9.1).
//   Más de 4 categorías se agrupan en "Otras" (gris). Siempre con leyenda de texto.
// - etapas: un solo tono verde de claro a oscuro, porque las etapas tienen orden.
export const chartColors = {
  categorical: ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100'],
  other: '#8C8A83',
  etapas: ['#8FBF4F', '#5E9E3D', '#357A35', '#1B5128'],
};

// Plus Jakarta Sans para títulos, cifras y etiquetas; el texto corrido usa la fuente del sistema.
export const fonts = {
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
};

export const layout = {
  maxWidth: 1120,
  formWidth: 760,
  // A partir de este ancho se usa el diseño de escritorio (barra superior, columnas).
  wideBreakpoint: 768,
  sidebarBreakpoint: 1100,
  // Ancho máximo del armazón: la barra superior, el carril de módulos y el
  // contenido de todas las pantallas. En monitores grandes o con el zoom bajo,
  // 1680 dejaba franjas vacías a los lados en las pantallas que son rejillas
  // —el inventario cabe a ocho tarjetas por fila y solo mostraba cinco—.
  // Las pantallas de lectura siguen con su propio tope (maxWidth), que es más
  // estrecho a propósito: una línea de texto de dos mil píxeles no se lee.
  maxAppWidth: 2400,
};
