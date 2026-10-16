import { analisisIASchema, estadoIASchema } from '@/features/ia/schemas';
import { adjuntarFoto } from '@/features/trees/services/photosService';
import type { FotoLocal } from '@/features/trees/types';
import { api, validar } from '@/services/api/client';

// Analizar dos fotos puede tardar más que el límite general de la API (20 s).
const ESPERA_ANALISIS_MS = 120_000;

export const iaService = {
  /** Si la identificación con IA está activada en el servidor. */
  async estado() {
    const { data } = await api.get<unknown>('/ia/estado');
    return validar(estadoIASchema, data);
  },

  /** Envía la foto general (y la de detalle, si existe) y devuelve las sugerencias. */
  async analizar(general: FotoLocal, detalle?: FotoLocal) {
    const form = new FormData();
    await adjuntarFoto(form, 'general', general);
    if (detalle) await adjuntarFoto(form, 'detalle', detalle);
    const { data } = await api.post<unknown>('/ia/analizar-foto', form, { timeout: ESPERA_ANALISIS_MS });
    return validar(analisisIASchema, data);
  },
};
