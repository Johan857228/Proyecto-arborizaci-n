import { ApiContractError, api } from '@/services/api/client';
import { sessionSchema } from '@/features/auth/schemas';
import type { LoginInput, Session } from '@/features/auth/types';

export interface BackendStatus {
  estado: string;
  almacenamiento?: 'sqlite' | 'supabase' | string;
  temporal?: boolean;
}

export const authService = {
  async login(credentials: LoginInput) {
    const { data } = await api.post<unknown>('/auth/login', {
      ...credentials,
      email: credentials.email.trim(),
    });
    const result = sessionSchema.safeParse(data);
    if (!result.success) {
      throw new ApiContractError('El servidor no devolvió una sesión JWT válida.');
    }
    return result.data satisfies Session;
  },

  async getBackendStatus() {
    const { data } = await api.get<BackendStatus>('/salud');
    return data;
  },
};