import { create } from 'zustand';

import { useAuthStore } from '@/features/auth/store';
import { inspeccionesService } from '@/features/inspections/services/inspeccionesService';
import type { InspeccionPayload } from '@/features/inspections/schemas';
import {
  enviarRegistros,
  pendientes,
  type ArbolEnCola,
  type Enviado,
  type InspeccionEnCola,
  type RegistroEnCola,
  type ResultadoEnvio,
  type Servicios,
} from '@/features/sincronizacion/cola';
import { photosService } from '@/features/trees/services/photosService';
import { treesService } from '@/features/trees/services/treesService';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';
import { queryClient } from '@/services/api/queryClient';
import * as almacen from '@/services/offline/almacen';
import { hayConexion, marcarSinConexion } from '@/services/offline/conexion';
import { nuevoId } from '@/shared/utils/id';

/**
 * La cola de registros sin enviar, guardada en el teléfono. Hay una por cuenta: en un teléfono
 * compartido, lo que registró una persona solo se envía con su sesión, nunca con la de otra.
 */
const VERSION = 1;
const MAX_ENVIADOS = 10;

interface Guardado {
  version: number;
  registros: RegistroEnCola[];
  enviados: Enviado[];
}

interface ColaState {
  usuarioId?: string;
  cargada: boolean;
  registros: RegistroEnCola[];
  enviados: Enviado[];
  enviando: boolean;
  ultimoResultado?: ResultadoEnvio & { en: string };
  cargar: (usuarioId: string) => Promise<void>;
  descargar: () => void;
  agregar: (registro: RegistroEnCola) => Promise<void>;
  actualizar: (registro: RegistroEnCola) => Promise<void>;
  terminar: (registro: RegistroEnCola, enviado: Enviado) => Promise<void>;
  descartar: (id: string) => Promise<void>;
  reintentar: (id: string) => Promise<void>;
}

const clave = (usuarioId: string) => `cola-${usuarioId}`;

// Las escrituras van en fila para que una no pise a otra.
let escritura: Promise<void> = Promise.resolve();

function persistir() {
  const { usuarioId, registros, enviados } = useColaStore.getState();
  if (!usuarioId) return escritura;
  const contenido: Guardado = { version: VERSION, registros, enviados };
  escritura = escritura
    .catch(() => undefined)
    .then(() => almacen.guardarTexto(clave(usuarioId), JSON.stringify(contenido)));
  return escritura;
}

async function borrarFotos(registro: RegistroEnCola) {
  await Promise.all(registro.fotos.map((foto) => almacen.borrarFoto(foto)));
}

export const useColaStore = create<ColaState>((set, get) => ({
  cargada: false,
  registros: [],
  enviados: [],
  enviando: false,

  cargar: async (usuarioId) => {
    if (get().usuarioId === usuarioId && get().cargada) return;
    set({ usuarioId, cargada: false, registros: [], enviados: [] });
    let guardado: Guardado | undefined;
    try {
      const texto = await almacen.leerTexto(clave(usuarioId));
      if (texto) guardado = JSON.parse(texto) as Guardado;
    } catch {
      // Un archivo dañado no debe impedir usar la app; se conserva aparte por si hay que recuperarlo.
      const texto = await almacen.leerTexto(clave(usuarioId)).catch(() => null);
      if (texto) await almacen.guardarTexto(`${clave(usuarioId)}-danada-${Date.now()}`, texto).catch(() => undefined);
    }
    if (get().usuarioId !== usuarioId) return; // cambió la sesión mientras se leía
    set({
      cargada: true,
      registros: guardado?.version === VERSION ? guardado.registros ?? [] : [],
      enviados: guardado?.version === VERSION ? guardado.enviados ?? [] : [],
    });
  },

  descargar: () => set({ usuarioId: undefined, cargada: false, registros: [], enviados: [], ultimoResultado: undefined }),

  agregar: async (registro) => {
    set((estado) => ({ registros: [...estado.registros, registro] }));
    await persistir();
  },

  actualizar: async (registro) => {
    set((estado) => ({ registros: estado.registros.map((r) => (r.id === registro.id ? registro : r)) }));
    await persistir();
  },

  terminar: async (registro, enviado) => {
    set((estado) => ({
      registros: estado.registros.filter((r) => r.id !== registro.id),
      enviados: [enviado, ...estado.enviados].slice(0, MAX_ENVIADOS),
    }));
    await persistir();
    await borrarFotos(registro);
  },

  descartar: async (id) => {
    const registro = get().registros.find((r) => r.id === id);
    set((estado) => ({ registros: estado.registros.filter((r) => r.id !== id) }));
    await persistir();
    if (registro) await borrarFotos(registro);
  },

  reintentar: async (id) => {
    set((estado) => ({
      registros: estado.registros.map((r) => (r.id === id ? { ...r, estado: 'pendiente', error: undefined } : r)),
    }));
    await persistir();
    void sincronizarAhora();
  },
}));

/** Foto por guardar; trae su id_cliente si ya se intentó subir (así el reintento no la duplica). */
type FotoPorGuardar = FotoLocal & { id?: string };

