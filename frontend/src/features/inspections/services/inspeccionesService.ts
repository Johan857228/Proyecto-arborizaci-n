import { z } from 'zod';

import {
  inspeccionConArbolSchema,
  inspeccionPayloadSchema,
  inspeccionSchema,
  pendientesSchema,
  type InspeccionPayload,
} from '@/features/inspections/schemas';
import type { Envio } from '@/features/sincronizacion/cola';
import { photosService } from '@/features/trees/services/photosService';
import type { FotoLocal } from '@/features/trees/types';
import { ApiContractError, enviarValidado, getValidado } from '@/services/api/client';

export const inspeccionesService = {
  historial: (arbolId: string) => getValidado(`/arboles/${arbolId}/inspecciones`, z.array(inspeccionSchema)),

  detalle: (inspeccionId: string) => getValidado(`/inspecciones/${inspeccionId}`, inspeccionConArbolSchema),

  /** `envio` identifica la visita para que un reenvío no la duplique (ver sincronizacion/cola.ts). */
  async crear(arbolId: string, payload: InspeccionPayload, envio?: Envio) {
    const validado = inspeccionPayloadSchema.safeParse(payload);
    if (!validado.success) {
      throw new ApiContractError('No se puede enviar la inspección: revisa los datos ingresados.');
    }
    const cuerpo = envio ? { ...validado.data, id_cliente: envio.idCliente, capturado_en: envio.capturadoEn } : validado.data;
    return enviarValidado('post', `/arboles/${arbolId}/inspecciones`, cuerpo, inspeccionSchema);
  },

  subirFoto: (inspeccionId: string, foto: FotoLocal, idCliente?: string) =>
    photosService.uploadTo(`/inspecciones/${inspeccionId}/fotos`, foto, idCliente),

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
