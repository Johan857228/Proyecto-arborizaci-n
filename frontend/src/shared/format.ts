// Formatos para mostrar datos. Se calculan a mano (sin depender de Intl) para que se vean
// igual en web, Android e iOS. Las fechas se muestran en hora de Colombia (UTC-5).

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const OFFSET_COLOMBIA_MS = -5 * 60 * 60 * 1000;

function separarMiles(entero: string) {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1234567.891 → "1.234.567,89" */
export function formatNumero(valor: number | null | undefined, decimales = 2) {
  if (valor == null || !Number.isFinite(valor)) return '—';
  const negativo = valor < 0;
  const [entero, fraccion] = Math.abs(valor).toFixed(decimales).split('.');
  const limpio = fraccion ? fraccion.replace(/0+$/, '') : '';
  return `${negativo ? '-' : ''}${separarMiles(entero)}${limpio ? `,${limpio}` : ''}`;
}

/** Pesos colombianos sin decimales: "$ 1.250.000" */
export function formatPesos(valor: number | null | undefined) {
  if (valor == null || !Number.isFinite(valor)) return '—';
  return `${valor < 0 ? '-' : ''}$ ${separarMiles(Math.round(Math.abs(valor)).toString())}`;
}

export function formatPorcentaje(valor: number | null | undefined) {
  return valor == null ? '—' : `${formatNumero(valor, 1)} %`;
}

function aColombia(iso: string) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Date(fecha.getTime() + OFFSET_COLOMBIA_MS);
}

/** "2026-10-16T15:04:00Z" → "16 oct 2026" (día en Colombia) */
export function formatFecha(iso: string | null | undefined) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [anio, mes, dia] = iso.split('-').map(Number);
    return `${dia} ${MESES[mes - 1]} ${anio}`;
  }
  const local = aColombia(iso);
  if (!local) return '—';
  return `${local.getUTCDate()} ${MESES[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
}

/** "16 oct 2026, 10:04" */
export function formatFechaHora(iso: string | null | undefined) {
  if (!iso) return '—';
  const local = aColombia(iso);
  if (!local) return '—';
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${formatFecha(iso)}, ${hh}:${mm}`;
}

/** "2026-03" → "mar 2026" */
export function formatMes(mes: string) {
  const [anio, numero] = mes.split('-').map(Number);
  return `${MESES[numero - 1]} ${anio}`;
}

/** Fecha de hoy en Colombia como AAAA-MM-DD. */
export function hoyIso() {
  const local = new Date(Date.now() + OFFSET_COLOMBIA_MS);
  return local.toISOString().slice(0, 10);
}

/** Saludo según la hora en Colombia. */
export function saludo() {
  const hora = new Date(Date.now() + OFFSET_COLOMBIA_MS).getUTCHours();
  if (hora < 5) return 'Buenas noches';
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Convierte lo que escribe la persona en número. Acepta coma decimal. Vacío → undefined;
 *  texto que no es un número → NaN (para que la validación muestre el error). */
export function parsearNumero(texto: string): number | undefined {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return undefined;
  if (!/^-?\d*\.?\d*$/.test(limpio) || limpio === '.' || limpio === '-') return Number.NaN;
  return Number(limpio);
}
