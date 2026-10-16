import { create as createAxiosInstance, isAxiosError } from 'axios';

import { API_BASE_URL } from '@/config/constants';
import { readStoredSession } from '@/services/storage/sessionStorage';
import { describeApiDetail } from '@/shared/utils/apiErrors';

export const api = createAxiosInstance({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

export class ApiContractError extends Error {}

api.interceptors.request.use(async (request) => {
  if (request.url === '/auth/login') {
    return request;
  }
  const session = await readStoredSession();
  if (session?.access_token) {
    request.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return request;
});

// Si el servidor rechaza el token (401) fuera del inicio de sesión, la sesión expiró: se avisa
// al manejador registrado por la app para cerrarla y volver al login.
let onSessionExpired: (() => Promise<void>) | undefined;

export function setSessionExpiredHandler(handler: () => Promise<void>) {
  onSessionExpired = handler;
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (isAxiosError(error) && error.response?.status === 401 && error.config?.url !== '/auth/login') {
    await onSessionExpired?.();
  }
  return Promise.reject(error);
});

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiContractError) {
    return error.message;
  }
  if (isAxiosError<{ detail?: unknown }>(error)) {
    // Sin respuesta: el servidor no está disponible o no hubo red.
    if (!error.response) return 'No fue posible conectar con el servidor.';
    return describeApiDetail(error.response.data?.detail) ?? 'Ocurrió un error en el servidor. Intenta de nuevo.';
  }
  return 'Ocurrió un error inesperado.';
}