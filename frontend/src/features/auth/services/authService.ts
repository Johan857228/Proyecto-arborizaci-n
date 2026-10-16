import { api } from '@/services/api/client';
import type { LoginInput, Session } from '@/features/auth/types';

export interface BackendStatus {
  estado: string;
  almacenamiento?: 'sqlite' | 'supabase' | string;
  temporal?: boolean;
}

export const authService = {
  async login(credentials: LoginInput) {
    const { data } = await api.post<Session>('/auth/login', {
      ...credentials,
      email: credentials.email.trim(),
    });
    return data;
  },

  async getBackendStatus() {
    const { data } = await api.get<BackendStatus>('/salud');
    return data;
  },
};