// Límites aproximados de Colombia continental e insular (incluye San Andrés).
export const COLOMBIA = { latMin: -4.3, latMax: 13.5, lngMin: -82, lngMax: -66.8 };

// Por encima de estos valores se avisa (sin bloquear) para que el usuario revise la captura.
export const PRECISION_GPS_MAX_M = 30;
export const DISTANCIA_INSTITUCION_MAX_KM = 2;

export function isInColombia(lat: number, lng: number) {
  return lat >= COLOMBIA.latMin && lat <= COLOMBIA.latMax && lng >= COLOMBIA.lngMin && lng <= COLOMBIA.lngMax;
}

/** Distancia en km entre dos coordenadas (fórmula del haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
