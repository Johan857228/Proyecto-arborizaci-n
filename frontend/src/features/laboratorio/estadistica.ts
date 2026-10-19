/**
 * Estadística escolar con los árboles del colegio. Las mismas cuentas que se hacen a mano en
 * clase, para que el resultado de la app y el del cuaderno coincidan:
 * - Con todos los árboles (la población) la desviación divide entre n; con una muestra, entre n − 1.
 * - Cuartiles por el método de las mitades (la mediana de cada mitad, sin la mediana si n es impar).
 * - Intervalos de la tabla de frecuencias: regla de Sturges con una amplitud "redonda" (1, 2, 2,5 o
 *   5 por una potencia de 10), cerrados a la izquierda; el último incluye el máximo.
 */
export interface Medidas {
  n: number;
  media: number;
  mediana: number;
  minimo: number;
  maximo: number;
  rango: number;
  q1: number;
  q3: number;
  riq: number;
  /** null con un solo dato. */
  desviacion: number | null;
  poblacion: boolean;
}

export interface ClaseFrecuencia {
  desde: number;
  hasta: number;
  marca: number;
  frecuencia: number;
  /** En porcentaje. */
  relativa: number;
  acumulada: number;
}

export interface Regresion {
  a: number;
  b: number;
  r: number;
  r2: number;
}

const ordenar = (valores: number[]) => [...valores].sort((x, y) => x - y);

export function media(valores: number[]) {
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function medianaOrdenada(o: number[]) {
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function mediana(valores: number[]) {
  return medianaOrdenada(ordenar(valores));
}

export function cuartiles(valores: number[]) {
  const o = ordenar(valores);
  if (o.length < 2) return { q1: o[0], q3: o[0] };
  const mitad = Math.floor(o.length / 2);
  return { q1: medianaOrdenada(o.slice(0, mitad)), q3: medianaOrdenada(o.slice(o.length % 2 ? mitad + 1 : mitad)) };
}

export function desviacion(valores: number[], poblacion: boolean) {
  if (valores.length < 2) return null;
  const m = media(valores);
  const suma = valores.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(suma / (poblacion ? valores.length : valores.length - 1));
}

export function medidas(valores: number[], poblacion: boolean): Medidas | null {
  if (!valores.length) return null;
  const o = ordenar(valores);
  const { q1, q3 } = cuartiles(o);
  return {
    n: o.length, media: media(o), mediana: medianaOrdenada(o), minimo: o[0], maximo: o[o.length - 1],
    rango: o[o.length - 1] - o[0], q1, q3, riq: q3 - q1, desviacion: desviacion(o, poblacion), poblacion,
  };
}

/** Amplitud "redonda" mayor o igual a la pedida: 1, 2, 2,5 o 5 por una potencia de 10. */
export function amplitudRedonda(cruda: number) {
  if (!(cruda > 0)) return 1;
  const potencia = 10 ** Math.floor(Math.log10(cruda));
  const paso = [1, 2, 2.5, 5, 10].find((p) => p * potencia >= cruda - 1e-9) ?? 10;
  return paso * potencia;
}

const redondear = (v: number) => Math.round(v * 1e6) / 1e6;

export function tablaFrecuencias(valores: number[]): ClaseFrecuencia[] {
  if (!valores.length) return [];
  const o = ordenar(valores);
  const minimo = o[0];
  const maximo = o[o.length - 1];
  const k = Math.ceil(1 + 3.322 * Math.log10(o.length));
  const amplitud = amplitudRedonda((maximo - minimo) / k || 1);
  const inicio = redondear(Math.floor(minimo / amplitud) * amplitud);
  // Si el máximo cae justo en un límite, queda en el último intervalo, que es cerrado.
  const cantidad = Math.max(1, Math.ceil(redondear((maximo - inicio) / amplitud)));
  const clases: ClaseFrecuencia[] = [];
  let acumulada = 0;
  for (let i = 0; i < cantidad; i += 1) {
    const desde = redondear(inicio + i * amplitud);
    const hasta = redondear(desde + amplitud);
    const ultima = i === cantidad - 1;
    const frecuencia = o.filter((v) => v >= desde && (ultima ? v <= hasta : v < hasta)).length;
    acumulada += frecuencia;
    clases.push({ desde, hasta, marca: redondear((desde + hasta) / 2), frecuencia, relativa: (100 * frecuencia) / o.length, acumulada });
  }
  return clases;
}

/** Clase(s) con la mayor frecuencia. */
export function clasesModales(tabla: ClaseFrecuencia[]) {
  const mayor = Math.max(0, ...tabla.map((c) => c.frecuencia));
  return mayor ? tabla.filter((c) => c.frecuencia === mayor) : [];
}

/** Recta de mínimos cuadrados y = a + b·x y coeficiente de correlación de Pearson. */
export function regresion(x: number[], y: number[]): Regresion | null {
  if (x.length < 3 || x.length !== y.length) return null;
  const mx = media(x);
  const my = media(y);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < x.length; i += 1) {
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  if (sxx === 0 || syy === 0) return null;
  const b = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { a: my - b * mx, b, r, r2: r * r };
}

export function describirCorrelacion(r: number) {
  const fuerza = Math.abs(r) >= 0.7 ? 'fuerte' : Math.abs(r) >= 0.4 ? 'moderada' : Math.abs(r) >= 0.2 ? 'débil' : 'muy débil o nula';
  if (fuerza === 'muy débil o nula') return 'Relación muy débil o nula';
  return `Relación ${r > 0 ? 'positiva' : 'negativa'} ${fuerza}`;
}

/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da la misma muestra. */
function generador(semilla: number) {
  let t = semilla >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Muestra aleatoria simple sin reemplazo; conserva el orden original de los datos. */
export function muestraAleatoria<T>(items: T[], n: number, semilla: number): T[] {
  if (n >= items.length) return items;
  const azar = generador(semilla);
  const indices = items.map((_, i) => i);
  for (let i = 0; i < n; i += 1) {
    const j = i + Math.floor(azar() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, n).sort((a, b) => a - b).map((i) => items[i]);
}
