import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { api, enviarValidado, getValidado } from '@/services/api/client';
import { fechaIso, numero } from '@/shared/validacion';

export const resumenSchema = z.object({
  monto_asignado: z.number(),
  ejecutado: z.number(),
  comprometido: z.number(),
  recomendado_sin_programar: z.number(),
  disponible: z.number(),
  pct_ejecutado: z.number().nullable(),
  proyeccion_total: z.number(),
  saldo_proyectado: z.number(),
  proyeccion_ritmo_actual: z.number().nullable(),
  dias_transcurridos: z.number().int(),
  dias_totales: z.number().int(),
  vigente: z.boolean(),
  intervenciones_ejecutadas: z.number().int(),
  intervenciones_programadas: z.number().int(),
  por_tipo: z.array(z.object({
    tipo_codigo: z.string(),
    ejecutado: z.number(),
    comprometido: z.number(),
    ejecutadas: z.number().int(),
    programadas: z.number().int(),
  })),
  por_mes: z.array(z.object({ mes: z.string(), ejecutado: z.number() })),
});

export const presupuestoSchema = z.object({
  id: z.string().min(1),
  institucion_id: z.string(),
  nombre: z.string(),
  fecha_inicio: z.string(),
  fecha_fin: z.string(),
  monto_asignado: z.number(),
  notas: z.string().nullable(),
  creado_en: z.string(),
  resumen: resumenSchema,
});
export type Presupuesto = z.infer<typeof presupuestoSchema>;

export const presupuestoFormSchema = z
  .object({
    nombre: z.string().trim().min(3, 'Mínimo 3 caracteres.').max(80, 'Máximo 80 caracteres.'),
    fecha_inicio: fechaIso,
    fecha_fin: fechaIso,
    monto_asignado: numero().min(0, 'No puede ser negativo.').max(100_000_000_000, 'Máximo $ 100.000.000.000.'),
    notas: z.string().trim().max(500, 'Máximo 500 caracteres.'),
  })
  .refine((v) => v.fecha_fin >= v.fecha_inicio, { path: ['fecha_fin'], message: 'Debe ser igual o posterior a la fecha inicial.' });
export type PresupuestoFormInput = z.input<typeof presupuestoFormSchema>;

export const presupuestosService = {
  listar: (institucionId?: string) => getValidado('/presupuestos', z.array(presupuestoSchema), { institucion_id: institucionId }),
  detalle: (id: string) => getValidado(`/presupuestos/${id}`, presupuestoSchema),
  crear: (datos: Omit<PresupuestoFormInput, 'notas'> & { institucion_id: string; notas?: string | null }) =>
    enviarValidado('post', '/presupuestos', datos, presupuestoSchema),
  editar: (id: string, cambios: Omit<Partial<PresupuestoFormInput>, 'notas'> & { notas?: string | null }) =>
    enviarValidado('patch', `/presupuestos/${id}`, cambios, presupuestoSchema),
  borrar: async (id: string) => {
    await api.delete(`/presupuestos/${id}`);
  },
};

export function usePresupuestos(institucionId?: string, enabled = true) {
  return useQuery({
    queryKey: ['presupuestos', institucionId ?? 'todas'],
    queryFn: () => presupuestosService.listar(institucionId),
    enabled,
  });
}

export function usePresupuesto(id: string) {
  return useQuery({ queryKey: ['presupuestos', 'detalle', id], queryFn: () => presupuestosService.detalle(id) });
}

export function useGuardarPresupuesto() {
  const refrescar = useRefrescarTodo();
  return {
    crear: useMutation({ mutationFn: presupuestosService.crear, onSuccess: refrescar }),
    editar: useMutation({
      mutationFn: ({ id, cambios }: { id: string; cambios: Parameters<typeof presupuestosService.editar>[1] }) =>
        presupuestosService.editar(id, cambios),
      onSuccess: refrescar,
    }),
    borrar: useMutation({ mutationFn: presupuestosService.borrar, onSuccess: refrescar }),
  };
}
