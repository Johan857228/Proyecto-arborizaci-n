import { z } from 'zod';

import { fechaIso, numero, textoOpcional } from '@/shared/validacion';

/** Tope de la API para un costo (estimado, real o de referencia): mil millones de pesos. */
export const MAX_COSTO = 1_000_000_000;
export const MENSAJE_MAX_COSTO = 'Máximo $ 1.000.000.000.';

export const estadoIntervencionSchema = z.enum(['programada', 'ejecutada', 'cancelada']);
export type EstadoIntervencion = z.infer<typeof estadoIntervencionSchema>;
export const resultadoSchema = z.enum(['exitosa', 'parcial', 'sin_efecto']);
export type Resultado = z.infer<typeof resultadoSchema>;

export const ETIQUETA_ESTADO_INTERVENCION: Record<EstadoIntervencion, string> = {
  programada: 'Programada',
  ejecutada: 'Ejecutada',
  cancelada: 'Cancelada',
};
export const ETIQUETA_RESULTADO: Record<Resultado, string> = {
  exitosa: 'Exitosa',
  parcial: 'Parcial',
  sin_efecto: 'Sin efecto',
};

export const tipoIntervencionSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().nullable(),
  costo_referencia: z.number(),
  orden: z.number(),
});
export type TipoIntervencion = z.infer<typeof tipoIntervencionSchema>;

export const intervencionSchema = z.object({
  id: z.string().min(1),
  arbol_id: z.string().min(1),
  codigo: z.string().nullable(),
  nombre_comun: z.string().nullable(),
  zona: z.string().nullable(),
  institucion_id: z.string().nullable(),
  inspeccion_id: z.string().nullable(),
  tipo_codigo: z.string(),
  tipo_nombre: z.string().nullable(),
  estado: estadoIntervencionSchema,
  descripcion: z.string().nullable(),
  responsable: z.string(),
  fecha_programada: z.string().nullable(),
  fecha_ejecucion: z.string().nullable(),
  costo_estimado: z.number().nullable(),
  costo_real: z.number().nullable(),
  resultado: resultadoSchema.nullable(),
  resultado_detalle: z.string().nullable(),
  registrado_por: z.string().nullable(),
  creado_en: z.string(),
  actualizado_en: z.string(),
});
export type Intervencion = z.infer<typeof intervencionSchema>;

export const recomendacionSchema = z.object({
  arbol_id: z.string(),
  codigo: z.string(),
  nombre_comun: z.string(),
  zona: z.string(),
  institucion_id: z.string(),
  estado: z.enum(['sano', 'riesgo', 'critico']),
  puntaje_riesgo: z.number().nullable(),
  tipo_codigo: z.string(),
  tipo_nombre: z.string(),
  prioridad: z.number().int(),
  prioridad_nombre: z.string(),
  motivo: z.string(),
  costo_referencia: z.number(),
});
export type Recomendacion = z.infer<typeof recomendacionSchema>;

// ------------------------------------------------------------ Formulario
export const intervencionFormSchema = z
  .object({
    tipo_codigo: z.string().min(1, 'Selecciona el tipo de intervención.'),
    estado: z.enum(['programada', 'ejecutada']),
    responsable: z.string().trim().min(2, 'Indica quién es el responsable.').max(120, 'Máximo 120 caracteres.'),
    descripcion: textoOpcional(1000),
    fecha_programada: z.string().trim().optional(),
    fecha_ejecucion: z.string().trim().optional(),
    costo_estimado: numero().min(0, 'No puede ser negativo.').max(MAX_COSTO, MENSAJE_MAX_COSTO).optional(),
    costo_real: numero().min(0, 'No puede ser negativo.').max(MAX_COSTO, MENSAJE_MAX_COSTO).optional(),
    resultado: resultadoSchema.optional(),
    resultado_detalle: textoOpcional(1000),
  })
  .superRefine((valor, ctx) => {
    const fecha = (campo: 'fecha_programada' | 'fecha_ejecucion', obligatoria: boolean) => {
      const texto = valor[campo];
      if (!texto) {
        if (obligatoria) ctx.addIssue({ code: 'custom', path: [campo], message: 'Escribe la fecha (AAAA-MM-DD).' });
        return;
      }
      const resultado = fechaIso.safeParse(texto);
      if (!resultado.success) ctx.addIssue({ code: 'custom', path: [campo], message: resultado.error.issues[0].message });
    };
    if (valor.estado === 'programada') {
      fecha('fecha_programada', true);
    } else {
      fecha('fecha_ejecucion', true);
      if (valor.costo_real === undefined) ctx.addIssue({ code: 'custom', path: ['costo_real'], message: 'Escribe el costo real.' });
      if (!valor.resultado) ctx.addIssue({ code: 'custom', path: ['resultado'], message: 'Selecciona el resultado.' });
    }
  });
export type IntervencionFormInput = z.input<typeof intervencionFormSchema>;
export type IntervencionFormOutput = z.output<typeof intervencionFormSchema>;

export const ejecutarSchema = z.object({
  fecha_ejecucion: fechaIso,
  costo_real: numero().min(0, 'No puede ser negativo.').max(MAX_COSTO, MENSAJE_MAX_COSTO),
  resultado: resultadoSchema,
  resultado_detalle: textoOpcional(1000),
});
export type EjecutarInput = z.input<typeof ejecutarSchema>;
