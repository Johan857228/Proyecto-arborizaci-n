import { z } from 'zod';

export const catalogosSchema = z.object({
  especies: z.array(z.object({
    id: z.number().int().positive(),
    nombre_comun: z.string().min(1),
    nombre_cientifico: z.string().min(1),
  })),
  instituciones: z.array(z.object({
    id: z.string().min(1),
    nombre: z.string().min(1),
    nombre_corto: z.string().min(1),
    prefijo: z.string().min(1),
    lat: z.number(),
    lng: z.number(),
  })),
  observaciones: z.array(z.object({
    codigo: z.string().min(1),
    grupo: z.enum(['follaje', 'tronco', 'raiz', 'plagas']),
    etiqueta: z.string().min(1),
    orden: z.number().int(),
  })),
});
