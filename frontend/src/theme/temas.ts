export type NombreTema = 'claro' | 'oscuro';

// Paleta "Campus UPC": estilo Organic Biophilic (skill ui-ux-pro-max) con los colores del propio
// campus: verde lima de las letras UPC, verde profundo de las baldosas y el follaje, marfil de los
// senderos, terracota de los ladrillos y azul del cielo. Todos los textos cumplen contraste 4.5:1.
const paletaClara = {
  ink: '#13261C',
  forest: '#166534',
  // Verde profundo de la marca: igual en los dos temas porque siempre va sobre fondos claros o lima.
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
  // Fondo de tarjetas y campos. Sobre los colores de acento (forest, amber, red…) sirve también
  // de texto: blanco en el tema claro y casi negro en el oscuro, donde los acentos son claros.
  paper: '#FFFFFF',
  muted: '#5A6258',
  line: '#E8E4D8',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  red: '#B91C1C',
  redSoft: '#FEE2E2',
  // Fondo salvia de la app (detrás de las tarjetas) y fondo de las fichas dentro de una tarjeta.
  sage: '#E4EDD8',
  tile: '#F3F7ED',
  // Blanco en los dos temas: textos sobre fotos y sobre los degradados verdes oscuros.
  white: '#FFFFFF',
  placeholder: '#8A978F',
  // Barras superior e inferior (translúcidas) y su borde.
  chrome: 'rgba(255, 255, 255, 0.8)',
  chromeLine: 'rgba(232, 228, 216, 0.9)',
  // Líneas finas dentro de las tarjetas (separadores del encabezado).
  hairline: 'rgba(15, 61, 38, 0.08)',
};

export type Paleta = { [K in keyof typeof paletaClara]: string };

// Tema oscuro: verde casi negro del follaje de noche; los acentos se aclaran para conservar el
// contraste 4.5:1 sobre las tarjetas.
const paletaOscura: Paleta = {
  ink: '#E6EFE8',
  forest: '#5CC98A',
  forestDark: '#0F3D26',
  forestSoft: '#173527',
  leaf: '#B4DA55',
  sun: '#F59E0B',
  sunSoft: '#3A2C12',
  clay: '#EE9466',
  claySoft: '#3A2219',
  sky: '#5DB7EC',
  skySoft: '#10283A',
  canvas: '#1A271F',
  paper: '#131E18',
  muted: '#9AAEA1',
  line: '#26372D',
  amber: '#F2A93B',
  amberSoft: '#3A2C12',
  red: '#F47F7F',
  redSoft: '#3D1C1E',
  sage: '#0B130F',
  tile: '#19271F',
  white: '#FFFFFF',
  placeholder: '#6F8577',
  chrome: 'rgba(14, 22, 18, 0.84)',
  chromeLine: 'rgba(255, 255, 255, 0.06)',
  hairline: 'rgba(255, 255, 255, 0.07)',
};

export type Degradados = Record<'canopy' | 'lime' | 'heroWide' | 'heroNarrow', string>;

// Degradados (CSS); se aplican con `gradient()` de '@/shared/styles/gradient'.
const degradadosClaros: Degradados = {
  canopy: 'linear-gradient(135deg, #1B7A41 0%, #0F3D26 100%)',
  lime: 'linear-gradient(135deg, #C9E777 0%, #9FCB3A 100%)',
  heroWide: 'linear-gradient(100deg, rgba(15, 61, 38, 0.97) 0%, rgba(15, 61, 38, 0.86) 42%, rgba(15, 61, 38, 0.25) 100%)',
  heroNarrow: 'linear-gradient(180deg, rgba(15, 61, 38, 0.45) 0%, rgba(15, 61, 38, 0.90) 50%, rgba(15, 61, 38, 0.98) 100%)',
};

const degradadosOscuros: Degradados = {
  ...degradadosClaros,
  // Un poco más claro que en el tema claro para que los botones se distingan de las tarjetas.
  canopy: 'linear-gradient(135deg, #23874B 0%, #12482B 100%)',
  heroWide: 'linear-gradient(100deg, rgba(8, 26, 17, 0.97) 0%, rgba(8, 26, 17, 0.86) 42%, rgba(8, 26, 17, 0.3) 100%)',
  heroNarrow: 'linear-gradient(180deg, rgba(8, 26, 17, 0.5) 0%, rgba(8, 26, 17, 0.92) 50%, rgba(8, 26, 17, 0.98) 100%)',
};

