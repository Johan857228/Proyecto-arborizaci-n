import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { enviarValidado, getValidado } from '@/services/api/client';

export const CONJUNTOS = ['arboles', 'inspecciones', 'intervenciones', 'todo'] as const;
export type Conjunto = (typeof CONJUNTOS)[number];
export type Formato = 'csv' | 'geojson' | 'shp' | 'zip';

export const institucionSchema = z.object({
  id: z.string().min(1),
  nombre: z.string(),
  nombre_corto: z.string(),
  prefijo: z.string(),
  codigo_dane: z.string().nullable(),
  divipola: z.string().nullable(),
  municipio: z.string().nullable(),
});
export type Institucion = z.infer<typeof institucionSchema>;

export const exportacionSchema = z.object({
  url: z.string().min(1),
  nombre: z.string().min(1),
  conjunto: z.enum(CONJUNTOS),
  formato: z.enum(['csv', 'geojson', 'shp', 'zip']),
  filas: z.number().int(),
  generado_en: z.string(),
  vence_en_segundos: z.number().int(),
  sin_codigo_dane: z.array(z.string()),
});
export type Exportacion = z.infer<typeof exportacionSchema>;

const campoSchema = z.object({
  conjunto: z.string(),
  campo: z.string(),
  nombre_shapefile: z.string(),
  tipo: z.string(),
  unidad: z.string(),
  descripcion: z.string(),
});
export const diccionarioSchema = z.object({
  conjuntos: z.record(z.string(), z.string()),
  campos: z.array(campoSchema),
  sistema_de_coordenadas: z.string(),
});
export type CampoDiccionario = z.infer<typeof campoSchema>;

// Mismas reglas que InstitucionEditar en backend/routers/exportar.py.
export const daneSchema = z.object({
  codigo_dane: z.string().trim().refine((v) => v === '' || /^\d{12}$/.test(v), 'El código DANE de la sede tiene 12 dígitos.'),
  divipola: z.string().trim().refine((v) => v === '' || /^\d{5}$/.test(v), 'El DIVIPOLA tiene 5 dígitos (Valledupar: 20001).'),
  municipio: z.string().trim().refine((v) => v === '' || (v.length >= 2 && v.length <= 80), 'Escribe el nombre del municipio.'),
});
export type DaneForm = z.infer<typeof daneSchema>;

export const exportarService = {
  instituciones: () => getValidado('/instituciones', z.array(institucionSchema)),
  editarInstitucion: (id: string, cambios: DaneForm) => enviarValidado('patch', `/instituciones/${id}`, cambios, institucionSchema),
  exportar: (conjunto: Conjunto, formato: Formato, institucionId?: string) =>
    enviarValidado('post', '/exportar', { conjunto, formato, institucion_id: institucionId ?? null }, exportacionSchema),
  diccionario: () => getValidado('/exportar/diccionario', diccionarioSchema),
};

export function useInstituciones() {
  return useQuery({ queryKey: ['instituciones', 'dane'], queryFn: exportarService.instituciones, staleTime: 5 * 60_000 });
}

export function useEditarInstitucion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: DaneForm }) => exportarService.editarInstitucion(id, cambios),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['instituciones'] }),
  });
}

export function useExportar() {
  return useMutation({
    mutationFn: ({ conjunto, formato, institucionId }: { conjunto: Conjunto; formato: Formato; institucionId?: string }) =>
      exportarService.exportar(conjunto, formato, institucionId),
  });
}

export function useDiccionario(enabled: boolean) {
  return useQuery({ queryKey: ['exportar', 'diccionario'], queryFn: exportarService.diccionario, enabled, staleTime: Infinity });
}