/** Copia las fotos a la carpeta de la app (la cámara las deja en la caché, que el sistema puede
 *  borrar). */
async function guardarFotos(fotos: FotoPorGuardar[]) {
  const guardadas = [];
  for (const foto of fotos) {
    const id = foto.id ?? nuevoId();
    guardadas.push({ ...(await almacen.guardarFoto(id, foto)), id, subida: false });
  }
  return guardadas;
}

function usuarioActual() {
  const usuarioId = useAuthStore.getState().session?.user_id;
  if (!usuarioId || useColaStore.getState().usuarioId !== usuarioId) {
    throw new Error('No se pudo guardar en el teléfono: vuelve a abrir la app e intenta de nuevo.');
  }
  return usuarioId;
}

/** Guarda en el teléfono un árbol para enviarlo cuando haya conexión. Si ya se creó en el
 *  servidor y solo faltan fotos, se pasa `registroId` (y su código). */
export async function guardarArbolParaDespues(datos: {
  idCliente: string;
  payload: ArbolCrear;
  fotos: FotoPorGuardar[];
  titulo: string;
  detalle: string;
  registroId?: string;
  codigo?: string;
}): Promise<ArbolEnCola> {
  usuarioActual();
  const registro: ArbolEnCola = {
    tipo: 'arbol',
    id: datos.idCliente,
    creadoEn: new Date().toISOString(),
    payload: datos.payload,
    fotos: await guardarFotos(datos.fotos),
    estado: 'pendiente',
    intentos: 0,
    registroId: datos.registroId,
    codigo: datos.codigo,
    titulo: datos.titulo,
    detalle: datos.detalle,
  };
  await useColaStore.getState().agregar(registro);
  return registro;
}

export async function guardarInspeccionParaDespues(datos: {
  idCliente: string;
  arbolId: string;
  payload: InspeccionPayload;
  fotos: FotoPorGuardar[];
  titulo: string;
  detalle: string;
  registroId?: string;
}): Promise<InspeccionEnCola> {
  usuarioActual();
  const registro: InspeccionEnCola = {
    tipo: 'inspeccion',
    id: datos.idCliente,
    creadoEn: new Date().toISOString(),
    arbolId: datos.arbolId,
    payload: datos.payload,
    fotos: await guardarFotos(datos.fotos),
    estado: 'pendiente',
    intentos: 0,
    registroId: datos.registroId,
    titulo: datos.titulo,
    detalle: datos.detalle,
  };
  await useColaStore.getState().agregar(registro);
  return registro;
}

const servicios: Servicios = {
  crearArbol: (payload, envio) => treesService.create(payload, envio),
  crearInspeccion: (arbolId, payload, envio) => inspeccionesService.crear(arbolId, payload, envio),
  subirFotoArbol: (arbolId, foto, idCliente) => photosService.upload(arbolId, foto, idCliente),
  subirFotoInspeccion: (inspeccionId, foto, idCliente) => inspeccionesService.subirFoto(inspeccionId, foto, idCliente),
  prepararFoto: almacen.prepararFoto,
};

let enCurso: Promise<ResultadoEnvio | undefined> | undefined;

/** Envía lo pendiente si hay conexión y la cola es de la sesión abierta. Una sola vez a la vez. */
export function sincronizarAhora(): Promise<ResultadoEnvio | undefined> {
  enCurso ??= (async () => {
    const estado = useColaStore.getState();
    const sesion = useAuthStore.getState().session?.user_id;
    if (!estado.cargada || !sesion || estado.usuarioId !== sesion) return undefined;
    if (!hayConexion() || pendientes(estado.registros).length === 0) return undefined;
    useColaStore.setState({ enviando: true });
    const incluidos = new Set(pendientes(estado.registros).map((r) => r.id));
    try {
      const resultado = await enviarRegistros(estado.registros, servicios, {
        guardar: (registro) => useColaStore.getState().actualizar(registro),
        terminar: (registro, enviado) => useColaStore.getState().terminar(registro, enviado),
      });
      if (resultado.detenido === 'sin_conexion') marcarSinConexion();
      useColaStore.setState({ ultimoResultado: { ...resultado, en: new Date().toISOString() } });
      if (resultado.enviados > 0) void queryClient.invalidateQueries();
      // Lo que se guardó o se volvió a intentar mientras se enviaba sale en la siguiente vuelta.
      const nuevos = pendientes(useColaStore.getState().registros).some((r) => !incluidos.has(r.id));
      if (nuevos && !resultado.detenido) setTimeout(() => void sincronizarAhora(), 0);
      return resultado;
    } finally {
      useColaStore.setState({ enviando: false });
    }
  })().finally(() => {
    enCurso = undefined;
  });
  return enCurso;
}

export function useContadorCola() {
  const registros = useColaStore((estado) => estado.registros);
  return {
    pendientes: registros.filter((r) => r.estado === 'pendiente').length,
    conError: registros.filter((r) => r.estado === 'error').length,
    total: registros.length,
  };
}
