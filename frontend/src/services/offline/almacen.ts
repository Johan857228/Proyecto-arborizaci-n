import { Directory, File, Paths } from 'expo-file-system';

import type { FotoLocal } from '@/features/trees/types';
import { FotoNoDisponible } from '@/services/offline/tipos';

/**
 * Almacenamiento del teléfono para lo que se registra sin conexión y para la copia de las
 * consultas. Va en la carpeta de documentos de la app: el sistema no la borra para liberar
 * espacio (la caché sí) y ninguna otra app puede leerla. En web se usa almacen.web.ts.
 */
const EXTENSION: Record<FotoLocal['mimeType'], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function carpeta(...partes: string[]) {
  const directorio = new Directory(Paths.document, 'sin-conexion', ...partes);
  if (!directorio.exists) directorio.create({ intermediates: true, idempotent: true });
  return directorio;
}

export async function leerTexto(clave: string): Promise<string | null> {
  const archivo = new File(carpeta(), `${clave}.json`);
  return archivo.exists ? archivo.text() : null;
}

/** Escribe primero un temporal y luego lo reemplaza: si la app se cierra a mitad de camino,
 *  queda la versión anterior completa y no un archivo cortado. */
export async function guardarTexto(clave: string, valor: string): Promise<void> {
  const temporal = new File(carpeta(), `${clave}.tmp`);
  if (!temporal.exists) temporal.create({ overwrite: true });
  temporal.write(valor);
  await temporal.move(new File(carpeta(), `${clave}.json`), { overwrite: true });
}

export async function borrarTexto(clave: string): Promise<void> {
  const archivo = new File(carpeta(), `${clave}.json`);
  if (archivo.exists) archivo.delete();
}

/** Copia la foto (que la cámara dejó en la caché) a la carpeta de la app y devuelve la copia. */
export async function guardarFoto(id: string, foto: FotoLocal): Promise<FotoLocal> {
  const destino = new File(carpeta('fotos'), `${id}.${EXTENSION[foto.mimeType]}`);
  if (destino.exists) destino.delete();
  await new File(foto.uri).copy(destino);
  return { ...foto, uri: destino.uri };
}

/** La foto lista para subir. */
export async function prepararFoto(foto: FotoLocal): Promise<FotoLocal> {
  if (!new File(foto.uri).exists) throw new FotoNoDisponible();
  return foto;
}

export async function borrarFoto(foto: FotoLocal): Promise<void> {
  try {
    const archivo = new File(foto.uri);
    if (archivo.exists) archivo.delete();
  } catch {
    // Si ya no estaba, no hay nada que borrar.
  }
}

/** Dirección para mostrar la miniatura de una foto guardada. */
export function uriVisible(foto: FotoLocal): string | undefined {
  return foto.uri;
}
