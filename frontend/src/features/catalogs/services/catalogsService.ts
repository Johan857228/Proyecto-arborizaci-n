import { api, ApiContractError } from '@/services/api/client';
import { catalogosSchema } from '@/features/catalogs/schemas';
import type { Catalogos } from '@/features/catalogs/types';

export const catalogsService = {
  async getAll() {
    const { data } = await api.get<unknown>('/catalogos');
    const result = catalogosSchema.safeParse(data);
    if (!result.success) {
      throw new ApiContractError('El servidor devolvió catálogos incompletos o inválidos.');
    }
    return result.data satisfies Catalogos;
  },
};