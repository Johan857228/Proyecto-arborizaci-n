import { Platform } from 'react-native';

const localApiUrl = Platform.select({
  android: 'http://10.0.2.2:8000',
  default: 'http://127.0.0.1:8000',
});

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || localApiUrl;
export const SESSION_STORAGE_KEY = 'arbolado.session.v1';

// Paleta "Campus UPC": estilo Organic Biophilic (skill ui-ux-pro-max) con los colores del propio
// campus: verde lima de las letras UPC, verde profundo de las baldosas y el follaje, marfil de los
// senderos, terracota de los ladrillos y azul del cielo. Todos los textos cumplen contraste 4.5:1.
export const palette = {
  ink: '#13261C',
  forest: '#166534',
  forestDark: '#0F3D26',
  forestSoft: '#E5F1E4',
  leaf: '#B4DA55',
  sun: '#F59E0B',
  sunSoft: '#FEF3C7',
  clay: '#B4532A',
  claySoft: '#F8E7DC',
  sky: '#0369A1',
  skySoft: '#E0F2FE',
  canvas: '#F6F4EC',
  paper: '#FFFFFF',
  muted: '#5A6258',
  line: '#E8E4D8',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  red: '#B91C1C',
  redSoft: '#FEE2E2',
};

// Degradados (CSS); se aplican con `gradient()` de '@/shared/styles/gradient'.
export const gradients = {
  canopy: 'linear-gradient(135deg, #1B7A41 0%, #0F3D26 100%)',
  lime: 'linear-gradient(135deg, #C9E777 0%, #9FCB3A 100%)',
  heroWide: 'linear-gradient(100deg, rgba(15, 61, 38, 0.97) 0%, rgba(15, 61, 38, 0.86) 42%, rgba(15, 61, 38, 0.25) 100%)',
  heroNarrow: 'linear-gradient(180deg, rgba(15, 61, 38, 0.45) 0%, rgba(15, 61, 38, 0.90) 50%, rgba(15, 61, 38, 0.98) 100%)',
};

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

// Sombras suaves con tinte verde (funcionan en web y en la nueva arquitectura nativa).
export const shadows = {
  card: '0 1px 2px rgba(15, 61, 38, 0.05), 0 12px 32px rgba(15, 61, 38, 0.07)',
  raised: '0 2px 8px rgba(15, 61, 38, 0.10), 0 24px 56px rgba(15, 61, 38, 0.16)',
};

export const layout = {
  maxWidth: 1120,
  formWidth: 760,
  // A partir de este ancho se usa el diseño de escritorio (barra superior, columnas).
  wideBreakpoint: 768,
};