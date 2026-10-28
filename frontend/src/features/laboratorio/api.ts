import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { getValidado } from '@/services/api/client';

/** Respuesta de GET /laboratorio/datos (backend/routers/guias.py): medidas sin datos de personas. */
export const datoSchema = z.object({
  id: z.string(),
  codigo: z.string().nullable(),
  institucion_id: z.string().nullable(),
  especie: z.string(),
  nombre_cientifico: z.string().nullable(),
  zona: z.string().nullable(),
  etapa: z.string().nullable(),
  estado: z.string().nullable(),
  dap_cm: z.number(),
  altura_m: z.number(),
  copa_m: z.number().nullable(),
});
export type DatoLaboratorio = z.infer<typeof datoSchema>;

export const laboratorioSchema = z.object({
  institucion_id: z.string().nullable(),
  generado_en: z.string(),
  arboles: z.array(datoSchema),
});

export const VARIABLES = {
  dap_cm: { etiqueta: 'DAP', unidad: 'cm', nombre: 'Diámetro a la altura del pecho' },
  altura_m: { etiqueta: 'Altura', unidad: 'm', nombre: 'Altura total' },
  copa_m: { etiqueta: 'Copa', unidad: 'm', nombre: 'Diámetro de la copa' },
} as const;
export type Variable = keyof typeof VARIABLES;

// La raíz 'laboratorio' se guarda en el teléfono: el laboratorio funciona sin conexión.
export function useLaboratorio(institucionId?: string, enabled = true) {
  return useQuery({
    queryKey: ['laboratorio', institucionId ?? 'propia'],
    queryFn: () => getValidado('/laboratorio/datos', laboratorioSchema, { institucion_id: institucionId }),
    enabled,
    staleTime: 5 * 60_000,
  });
}
