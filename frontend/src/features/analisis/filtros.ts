import type { Analisis, ArbolAnalisis, HallazgoAnalisis, InspeccionAnalisis, IntervencionAnalisis } from '@/features/analisis/schemas';

/**
 * Filtros cruzados del tablero de Análisis, como en Power BI: al tocar una barra o una porción se
 * filtra todo lo demás. Cada gráfico se calcula con todos los filtros menos el suyo, para que siga
 * mostrando las otras categorías (atenuadas) y se pueda cambiar de selección.
 *
 * - Los filtros de árbol (estado, zona, especie, origen, sede, clase de DAP, interferencia) también
 *   filtran las inspecciones, hallazgos e intervenciones de esos árboles.
 * - Mes y curso filtran inspecciones y hallazgos; tipo filtra intervenciones.
 */
export const DIMENSIONES = ['estado', 'zona', 'especie', 'origen', 'sede', 'clase_dap', 'interferencia', 'mes', 'curso', 'tipo'] as const;
export type Dimension = (typeof DIMENSIONES)[number];
export type Filtros = Partial<Record<Dimension, string>>;

export const ETIQUETA_DIMENSION: Record<Dimension, string> = {
  estado: 'Estado',
  zona: 'Zona',
  especie: 'Especie',
  origen: 'Origen',
  sede: 'Sede',
  clase_dap: 'Diámetro',
  interferencia: 'Interferencia',
  mes: 'Mes',
  curso: 'Curso',
  tipo: 'Intervención',
};

export const PERIODOS = [
  { valor: '30', etiqueta: '30 días', dias: 30 },
  { valor: '90', etiqueta: '90 días', dias: 90 },
  { valor: '365', etiqueta: '12 meses', dias: 365 },
  { valor: 'todo', etiqueta: 'Todo', dias: null },
] as const;
export type Periodo = (typeof PERIODOS)[number]['valor'];

export const ESTADOS = ['Sano', 'En riesgo', 'Crítico'] as const;
export const COLOR_ESTADO: Record<string, string> = { Sano: '#1BAF7A', 'En riesgo': '#EDA100', Crítico: '#D7263D' };
export const COLOR_REVISION: Record<string, string> = { Confirmada: '#166534', Pendiente: '#F59E0B' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const DE_ARBOL: Dimension[] = ['estado', 'zona', 'especie', 'origen', 'sede', 'clase_dap', 'interferencia'];

export function valorArbol(a: ArbolAnalisis, d: Dimension): string | undefined {
  switch (d) {
    case 'estado': return a.estado;
    case 'zona': return a.zona ?? 'Sin zona';
    case 'especie': return a.especie ?? 'Sin especie';
    case 'origen': return a.origen;
    case 'sede': return a.sede_id;
    case 'clase_dap': return a.clase_dap ?? 'Sin medida';
    case 'interferencia': return a.interferencia ?? 'Sin dato';
    default: return undefined;
  }
}

export function filtrarArboles(arboles: ArbolAnalisis[], f: Filtros, excepto?: Dimension) {
  const activos = DE_ARBOL.filter((d) => d !== excepto && f[d] !== undefined);
  if (!activos.length) return arboles;
  return arboles.filter((a) => activos.every((d) => valorArbol(a, d) === f[d]));
}

/** 'AAAA-MM-DD' de hace `dias` días contando desde `hoy` (también 'AAAA-MM-DD'). */
export function restarDias(hoy: string, dias: number) {
  const [y, m, d] = hoy.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10);
}

export function desdeDelPeriodo(hoy: string, periodo: Periodo) {
  const p = PERIODOS.find((x) => x.valor === periodo);
  return p?.dias == null ? undefined : restarDias(hoy, p.dias);
}

const mesDe = (fecha: string | null) => (fecha ? fecha.slice(0, 7) : undefined);

export function etiquetaMes(clave: string) {
  const [y, m] = clave.split('-');
  return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
}

