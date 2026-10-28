/** UUID v4 para identificar en el servidor lo que se registra en el teléfono (id_cliente).
 *  Usa crypto cuando el motor lo trae (web, Hermes reciente) y si no, Math.random: no protege
 *  nada secreto, solo evita que dos registros coincidan. */
export function nuevoId(): string {
  const cripto = (globalThis as { crypto?: Partial<Crypto> }).crypto;
  if (typeof cripto?.randomUUID === 'function') return cripto.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cripto?.getRandomValues === 'function') {
    cripto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
