import { z } from 'zod';

import {
  PARTES_ARBOL,
  TIPOS_ENFERMEDAD,
  TIPOS_EPIFITA,
  TIPOS_HEMIPARASITA,
  TIPOS_INSECTO,
} from '@/features/inspections/bioticos';
import { etapas, interferencias } from '@/features/inspections/schemas';

/** Respuesta de POST /ia/analizar-foto (backend/servicios/ia.py). El backend ya descartó lo que
 *  no está en los catálogos; aquí se vuelve a validar antes de mostrarlo. */
export const confianzaSchema = z.enum(['alta', 'media', 'baja']);
export type Confianza = z.infer<typeof confianzaSchema>;

const respaldo = { confianza: confianzaSchema, razon: z.string() };

export const analisisIASchema = z.object({
  es_arbol: z.boolean(),
  calidad_foto: z.enum(['buena', 'regular', 'mala']),
  resumen: z.string(),
  especie: z.object({ especie_id: z.number().int().nullable(), nombre_probable: z.string().nullable(), ...respaldo }),
  etapa: z.object({ valor: z.enum(etapas).nullable(), ...respaldo }),
  interferencia: z.object({ valor: z.enum(interferencias).nullable(), ...respaldo }),
  observaciones: z.array(z.object({ codigo: z.string().min(1), ...respaldo })),
  insectos: z
    .object({ tipo: z.enum(TIPOS_INSECTO), parte: z.enum(PARTES_ARBOL), severidad: z.number().int().min(0).max(4), ...respaldo })
    .nullable(),
  enfermedad: z
    .object({ tipo: z.enum(TIPOS_ENFERMEDAD), parte: z.enum(PARTES_ARBOL), severidad: z.number().int().min(0).max(4), ...respaldo })
    .nullable(),
  hemiparasitas: z
    .object({ tipo: z.enum(TIPOS_HEMIPARASITA), pct_copa: z.number().gt(0).max(100), ...respaldo })
    .nullable(),
  bejucos: z.object({ nivel: z.number().int().min(1).max(4), ...respaldo }).nullable(),
  epifitas: z.object({ tipos: z.array(z.enum(TIPOS_EPIFITA)), ...respaldo }).nullable(),
  modelo: z.string(),
  /** Se envía con el árbol para medir qué tan bien acierta la IA (null si el servidor no lo anotó). */
  analisis_id: z.string().nullable().optional(),
});
export type AnalisisIA = z.infer<typeof analisisIASchema>;

export const estadoIASchema = z.object({ disponible: z.boolean(), modelo: z.string() });
export type EstadoIA = z.infer<typeof estadoIASchema>;