/** Inspecciones de los árboles filtrados, del periodo (o del mes elegido) y del curso elegido.
 *  Con `excepto = 'mes'` no se mira la fecha: el gráfico por mes muestra sus propios 12 meses. */
export function filtrarInspecciones(
  inspecciones: InspeccionAnalisis[], ids: Set<string>, f: Filtros, desde: string | undefined, excepto?: Dimension,
) {
  return inspecciones.filter((i) => {
    if (!ids.has(i.arbol_id)) return false;
    if (excepto !== 'curso' && f.curso !== undefined && i.curso !== f.curso) return false;
    if (excepto === 'mes') return true;
    if (f.mes !== undefined) return mesDe(i.fecha) === f.mes;
    return !desde || (i.fecha ?? '') >= desde;
  });
}

export function filtrarHallazgos(hallazgos: HallazgoAnalisis[], ids: Set<string>, f: Filtros, desde: string | undefined) {
  return hallazgos.filter((h) => !h.anulada && ids.has(h.arbol_id)
    && (f.mes === undefined ? !desde || (h.fecha ?? '') >= desde : mesDe(h.fecha) === f.mes));
}

export function filtrarIntervenciones(
  intervenciones: IntervencionAnalisis[], ids: Set<string>, f: Filtros, desde: string | undefined, excepto?: Dimension,
) {
  return intervenciones.filter((v) => ids.has(v.arbol_id)
    && (excepto === 'tipo' || f.tipo === undefined || (v.tipo ?? 'Sin tipo') === f.tipo)
    // Las programadas siguen contando aunque su fecha sea anterior al periodo: siguen pendientes.
    && (!desde || v.estado === 'Programada' || (v.fecha ?? '') >= desde));
}

export interface Item {
  clave: string;
  etiqueta: string;
  valor: number;
}

/** Conteo (o suma) por categoría, de mayor a menor. Más de `maximo` categorías se juntan en "Otras". */
export function agrupar<T>(
  filas: T[], clave: (fila: T) => string | null | undefined, { valor, maximo, otras = 'Otras', etiqueta }: {
    valor?: (fila: T) => number; maximo?: number; otras?: string; etiqueta?: (clave: string) => string;
  } = {},
): Item[] {
  const totales = new Map<string, number>();
  for (const fila of filas) {
    const k = clave(fila);
    if (k == null) continue;
    totales.set(k, (totales.get(k) ?? 0) + (valor ? valor(fila) : 1));
  }
  const items = [...totales.entries()]
    .map(([k, v]) => ({ clave: k, etiqueta: etiqueta ? etiqueta(k) : k, valor: v }))
    .sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta, 'es'));
  if (!maximo || items.length <= maximo) return items;
  const resto = items.slice(maximo - 1).reduce((s, i) => s + i.valor, 0);
  return [...items.slice(0, maximo - 1), { clave: '__otras__', etiqueta: otras, valor: resto }];
}

/** Últimos `cantidad` meses hasta el de `hoy`, con las inspecciones no anuladas de cada uno. */
export function porMes(inspecciones: InspeccionAnalisis[], hoy: string, cantidad = 12) {
  const [y, m] = hoy.split('-').map(Number);
  const meses: string[] = [];
  for (let i = cantidad - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    meses.push(d.toISOString().slice(0, 7));
  }
  return meses.map((clave) => {
    const delMes = inspecciones.filter((i) => mesDe(i.fecha) === clave && i.revision !== 'Anulada');
    return {
      clave,
      etiqueta: etiquetaMes(clave),
      confirmadas: delMes.filter((i) => i.revision === 'Confirmada').length,
      pendientes: delMes.filter((i) => i.revision === 'Pendiente').length,
    };
  });
}

const suma = (valores: (number | null)[]) => valores.reduce<number>((s, v) => s + (v ?? 0), 0);
function promedio(valores: (number | null)[]) {
  const ok = valores.filter((v): v is number => v != null);
  return ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
}
const pct = (parte: number, total: number) => (total ? (parte * 100) / total : null);

