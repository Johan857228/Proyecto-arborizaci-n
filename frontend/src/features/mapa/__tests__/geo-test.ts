import { describe, expect, it } from '@jest/globals';

import {
  acercarEn,
  aLatLng,
  aMundo,
  desplazar,
  encuadrar,
  limitesVisibles,
  MAX_TESELAS_GUARDADAS,
  mundoAPantalla,
  pantallaAMundo,
  planDeDescarga,
  teselasDe,
  teselasDeLimites,
  zoomDeTeselas,
  type Camara,
} from '@/features/mapa/geo';

const VALLEDUPAR = { lat: 10.4631, lng: -73.2532 };

describe('mapa: proyección y cámara', () => {
  it('ida y vuelta entre lat/lng y mundo', () => {
    const w = aMundo(VALLEDUPAR);
    const vuelta = aLatLng(w);
    expect(vuelta.lat).toBeCloseTo(VALLEDUPAR.lat, 9);
    expect(vuelta.lng).toBeCloseTo(VALLEDUPAR.lng, 9);
    expect(aMundo({ lat: 0, lng: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('la tesela de zoom 16 de Valledupar es la de OpenStreetMap', () => {
    const w = aMundo(VALLEDUPAR);
    // x = floor((lng + 180) / 360 · 2^16), y según la fórmula de Mercator de OSM
    expect([Math.floor(w.x * 2 ** 16), Math.floor(w.y * 2 ** 16)]).toEqual([19432, 30852]);
  });

  it('pantalla y mundo son inversos, y acercar deja quieto el punto del foco', () => {
    const camara: Camara = { centro: aMundo(VALLEDUPAR), zoom: 16.3 };
    const foco = { x: 120, y: 300 };
    const w = pantallaAMundo(camara, foco, 400, 600);
    const p = mundoAPantalla(camara, w, 400, 600);
    expect(p.x).toBeCloseTo(120, 6);
    expect(p.y).toBeCloseTo(300, 6);
    const cerca = acercarEn(camara, 17.8, foco, 400, 600);
    const q = mundoAPantalla(cerca, w, 400, 600);
    expect(cerca.zoom).toBe(17.8);
    expect(q.x).toBeCloseTo(120, 6);
    expect(q.y).toBeCloseTo(300, 6);
    expect(acercarEn(camara, 30, foco, 400, 600).zoom).toBe(19.5);
  });

  it('arrastrar a la derecha mueve el centro al oeste', () => {
    const camara: Camara = { centro: aMundo(VALLEDUPAR), zoom: 15 };
    const movida = desplazar(camara, 256, 0);
    expect(aLatLng(movida.centro).lng).toBeLessThan(VALLEDUPAR.lng);
    expect(movida.centro.y).toBe(camara.centro.y);
  });

  it('encuadrar deja todo dentro con margen; un solo punto queda en zoom 18', () => {
    const limites = { sur: 10.46, oeste: -73.26, norte: 10.47, este: -73.25 };
    const camara = encuadrar(limites, 400, 300);
    const visibles = limitesVisibles(camara, 400, 300);
    expect(visibles.sur).toBeLessThan(limites.sur);
    expect(visibles.norte).toBeGreaterThan(limites.norte);
    expect(visibles.oeste).toBeLessThan(limites.oeste);
    expect(visibles.este).toBeGreaterThan(limites.este);
    expect(camara.zoom).toBeGreaterThan(14);
    expect(encuadrar({ sur: 10.46, oeste: -73.25, norte: 10.46, este: -73.25 }, 400, 300).zoom).toBe(18);
    expect(encuadrar(null, 400, 300).zoom).toBe(13);
  });
});

describe('mapa: teselas', () => {
  it('cubre el rectángulo y no sale del mundo', () => {
    expect(teselasDe(2, { x: 0.3, y: 0.3 }, { x: 0.6, y: 0.6 })).toEqual([
      { z: 2, x: 1, y: 1 }, { z: 2, x: 2, y: 1 }, { z: 2, x: 1, y: 2 }, { z: 2, x: 2, y: 2 },
    ]);
    expect(teselasDe(1, { x: 0.1, y: -0.5 }, { x: 0.2, y: 0.1 })).toEqual([{ z: 1, x: 0, y: 0 }]);
    expect(zoomDeTeselas(16.4)).toBe(16);
    expect(zoomDeTeselas(19.5)).toBe(19);
  });

  it('el plan para guardar una sede no pasa de 250 teselas', () => {
    const sede = { sur: 10.462, oeste: -73.256, norte: 10.466, este: -73.251 };
    const plan = planDeDescarga(sede, 14);
    expect(plan).not.toBeNull();
    expect(plan?.teselas.length).toBeLessThanOrEqual(MAX_TESELAS_GUARDADAS);
    expect(plan?.zoomDesde).toBe(14);
    expect(plan?.zoomHasta).toBe(18);
    const total = [14, 15, 16, 17, 18].reduce((s, z) => s + teselasDeLimites(z, sede).length, 0);
    expect(plan?.teselas.length).toBe(total);
  });

  it('si la zona es grande guarda menos niveles, y si ni uno cabe no guarda', () => {
    const barrio = { sur: 10.44, oeste: -73.28, norte: 10.48, este: -73.23 };
    const plan = planDeDescarga(barrio, 14);
    expect(plan?.zoomHasta).toBeLessThan(18);
    expect(plan?.teselas.length).toBeLessThanOrEqual(MAX_TESELAS_GUARDADAS);
    expect(planDeDescarga({ sur: 4, oeste: -76, norte: 11, este: -72 }, 13)).toBeNull();
  });
});
