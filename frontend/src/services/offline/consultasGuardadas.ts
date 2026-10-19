import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from '@tanstack/react-query';

import * as almacen from '@/services/offline/almacen';

/**
 * Copia en el teléfono de lo que la app ya consultó: catálogos, perfil, inventario y fichas de
 * árboles. Sin conexión, el formulario de registro sigue teniendo especies e instituciones, y el
 * inventario se puede consultar con los datos de la última vez. Es una copia por cuenta, de
 * máximo 7 días, y se borra al cerrar sesión.
 */
const VERSION = 1;
const MAX_EDAD_MS = 7 * 24 * 60 * 60 * 1000;
const ESPERA_ESCRITURA_MS = 3000;
// Lo necesario para trabajar en campo. Lo demás (reportes, presupuestos, usuarios…) se consulta en línea.
// Las alertas y los contactos de emergencia van para que la ruta de emergencia funcione sin señal.
const RAICES = new Set(['catalogs', 'perfil', 'trees', 'arbol', 'dashboard', 'instituciones', 'intervenciones', 'inspeccion', 'alertas', 'contactos', 'mapa', 'guias', 'laboratorio', 'siembras']);

interface Copia {
  version: number;
  guardadaEn: number;
  estado: DehydratedState;
}

const clave = (usuarioId: string) => `consultas-${usuarioId}`;

function seGuarda(query: Query) {
  return (
    query.state.status === 'success' &&
    RAICES.has(String(query.queryKey[0])) &&
    Date.now() - query.state.dataUpdatedAt < MAX_EDAD_MS
  );
}

/** Carga la copia guardada en la caché de consultas (sin reemplazar datos más nuevos). */
export async function restaurarConsultas(cliente: QueryClient, usuarioId: string): Promise<void> {
  try {
    const texto = await almacen.leerTexto(clave(usuarioId));
    if (!texto) return;
    const copia = JSON.parse(texto) as Copia;
    if (copia.version !== VERSION || Date.now() - copia.guardadaEn > MAX_EDAD_MS) return;
    hydrate(cliente, copia.estado);
  } catch {
    // Sin copia la app funciona igual, solo que necesita conexión para cargar los datos.
  }
}

/** Guarda la copia cada vez que cambian las consultas (con unos segundos de espera para no
 *  escribir en cada respuesta). Devuelve la función para dejar de guardar. */
export function guardarConsultasAlCambiar(cliente: QueryClient, usuarioId: string): () => void {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const guardar = () => {
    temporizador = undefined;
    const copia: Copia = { version: VERSION, guardadaEn: Date.now(), estado: dehydrate(cliente, { shouldDehydrateQuery: seGuarda }) };
    void almacen.guardarTexto(clave(usuarioId), JSON.stringify(copia)).catch(() => undefined);
  };
  const dejarDeOir = cliente.getQueryCache().subscribe((evento) => {
    if (evento.type !== 'updated' || evento.action.type !== 'success') return;
    if (!RAICES.has(String(evento.query.queryKey[0]))) return;
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(guardar, ESPERA_ESCRITURA_MS);
  });
  return () => {
    dejarDeOir();
    if (temporizador) clearTimeout(temporizador);
  };
}

export async function borrarConsultas(usuarioId: string): Promise<void> {
  await almacen.borrarTexto(clave(usuarioId)).catch(() => undefined);
}
