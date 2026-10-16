import { z } from 'zod';

import type { Catalogos } from '@/features/catalogs/types';

// Medida numérica con mensajes en español: vacía ("Ingresa…") o con un valor que no es número.
const medida = (mensajeVacio: string) =>
  z.number({ error: (issue) => (issue.input === undefined ? mensajeVacio : 'Escribe un número válido.') });

const arbolFieldsSchema = z.object({
  institucion_id: z.string().min(1, 'Selecciona la institución.'),
  zona: z.enum([
    'Patio central',
    'Entrada principal',
    'Zona deportiva',
    'Bloques académicos',
    'Otra',
  ]),
  zona_otra: z.string().trim().max(120).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  especie_id: z.number().int().positive('Selecciona una especie.'),
  dap_cm: medida('Ingresa el diámetro del tronco.').gt(0, 'Debe ser mayor que cero.'),
  altura_m: medida('Ingresa la altura.').gt(0, 'Debe ser mayor que cero.').max(25, 'Máximo 25 m.'),
  copa_m: medida('Ingresa el diámetro de copa.').gt(0, 'Debe ser mayor que cero.'),
  etapa: z.enum(['Plántula', 'Juvenil', 'Adulto', 'Senescente']),
  interferencia: z.enum([
    'Ninguna',
    'Levantamiento de pisos',
    'Afectación de muros',
    'Cables eléctricos',
    'Otra infraestructura',
  ]),
  interferencia_otra: z.string().trim().max(120).optional(),
  observaciones: z.array(z.string().min(1)).max(50, 'Selecciona como máximo 50 observaciones.'),
}).strict();

function validateTreeRules(
  value: z.infer<typeof arbolFieldsSchema>,
  ctx: z.RefinementCtx,
) {
  if (value.zona === 'Otra' && !value.zona_otra?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['zona_otra'], message: 'Especifica la zona.' });
  }
  if (value.interferencia === 'Otra infraestructura' && !value.interferencia_otra?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['interferencia_otra'],
      message: 'Describe la infraestructura afectada.',
    });
  }
  if (new Set(value.observaciones).size !== value.observaciones.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['observaciones'],
      message: 'Una observación no se puede seleccionar más de una vez.',
    });
  }
}

export const arbolCreatePayloadSchema = arbolFieldsSchema.superRefine(validateTreeRules);

export const arbolCreateSchema = arbolFieldsSchema
  .extend({
    gps_confirmado: z.boolean(),
  })
  .superRefine((value, ctx) => {
    validateTreeRules(value, ctx);
    if (!value.gps_confirmado) {
      ctx.addIssue({
        code: 'custom',
        path: ['gps_confirmado'],
        message: 'Captura la ubicación GPS.',
      });
    }
  });

export function createArbolCreateSchema(catalogos: Catalogos) {
  const instituciones = new Set(catalogos.instituciones.map(({ id }) => id));
  const especies = new Set(catalogos.especies.map(({ id }) => id));
  const observaciones = new Set(catalogos.observaciones.map(({ codigo }) => codigo));

  return arbolCreateSchema.superRefine((value, ctx) => {
    if (!instituciones.has(value.institucion_id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['institucion_id'],
        message: 'Selecciona una institución disponible en el catálogo.',
      });
    }
    if (!especies.has(value.especie_id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['especie_id'],
        message: 'Selecciona una especie disponible en el catálogo.',
      });
    }
    value.observaciones.forEach((codigo, index) => {
      if (!observaciones.has(codigo)) {
        ctx.addIssue({
          code: 'custom',
          path: ['observaciones', index],
          message: 'La observación seleccionada ya no está disponible.',
        });
      }
    });
  });
}

export const arbolResumenSchema = z.object({
  id: z.string().min(1),
  codigo: z.string().min(1),
  institucion_id: z.string().min(1),
  prefijo: z.string().min(1),
  nombre_corto: z.string().min(1),
  zona: z.string().min(1),
  zona_otra: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  nombre_comun: z.string().min(1),
  nombre_cientifico: z.string().min(1),
  dap_cm: z.number(),
  altura_m: z.number(),
  copa_m: z.number(),
  etapa: z.string().min(1),
  interferencia: z.string().min(1),
  interferencia_otra: z.string().nullable(),
  registrado_en: z.string().min(1),
  n_observaciones: z.number().int().nonnegative(),
  estado: z.enum(['sano', 'riesgo', 'critico']),
});

export const arbolesResumenSchema = z.array(arbolResumenSchema);

export const fotoLocalSchema = z.object({
  tipo: z.enum(['completo', 'detalle', 'adicional']),
  uri: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

export const fotosRegistroSchema = z.array(fotoLocalSchema).superRefine((fotos, ctx) => {
  if (!fotos.some(({ tipo }) => tipo === 'completo')) {
    ctx.addIssue({
      code: 'custom',
      path: [],
      message: 'Agrega una fotografía general antes de guardar.',
    });
  }
  for (const tipo of ['completo', 'detalle'] as const) {
    if (fotos.filter((foto) => foto.tipo === tipo).length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'Solo se permite una fotografía general y una de detalle.',
      });
    }
  }
  if (fotos.filter((foto) => foto.tipo === 'adicional').length > 3) {
    ctx.addIssue({
      code: 'custom',
      path: [],
      message: 'Puedes agregar hasta tres fotografías adicionales.',
    });
  }
});

export type ArbolFormInput = z.input<typeof arbolCreateSchema>;