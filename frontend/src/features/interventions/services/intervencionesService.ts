import { z } from 'zod';

import {
  intervencionSchema,
  recomendacionSchema,
  tipoIntervencionSchema,
  type EstadoIntervencion,
} from '@/features/interventions/schemas';
import { enviarValidado, getValidado } from '@/services/api/client';

export interface NuevaIntervencion {
  arbol_id: string;
  inspeccion_id?: string | null;
  tipo_codigo: string;
  estado: 'programada' | 'ejecutada';
  responsable: string;
  descripcion?: string;
  fecha_programada?: string;
  fecha_ejecucion?: string;
  costo_estimado?: number;
  costo_real?: number;
  resultado?: string;
  resultado_detalle?: string;
}

export const intervencionesService = {
  tipos: () => getValidado('/intervenciones/tipos', z.array(tipoIntervencionSchema)),

  editarTipo: (codigo: string, cambios: { costo_referencia?: number; nombre?: string; descripcion?: string | null }) =>
    enviarValidado('patch', `/intervenciones/tipos/${codigo}`, cambios, tipoIntervencionSchema),

  listar: (filtros: { institucionId?: string; estado?: EstadoIntervencion; tipoCodigo?: string }) =>
    getValidado('/intervenciones', z.array(intervencionSchema), {
      institucion_id: filtros.institucionId,
      estado: filtros.estado,
      tipo_codigo: filtros.tipoCodigo,
    }),

  detalle: (id: string) => getValidado(`/intervenciones/${id}`, intervencionSchema),

  deArbol: (arbolId: string) => getValidado(`/arboles/${arbolId}/intervenciones`, z.array(intervencionSchema)),

  recomendacionesArbol: (arbolId: string) => getValidado(`/arboles/${arbolId}/recomendaciones`, z.array(recomendacionSchema)),

  recomendaciones: (institucionId?: string, prioridadMinima = 1) =>
    getValidado('/intervenciones/recomendaciones', z.array(recomendacionSchema), {
      institucion_id: institucionId,
      prioridad_minima: prioridadMinima,
    }),

  crear: (datos: NuevaIntervencion) => enviarValidado('post', '/intervenciones', datos, intervencionSchema),

  editar: (id: string, cambios: Record<string, unknown>) => enviarValidado('patch', `/intervenciones/${id}`, cambios, intervencionSchema),
};
