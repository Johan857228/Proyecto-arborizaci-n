import { z } from 'zod';

/** Guías de clase: mismos campos que backend/routers/guias.py. */
export const AREAS = { ciencias: 'Ciencias Naturales', matematicas: 'Matemáticas' } as const;
export type Area = keyof typeof AREAS;

const enlaceLaboratorio = z.object({
  variable: z.enum(['dap_cm', 'altura_m', 'copa_m']),
  vista: z.enum(['tabla', 'histograma', 'medidas', 'dispersion']),
});
export type EnlaceLaboratorio = z.infer<typeof enlaceLaboratorio>;

export const guiaResumenSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  area: z.enum(['ciencias', 'matematicas']),
  grados: z.array(z.number().int()),
  referente: z.string(),
  duracion_min: z.number(),
  datos: z.string(),
  laboratorio: enlaceLaboratorio.nullable().optional(),
  aplicaciones: z.number(),
});
export type GuiaResumen = z.infer<typeof guiaResumenSchema>;

export const claseSchema = z.object({
  id: z.string(),
  guia_id: z.string(),
  guia_titulo: z.string(),
  institucion_id: z.string(),
  curso_id: z.string().nullable(),
  curso_nombre: z.string().nullable(),
  docente_nombre: z.string().nullable(),
  fecha: z.string(),
  asistentes: z.number().nullable(),
  notas: z.string().nullable(),
  puede_borrar: z.boolean(),
});
export type Clase = z.infer<typeof claseSchema>;

export const guiaSchema = guiaResumenSchema.extend({
  proposito: z.string(),
  materiales: z.array(z.string()),
  momentos: z.array(z.object({ titulo: z.string(), pasos: z.array(z.string()) })),
  preguntas: z.array(z.string()),
  evidencia: z.string(),
  saber11: z.string().nullable().optional(),
  celular: z.string(),
  seguridad: z.string(),
  clases: z.array(claseSchema),
});
export type Guia = z.infer<typeof guiaSchema>;

export const fichaSchema = z.object({ url: z.string().min(1), nombre: z.string(), vence_en_segundos: z.number(), semilla: z.number() });

/** "Grado 2.°" o "Grados 6.° y 7.°". */
export function textoGrados(grados: number[]) {
  const t = grados.map((g) => `${g}.°`);
  if (t.length === 1) return `Grado ${t[0]}`;
  return `Grados ${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}`;
}

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escribe la fecha como AAAA-MM-DD.');

/** Mismas reglas que ClaseIn en el backend. */
export function claseFormSchema(hoy: string) {
  return z.object({
    fecha: fechaIso.refine((f) => f <= hoy, 'La fecha de la clase no puede ser futura.'),
    curso_id: z.string().optional(),
    asistentes: z.number().int('Escribe un número entero.').min(1, 'Al menos 1 estudiante.').max(80, 'Máximo 80 estudiantes.').optional(),
    notas: z.string().trim().max(1000, 'Máximo 1.000 caracteres.'),
  });
}