export function indicadores(arboles: ArbolAnalisis[], inspecciones: InspeccionAnalisis[], intervenciones: IntervencionAnalisis[]) {
  const cuenta = (e: string) => arboles.filter((a) => a.estado === e).length;
  const clasificadas = arboles.filter((a) => a.origen === 'Nativa' || a.origen === 'Exótica');
  const validas = inspecciones.filter((i) => i.revision !== 'Anulada');
  const ejecutadas = intervenciones.filter((v) => v.estado === 'Ejecutada');
  const programadas = intervenciones.filter((v) => v.estado === 'Programada');
  const confirmadas = inspecciones.filter((i) => i.revision === 'Confirmada').length;
  const anuladas = inspecciones.filter((i) => i.revision === 'Anulada').length;
  return {
    total: arboles.length,
    sanos: cuenta('Sano'),
    riesgo: cuenta('En riesgo'),
    criticos: cuenta('Crítico'),
    pctRiesgo: pct(cuenta('En riesgo') + cuenta('Crítico'), arboles.length),
    prioritarios: arboles.filter((a) => a.prioritario).length,
    sinRevisita: arboles.filter((a) => a.revisita_pendiente).length,
    especies: new Set(arboles.map((a) => a.especie).filter(Boolean)).size,
    pctNativas: pct(clasificadas.filter((a) => a.origen === 'Nativa').length, clasificadas.length),
    co2T: suma(arboles.map((a) => a.co2_kg)) / 1000,
    biomasaT: suma(arboles.map((a) => a.biomasa_kg)) / 1000,
    carbonoT: suma(arboles.map((a) => a.carbono_kg)) / 1000,
    areaCopa: suma(arboles.map((a) => a.area_copa)),
    dap: promedio(arboles.map((a) => a.dap)),
    altura: promedio(arboles.map((a) => a.altura)),
    copa: promedio(arboles.map((a) => a.copa)),
    puntaje: promedio(arboles.map((a) => a.puntaje)),
    inspecciones: inspecciones.length,
    confirmadas,
    pendientes: inspecciones.filter((i) => i.revision === 'Pendiente').length,
    anuladas,
    pctRevisadas: pct(confirmadas + anuladas, inspecciones.length),
    horasRevision: promedio(inspecciones.map((i) => i.horas_revision)),
    cobertura: pct(new Set(validas.map((i) => i.arbol_id)).size, arboles.length),
    ejecutadas: ejecutadas.length,
    programadas: programadas.length,
    vencidas: intervenciones.filter((v) => v.vencida).length,
    costoEjecutado: suma(ejecutadas.map((v) => v.costo_real)),
    costoProgramado: suma(programadas.map((v) => v.costo_estimado)),
    eficacia: pct(ejecutadas.filter((v) => v.resultado === 'Exitosa').length, ejecutadas.length),
  };
}
export type Indicadores = ReturnType<typeof indicadores>;

/** Diferencia entre dos cargas de datos, para avisar lo que llegó mientras la pantalla estaba abierta. */
export function novedades(antes: Analisis | undefined, ahora: Analisis | undefined) {
  if (!antes || !ahora) return [];
  const cambios: string[] = [];
  const dif = (n: number, uno: string, varios: string) => {
    if (n > 0) cambios.push(`${n} ${n === 1 ? uno : varios}`);
  };
  dif(ahora.arboles.length - antes.arboles.length, 'árbol nuevo', 'árboles nuevos');
  dif(ahora.inspecciones.length - antes.inspecciones.length, 'inspección nueva', 'inspecciones nuevas');
  dif(ahora.intervenciones.length - antes.intervenciones.length, 'intervención nueva', 'intervenciones nuevas');
  const confirmadas = (d: Analisis) => d.inspecciones.filter((i) => i.revision === 'Confirmada').length;
  dif(confirmadas(ahora) - confirmadas(antes), 'inspección revisada', 'inspecciones revisadas');
  return cambios;
}
