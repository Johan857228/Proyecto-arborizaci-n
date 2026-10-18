import { api, ApiContractError, getValidado } from '@/services/api/client';
import type { ArbolResumen } from '@/shared/types/entities';
import {
  arbolCreatePayloadSchema,
  arbolDetalleSchema,
  arbolesResumenSchema,
  arbolResumenSchema,
  calculosSchema,
  type ArbolDetalle,
  type Calculos,
} from '@/features/trees/schemas';
import type { ArbolCrear, PaginaInventario } from '@/features/trees/types';
import type { Envio } from '@/features/sincronizacion/cola';

export interface TreesGateway {
  getAll(query: PaginaInventario): Promise<ArbolResumen[]>;
  /** `envio` identifica el registro para que un reenvío no lo duplique (ver sincronizacion/cola.ts). */
  create(payload: ArbolCrear, envio?: Envio): Promise<ArbolResumen>;
  getById(id: string): Promise<ArbolDetalle>;
  getCalculos(id: string): Promise<Calculos>;
}

const apiTreesGateway: TreesGateway = {
  async getAll(query) {
    const { data } = await api.get<unknown>('/arboles', {
      params: {
        limite: query.limite,
        desplazamiento: query.desplazamiento,
        institucion_id: query.institucionId,
        estado: query.estado,
        especie: query.especie,
        zona: query.zona,
      },
    });

    const result = arbolesResumenSchema.safeParse(data);
    if (!result.success) {
      throw new ApiContractError('El servidor devolvió registros de árboles con un formato inválido.');
    }
    return result.data;
  },

  async create(payload: ArbolCrear, envio?: Envio) {
    const validatedPayload = arbolCreatePayloadSchema.safeParse(payload);
    if (!validatedPayload.success) {
      throw new ApiContractError('No se puede enviar el registro: revisa los datos ingresados.');
    }

    const cuerpo = envio
      ? { ...validatedPayload.data, id_cliente: envio.idCliente, capturado_en: envio.capturadoEn }
      : validatedPayload.data;
    const { data } = await api.post<unknown>('/arboles', cuerpo);
    const result = arbolResumenSchema.safeParse(data);
    if (!result.success) {
      throw new ApiContractError('El servidor no devolvió un registro de árbol válido.');
    }
    return result.data;
  },

  getById: (id) => getValidado(`/arboles/${id}`, arbolDetalleSchema),

  getCalculos: (id) => getValidado(`/arboles/${id}/calculos`, calculosSchema),
};

export const treesService = apiTreesGateway;