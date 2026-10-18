/**
 * Cuentas del mapa en la proyección Web Mercator, la misma de las teselas de OpenStreetMap.
 *
 * Coordenadas "de mundo": x e y de 0 a 1 (x = 0 en la longitud −180, y = 0 en el norte). Un
 * zoom z mide 256 · 2^z píxeles de lado; las teselas de ese zoom son cuadros de 256 px.
 */
export const TAM_TESELA = 256;
export const ZOOM_MIN = 3;
export const ZOOM_MAX = 19.5;
/** Las teselas de OpenStreetMap llegan hasta el zoom 19; más cerca se amplían. */
export const ZOOM_TESELAS_MAX = 19;
/** Valledupar, por si no hay ni árboles ni sedes con coordenadas. */
export const CENTRO_POR_DEFECTO = { lat: 10.4631, lng: -73.2532 };

export interface Punto { x: number; y: number }
export interface LatLng { lat: number; lng: number }
export interface Limites { sur: number; oeste: number; norte: number; este: number }
/** Lo que se ve: centro en coordenadas de mundo y zoom (con decimales). */
export interface Camara { centro: Punto; zoom: number }
export interface Tesela { z: number; x: number; y: number }

const LAT_MAX = 85.05112878;

export function aMundo({ lat, lng }: LatLng): Punto {
  const seno = Math.sin((Math.max(-LAT_MAX, Math.min(LAT_MAX, lat)) * Math.PI) / 180);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI) };
}

export function aLatLng({ x, y }: Punto): LatLng {
  const n = Math.PI - 2 * Math.PI * y;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: x * 360 - 180 };
}

export const escala = (zoom: number) => TAM_TESELA * 2 ** zoom;

export function limitarZoom(zoom: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/** Punto de la pantalla (px desde la esquina superior izquierda del mapa) -> mundo. */
export function pantallaAMundo(camara: Camara, p: Punto, ancho: number, alto: number): Punto {
  const s = escala(camara.zoom);
  return { x: camara.centro.x + (p.x - ancho / 2) / s, y: camara.centro.y + (p.y - alto / 2) / s };
}

export function mundoAPantalla(camara: Camara, w: Punto, ancho: number, alto: number): Punto {
  const s = escala(camara.zoom);
  return { x: (w.x - camara.centro.x) * s + ancho / 2, y: (w.y - camara.centro.y) * s + alto / 2 };
}

/** Mueve la cámara lo que se arrastró el dedo (en px de pantalla). */
export function desplazar(camara: Camara, dx: number, dy: number): Camara {
  const s = escala(camara.zoom);
  return { zoom: camara.zoom, centro: { x: camara.centro.x - dx / s, y: Math.max(0, Math.min(1, camara.centro.y - dy / s)) } };
}

/** Cambia el zoom dejando quieto el punto del mundo que está bajo `foco` (px de pantalla). */
export function acercarEn(camara: Camara, zoom: number, foco: Punto, ancho: number, alto: number): Camara {
  const nuevo = limitarZoom(zoom);
  const fijo = pantallaAMundo(camara, foco, ancho, alto);
  const s = escala(nuevo);
  return { zoom: nuevo, centro: { x: fijo.x - (foco.x - ancho / 2) / s, y: fijo.y - (foco.y - alto / 2) / s } };
}

/** Cámara para ver todos los límites con un margen (px) alrededor. Un solo punto queda en zoom 18. */
export function encuadrar(limites: Limites | null | undefined, ancho: number, alto: number, margen = 40, zoomMax = 18): Camara {
  if (!limites || ancho <= 0 || alto <= 0) return { centro: aMundo(CENTRO_POR_DEFECTO), zoom: 13 };
  const a = aMundo({ lat: limites.norte, lng: limites.oeste });
  const b = aMundo({ lat: limites.sur, lng: limites.este });
  const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const util = { x: Math.max(1, ancho - 2 * margen), y: Math.max(1, alto - 2 * margen) };
  const candidatos = [dx > 0 ? Math.log2(util.x / (dx * TAM_TESELA)) : zoomMax, dy > 0 ? Math.log2(util.y / (dy * TAM_TESELA)) : zoomMax];
  return { centro, zoom: limitarZoom(Math.min(zoomMax, ...candidatos)) };
}

/** Límites (lat/lng) de lo que se ve en pantalla. */
export function limitesVisibles(camara: Camara, ancho: number, alto: number): Limites {
  const noroeste = aLatLng(pantallaAMundo(camara, { x: 0, y: 0 }, ancho, alto));
  const sureste = aLatLng(pantallaAMundo(camara, { x: ancho, y: alto }, ancho, alto));
  return { norte: noroeste.lat, oeste: noroeste.lng, sur: sureste.lat, este: sureste.lng };
}

/** Teselas de un zoom que cubren un rectángulo de mundo. */
export function teselasDe(z: number, desde: Punto, hasta: Punto): Tesela[] {
  const n = 2 ** z;
  const x0 = Math.floor(Math.min(desde.x, hasta.x) * n);
  const x1 = Math.floor(Math.max(desde.x, hasta.x) * n);
  const y0 = Math.max(0, Math.floor(Math.min(desde.y, hasta.y) * n));
  const y1 = Math.min(n - 1, Math.floor(Math.max(desde.y, hasta.y) * n));
  const teselas: Tesela[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) teselas.push({ z, x: ((x % n) + n) % n, y });
  }
  return teselas;
}

