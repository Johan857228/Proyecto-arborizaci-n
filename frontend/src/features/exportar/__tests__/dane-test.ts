import { describe, expect, it } from '@jest/globals';
import { daneSchema } from '@/features/exportar/api';

describe('daneSchema (códigos de la sede)', () => {
  it('acepta códigos completos o vacíos (para quitarlos)', () => {
    expect(daneSchema.safeParse({ codigo_dane: '120001000123', divipola: '20001', municipio: 'Valledupar' }).success).toBe(true);
    expect(daneSchema.safeParse({ codigo_dane: '', divipola: '', municipio: '' }).success).toBe(true);
  });

  it('rechaza longitudes o caracteres que no corresponden', () => {
    expect(daneSchema.safeParse({ codigo_dane: '12000100012', divipola: '', municipio: '' }).success).toBe(false);
    expect(daneSchema.safeParse({ codigo_dane: '', divipola: '2000', municipio: '' }).success).toBe(false);
    expect(daneSchema.safeParse({ codigo_dane: '', divipola: '', municipio: 'V' }).success).toBe(false);
  });
});
