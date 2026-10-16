import { z } from 'zod';

import {
  inspeccionConArbolSchema,
  inspeccionPayloadSchema,
  inspeccionSchema,
  pendientesSchema,
  type InspeccionPayload,
} from '@/features/inspections/schemas';
import { photosService } from '@/features/trees/services/photosService';
import type { FotoLocal } from '@/features/trees/types';
import { ApiContractError, enviarValidado, getValidado } from '@/services/api/client';

export const inspeccionesService = {
  historial: (arbolId: string) => getValidado(`/arboles/${arbolId}/inspecciones`, z.array(inspeccionSchema)),

  detalle: (inspeccionId: string) => getValidado(`/inspecciones/${inspeccionId}`, inspeccionConArbolSchema),

  async crear(arbolId: string, payload: InspeccionPayload) {
    const validado = inspeccionPayloadSchema.safeParse(payload);
    if (!validado.success) {
      throw new ApiContractError('No se puede enviar la inspección: revisa los datos ingresados.');
    }
    return enviarValidado('post', `/arboles/${arbolId}/inspecciones`, validado.data, inspeccionSchema);
  },

  subirFoto: (inspeccionId: string, foto: FotoLocal) => photosService.uploadTo(`/inspecciones/${inspeccionId}/fotos`, foto),

  pendientes: (params: { institucionId?: string; limite: number; desplazamiento: number }) =>
    getValidado('/revision/pendientes', pendientesSchema, {
      institucion_id: params.institucionId,
      limite: params.limite,
      desplazamiento: params.desplazamiento,
    }),

  confirmar: (inspeccionId: string, comentario: string) =>
    enviarValidado('post', `/inspecciones/${inspeccionId}/confirmar`, { comentario: comentario || null }, inspeccionConArbolSchema),

  anular: (inspeccionId: string, motivo: string) =>
    enviarValidado('post', `/inspecciones/${inspeccionId}/anular`, { motivo }, inspeccionConArbolSchema),
};