export function teselasDeLimites(z: number, limites: Limites): Tesela[] {
  return teselasDe(z, aMundo({ lat: limites.norte, lng: limites.oeste }), aMundo({ lat: limites.sur, lng: limites.este }));
}

/** Zoom de las teselas que se dibujan para un zoom de cámara. */
export function zoomDeTeselas(zoom: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_TESELAS_MAX, Math.round(zoom)));
}

/** Política de uso de las teselas de OpenStreetMap: no se pueden descargar más de 250 de zoom
 *  13 o mayor para usarlas sin conexión. */
export const MAX_TESELAS_GUARDADAS = 250;

/**
 * Plan para guardar una zona sin conexión: desde `zoomDesde` se van sumando niveles (más
 * cercanos) mientras el total no pase del máximo. Devuelve null si ni el primer nivel cabe.
 */
export function planDeDescarga(limites: Limites, zoomDesde: number, zoomHasta = 18, maximo = MAX_TESELAS_GUARDADAS) {
  const teselas: Tesela[] = [];
  let ultimo: number | null = null;
  const desde = Math.max(ZOOM_MIN, Math.floor(zoomDesde));
  for (let z = desde; z <= Math.min(zoomHasta, ZOOM_TESELAS_MAX); z += 1) {
    const nivel = teselasDeLimites(z, limites);
    if (teselas.length + nivel.length > maximo) break;
    teselas.push(...nivel);
    ultimo = z;
  }
  return ultimo == null ? null : { teselas, zoomDesde: desde, zoomHasta: ultimo };
}

/** Distancia en px de pantalla entre dos puntos de mundo con el zoom dado. */
export function distanciaEnPantalla(a: Punto, b: Punto, zoom: number) {
  const s = escala(zoom);
  return Math.hypot((a.x - b.x) * s, (a.y - b.y) * s);
}

/** Amplía los límites un porcentaje de su tamaño (mínimo ~100 m) para que nada quede en el borde. */
export function ampliar(limites: Limites, fraccion = 0.15, minimoGrados = 0.001): Limites {
  const dLat = Math.max((limites.norte - limites.sur) * fraccion, minimoGrados);
  const dLng = Math.max((limites.este - limites.oeste) * fraccion, minimoGrados);
  return { sur: limites.sur - dLat, norte: limites.norte + dLat, oeste: limites.oeste - dLng, este: limites.este + dLng };
}
