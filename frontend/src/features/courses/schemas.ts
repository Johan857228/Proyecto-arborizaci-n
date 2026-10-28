import { z } from 'zod';

export const ZONAS = ['Patio central', 'Entrada principal', 'Zona deportiva', 'Bloques académicos', 'Otra'] as const;
export const zonaSchema = z.enum(ZONAS);
export type Zona = z.infer<typeof zonaSchema>;

// 10.° y 11.° prestan servicio social (features/servicio).
export const GRADOS = [
  { value: 0, label: 'Transición' },
  ...Array.from({ length: 11 }, (_, i) => ({ value: i + 1, label: `${i + 1}.°` })),
];

export const cursoSchema = z.object({
  id: z.string().min(1),
  institucion_id: z.string(),
  nombre: z.string(),
  anio: z.number().int(),
  // El guardado o, si no tiene, el que dice el nombre ("10-A").
  grado: z.number().int().nullable().optional(),
  docente_id: z.string().nullable(),
  docente_nombre: z.string().nullable(),
  activo: z.boolean(),
  creado_en: z.string(),
  zonas: z.array(z.string()),
  integrantes: z.number().int(),
  puede_gestionar: z.boolean(),
});
export type Curso = z.infer<typeof cursoSchema>;

export const cursoDetalleSchema = cursoSchema.extend({
  miembros: z.array(z.object({ usuario_id: z.string(), nombre: z.string(), rol: z.string() })),
});
export type CursoDetalle = z.infer<typeof cursoDetalleSchema>;

const estado = z.enum(['sano', 'riesgo', 'critico']);
const pct = z.number().nullable();

export const avanceSchema = z.object({
  curso: z.object({ id: z.string(), nombre: z.string(), anio: z.number(), zonas: z.array(z.string()) }),
  zonas_disponibles: z.array(z.string()),
  periodo: z.object({ desde: z.string(), hasta: z.string() }),
  cobertura: z.object({
    arboles_asignados: z.number().int(),
    arboles_inspeccionados: z.number().int(),
    cobertura_pct: pct,
    por_zona: z.array(z.object({ zona: z.string(), asignados: z.number(), inspeccionados: z.number(), cobertura_pct: pct })),
    pendientes: z.array(z.object({
      id: z.string(),
      codigo: z.string(),
      nombre_comun: z.string(),
      zona: z.string(),
      estado,
      ultima_inspeccion_en: z.string().nullable(),
    })),
  }),
  productividad: z.object({
    integrantes: z.number().int(),
    inspecciones: z.number().int(),
    confirmadas: z.number().int(),
    anuladas: z.number().int(),
    pendientes: z.number().int(),
    pct_confirmadas_de_revisadas: pct,
    promedio_por_integrante: z.number().nullable(),
    por_integrante: z.array(z.object({
      usuario_id: z.string(),
      nombre: z.string(),
      inspecciones: z.number().int(),
      confirmadas: z.number().int(),
      anuladas: z.number().int(),
      arboles_registrados: z.number().int(),
    })),
  }),
});
export type Avance = z.infer<typeof avanceSchema>;

export const cursoFormSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre del curso.').max(60, 'Máximo 60 caracteres.'),
  anio: z.number({ error: 'Escribe el año.' }).int('Escribe el año sin decimales.').min(2000, 'Año no válido.').max(2100, 'Año no válido.'),
  zonas: z.array(zonaSchema),
  grado: z.number().int().min(0).max(11).optional(),
});
export type CursoFormInput = z.input<typeof cursoFormSchema>;
