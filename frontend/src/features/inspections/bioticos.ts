import { z } from 'zod';

import { numero } from '@/shared/validacion';

/**
 * Agentes bióticos (tabla de variables FB-01 a FB-06). Se registran en cada inspección, también
 * en la del registro del árbol. Los códigos son los mismos del backend y de la migración 004.
 */
export const TIPOS_INSECTO = ['defoliadores', 'chupadores', 'escamas', 'arrieras', 'minadores', 'agalladores'] as const;
export const TIPOS_ENFERMEDAD = ['fungica', 'bacteriana', 'viral', 'indeterminada'] as const;
export const PARTES_ARBOL = ['hojas', 'ramas', 'tronco', 'raiz', 'flores_frutos'] as const;
export const TIPOS_HEMIPARASITA = ['pajarito', 'cuscuta'] as const;
export const TIPOS_EPIFITA = ['bromelias', 'orquideas', 'helechos', 'liquenes', 'musgos'] as const;

export type TipoInsecto = (typeof TIPOS_INSECTO)[number];
export type TipoEnfermedad = (typeof TIPOS_ENFERMEDAD)[number];
export type ParteArbol = (typeof PARTES_ARBOL)[number];
export type TipoHemiparasita = (typeof TIPOS_HEMIPARASITA)[number];
export type TipoEpifita = (typeof TIPOS_EPIFITA)[number];

/** Nombre y cómo se reconoce en campo (método de medición de la tabla). */
export const INSECTOS: Record<TipoInsecto, { nombre: string; senal: string }> = {
  defoliadores: { nombre: 'Defoliadores', senal: 'Hojas mordidas, orugas.' },
  chupadores: { nombre: 'Chupadores', senal: 'Hojas enrolladas, pegajosas o con fumagina.' },
  escamas: { nombre: 'Escamas', senal: 'Costras o motas algodonosas.' },
  arrieras: { nombre: 'Arrieras', senal: 'Cortes en media luna y caminos.' },
  minadores: { nombre: 'Minadores', senal: 'Galerías en la hoja.' },
  agalladores: { nombre: 'Agalladores', senal: 'Abultamientos.' },
};

export const ENFERMEDADES: Record<TipoEnfermedad, { nombre: string; senal: string }> = {
  fungica: { nombre: 'Fúngica', senal: 'Manchas con anillos, polvo blanco o negro.' },
  bacteriana: { nombre: 'Bacteriana', senal: 'Manchas aceitosas, exudado maloliente.' },
  viral: { nombre: 'Viral', senal: 'Mosaicos, hojas deformes.' },
  indeterminada: { nombre: 'Causa indeterminada', senal: 'Cuando no es posible decidir entre las anteriores.' },
};

export const PARTES: Record<ParteArbol, string> = {
  hojas: 'Hojas',
  ramas: 'Ramas',
  tronco: 'Tronco',
  raiz: 'Raíz',
  flores_frutos: 'Flores o frutos',
};

export const HEMIPARASITAS: Record<TipoHemiparasita, { nombre: string; senal: string }> = {
  pajarito: {
    nombre: 'Pajarito o muérdago (Loranthaceae)',
    senal: 'Matas de hojas distintas que nacen de la rama, a menudo con flores rojas o naranjas.',
  },
  cuscuta: { nombre: 'Cuscuta', senal: 'Filamentos amarillos o naranjas sobre la copa.' },
};

export const EPIFITAS: Record<TipoEpifita, string> = {
  bromelias: 'Bromelias',
  orquideas: 'Orquídeas',
  helechos: 'Helechos',
  liquenes: 'Líquenes',
  musgos: 'Musgos',
};

/** Escala de severidad 0 a 4 (daño de insectos y enfermedades). */
export const SEVERIDAD = ['Sin daño', 'Leve', 'Moderada', 'Severa', 'Muy severa'] as const;
/** Bejucos: se califica la porción del individuo cubierta. */
export const COBERTURA_BEJUCOS = ['Sin bejucos', 'Hasta 25 %', '26 a 50 %', '51 a 75 %', 'Más de 75 %'] as const;

const CODIGO_MUESTRA = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;

