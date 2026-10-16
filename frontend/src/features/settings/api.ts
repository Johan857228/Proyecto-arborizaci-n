import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { enviarValidado, getValidado } from '@/services/api/client';
import { numero } from '@/shared/validacion';

const peso = numero().min(0, 'Mínimo 0.').max(100, 'Máximo 100.');

export const metodoCamposSchema = z
  .object({
    nombre: z.string().trim().min(3, 'Mínimo 3 caracteres.').max(80, 'Máximo 80 caracteres.'),
    descripcion: z.string().trim().max(500, 'Máximo 500 caracteres.'),
    peso_follaje: peso,
    peso_tronco: peso,
    peso_raiz: peso,
    peso_plagas: peso,
    peso_interferencia: peso,
    pesos_observacion: z.record(z.string(), peso),
    umbral_riesgo: numero().gt(0, 'Debe ser mayor que cero.').max(1000),
    umbral_critico: numero().gt(0, 'Debe ser mayor que cero.').max(1000),
    densidad_madera_defecto: numero().min(0.1, 'Entre 0,1 y 1,5.').max(1.5, 'Entre 0,1 y 1,5.'),
    factor_raiz: numero().min(0, 'Entre 0 y 1.').max(1, 'Entre 0 y 1.'),
    fraccion_carbono: numero().min(0.3, 'Entre 0,3 y 0,6.').max(0.6, 'Entre 0,3 y 0,6.'),
  })
  .refine((v) => v.umbral_critico > v.umbral_riesgo, {
    path: ['umbral_critico'],
    message: 'Debe ser mayor que el umbral de riesgo.',
  });
export type MetodoCampos = z.input<typeof metodoCamposSchema>;

export const metodoSchema = z.object({
  id: z.string().min(1),
  version: z.number().int(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  peso_follaje: z.number(),
  peso_tronco: z.number(),
  peso_raiz: z.number(),
  peso_plagas: z.number(),
  peso_interferencia: z.number(),
  pesos_observacion: z.record(z.string(), z.number()),
  umbral_riesgo: z.number(),
  umbral_critico: z.number(),
  densidad_madera_defecto: z.number(),
  factor_raiz: z.number(),
  fraccion_carbono: z.number(),
  creado_en: z.string(),
  instituciones: z.array(z.string()),
});
export type Metodo = z.infer<typeof metodoSchema>;

export const parametrosSchema = z.object({
  institucion_id: z.string(),
  institucion_nombre: z.string(),
  metodo_id: z.string().nullable(),
  metodo_version: z.number().int(),
  metodo_nombre: z.string(),
  dias_revisita: z.number().int(),
  precision_gps_max_m: z.number(),
  puntos_inspeccion: z.number().int(),
  puntos_arbol_nuevo: z.number().int(),
  configurado: z.boolean(),
});
export type Parametros = z.infer<typeof parametrosSchema>;

export const parametrosFormSchema = z.object({
  metodo_id: z.string().min(1, 'Selecciona un método.'),
  dias_revisita: numero().int('Sin decimales.').min(7, 'Mínimo 7 días.').max(730, 'Máximo 730 días.'),
  precision_gps_max_m: numero().gt(0, 'Debe ser mayor que cero.').max(500, 'Máximo 500 m.'),
  puntos_inspeccion: numero().int('Sin decimales.').min(0).max(1000),
  puntos_arbol_nuevo: numero().int('Sin decimales.').min(0).max(1000),
});
export type ParametrosForm = z.input<typeof parametrosFormSchema>;

export const simulacionSchema = z.object({
  arboles_evaluados: z.number().int(),
  actual: z.record(z.string(), z.number()),
  simulado: z.record(z.string(), z.number()),
  cambian: z.number().int(),
  cambios: z.array(z.object({
    arbol_id: z.string(),
    codigo: z.string(),
    nombre_comun: z.string(),
    estado_actual: z.enum(['sano', 'riesgo', 'critico']),
    estado_simulado: z.enum(['sano', 'riesgo', 'critico']),
    puntaje_simulado: z.number(),
  })),
});
export type Simulacion = z.infer<typeof simulacionSchema>;

type MetodoPayload = z.output<typeof metodoCamposSchema>;

function payloadMetodo(v: MetodoPayload) {
  return { ...v, descripcion: v.descripcion || null };
}

export const configuracionService = {
  metodos: () => getValidado('/configuracion/metodos', z.array(metodoSchema)),
  crearMetodo: (v: MetodoPayload) => enviarValidado('post', '/configuracion/metodos', payloadMetodo(v), metodoSchema),
  simular: (datos: { metodo_id?: string; metodo?: MetodoPayload; institucion_id?: string }) =>
    enviarValidado(
      'post',
      '/configuracion/metodos/simular',
      { ...datos, metodo: datos.metodo ? payloadMetodo(datos.metodo) : undefined },
      simulacionSchema,
    ),
  parametros: () => getValidado('/configuracion/parametros', z.array(parametrosSchema)),
  guardarParametros: (institucionId: string, datos: z.output<typeof parametrosFormSchema>) =>
    enviarValidado('put', `/configuracion/parametros/${institucionId}`, datos, parametrosSchema),
};

export function useMetodos() {
  return useQuery({ queryKey: ['configuracion', 'metodos'], queryFn: configuracionService.metodos });
}

export function useParametros() {
  return useQuery({ queryKey: ['configuracion', 'parametros'], queryFn: configuracionService.parametros });
}

export function useGuardarConfiguracion() {
  const refrescar = useRefrescarTodo();
  return {
    crearMetodo: useMutation({ mutationFn: configuracionService.crearMetodo, onSuccess: refrescar }),
    parametros: useMutation({
      mutationFn: ({ institucionId, datos }: { institucionId: string; datos: z.output<typeof parametrosFormSchema> }) =>
        configuracionService.guardarParametros(institucionId, datos),
      onSuccess: refrescar,
    }),
    simular: useMutation({ mutationFn: configuracionService.simular }),
  };
}
