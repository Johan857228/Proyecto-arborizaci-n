import type { FotoLocal } from '@/features/trees/types';
import { FotoNoDisponible } from '@/services/offline/tipos';

/**
 * Versión web de almacen.ts: IndexedDB, que guarda las fotos como archivos (Blob) sin el límite
 * de 5 MB de localStorage. Las fotos guardadas se identifican con "idb:<id>" y se convierten en
 * una dirección temporal del navegador al momento de subirlas.
 */
const BASE = 'arbolado-sin-conexion';
const TEXTOS = 'textos';
const FOTOS = 'fotos';
const PREFIJO = 'idb:';

let conexion: Promise<IDBDatabase> | undefined;

function abrir(): Promise<IDBDatabase> {
  conexion ??= new Promise((resolver, rechazar) => {
    const solicitud = indexedDB.open(BASE, 1);
    solicitud.onupgradeneeded = () => {
      solicitud.result.createObjectStore(TEXTOS);
      solicitud.result.createObjectStore(FOTOS);
    };
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => {
      conexion = undefined;
      rechazar(solicitud.error ?? new Error('Este navegador no permite guardar datos.'));
    };
  });
  return conexion;
}

async function operar<T>(almacen: string, modo: IDBTransactionMode, accion: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const base = await abrir();
  return new Promise((resolver, rechazar) => {
    const solicitud = accion(base.transaction(almacen, modo).objectStore(almacen));
    solicitud.onsuccess = () => resolver(solicitud.result as T);
    solicitud.onerror = () => rechazar(solicitud.error ?? new Error('No se pudo guardar en este navegador.'));
  });
}

export async function leerTexto(clave: string): Promise<string | null> {
  const valor = await operar<string | undefined>(TEXTOS, 'readonly', (s) => s.get(clave));
  return valor ?? null;
}

export async function guardarTexto(clave: string, valor: string): Promise<void> {
  await operar(TEXTOS, 'readwrite', (s) => s.put(valor, clave));
}

export async function borrarTexto(clave: string): Promise<void> {
  await operar(TEXTOS, 'readwrite', (s) => s.delete(clave));
}

export async function guardarFoto(id: string, foto: FotoLocal): Promise<FotoLocal> {
  const respuesta = await fetch(foto.uri);
  if (!respuesta.ok) throw new Error('No se pudo leer la fotografía seleccionada.');
  const blob = await respuesta.blob();
  await operar(FOTOS, 'readwrite', (s) => s.put(blob, id));
  return { ...foto, uri: `${PREFIJO}${id}` };
}

export async function prepararFoto(foto: FotoLocal): Promise<FotoLocal> {
  if (!foto.uri.startsWith(PREFIJO)) return foto;
  const blob = await operar<Blob | undefined>(FOTOS, 'readonly', (s) => s.get(foto.uri.slice(PREFIJO.length)));
  if (!blob) throw new FotoNoDisponible();
  return { ...foto, uri: URL.createObjectURL(blob) };
}

export async function borrarFoto(foto: FotoLocal): Promise<void> {
  if (!foto.uri.startsWith(PREFIJO)) return;
  await operar(FOTOS, 'readwrite', (s) => s.delete(foto.uri.slice(PREFIJO.length))).catch(() => undefined);
}

/** En web la foto guardada no tiene una dirección que se pueda mostrar sin leerla primero. */
export function uriVisible(foto: FotoLocal): string | undefined {
  return foto.uri.startsWith(PREFIJO) ? undefined : foto.uri;
}