export type Sombras = Record<'card' | 'raised', string>;

// Sombras suaves con tinte verde (funcionan en web y en la nueva arquitectura nativa).
const sombrasClaras: Sombras = {
  card: '0 1px 2px rgba(15, 61, 38, 0.05), 0 12px 32px rgba(15, 61, 38, 0.07)',
  raised: '0 2px 8px rgba(15, 61, 38, 0.10), 0 24px 56px rgba(15, 61, 38, 0.16)',
};

const sombrasOscuras: Sombras = {
  card: '0 1px 2px rgba(0, 0, 0, 0.45), 0 12px 32px rgba(0, 0, 0, 0.35)',
  raised: '0 2px 8px rgba(0, 0, 0, 0.5), 0 24px 56px rgba(0, 0, 0, 0.55)',
};

export interface Superficie {
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
  boxShadow: string;
}

// Tarjetas: superficie sólida con borde fino, sombra en capas y, en el tema oscuro, un brillo de
// 1 px en el borde superior que les da relieve.
const tarjetaClara: Superficie = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(15, 61, 38, 0.07)',
  backgroundColor: '#FFFFFF',
  boxShadow: '0 1px 2px rgba(15, 61, 38, 0.05), 0 4px 10px rgba(15, 61, 38, 0.04), 0 18px 36px rgba(15, 61, 38, 0.08)',
};

const tarjetaOscura: Superficie = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.06)',
  backgroundColor: '#131E18',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 2px rgba(0, 0, 0, 0.5), 0 18px 36px rgba(0, 0, 0, 0.35)',
};

// Fondo de la app. El claro es el salvia de siempre; el oscuro, un verde casi negro. En web llevan
// brillos radiales (lima arriba a la izquierda, sol arriba a la derecha y verde abajo).
const fondoClaro = {
  web: [
    'radial-gradient(60% 40% at 0% 0%, rgba(180, 218, 85, 0.38) 0%, rgba(180, 218, 85, 0) 70%)',
    'radial-gradient(45% 35% at 100% 8%, rgba(245, 158, 11, 0.14) 0%, rgba(245, 158, 11, 0) 70%)',
    'radial-gradient(60% 45% at 100% 100%, rgba(22, 101, 52, 0.18) 0%, rgba(22, 101, 52, 0) 70%)',
    'linear-gradient(180deg, #D7E7CB 0%, #E3ECD6 38%, #EAEFE1 100%)',
  ].join(', '),
  nativo: 'linear-gradient(180deg, #D4E5C7 0%, #E1EBD4 38%, #E9EEE0 100%)',
};

const fondoOscuro = {
  web: [
    'radial-gradient(60% 40% at 0% 0%, rgba(180, 218, 85, 0.10) 0%, rgba(180, 218, 85, 0) 70%)',
    'radial-gradient(45% 35% at 100% 8%, rgba(245, 158, 11, 0.05) 0%, rgba(245, 158, 11, 0) 70%)',
    'radial-gradient(60% 45% at 100% 100%, rgba(34, 135, 75, 0.16) 0%, rgba(34, 135, 75, 0) 70%)',
    'linear-gradient(180deg, #0F1A14 0%, #0C1511 45%, #0A110D 100%)',
  ].join(', '),
  nativo: 'linear-gradient(180deg, #102019 0%, #0C1511 45%, #0A110D 100%)',
};

export interface Tema {
  nombre: NombreTema;
  oscuro: boolean;
  palette: Paleta;
  gradients: Degradados;
  shadows: Sombras;
  card: Superficie;
  fondo: { web: string; nativo: string };
}

export const temas: Record<NombreTema, Tema> = {
  claro: {
    nombre: 'claro',
    oscuro: false,
    palette: paletaClara,
    gradients: degradadosClaros,
    shadows: sombrasClaras,
    card: tarjetaClara,
    fondo: fondoClaro,
  },
  oscuro: {
    nombre: 'oscuro',
    oscuro: true,
    palette: paletaOscura,
    gradients: degradadosOscuros,
    shadows: sombrasOscuras,
    card: tarjetaOscura,
    fondo: fondoOscuro,
  },
};
