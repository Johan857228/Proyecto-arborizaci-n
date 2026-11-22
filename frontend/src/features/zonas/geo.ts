import type { Contorno, ZonaInstitucion } from '@/features/zonas/api';

/** Si el punto cae dentro del contorno (regla del rayo: cuenta cuántos lados cruza hacia el este).
 *  A la escala de un colegio la latitud y la longitud se pueden tratar como un plano. */
export function dentroDe(lat: number, lng: number, contorno: Contorno) {
  let dentro = false;
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    const [latI, lngI] = contorno[i];
    const [latJ, lngJ] = contorno[j];
    if ((latI > lat) !== (latJ > lat) && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) dentro = !dentro;
  }
  return dentro;
}

/** Área aproximada en grados², solo para comparar zonas entre sí. */
export function area(contorno: Contorno) {
  let suma = 0;
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    suma += (contorno[j][1] + contorno[i][1]) * (contorno[j][0] - contorno[i][0]);
  }
  return Math.abs(suma / 2);
}

/** La zona dibujada en la que cae el punto. Si caen varias (una cancha dentro del patio, por
 *  ejemplo), la más pequeña, que es la más precisa. */
export function zonaEnPunto(zonas: ZonaInstitucion[], lat: number, lng: number): ZonaInstitucion | null {
  let mejor: { zona: ZonaInstitucion; area: number } | null = null;
  for (const zona of zonas) {
    if (!zona.contorno || zona.contorno.length < 3 || !dentroDe(lat, lng, zona.contorno)) continue;
    const a = area(zona.contorno);
    if (!mejor || a < mejor.area) mejor = { zona, area: a };
  }
  return mejor?.zona ?? null;
}

/** Punto medio de las esquinas: ahí va el nombre de la zona en el plano. */
export function centro(contorno: Contorno) {
  const n = contorno.length;
  return {
    lat: contorno.reduce((s, [lat]) => s + lat, 0) / n,
    lng: contorno.reduce((s, [, lng]) => s + lng, 0) / n,
  };
}
