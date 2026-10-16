/**
 * Busca la opción elegida comparando como texto: en web el <select> siempre entrega strings,
 * aunque las opciones tengan valores numéricos (por ejemplo, el id de la especie).
 */
export function findOption<O extends { value: string | number }>(options: O[], next: unknown): O | undefined {
  return options.find((option) => String(option.value) === String(next));
}

/** Deja solo dígitos y un separador decimal; acepta coma o punto. */
export function sanitizeDecimal(text: string): string {
  const [entero, ...decimales] = text.replace(/,/g, '.').replace(/[^0-9.]/g, '').split('.');
  return decimales.length === 0 ? entero : `${entero}.${decimales.join('')}`;
}

/** Convierte el texto ya saneado; vacío (o solo ".") queda sin valor en lugar de convertirse en cero. */
export function parseDecimal(text: string): number | undefined {
  if (text === '' || text === '.') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}
