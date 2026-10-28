import { describe, expect, it } from '@jest/globals';

import { abreAlerta, evaluarTamizaje, TAMIZAJE_INICIAL, type CategoriaRiesgo, type Tamizaje } from '@/features/riesgo/reglas';
import { tamizajeSchema } from '@/features/riesgo/schemas';

const t = (cambios: Partial<Tamizaje>): Tamizaje => ({ ...TAMIZAJE_INICIAL, ...cambios });

// Mismos casos que backend/tests/test_riesgo.py: las dos reglas deben dar lo mismo.
describe('evaluarTamizaje (igual que el servidor)', () => {
  const casos: [Tamizaje, CategoriaRiesgo][] = [
    [t({ debajo: ['recreo'] }), 'bajo'],
    [t({ ramas_secas: 'pequenas', debajo: ['recreo'] }), 'medio'],
    [t({ ramas_secas: 'pequenas', debajo: ['poco_uso'] }), 'bajo'],
    [t({ hongos: 'en_tronco_o_base', debajo: ['cancha'] }), 'alto'],
    [t({ hongos: 'en_tronco_o_base', debajo: ['poco_uso'] }), 'medio'],
    [t({ hongos: 'en_tronco_o_base', debajo: ['cerrada'] }), 'bajo'],
    [t({ grietas: 'abriendose', debajo: ['aulas'] }), 'inminente'],
    [t({ inclinacion: 'reciente', debajo: ['poco_uso'] }), 'alto'],
    [t({ inclinacion: 'reciente', debajo: ['cerrada'] }), 'medio'],
    [t({ raices: 'expuestas', ramas_secas: 'colgando', debajo: ['cerrada', 'via'] }), 'inminente'],
  ];
  it.each(casos)('%# → %s', (respuestas, categoria) => {
    expect(evaluarTamizaje(respuestas).categoria).toBe(categoria);
  });

  it('explica los motivos en el mismo orden que el servidor', () => {
    const r = evaluarTamizaje(t({ ramas_secas: 'grandes', hongos: 'en_ramas', debajo: ['recreo', 'cables'] }));
    expect(r).toMatchObject({ probabilidad: 'probable', ocupacion: 'constante', categoria: 'alto' });
    expect(r.motivos).toEqual(['Ramas secas gruesas', 'Hongos en ramas', 'Debajo: cables eléctricos, zona de recreo o de descanso']);
    expect(r.accion).toContain('visita técnica');
  });

  it('un árbol pequeño baja un nivel', () => {
    const respuestas = t({ ramas_secas: 'colgando', debajo: ['recreo'] });
    expect(evaluarTamizaje(respuestas, 2.5, 8).categoria).toBe('alto');
    expect(evaluarTamizaje(respuestas, 2.5, 30).categoria).toBe('inminente');
    expect(evaluarTamizaje(t({ debajo: ['recreo'] }), 1, 1).categoria).toBe('bajo');
  });

  it('solo alto e inminente abren alerta', () => {
    expect([abreAlerta('bajo'), abreAlerta('medio'), abreAlerta('alto'), abreAlerta('inminente'), abreAlerta(null)]).toEqual([
      false, false, true, true, false,
    ]);
  });
});

describe('tamizajeSchema', () => {
  it('exige indicar qué hay debajo y no acepta campos de más', () => {
    expect(tamizajeSchema.safeParse(t({ debajo: ['recreo'] })).success).toBe(true);
    expect(tamizajeSchema.safeParse(t({})).success).toBe(false);
    expect(tamizajeSchema.safeParse({ ...t({ debajo: ['recreo'] }), categoria: 'bajo' }).success).toBe(false);
  });
});
