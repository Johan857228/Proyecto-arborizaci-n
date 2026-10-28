import { create as createAxiosInstance, isAxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { z } from 'zod';

import { API_BASE_URL } from '@/config/constants';
import { sessionSchema } from '@/features/auth/schemas';
import type { Session } from '@/features/auth/types';
import { esErrorDeRed, marcarConConexion, marcarSinConexion } from '@/services/offline/conexion';
import { readStoredSession } from '@/services/storage/sessionStorage';
import { describeApiDetail } from '@/shared/utils/apiErrors';

export const api = createAxiosInstance({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

export class ApiContractError extends Error {}

const RUTAS_SIN_TOKEN = ['/auth/login', '/auth/refresh'];

api.interceptors.request.use(async (request) => {
  if (RUTAS_SIN_TOKEN.includes(request.url ?? '')) {
    return request;
  }
  const session = await readStoredSession();
  if (session?.access_token) {
    request.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return request;
});

// Cada respuesta confirma que hay conexión; un fallo sin respuesta la marca como perdida
// (services/offline/conexion.ts).
api.interceptors.response.use(
  (respuesta) => {
    marcarConConexion();
    return respuesta;
  },
  (error: unknown) => {
    if (esErrorDeRed(error)) marcarSinConexion();
    else if (isAxiosError(error) && error.response) marcarConConexion();
    throw error;
  },
);

// La app registra aquí qué hacer cuando la sesión se renueva (guardarla) y cuando ya no se
// puede renovar (cerrarla y volver al login). Así este módulo no depende del store.
let onSessionRenewed: ((session: Session) => Promise<void>) | undefined;
let onSessionExpired: (() => Promise<void>) | undefined;

export function setSessionRenewedHandler(handler: (session: Session) => Promise<void>) {
  onSessionRenewed = handler;
}

export function setSessionExpiredHandler(handler: () => Promise<void>) {
  onSessionExpired = handler;
}

// El token de Supabase dura una hora. Ante un 401 se intenta una sola renovación con el
// refresh_token (compartida entre las peticiones que fallen a la vez) y se repite la petición;
// si no se puede renovar, la sesión expiró.
let renovacionEnCurso: Promise<Session | null> | null = null;
const reintentadas = new WeakSet<InternalAxiosRequestConfig>();

async function renovarSesion(): Promise<Session | null> {
  const actual = await readStoredSession();
  if (!actual?.refresh_token) return null;
  try {
    const { data } = await api.post<unknown>('/auth/refresh', { refresh_token: actual.refresh_token });
    const result = sessionSchema.safeParse(data);
    if (!result.success) return null;
    await onSessionRenewed?.(result.data);
    return result.data;
  } catch {
    return null;
  }
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!isAxiosError(error) || error.response?.status !== 401 || !error.config) {
    throw error;
  }
  const original = error.config;
  if (RUTAS_SIN_TOKEN.includes(original.url ?? '') || reintentadas.has(original)) {
    throw error;
  }
  reintentadas.add(original);
  renovacionEnCurso ??= renovarSesion().finally(() => {
    renovacionEnCurso = null;
  });
  const nueva = await renovacionEnCurso;
  if (!nueva) {
    await onSessionExpired?.();
    throw error;
  }
  original.headers.Authorization = `Bearer ${nueva.access_token}`;
  return api(original);
});

/** GET que valida la respuesta contra el contrato antes de usarla. */
export async function getValidado<T extends z.ZodType>(
  url: string,
  schema: T,
  params?: Record<string, unknown>,
): Promise<z.infer<T>> {
  const { data } = await api.get<unknown>(url, { params: limpiarParametros(params) });
  return validar(schema, data);
}

/** POST/PUT/PATCH/DELETE que valida la respuesta contra el contrato. */
export async function enviarValidado<T extends z.ZodType>(
  metodo: 'post' | 'put' | 'patch' | 'delete',
  url: string,
  cuerpo: unknown,
  schema: T,
): Promise<z.infer<T>> {
  const { data } = await api.request<unknown>({ method: metodo, url, data: cuerpo });
  return validar(schema, data);
}

export function validar<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiContractError('El servidor devolvió datos con un formato inesperado. Actualiza la aplicación o avisa al equipo.');
  }
  return result.data;
}

function limpiarParametros(params?: Record<string, unknown>) {
  if (!params) return undefined;
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiContractError) {
    return error.message;
  }
  if (isAxiosError<{ detail?: unknown }>(error)) {
    // Sin respuesta: el servidor no está disponible o no hubo red.
    if (!error.response) return 'No fue posible conectar con el servidor. Revisa tu conexión.';
    const descripcion = describeApiDetail(error.response.data?.detail);
    if (descripcion) return descripcion;
    const status = error.response.status;
    if (status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo.';
    if (status === 403) return 'No tienes permiso para esta acción.';
    if (status === 404) return 'No se encontró el registro solicitado.';
    if (status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en unos minutos.';
    return 'Ocurrió un error en el servidor. Intenta de nuevo.';
  }
  return 'Ocurrió un error inesperado.';
}
