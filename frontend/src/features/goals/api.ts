import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { api, enviarValidado, getValidado } from '@/services/api/client';
import { fechaIso, numero } from '@/shared/validacion';

export const INDICADORES = [
  'arboles_registrados',
  'inspecciones_confirmadas',
  'cobertura_inspeccion_pct',
  'arboles_sanos_pct',
  'arboles_criticos',
  'intervenciones_ejecutadas',
  'co2_almacenado_kg',
  'cobertura_copa_m2',
  'gasto_ejecutado',
] as const;
export const indicadorSchema = z.enum(INDICADORES);
export type Indicador = z.infer<typeof indicadorSchema>;
const PORCENTAJES: Indicador[] = ['cobertura_inspeccion_pct', 'arboles_sanos_pct'];

export const indicadorInfoSchema = z.object({
  codigo: indicadorSchema,
  nombre: z.string(),
  unidad: z.string(),
  sentido: z.enum(['mayor', 'menor']),
});
export type IndicadorInfo = z.infer<typeof indicadorInfoSchema>;

export const estadoMetaSchema = z.enum(['por_iniciar', 'en_curso', 'cumplida', 'no_cumplida']);
export const ETIQUETA_ESTADO_META: Record<z.infer<typeof estadoMetaSchema>, string> = {
  por_iniciar: 'Por iniciar',
  en_curso: 'En curso',
  cumplida: 'Cumplida',
  no_cumplida: 'No cumplida',
};

export const metaSchema = z.object({
  id: z.string().min(1),
  institucion_id: z.string(),
  indicador: indicadorSchema,
  indicador_nombre: z.string(),
  unidad: z.string(),
  sentido: z.enum(['mayor', 'menor']),
  fecha_inicio: z.string(),
  fecha_fin: z.string(),
  valor_meta: z.number(),
  descripcion: z.string().nullable(),
  creado_en: z.string(),
  valor_actual: z.number(),
  avance_pct: z.number(),
  estado: estadoMetaSchema,
});
export type Meta = z.infer<typeof metaSchema>;

export const metaFormSchema = z
  .object({
    indicador: indicadorSchema,
    fecha_inicio: fechaIso,
    fecha_fin: fechaIso,
    valor_meta: numero().min(0, 'No puede ser negativo.').max(1_000_000_000_000, 'El valor es demasiado grande.'),
    descripcion: z.string().trim().max(300, 'Máximo 300 caracteres.'),
  })
  .refine((v) => v.fecha_fin >= v.fecha_inicio, { path: ['fecha_fin'], message: 'Debe ser igual o posterior a la fecha inicial.' })
  .refine((v) => !PORCENTAJES.includes(v.indicador) || v.valor_meta <= 100, {
    path: ['valor_meta'],
    message: 'Un porcentaje no puede superar 100.',
  });
export type MetaForm = z.input<typeof metaFormSchema>;

export const metasService = {
  indicadores: () => getValidado('/metas/indicadores', z.array(indicadorInfoSchema)),
  listar: (institucionId?: string) => getValidado('/metas', z.array(metaSchema), { institucion_id: institucionId }),
  crear: (datos: Omit<MetaForm, 'descripcion'> & { institucion_id: string; descripcion: string | null }) =>
    enviarValidado('post', '/metas', datos, metaSchema),
  editar: (id: string, cambios: { fecha_inicio?: string; fecha_fin?: string; valor_meta?: number; descripcion?: string | null }) =>
    enviarValidado('patch', `/metas/${id}`, cambios, metaSchema),
  borrar: async (id: string) => {
    await api.delete(`/metas/${id}`);
  },
};

export function useIndicadoresMeta() {
  return useQuery({ queryKey: ['metas', 'indicadores'], queryFn: metasService.indicadores, staleTime: 30 * 60_000 });
}

export function useMetas(institucionId?: string, opciones: { enabled?: boolean; staleTime?: number } = {}) {
  return useQuery({ queryKey: ['metas', institucionId ?? 'todas'], queryFn: () => metasService.listar(institucionId), ...opciones });
}

export function useGuardarMeta() {
  const refrescar = useRefrescarTodo();
  return {
    crear: useMutation({ mutationFn: metasService.crear, onSuccess: refrescar }),
    editar: useMutation({
      mutationFn: ({ id, cambios }: { id: string; cambios: Parameters<typeof metasService.editar>[1] }) => metasService.editar(id, cambios),
      onSuccess: refrescar,
    }),
    borrar: useMutation({ mutationFn: metasService.borrar, onSuccess: refrescar }),
  };
}
