import { create as createAxiosInstance, isAxiosError } from 'axios';

import { API_BASE_URL } from '@/config/constants';
import { readStoredSession } from '@/services/storage/sessionStorage';

export const api = createAxiosInstance({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

export class ApiContractError extends Error {}

api.interceptors.request.use(async (request) => {
  const session = await readStoredSession();
  if (session?.access_token) {
    request.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return request;
});

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiContractError) {
    return error.message;
  }
  if (isAxiosError<{ detail?: string }>(error)) {
    return error.response?.data?.detail ?? 'No fue posible conectar con el servidor.';
  }
  return 'Ocurrió un error inesperado.';
}