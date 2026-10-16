import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { api, enviarValidado, getValidado } from '@/services/api/client';

const candidataSchema = z.object({
  origen: z.enum(['recomendada', 'programada']),
  intervencion_id: z.string().nullable(),
  arbol_id: z.string(),
  codigo: z.string(),
  nombre_comun: z.string(),
  zona: z.string(),
  estado: z.enum(['sano', 'riesgo', 'critico']),
  puntaje_riesgo: z.number().nullable(),
  tipo_codigo: z.string(),
  tipo_nombre: z.string(),
  prioridad: z.number().int(),
  motivo: z.string(),
  costo: z.number(),
  motivo_exclusion: z.string().optional(),
});
export type Candidata = z.infer<typeof candidataSchema>;

export const resultadoSchema = z.object({
  monto: z.number(),
  criterio: z.enum(['riesgo', 'cantidad']),
  total_incluido: z.number(),
  saldo: z.number(),
  total_requerido: z.number(),
  faltante: z.number(),
  acciones_incluidas: z.number().int(),
  acciones_excluidas: z.number().int(),
  arboles_atendidos: z.number().int(),
  criticos_atendidos: z.number().int(),
  criticos_sin_atender: z.number().int(),
  incluidas: z.array(candidataSchema),
  excluidas: z.array(candidataSchema),
});
export type ResultadoEscenario = z.infer<typeof resultadoSchema>;

export const escenarioSchema = z.object({
  id: z.string().min(1),
  institucion_id: z.string(),
  nombre: z.string(),
  monto: z.number(),
  criterio: z.enum(['riesgo', 'cantidad']),
  incluir_programadas: z.boolean(),
  tipos: z.array(z.string()).nullable(),
  resultado: resultadoSchema,
  creado_en: z.string(),
});
export type Escenario = z.infer<typeof escenarioSchema>;

export interface ParametrosEscenario {
  institucion_id: string;
  monto: number;
  criterio: 'riesgo' | 'cantidad';
  incluir_programadas: boolean;
  tipos: string[] | null;
}

export const escenariosService = {
  simular: (p: ParametrosEscenario) => enviarValidado('post', '/escenarios/simular', p, resultadoSchema),
  listar: (institucionId?: string) => getValidado('/escenarios', z.array(escenarioSchema), { institucion_id: institucionId }),
  guardar: (p: ParametrosEscenario & { nombre: string }) => enviarValidado('post', '/escenarios', p, escenarioSchema),
  borrar: async (id: string) => {
    await api.delete(`/escenarios/${id}`);
  },
};

export function useEscenarios(institucionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['escenarios', institucionId ?? 'todas'],
    queryFn: () => escenariosService.listar(institucionId),
    enabled,
  });
}

export function useEscenarioAcciones() {
  const refrescar = useRefrescarTodo();
  return {
    simular: useMutation({ mutationFn: escenariosService.simular }),
    guardar: useMutation({ mutationFn: escenariosService.guardar, onSuccess: refrescar }),
    borrar: useMutation({ mutationFn: escenariosService.borrar, onSuccess: refrescar }),
  };
}
