import { api, ApiContractError } from '@/services/api/client';
import type { ArbolResumen } from '@/shared/types/entities';
import {
  arbolCreatePayloadSchema,
  arbolesResumenSchema,
  arbolResumenSchema,
} from '@/features/trees/schemas';
import type { ArbolCrear, PaginaInventario } from '@/features/trees/types';

export interface TreesGateway {
  getAll(query: PaginaInventario): Promise<ArbolResumen[]>;
  create(payload: ArbolCrear): Promise<ArbolResumen>;
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

  async create(payload: ArbolCrear) {
    const validatedPayload = arbolCreatePayloadSchema.safeParse(payload);
    if (!validatedPayload.success) {
      throw new ApiContractError('No se puede enviar el registro: revisa los datos ingresados.');
    }

    const { data } = await api.post<unknown>('/arboles', validatedPayload.data);
    const result = arbolResumenSchema.safeParse(data);
    if (!result.success) {
      throw new ApiContractError('El servidor no devolvió un registro de árbol válido.');
    }
    return result.data;
  },
};

export const treesService = apiTreesGateway;