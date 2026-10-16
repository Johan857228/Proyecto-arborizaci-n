import { z } from 'zod';

// Mensajes de Zod en español para los errores que no tienen un texto propio.
z.config(z.locales.es());

/** Número escrito por la persona: vacío (undefined) o texto inválido (NaN) muestran un
 *  mensaje claro en lugar del genérico. */
export function numero(mensaje = 'Escribe un número válido.') {
  return z.number({ error: mensaje });
}

/** Fecha AAAA-MM-DD que existe en el calendario. */
export const fechaIso = z
  .string({ error: 'Escribe la fecha.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.')
  .refine((valor) => {
    const [anio, mes, dia] = valor.split('-').map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
  }, 'Esa fecha no existe.');

/** Texto opcional: se recorta y, si queda vacío, no se envía. */
export function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, `Máximo ${maximo} caracteres.`)
    .optional()
    .transform((valor) => (valor ? valor : undefined));
}

/** Identificador UUID devuelto por la API. */
export const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, 'Identificador inválido.');
