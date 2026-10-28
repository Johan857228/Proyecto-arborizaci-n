import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { confianzaSchema } from '@/features/ia/schemas';
import { adjuntarFoto } from '@/features/trees/services/photosService';
import type { FotoLocal } from '@/features/trees/types';
import { api, getValidado, validar } from '@/services/api/client';

/** Precisión y costo de la IA: misma forma que GET /ia/precision (backend/servicios/precision_ia.py). */
const tasaSchema = z.object({
  n: z.number(),
  aciertos: z.number(),
  pct: z.number().nullable(),
  ic95: z.tuple([z.number(), z.number()]).nullable(),
});
export type Tasa = z.infer<typeof tasaSchema>;

export const precisionSchema = z.object({
  desde: z.string().nullable(),
  modelo_actual: z.string(),
  tarifa: z.string(),
  general: tasaSchema,
  muestra_pequena: z.boolean(),
  muestra_minima: z.number(),
  cobertura: tasaSchema,
  al_sugerir: tasaSchema,
  por_tipo: z.object({ campo: tasaSchema, prueba: tasaSchema }),
  por_confianza: z.object({ alta: tasaSchema, media: tasaSchema, baja: tasaSchema }),
  por_origen: z.object({ nativa: tasaSchema, exotica: tasaSchema }),
  bosque_seco_cesar: tasaSchema.extend({ especies: z.number() }),
  por_especie: z.array(tasaSchema.extend({
    especie_id: z.number(),
    nombre_comun: z.string(),
    nombre_cientifico: z.string().nullable(),
    origen: z.enum(['nativa', 'exotica']).nullable(),
    bosque_seco_cesar: z.boolean(),
  })),
  confusiones: z.array(z.object({ real: z.string(), sugerida: z.string(), veces: z.number() })),
  fuera: z.object({ sin_arbol: z.number(), por_revisar: z.number(), anulados: z.number(), sin_especie: z.number() }),
  costo: z.object({
    analisis: z.number(),
    fotos: z.number(),
    sin_precio: z.number(),
    total_usd: z.number(),
    por_analisis_usd: z.number().nullable(),
    por_foto_usd: z.number().nullable(),
    trm: z.number().nullable(),
    por_foto_cop: z.number().nullable(),
    total_cop: z.number().nullable(),
    tokens_entrada_promedio: z.number().nullable(),
    tokens_salida_promedio: z.number().nullable(),
    duracion_mediana_s: z.number().nullable(),
    por_modelo: z.array(z.object({ modelo: z.string(), analisis: z.number(), total_usd: z.number() })),
  }),
});
export type Precision = z.infer<typeof precisionSchema>;

export const pruebaSchema = z.object({
  analisis_id: z.string(),
  especie_real_id: z.number(),
  especie_sugerida_id: z.number().nullable(),
  nombre_probable: z.string().nullable(),
  confianza: confianzaSchema,
  razon: z.string(),
  acierto: z.boolean(),
  es_arbol: z.boolean(),
  calidad_foto: z.enum(['buena', 'regular', 'mala']),
  modelo: z.string(),
  costo_usd: z.number().nullable(),
});
export type Prueba = z.infer<typeof pruebaSchema>;

// Analizar puede tardar más que el límite general de la API (20 s).
const ESPERA_ANALISIS_MS = 120_000;

export const precisionService = {
  precision: (desde?: string) => getValidado('/ia/precision', precisionSchema, desde ? { desde } : undefined),
  async probar(especieId: number, general: FotoLocal) {
    const form = new FormData();
    form.append('especie_id', String(especieId));
    await adjuntarFoto(form, 'general', general);
    const { data } = await api.post<unknown>('/ia/prueba', form, { timeout: ESPERA_ANALISIS_MS });
    return validar(pruebaSchema, data);
  },
};

export function usePrecisionIA(desde: string | undefined, enabled = true) {
  return useQuery({ queryKey: ['ia', 'precision', desde ?? 'todo'], queryFn: () => precisionService.precision(desde), enabled });
}

export function useProbarIA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ especieId, foto }: { especieId: number; foto: FotoLocal }) => precisionService.probar(especieId, foto),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['ia', 'precision'] }),
  });
}

/** "78 % (IC 95 %: 70–85 %)"; sin casos, "—". */
export function textoTasa(t: Tasa) {
  if (t.pct == null) return '—';
  const pct = `${Math.round(t.pct)} %`;
  return t.ic95 ? `${pct} (IC 95 %: ${Math.round(t.ic95[0])}–${Math.round(t.ic95[1])} %)` : pct;
}

/** Dólares con los decimales que hacen falta para que un costo de centavos no salga en cero. */
export function formatUsd(valor: number | null | undefined) {
  if (valor == null) return '—';
  return `US$${valor < 1 ? valor.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : valor.toFixed(2)}`.replace('.', ',');
}
