import { ApiContractError, api, validar } from '@/services/api/client';
import { registroRespuestaSchema, sessionSchema, type RegistroFormValues } from '@/features/auth/schemas';
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

  /** Crea una cuenta propia. Si Supabase pide confirmar el correo, no trae sesión. */
  async registrar({ nombre, email, password }: RegistroFormValues) {
    const { data } = await api.post<unknown>('/auth/registro', { nombre, email, password });
    return validar(registroRespuestaSchema, data);
  },

  async reenviarConfirmacion(email: string) {
    await api.post('/auth/reenviar-confirmacion', { email: email.trim() });
  },

  async getBackendStatus() {
    const { data } = await api.get<BackendStatus>('/salud');
    return data;
  },
};