import { Image } from 'expo-image';
import { Platform } from 'react-native';

import { ampliar, planDeDescarga, type Limites, type Tesela } from '@/features/mapa/geo';
import { guardarTexto, leerTexto } from '@/services/offline/almacen';

/**
 * Mapa base. Por defecto, las teselas de OpenStreetMap, con su atribución obligatoria. Su
 * servidor es gratuito pero de uso moderado: para muchos usuarios conviene un proveedor propio
 * o pago, que se configura con EXPO_PUBLIC_MAPA_TESELAS (plantilla con {z}, {x} y {y}) y
 * EXPO_PUBLIC_MAPA_ATRIBUCION, sin cambiar el código.
 */
export const PLANTILLA_TESELAS = process.env.EXPO_PUBLIC_MAPA_TESELAS || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ATRIBUCION = process.env.EXPO_PUBLIC_MAPA_ATRIBUCION || '© OpenStreetMap';
export const ENLACE_ATRIBUCION = 'https://www.openstreetmap.org/copyright';

/** Vista satelital para dibujar el plano del colegio sobre la foto real (World Imagery de Esri,
 *  con su atribución). Se cambia con EXPO_PUBLIC_MAPA_SATELITE si el equipo usa otro proveedor. */
export const PLANTILLA_SATELITE = process.env.EXPO_PUBLIC_MAPA_SATELITE
  || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const ATRIBUCION_SATELITE = process.env.EXPO_PUBLIC_MAPA_SATELITE_ATRIBUCION || 'Imágenes © Esri, Maxar, Earthstar Geographics';
export const ENLACE_ATRIBUCION_SATELITE = 'https://www.esri.com/en-us/legal/terms/full-master-agreement';

// OpenStreetMap pide que cada app se identifique. En web el navegador manda los suyos.
const ENCABEZADOS: Record<string, string> | undefined =
  Platform.OS === 'web' ? undefined : { 'User-Agent': 'ArboladoEscolar/1.0 (co.edu.upc.arboladoescolar)' };

export function urlTesela({ z, x, y }: Tesela, plantilla = PLANTILLA_TESELAS) {
  return plantilla.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export function fuenteTesela(t: Tesela, satelite = false) {
  const uri = urlTesela(t, satelite ? PLANTILLA_SATELITE : PLANTILLA_TESELAS);
  return ENCABEZADOS ? { uri, headers: ENCABEZADOS } : { uri };
}

// ================================ Zonas sin conexión ================================
/** Zona del mapa base guardada en el teléfono. Las teselas quedan en la caché de imágenes, que
 *  el sistema puede vaciar si le falta espacio; por eso se puede volver a guardar. */
export interface ZonaGuardada {
  clave: string;
  nombre: string;
  limites: Limites;
  zoomDesde: number;
  zoomHasta: number;
  teselas: number;
  guardadaEn: string;
}

const CLAVE_ZONAS = 'mapa-zonas';
const LOTE = 12;

export async function leerZonas(): Promise<ZonaGuardada[]> {
  try {
    const texto = await leerTexto(CLAVE_ZONAS);
    return texto ? (JSON.parse(texto) as ZonaGuardada[]) : [];
  } catch {
    return [];
  }
}

export class ZonaMuyGrande extends Error {
  constructor() {
    super('La zona es muy grande para guardarla. Acerca el mapa a la sede y vuelve a intentarlo.');
  }
}

/** Plan para guardar lo que se ve: desde un nivel menos que el actual (mínimo 13) hasta el 18,
 *  sin pasar de 250 teselas. */
export function planDeZona(limites: Limites, zoomActual: number) {
  return planDeDescarga(ampliar(limites, 0.1, 0.0005), Math.max(13, Math.floor(zoomActual) - 1));
}

/** Descarga las teselas de la zona y la anota. Devuelve cuántas no se pudieron descargar. */
export async function guardarZona(
  clave: string,
  nombre: string,
  limites: Limites,
  zoomActual: number,
  alAvanzar?: (hechas: number, total: number) => void,
): Promise<{ zona: ZonaGuardada; fallidas: number }> {
  const plan = planDeZona(limites, zoomActual);
  if (!plan) throw new ZonaMuyGrande();
  const urls = plan.teselas.map((t) => urlTesela(t));
  let fallidas = 0;
  for (let i = 0; i < urls.length; i += LOTE) {
    const lote = urls.slice(i, i + LOTE);
    const listas = await Promise.all(
      lote.map((url) => Image.prefetch(url, { cachePolicy: 'disk', headers: ENCABEZADOS }).catch(() => false)),
    );
    fallidas += listas.filter((ok) => !ok).length;
    alAvanzar?.(Math.min(i + LOTE, urls.length), urls.length);
  }
  const zona: ZonaGuardada = {
    clave, nombre, limites, zoomDesde: plan.zoomDesde, zoomHasta: plan.zoomHasta,
    teselas: urls.length - fallidas, guardadaEn: new Date().toISOString(),
  };
  const zonas = (await leerZonas()).filter((z) => z.clave !== clave);
  await guardarTexto(CLAVE_ZONAS, JSON.stringify([zona, ...zonas].slice(0, 10)));
  return { zona, fallidas };
}

export async function olvidarZona(clave: string) {
  const zonas = (await leerZonas()).filter((z) => z.clave !== clave);
  await guardarTexto(CLAVE_ZONAS, JSON.stringify(zonas));
}
