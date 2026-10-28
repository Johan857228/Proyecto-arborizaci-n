import { chartColors } from '@/config/constants';
import type { ArbolMapa, EspecieMapa } from '@/features/mapa/schemas';

/** Cómo se colorean los árboles. La leyenda sirve también de filtro: tocar una clase la oculta. */
export type ModoColor = 'estado' | 'riesgo' | 'especie' | 'origen';

export const MODOS: { valor: ModoColor; etiqueta: string }[] = [
  { valor: 'estado', etiqueta: 'Estado' },
  { valor: 'riesgo', etiqueta: 'Riesgo de caída' },
  { valor: 'especie', etiqueta: 'Especie' },
  { valor: 'origen', etiqueta: 'Nativa o exótica' },
];

export interface ClaseLeyenda {
  clave: string;
  etiqueta: string;
  color: string;
  total: number;
}

const SIN_DATO = chartColors.other;
// Colores fijos, no del tema: van sobre el mapa base, que siempre es claro. Estado y riesgo usan
// el mismo orden verde → amarillo → naranja → rojo; la leyenda siempre lleva el texto.
const FIJAS: Record<Exclude<ModoColor, 'especie'>, { clave: string; etiqueta: string; color: string }[]> = {
  estado: [
    { clave: 'sano', etiqueta: 'Sano', color: '#1BAF7A' },
    { clave: 'riesgo', etiqueta: 'En riesgo', color: '#EDA100' },
    { clave: 'critico', etiqueta: 'Crítico', color: '#D7263D' },
    { clave: 'sin_dato', etiqueta: 'Sin calificar', color: SIN_DATO },
  ],
  riesgo: [
    { clave: 'bajo', etiqueta: 'Bajo', color: '#1BAF7A' },
    { clave: 'medio', etiqueta: 'Medio', color: '#EDA100' },
    { clave: 'alto', etiqueta: 'Alto', color: '#EB6834' },
    { clave: 'inminente', etiqueta: 'Inminente', color: '#B3122E' },
    { clave: 'sin_dato', etiqueta: 'Sin tamizaje', color: SIN_DATO },
  ],
  origen: [
    { clave: 'nativa', etiqueta: 'Nativa', color: '#1BAF7A' },
    { clave: 'exotica', etiqueta: 'Exótica', color: '#2A78D6' },
    { clave: 'sin_dato', etiqueta: 'Sin clasificar', color: SIN_DATO },
  ],
};

/** Las especies con más árboles tienen color propio; el resto va en "Otras" (paleta validada de 4). */
const ESPECIES_CON_COLOR = chartColors.categorical.length;

export const COLOR_ALERTA = '#B3122E';
export const COLOR_SIEMBRA = '#7CB518';
export const COLOR_SEDE = '#0F3D26';

export function claveEspecie(e: { especie_id: number | null; nombre_comun: string }) {
  return e.especie_id != null ? String(e.especie_id) : `n:${e.nombre_comun}`;
}

export function especiesConColor(especies: EspecieMapa[]) {
  return especies.slice(0, ESPECIES_CON_COLOR).map(claveEspecie);
}

function otrasEspecies(n: number) {
  return n === 1 ? 'Otra especie' : n > 1 ? `Otras ${n} especies` : 'Otras';
}

/** Clase de la leyenda a la que pertenece el árbol en el modo elegido. */
export function claseDe(arbol: ArbolMapa, modo: ModoColor, conColor: string[]): string {
  if (modo === 'estado') return arbol.estado ?? 'sin_dato';
  if (modo === 'riesgo') return arbol.riesgo ?? 'sin_dato';
  if (modo === 'origen') return arbol.origen ?? 'sin_dato';
  const clave = claveEspecie(arbol);
  return conColor.includes(clave) ? clave : 'otras';
}

/** Clases del modo con su color y cuántos árboles tiene cada una (solo las que tienen alguno). */
export function leyenda(arboles: ArbolMapa[], modo: ModoColor, especies: EspecieMapa[]): ClaseLeyenda[] {
  const conColor = especiesConColor(especies);
  const totales = new Map<string, number>();
  for (const a of arboles) {
    const clase = claseDe(a, modo, conColor);
    totales.set(clase, (totales.get(clase) ?? 0) + 1);
  }
  const clases = modo === 'especie'
    ? [
        ...especies.slice(0, ESPECIES_CON_COLOR).map((e, i) => ({ clave: claveEspecie(e), etiqueta: e.nombre_comun, color: chartColors.categorical[i] })),
        { clave: 'otras', etiqueta: otrasEspecies(especies.length - ESPECIES_CON_COLOR), color: SIN_DATO },
      ]
    : FIJAS[modo];
  return clases.map((c) => ({ ...c, total: totales.get(c.clave) ?? 0 })).filter((c) => c.total > 0);
}

export function coloresDe(clases: ClaseLeyenda[]): Record<string, string> {
  return Object.fromEntries(clases.map((c) => [c.clave, c.color]));
}

/** Capas que se encienden o apagan encima de los árboles. */
export interface CapasVisibles {
  arboles: boolean;
  sedes: boolean;
  alertas: boolean;
  siembras: boolean;
  fondo: boolean;
}

export const CAPAS_INICIALES: CapasVisibles = { arboles: true, sedes: true, alertas: true, siembras: true, fondo: true };

/** Anillo alrededor del punto: la alerta abierta pesa más que la siembra. */
export function anilloDe(arbol: ArbolMapa, capas: CapasVisibles): string | null {
  if (capas.alertas && arbol.alerta) return COLOR_ALERTA;
  if (capas.siembras && arbol.siembra) return COLOR_SIEMBRA;
  return null;
}

export const ORIGENES: Record<'nativa' | 'exotica', string> = { nativa: 'Nativa', exotica: 'Exótica' };
export const RIESGOS: Record<'bajo' | 'medio' | 'alto' | 'inminente', string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', inminente: 'Inminente' };
