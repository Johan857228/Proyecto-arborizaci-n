import { z } from 'zod';

import type { Catalogos } from '@/features/catalogs/types';
import {
  bioticosSalidaSchema,
  camposBioticosSchema,
  validarBioticos,
  TIPOS_ENFERMEDAD,
  TIPOS_EPIFITA,
  TIPOS_HEMIPARASITA,
  TIPOS_INSECTO,
  PARTES_ARBOL,
} from '@/features/inspections/bioticos';
import { fotoOutSchema, observacionOutSchema } from '@/features/trees/schemas';
import { COLOMBIA, isInColombia } from '@/shared/utils/geo';
import { numero, textoOpcional } from '@/shared/validacion';

export const estadoSchema = z.enum(['sano', 'riesgo', 'critico']);
export const estadoRevisionSchema = z.enum(['pendiente', 'confirmada', 'anulada']);
export type EstadoRevision = z.infer<typeof estadoRevisionSchema>;

const ETAPAS = ['Plántula', 'Juvenil', 'Adulto', 'Senescente'] as const;
const INTERFERENCIAS = [
  'Ninguna',
  'Levantamiento de pisos',
  'Afectación de muros',
  'Cables eléctricos',
  'Otra infraestructura',
] as const;
export const etapas = ETAPAS;
export const interferencias = INTERFERENCIAS;

export const inspeccionSchema = z.object({
  id: z.string().min(1),
  arbol_id: z.string().min(1),
  fecha: z.string().min(1),
  origen: z.enum(['registro', 'seguimiento']),
  inspector_id: z.string().nullable(),
  inspector_nombre: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  precision_gps_m: z.number().nullable(),
  dap_cm: z.number(),
  altura_m: z.number(),
  copa_m: z.number(),
  etapa: z.string(),
  interferencia: z.string(),
  interferencia_otra: z.string().nullable(),
  notas: z.string().nullable(),
  metodo_id: z.string(),
  metodo_version: z.number().int().nullable(),
  puntaje_riesgo: z.number(),
  calificacion: estadoSchema,
  estado_revision: estadoRevisionSchema,
  revisado_por: z.string().nullable(),
  revisado_por_nombre: z.string().nullable(),
  revisado_en: z.string().nullable(),
  comentario_revision: z.string().nullable(),
  observaciones: z.array(observacionOutSchema),
  fotos: z.array(fotoOutSchema),
  biomasa_total_kg: z.number(),
  carbono_kg: z.number(),
  co2_kg: z.number(),
  o2_kg: z.number(),
  advertencias: z.array(z.string()),
  fotos_sugeridas: z.array(z.enum(['completo', 'detalle', 'adicional'])),
  ...bioticosSalidaSchema.shape,
});
export type Inspeccion = z.infer<typeof inspeccionSchema>;

export const inspeccionConArbolSchema = inspeccionSchema.extend({
  codigo: z.string(),
  nombre_comun: z.string(),
  nombre_cientifico: z.string(),
  zona: z.string(),
  zona_otra: z.string().nullable(),
  institucion_id: z.string(),
  nombre_corto: z.string(),
  puede_revisar: z.boolean(),
  motivo_no_revisable: z.string().nullable(),
});
export type InspeccionConArbol = z.infer<typeof inspeccionConArbolSchema>;

export const pendientesSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(inspeccionConArbolSchema),
});

