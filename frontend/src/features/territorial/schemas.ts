import { z } from 'zod';

import type { Tono } from '@/shared/components/UI';

/** Tablero territorial: mismos valores que backend/routers/territorial.py. */
export const SEMAFOROS = {
  rojo: { etiqueta: 'Sin PRAE', tono: 'critico', detalle: 'No hay PRAE del año en la app' },
  amarillo: { etiqueta: 'Falta evaluación', tono: 'riesgo', detalle: 'Le falta la evaluación del consejo directivo o de la Secretaría' },
  verde: { etiqueta: 'PRAE evaluado', tono: 'sano', detalle: 'Evaluado por el consejo directivo y la Secretaría' },
} as const satisfies Record<string, { etiqueta: string; tono: Tono; detalle: string }>;
export type Semaforo = keyof typeof SEMAFOROS;

export const TIPOS = {
  secretaria_educacion: 'Secretaría de Educación',
  autoridad_ambiental: 'Autoridad ambiental',
  gobernacion: 'Gobernación',
  alcaldia: 'Alcaldía',
  otro: 'Otro',
} as const;
export type TipoTerritorio = keyof typeof TIPOS;

export const territorioSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.enum(['secretaria_educacion', 'autoridad_ambiental', 'gobernacion', 'alcaldia', 'otro']),
  divipolas: z.array(z.string()),
  institucion_ids: z.array(z.string()),
  instituciones: z.number(),
  miembros: z.array(z.object({ usuario_id: z.string(), nombre: z.string(), correo: z.string().nullable() })),
});
export type Territorio = z.infer<typeof territorioSchema>;

const filaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  nombre_corto: z.string().nullable(),
  codigo_dane: z.string().nullable(),
  municipio: z.string().nullable(),
  divipola: z.string().nullable(),
  semaforo: z.enum(['verde', 'amarillo', 'rojo']),
  prae: z.object({
    id: z.string(),
    titulo: z.string(),
    tema: z.string().nullable(),
    tema_otro: z.string().nullable(),
    estado: z.string(),
    evaluaciones_faltantes: z.array(z.string()),
    pct_cumplidas: z.number().nullable(),
  }).nullable(),
  arboles: z.object({ total: z.number(), sano: z.number(), riesgo: z.number(), critico: z.number() }).nullable(),
  siembras: z.object({
    jornadas: z.number(), sembradas: z.number(), nativas: z.number(), clasificadas: z.number(), pct_nativas: z.number().nullable(),
    evaluadas: z.number(), vivas: z.number(), supervivencia_pct: z.number().nullable(), asistentes: z.number(),
  }).nullable(),
  clases: z.object({ clases: z.number(), guias: z.number(), asistentes: z.number() }).nullable(),
  servicio_social: z.object({ estudiantes: z.number(), completaron: z.number(), horas_aprobadas: z.number() }).nullable(),
  inspectores: z.number().nullable(),
});
export type FilaInstitucion = z.infer<typeof filaSchema>;

export const tableroSchema = z.object({
  territorio_id: z.string().nullable(),
  territorio: z.string(),
  anio: z.number(),
  generado_en: z.string(),
  totales: z.object({
    instituciones: z.number(),
    semaforo: z.object({ verde: z.number(), amarillo: z.number(), rojo: z.number() }),
    arboles: z.number(),
    jornadas: z.number(),
    sembradas: z.number(),
    pct_nativas: z.number().nullable(),
    supervivencia_pct: z.number().nullable(),
    clases: z.number(),
    estudiantes_en_clases: z.number(),
    inspectores: z.number(),
    asistentes_siembras: z.number(),
    estudiantes_servicio: z.number(),
    horas_servicio: z.number(),
  }),
  instituciones: z.array(filaSchema),
});
export type Tablero = z.infer<typeof tableroSchema>;

export const informeSchema = z.object({
  territorio_id: z.string(),
  anio: z.number(),
  secciones: z.record(z.string(), z.string()),
  estado: z.enum(['borrador', 'final']),
  actualizado_en: z.string().nullable(),
  titulos: z.record(z.string(), z.string()),
});
export type Informe = z.infer<typeof informeSchema>;

export const descargaSchema = z.object({ url: z.string().min(1), nombre: z.string(), vence_en_segundos: z.number() });

/** Orden de las secciones editables del informe (las mismas claves que el backend). */
export const SECCIONES = ['presentacion', 'reforestacion', 'cambio_climatico', 'logros', 'dificultades', 'proyecciones'] as const;

export const AYUDAS: Record<(typeof SECCIONES)[number], string> = {
  presentacion: 'Para qué es el informe, qué periodo cubre y cómo se recogió la información.',
  reforestacion: 'Lo que las cifras no cuentan: alianzas, viveros, mantenimiento, apoyo de la autoridad ambiental.',
  cambio_climatico: 'Proyectos, campañas o cátedras de los colegios frente al cambio climático.',
  logros: 'Lo más importante que se consiguió en el año.',
  dificultades: 'Qué impidió avanzar: recursos, tiempos, acompañamiento.',
  proyecciones: 'Metas y apoyo previsto para el próximo año.',
};

/** "20001, 20011" o una por línea -> ["20001", "20011"]. */
export function separarDivipolas(texto: string) {
  return [...new Set(texto.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
}

export function divipolasValidas(lista: string[]) {
  return lista.every((c) => /^\d{5}$/.test(c));
}