export const camposBioticosSchema = z.object({
  // Todos tienen valor por defecto: un registro o inspección sin agentes sigue siendo válido.
  insectos: z.enum(TIPOS_INSECTO).nullable().default(null),
  insectos_parte: z.enum(PARTES_ARBOL).nullable().default(null),
  insectos_sev: z.number().int().min(0).max(4).nullable().default(null),
  enfermedad: z.enum(TIPOS_ENFERMEDAD).nullable().default(null),
  enfermedad_parte: z.enum(PARTES_ARBOL).nullable().default(null),
  enfermedad_sev: z.number().int().min(0).max(4).nullable().default(null),
  muestra_lab: z.boolean().default(false),
  // Nulo es lo que se envía a la API cuando no hay muestra o hemiparásitas.
  cod_muestra_lab: z.string().trim().max(40, 'Máximo 40 caracteres.').nullable().default(''),
  hemiparasitas: z.enum(TIPOS_HEMIPARASITA).nullable().default(null),
  pct_hemiparasitas: numero().gt(0, 'Debe ser mayor que cero.').max(100, 'Máximo 100 %.').nullable().optional(),
  bejucos: z.number().int().min(0).max(4).default(0),
  epifitas: z.array(z.enum(TIPOS_EPIFITA)).max(5).default([]),
});
export type CamposBioticos = z.input<typeof camposBioticosSchema>;

export const valoresBioticosIniciales: Required<Omit<CamposBioticos, 'pct_hemiparasitas'>> & Pick<CamposBioticos, 'pct_hemiparasitas'> = {
  insectos: null,
  insectos_parte: null,
  insectos_sev: null,
  enfermedad: null,
  enfermedad_parte: null,
  enfermedad_sev: null,
  muestra_lab: false,
  cod_muestra_lab: '',
  hemiparasitas: null,
  pct_hemiparasitas: undefined,
  bejucos: 0,
  epifitas: [],
};

/** Reglas entre campos (las mismas del backend y de la base de datos). */
export function validarBioticos(valor: z.output<typeof camposBioticosSchema>, ctx: z.RefinementCtx) {
  for (const agente of ['insectos', 'enfermedad'] as const) {
    if (!valor[agente]) continue;
    if (!valor[`${agente}_parte`]) {
      ctx.addIssue({ code: 'custom', path: [`${agente}_parte`], message: 'Indica la parte afectada.' });
    }
    if (valor[`${agente}_sev`] == null) {
      ctx.addIssue({ code: 'custom', path: [`${agente}_sev`], message: 'Elige la severidad.' });
    }
  }
  if (valor.muestra_lab) {
    const codigo = (valor.cod_muestra_lab ?? '').trim();
    if (!codigo) {
      ctx.addIssue({ code: 'custom', path: ['cod_muestra_lab'], message: 'Escribe el código con que rotulaste la muestra.' });
    } else if (!CODIGO_MUESTRA.test(codigo)) {
      ctx.addIssue({ code: 'custom', path: ['cod_muestra_lab'], message: 'Usa de 3 a 40 letras, números o guiones, sin espacios.' });
    }
  }
  if (valor.hemiparasitas && valor.pct_hemiparasitas == null) {
    ctx.addIssue({ code: 'custom', path: ['pct_hemiparasitas'], message: 'Indica qué porcentaje de la copa cubren.' });
  }
}

export interface PayloadBiotico {
  insectos: TipoInsecto | null;
  insectos_parte: ParteArbol | null;
  insectos_sev: number | null;
  enfermedad: TipoEnfermedad | null;
  enfermedad_parte: ParteArbol | null;
  enfermedad_sev: number | null;
  muestra_lab: boolean;
  cod_muestra_lab: string | null;
  hemiparasitas: TipoHemiparasita | null;
  pct_hemiparasitas: number | null;
  bejucos: number;
  epifitas: TipoEpifita[];
}