// ------------------------------------------------------------ Formulario
// Mismos límites que el registro del árbol, la API y la base de datos (migración 003).
const camposInspeccion = z.object({
  gps_confirmado: z.boolean(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  precision_gps_m: z.number().min(0).nullable(),
  dap_cm: numero().gt(0, 'Debe ser mayor que cero.').max(500, 'Máximo 500 cm (5 m).'),
  altura_m: numero().gt(0, 'Debe ser mayor que cero.').max(25, 'Máximo 25 m.'),
  copa_m: numero().gt(0, 'Debe ser mayor que cero.').max(40, 'Máximo 40 m.'),
  etapa: z.enum(ETAPAS),
  interferencia: z.enum(INTERFERENCIAS),
  interferencia_otra: z.string().trim().max(120, 'Máximo 120 caracteres.').optional(),
  observaciones: z.array(z.string().min(1)).max(50),
  notas: textoOpcional(1000),
  ...camposBioticosSchema.shape,
});
export type InspeccionFormInput = z.input<typeof camposInspeccion>;

export function crearInspeccionFormSchema(catalogos: Catalogos) {
  const validas = new Set(catalogos.observaciones.map(({ codigo }) => codigo));
  return camposInspeccion.superRefine((valor, ctx) => {
    validarBioticos(valor, ctx);
    if (valor.interferencia === 'Otra infraestructura') {
      const texto = valor.interferencia_otra?.trim() ?? '';
      if (!texto) {
        ctx.addIssue({ code: 'custom', path: ['interferencia_otra'], message: 'Describe la infraestructura afectada.' });
      } else if (texto.length < 3) {
        ctx.addIssue({ code: 'custom', path: ['interferencia_otra'], message: 'Escribe al menos 3 caracteres.' });
      }
    }
    if (valor.gps_confirmado && valor.lat != null && valor.lng != null && !isInColombia(valor.lat, valor.lng)) {
      ctx.addIssue({
        code: 'custom',
        path: ['gps_confirmado'],
        message: 'La ubicación capturada está fuera de Colombia. Vuelve a capturarla junto al árbol.',
      });
    }
    if (new Set(valor.observaciones).size !== valor.observaciones.length) {
      ctx.addIssue({ code: 'custom', path: ['observaciones'], message: 'Una observación no se puede repetir.' });
    }
    valor.observaciones.forEach((codigo, index) => {
      if (!validas.has(codigo)) {
        ctx.addIssue({ code: 'custom', path: ['observaciones', index], message: 'La observación ya no está disponible.' });
      }
    });
  });
}

/** Lo que se envía a POST /arboles/{id}/inspecciones. */
export const inspeccionPayloadSchema = z.object({
  lat: z.number().min(COLOMBIA.latMin).max(COLOMBIA.latMax).nullable(),
  lng: z.number().min(COLOMBIA.lngMin).max(COLOMBIA.lngMax).nullable(),
  precision_gps_m: z.number().min(0).nullable(),
  dap_cm: z.number().gt(0).max(500),
  altura_m: z.number().gt(0).max(25),
  copa_m: z.number().gt(0).max(40),
  etapa: z.enum(ETAPAS),
  interferencia: z.enum(INTERFERENCIAS),
  interferencia_otra: z.string().min(3).max(120).nullable(),
  observaciones: z.array(z.string().min(1)).max(50),
  notas: z.string().max(1000).nullable(),
  // Opcionales: la API pone los valores por defecto si no se envían.
  insectos: z.enum(TIPOS_INSECTO).nullable().optional(),
  insectos_parte: z.enum(PARTES_ARBOL).nullable().optional(),
  insectos_sev: z.number().int().min(0).max(4).nullable().optional(),
  enfermedad: z.enum(TIPOS_ENFERMEDAD).nullable().optional(),
  enfermedad_parte: z.enum(PARTES_ARBOL).nullable().optional(),
  enfermedad_sev: z.number().int().min(0).max(4).nullable().optional(),
  muestra_lab: z.boolean().optional(),
  cod_muestra_lab: z.string().min(3).max(40).nullable().optional(),
  hemiparasitas: z.enum(TIPOS_HEMIPARASITA).nullable().optional(),
  pct_hemiparasitas: z.number().gt(0).max(100).nullable().optional(),
  bejucos: z.number().int().min(0).max(4).optional(),
  epifitas: z.array(z.enum(TIPOS_EPIFITA)).max(5).optional(),
}).strict();
export type InspeccionPayload = z.infer<typeof inspeccionPayloadSchema>;

export const anularSchema = z.object({
  motivo: z.string().trim().min(5, 'Explica el motivo en al menos 5 caracteres.').max(500, 'Máximo 500 caracteres.'),
});
export const confirmarSchema = z.object({
  comentario: z.string().trim().max(500, 'Máximo 500 caracteres.'),
});
