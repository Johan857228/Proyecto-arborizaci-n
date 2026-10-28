import { isAxiosError } from 'axios';

import type { InspeccionPayload } from '@/features/inspections/schemas';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';
import { getApiErrorMessage } from '@/services/api/client';
import { esErrorDeRed } from '@/services/offline/conexion';
import { FotoNoDisponible } from '@/services/offline/tipos';

/**
 * Registros hechos sin conexión que esperan en el teléfono para enviarse. Cada uno lleva un
 * id_cliente: si un envío se corta después de guardarse en el servidor, al repetirlo el backend
 * devuelve el que ya existe (migración 007) y no queda duplicado. El código del árbol lo sigue
 * asignando la base de datos al recibirlo; mientras tanto la app no inventa uno.
 */
export interface FotoEnCola extends FotoLocal {
  /** id_cliente de la foto. */
  id: string;
  subida: boolean;
  /** No se pudo subir y no se volverá a intentar (p. ej. ya había tres adicionales). */
  error?: string;
}

interface RegistroBase {
  /** id_cliente del registro. */
  id: string;
  /** Hora de captura en campo (ISO); llega al servidor como capturado_en. */
  creadoEn: string;
  fotos: FotoEnCola[];
  estado: 'pendiente' | 'error';
  error?: string;
  intentos: number;
  /** Id en el servidor cuando ya se guardó y solo faltan fotos. */
  registroId?: string;
  /** Para mostrarlo en la lista: especie, o el árbol inspeccionado. */
  titulo: string;
  detalle: string;
}

export interface ArbolEnCola extends RegistroBase {
  tipo: 'arbol';
  payload: ArbolCrear;
  /** Código que asignó la base de datos (cuando ya se guardó). */
  codigo?: string;
}

export interface InspeccionEnCola extends RegistroBase {
  tipo: 'inspeccion';
  arbolId: string;
  payload: InspeccionPayload;
}

export type RegistroEnCola = ArbolEnCola | InspeccionEnCola;

/** Lo que ya se envió (los últimos), para confirmar en la lista con el código asignado. */
export interface Enviado {
  id: string;
  tipo: RegistroEnCola['tipo'];
  titulo: string;
  codigo?: string;
  arbolId?: string;
  enviadoEn: string;
  fotosConError: number;
}

export interface Envio {
  idCliente: string;
  capturadoEn: string;
}

/** Lo que el envío necesita del resto de la app (en las pruebas se reemplaza). */
export interface Servicios {
  crearArbol(payload: ArbolCrear, envio: Envio): Promise<{ id: string; codigo: string }>;
  crearInspeccion(arbolId: string, payload: InspeccionPayload, envio: Envio): Promise<{ id: string }>;
  subirFotoArbol(arbolId: string, foto: FotoLocal, idCliente: string): Promise<unknown>;
  subirFotoInspeccion(inspeccionId: string, foto: FotoLocal, idCliente: string): Promise<unknown>;
  prepararFoto(foto: FotoLocal): Promise<FotoLocal>;
}

export interface Cambios {
  /** Guarda el avance de un registro (ya creado, una foto más subida, un error). */
  guardar(registro: RegistroEnCola): Promise<void>;
  /** Quita de la cola un registro que ya llegó completo. */
  terminar(registro: RegistroEnCola, enviado: Enviado): Promise<void>;
}

export interface ResultadoEnvio {
  enviados: number;
  conError: number;
  /** Por qué se interrumpió: se vuelve a intentar con conexión o con sesión. */
  detenido?: 'sin_conexion' | 'sesion';
}

type Falla = 'reintentar' | 'sesion' | 'definitiva';

/** Sin red o con el servidor ocupado se reintenta más tarde; un 401 espera a que se inicie
 *  sesión; cualquier otro rechazo (datos no válidos, sin permiso) no se arregla reintentando. */
export function clasificarFalla(error: unknown): Falla {
  if (esErrorDeRed(error)) return 'reintentar';
  if (isAxiosError(error) && error.response) {
    const estado = error.response.status;
    if (estado === 401) return 'sesion';
    if (estado === 408 || estado === 425 || estado === 429 || estado >= 500) return 'reintentar';
  }
  return 'definitiva';
}

export function describirFalla(error: unknown): string {
  return error instanceof FotoNoDisponible ? error.message : getApiErrorMessage(error);
}

export function pendientes(registros: RegistroEnCola[]) {
  return registros.filter((r) => r.estado === 'pendiente');
}

function resumen(registro: RegistroEnCola): Enviado {
  return {
    id: registro.id,
    tipo: registro.tipo,
    titulo: registro.titulo,
    codigo: registro.tipo === 'arbol' ? registro.codigo : undefined,
    arbolId: registro.tipo === 'arbol' ? registro.registroId : registro.arbolId,
    enviadoEn: new Date().toISOString(),
    fotosConError: registro.fotos.filter((f) => f.error).length,
  };
}

/**
 * Envía los registros en el orden en que se hicieron. Primero crea el registro (si no se creó
 * antes) y después sube sus fotos una por una, guardando el avance después de cada paso: si la
 * señal se cae a mitad de camino, la próxima vez sigue donde quedó.
 */
export async function enviarRegistros(registros: RegistroEnCola[], servicios: Servicios, cambios: Cambios): Promise<ResultadoEnvio> {
  let enviados = 0;
  let conError = 0;
  for (const original of registros) {
    if (original.estado !== 'pendiente') continue;
    let registro: RegistroEnCola = { ...original, fotos: original.fotos.map((f) => ({ ...f })) };
    try {
      if (!registro.registroId) {
        const envio = { idCliente: registro.id, capturadoEn: registro.creadoEn };
        if (registro.tipo === 'arbol') {
          const creado = await servicios.crearArbol(registro.payload, envio);
          registro = { ...registro, registroId: creado.id, codigo: creado.codigo };
        } else {
          const creada = await servicios.crearInspeccion(registro.arbolId, registro.payload, envio);
          registro = { ...registro, registroId: creada.id };
        }
        await cambios.guardar(registro);
      }
      const destino = registro.registroId as string;
      for (let i = 0; i < registro.fotos.length; i += 1) {
        const foto = registro.fotos[i];
        if (foto.subida || foto.error) continue;
        try {
          const lista = await servicios.prepararFoto(foto);
          if (registro.tipo === 'arbol') await servicios.subirFotoArbol(destino, lista, foto.id);
          else await servicios.subirFotoInspeccion(destino, lista, foto.id);
          registro.fotos[i] = { ...foto, subida: true };
        } catch (error) {
          if (clasificarFalla(error) !== 'definitiva') throw error;
          // El registro ya está en el servidor: se sigue con las demás fotos y se avisa cuál faltó.
          registro.fotos[i] = { ...foto, error: describirFalla(error) };
        }
        await cambios.guardar(registro);
      }
      await cambios.terminar(registro, resumen(registro));
      enviados += 1;
    } catch (error) {
      const falla = clasificarFalla(error);
      if (falla === 'definitiva') {
        await cambios.guardar({ ...registro, estado: 'error', error: describirFalla(error), intentos: registro.intentos + 1 });
        conError += 1;
        continue;
      }
      await cambios.guardar({ ...registro, intentos: registro.intentos + 1 });
      return { enviados, conError, detenido: falla === 'sesion' ? 'sesion' : 'sin_conexion' };
    }
  }
  return { enviados, conError };
}
