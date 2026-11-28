import { ApiContractError, api, validar } from '@/services/api/client';
import { mensajeSchema, recuperarRespuestaSchema, registroRespuestaSchema, sessionSchema, type RegistroFormValues } from '@/features/auth/schemas';
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

  /** Crea una cuenta de estudiante (sin institución). Devuelve la sesión, o null si Supabase
   *  pide confirmar el correo primero. */
  async register(valores: RegistroFormValues) {
    const { data } = await api.post<unknown>('/auth/registro', {
      nombre: valores.nombre,
      email: valores.email,
      password: valores.password,
      acepta_politica: valores.acepta_politica,
    });
    return validar(registroRespuestaSchema, data);
  },

  /** Envía al correo el enlace para crear una contraseña nueva (la respuesta es la misma exista o no la cuenta).
   *  Si el enlace no llevaría a la app, el backend no lo manda (enviado = false) y explica qué hacer. */
  async recuperar(email: string) {
    const { data } = await api.post<unknown>('/auth/recuperar', { email });
    return validar(recuperarRespuestaSchema, data);
  },

  /** Guarda la contraseña nueva con el token que trae el enlace del correo. */
  async restablecer(accessToken: string, password: string) {
    const { data } = await api.post<unknown>('/auth/restablecer', { access_token: accessToken, password });
    return validar(mensajeSchema, data).mensaje;
  },

  async getBackendStatus() {
    const { data } = await api.get<BackendStatus>('/salud');
    return data;
  },
};