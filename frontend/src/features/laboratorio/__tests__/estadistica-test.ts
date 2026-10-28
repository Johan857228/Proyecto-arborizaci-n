import { describe, expect, it } from '@jest/globals';

import {
  amplitudRedonda,
  clasesModales,
  cuartiles,
  describirCorrelacion,
  medidas,
  muestraAleatoria,
  regresion,
  tablaFrecuencias,
} from '@/features/laboratorio/estadistica';

describe('laboratorio: medidas', () => {
  it('media, mediana, rango y desviación como en el cuaderno (y como el backend)', () => {
    const poblacion = medidas([40, 10, 30, 20], true);
    expect(poblacion).toMatchObject({ n: 4, media: 25, mediana: 25, minimo: 10, maximo: 40, rango: 30 });
    // Mismos valores que servicios/guias.estadisticas: σ = 11,1803 y s = 12,9099
    expect(poblacion?.desviacion).toBeCloseTo(11.1803, 4);
    expect(medidas([40, 10, 30, 20], false)?.desviacion).toBeCloseTo(12.9099, 4);
    expect(medidas([7], true)?.desviacion).toBeNull();
    expect(medidas([], true)).toBeNull();
  });

  it('cuartiles por el método de las mitades', () => {
    expect(cuartiles([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ q1: 2.5, q3: 6.5 });
    // con n impar la mediana no entra en ninguna mitad
    expect(cuartiles([1, 2, 3, 4, 5, 6, 7])).toEqual({ q1: 2, q3: 6 });
    expect(medidas([1, 2, 3, 4, 5, 6, 7], true)?.riq).toBe(4);
  });
});

describe('laboratorio: tabla de frecuencias', () => {
  it('amplitudes redondas', () => {
    expect([7.43, 1.71, 0.3, 12, 25, 0].map(amplitudRedonda)).toEqual([10, 2, 0.5, 20, 25, 1]);
  });

  it('cubre todos los datos, el último intervalo es cerrado y las frecuencias suman n', () => {
    const datos = [8.2, 12, 15.5, 19, 21, 24.9, 30, 33, 38, 41, 45, 52, 58, 60];
    const tabla = tablaFrecuencias(datos);
    expect(tabla[0].desde).toBeLessThanOrEqual(8.2);
    expect(tabla[tabla.length - 1].hasta).toBeGreaterThanOrEqual(60);
    expect(tabla.reduce((s, c) => s + c.frecuencia, 0)).toBe(datos.length);
    expect(tabla[tabla.length - 1].acumulada).toBe(datos.length);
    // n = 14 -> Sturges k = 5; (60 − 8,2) / 5 = 10,36 -> amplitud 20, de 0 a 60
    expect(tabla.map((c) => [c.desde, c.hasta, c.frecuencia])).toEqual([[0, 20, 4], [20, 40, 5], [40, 60, 5]]);
    expect(clasesModales(tabla).map((c) => c.desde)).toEqual([20, 40]);
    expect(tablaFrecuencias([5, 5, 5])).toEqual([{ desde: 5, hasta: 6, marca: 5.5, frecuencia: 3, relativa: 100, acumulada: 3 }]);
  });
});

describe('laboratorio: regresión y muestras', () => {
  it('recta y correlación', () => {
    const r = regresion([1, 2, 3, 4], [3, 5, 7, 9]);
    expect(r?.a).toBeCloseTo(1, 9);
    expect(r?.b).toBeCloseTo(2, 9);
    expect(r?.r).toBeCloseTo(1, 9);
    expect(regresion([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(regresion([1, 2], [1, 2])).toBeNull();
    expect(describirCorrelacion(0.87)).toBe('Relación positiva fuerte');
    expect(describirCorrelacion(-0.5)).toBe('Relación negativa moderada');
    expect(describirCorrelacion(0.1)).toBe('Relación muy débil o nula');
  });

  it('la misma semilla da la misma muestra, sin repetidos y en el orden original', () => {
    const datos = Array.from({ length: 50 }, (_, i) => i);
    const a = muestraAleatoria(datos, 10, 42);
    expect(a).toEqual(muestraAleatoria(datos, 10, 42));
    expect(a).not.toEqual(muestraAleatoria(datos, 10, 43));
    expect(new Set(a).size).toBe(10);
    expect([...a].sort((x, y) => x - y)).toEqual(a);
    expect(muestraAleatoria(datos, 80, 1)).toBe(datos);
  });
});
