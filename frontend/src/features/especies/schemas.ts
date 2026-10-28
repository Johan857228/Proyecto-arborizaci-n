import { z } from 'zod';

import type { Tono } from '@/shared/components/UI';

/** Catálogo de especies con fuente oficial: mismos valores que backend/routers/especies.py. */
export const AMENAZAS = {
  CR: { etiqueta: 'En peligro crítico', tono: 'critico' },
  EN: { etiqueta: 'En peligro', tono: 'critico' },
  VU: { etiqueta: 'Vulnerable', tono: 'riesgo' },
} as const satisfies Record<string, { etiqueta: string; tono: Tono }>;
export type Amenaza = keyof typeof AMENAZAS;

export const ESTATUS = { cultivada: 'Cultivada', naturalizada: 'Naturalizada', trasplantada: 'Trasplantada' } as const;

export const FUENTES_ORIGEN = {
  oficial: 'Según las listas oficiales',
  administrador: 'Clasificada a mano por el administrador',
  app: 'Lista de la app, sin consultar fuentes oficiales',
} as const;

const fuenteSchema = z.object({
  clave: z.string(),
  titulo: z.string(),
  editor: z.string(),
  version: z.string().nullable(),
  doi: z.string().nullable(),
  publicado: z.string().nullable(),
  encontrada: z.boolean(),
  registro_url: z.string().nullable(),
  dato: z.string(),
});
export type Fuente = z.infer<typeof fuenteSchema>;

const fichaSchema = z.object({
  nombre_consultado: z.string(),
  nombre_aceptado: z.string().nullable(),
  coincidencia: z.enum(['exacta', 'sinonimo', 'no_encontrada']),
  en_catalogo: z.boolean(),
  departamentos: z.array(z.string()),
  en_cesar: z.boolean(),
  forma_de_vida: z.string().nullable(),
  origen: z.enum(['nativa', 'exotica']).nullable(),
  estatus: z.enum(['cultivada', 'naturalizada', 'trasplantada']).nullable(),
  invasora: z.boolean().nullable(),
  riesgo_invasion: z.string().nullable(),
  amenaza: z.enum(['CR', 'EN', 'VU']).nullable(),
  bosque_seco: z.boolean(),
  bosque_seco_cesar: z.boolean(),
  avisos: z.array(z.string()),
  fuentes: z.array(fuenteSchema),
  consultado_en: z.string().nullable(),
  veda: z.string().nullable(),
  veda_url: z.string().nullable(),
  veda_registrada_en: z.string().nullable(),
});
export type Ficha = z.infer<typeof fichaSchema>;

export const especieCatalogoSchema = z.object({
  id: z.number(),
  nombre_comun: z.string(),
  nombre_cientifico: z.string().nullable(),
  origen: z.enum(['nativa', 'exotica']).nullable(),
  origen_fuente: z.enum(['oficial', 'administrador', 'app']).nullable(),
  arboles: z.number(),
  ficha: fichaSchema.nullable(),
});
export type EspecieCatalogo = z.infer<typeof especieCatalogoSchema>;

export const catalogoSchema = z.object({
  especies: z.array(especieCatalogoSchema),
  resumen: z.object({
    especies: z.number(),
    con_ficha: z.number(),
    nativas: z.number(),
    exoticas: z.number(),
    invasoras: z.number(),
    amenazadas: z.number(),
    en_veda: z.number(),
    bosque_seco_cesar: z.number(),
    arboles: z.number(),
    pct_arboles_nativos: z.number().nullable(),
    arboles_bosque_seco_cesar: z.number(),
    arboles_invasoras: z.number(),
  }),
  listas: z.array(z.object({ clave: z.string(), titulo: z.string(), editor: z.string() })),
  editable: z.boolean(),
  migracion_pendiente: z.boolean(),
});
export type Catalogo = z.infer<typeof catalogoSchema>;

export const FILTROS = {
  todas: 'Todas',
  nativas: 'Nativas',
  exoticas: 'Exóticas',
  bosque_seco: 'Bosque seco del Cesar',
  amenazadas: 'Amenazadas',
  invasoras: 'Invasoras',
  veda: 'En veda',
  sin_ficha: 'Sin fuente oficial',
} as const;
export type Filtro = keyof typeof FILTROS;

const CUMPLE: Record<Filtro, (e: EspecieCatalogo) => boolean> = {
  todas: () => true,
  nativas: (e) => e.origen === 'nativa',
  exoticas: (e) => e.origen === 'exotica',
  bosque_seco: (e) => e.ficha?.bosque_seco_cesar === true,
  amenazadas: (e) => Boolean(e.ficha?.amenaza),
  invasoras: (e) => e.ficha?.invasora === true,
  veda: (e) => Boolean(e.ficha?.veda),
  sin_ficha: (e) => !e.ficha,
};

function sinTildes(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Especies que cumplen el filtro y cuyo nombre común o científico contiene el texto. */
export function filtrarEspecies(especies: EspecieCatalogo[], filtro: Filtro, texto: string) {
  const buscado = sinTildes(texto.trim());
  return especies.filter(
    (e) => CUMPLE[filtro](e) && (!buscado || sinTildes(`${e.nombre_comun} ${e.nombre_cientifico ?? ''}`).includes(buscado)),
  );
}

/** Orden para actualizar desde las fuentes: primero las que no tienen ficha y las más sembradas. */
export function ordenDeConsulta(especies: EspecieCatalogo[]) {
  return [...especies].sort((a, b) => Number(Boolean(a.ficha)) - Number(Boolean(b.ficha)) || b.arboles - a.arboles);
}

/** Avisos al elegir una especie para sembrar o registrar (con lo que trae /catalogos). */
export function avisosDeSiembra(especie: { invasora?: boolean | null; amenaza?: Amenaza | null; en_veda?: boolean } | undefined) {
  const avisos: { tono: 'warning' | 'error' | 'info'; texto: string }[] = [];
  if (!especie) return avisos;
  if (especie.invasora) avisos.push({ tono: 'error', texto: 'Especie declarada invasora en Colombia (Resolución 207 de 2010): no se recomienda sembrarla.' });
  if (especie.amenaza) avisos.push({ tono: 'info', texto: `Especie amenazada (${AMENAZAS[especie.amenaza].etiqueta.toLowerCase()}, Resolución 0126 de 2024): sembrarla ayuda a conservarla; pide plántulas de un vivero registrado.` });
  if (especie.en_veda) avisos.push({ tono: 'warning', texto: 'Especie en veda: para podarla o talarla se necesita permiso de la autoridad ambiental.' });
  return avisos;
}