/** Lo que se envía a la API: los datos de un agente solo van si el agente se marcó. */
export function payloadBiotico(v: CamposBioticos): PayloadBiotico {
  const insectos = v.insectos ?? null;
  const enfermedad = v.enfermedad ?? null;
  const hemiparasitas = v.hemiparasitas ?? null;
  const muestra = v.muestra_lab ?? false;
  return {
    insectos,
    insectos_parte: insectos ? (v.insectos_parte ?? null) : null,
    insectos_sev: insectos ? (v.insectos_sev ?? null) : null,
    enfermedad,
    enfermedad_parte: enfermedad ? (v.enfermedad_parte ?? null) : null,
    enfermedad_sev: enfermedad ? (v.enfermedad_sev ?? null) : null,
    muestra_lab: muestra,
    cod_muestra_lab: muestra ? (v.cod_muestra_lab ?? '').trim().toUpperCase() : null,
    hemiparasitas,
    pct_hemiparasitas: hemiparasitas ? (v.pct_hemiparasitas ?? null) : null,
    bejucos: v.bejucos ?? 0,
    epifitas: [...new Set(v.epifitas ?? [])].sort(),
  };
}

/** Campos bióticos tal como los devuelve la API en una inspección (vacíos en las anteriores a la 004). */
export const bioticosSalidaSchema = z.object({
  insectos: z.enum(TIPOS_INSECTO).nullable().optional(),
  insectos_parte: z.enum(PARTES_ARBOL).nullable().optional(),
  insectos_sev: z.number().int().nullable().optional(),
  enfermedad: z.enum(TIPOS_ENFERMEDAD).nullable().optional(),
  enfermedad_parte: z.enum(PARTES_ARBOL).nullable().optional(),
  enfermedad_sev: z.number().int().nullable().optional(),
  muestra_lab: z.boolean().optional(),
  cod_muestra_lab: z.string().nullable().optional(),
  hemiparasitas: z.enum(TIPOS_HEMIPARASITA).nullable().optional(),
  pct_hemiparasitas: z.number().nullable().optional(),
  bejucos: z.number().int().nullable().optional(),
  epifitas: z.array(z.enum(TIPOS_EPIFITA)).optional(),
});
export type BioticosSalida = z.infer<typeof bioticosSalidaSchema>;

/** Una línea para listas (historial, revisión): "Insectos: chupadores en hojas, …; Epífitas: …". */
export function lineaBiotica(i: BioticosSalida): string {
  return resumenBiotico(i).map((l) => `${l.etiqueta}: ${l.valor}`).join('; ');
}

/** Frases cortas con lo que se registró; vacío si no se observó ningún agente. */
export function resumenBiotico(i: BioticosSalida): { etiqueta: string; valor: string }[] {
  const lineas: { etiqueta: string; valor: string }[] = [];
  const parteYSeveridad = (parte?: ParteArbol | null, sev?: number | null) =>
    [parte ? `en ${PARTES[parte].toLowerCase()}` : null, sev != null ? `severidad ${sev} (${SEVERIDAD[sev]?.toLowerCase()})` : null]
      .filter(Boolean)
      .join(', ');
  if (i.insectos) {
    lineas.push({ etiqueta: 'Insectos', valor: `${INSECTOS[i.insectos].nombre} ${parteYSeveridad(i.insectos_parte, i.insectos_sev)}`.trim() });
  }
  if (i.enfermedad) {
    lineas.push({
      etiqueta: 'Enfermedad sospechada',
      valor: `${ENFERMEDADES[i.enfermedad].nombre} ${parteYSeveridad(i.enfermedad_parte, i.enfermedad_sev)}`.trim(),
    });
  }
  if (i.muestra_lab) lineas.push({ etiqueta: 'Muestra de laboratorio', valor: i.cod_muestra_lab ?? 'Sí' });
  if (i.hemiparasitas) {
    const pct = i.pct_hemiparasitas != null ? `, ${String(i.pct_hemiparasitas).replace('.', ',')} % de la copa` : '';
    lineas.push({ etiqueta: 'Hemiparásitas', valor: `${HEMIPARASITAS[i.hemiparasitas].nombre}${pct}` });
  }
  if (i.bejucos) lineas.push({ etiqueta: 'Bejucos', valor: `${COBERTURA_BEJUCOS[i.bejucos]} del individuo (${i.bejucos})` });
  if (i.epifitas?.length) lineas.push({ etiqueta: 'Epífitas', valor: i.epifitas.map((e) => EPIFITAS[e]).join(', ') });
  return lineas;
}
