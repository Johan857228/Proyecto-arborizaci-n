import { describe, expect, it } from '@jest/globals';

import type { Catalogos } from '@/features/catalogs/types';
import { payloadBiotico, resumenBiotico, valoresBioticosIniciales } from '@/features/inspections/bioticos';
import { crearInspeccionFormSchema, inspeccionPayloadSchema } from '@/features/inspections/schemas';
import { arbolCreatePayloadSchema } from '@/features/trees/schemas';

const catalogos: Catalogos = {
  especies: [{ id: 1, nombre_comun: 'Mango', nombre_cientifico: 'Mangifera indica' }],
  instituciones: [{ id: 'sj', nombre: 'IE San José', nombre_corto: 'San José', prefijo: 'IE001', lat: 10.46, lng: -73.25 }],
  observaciones: [{ codigo: 'f_manchas', grupo: 'follaje', etiqueta: 'Manchas', orden: 1 }],
};

const visita = {
  gps_confirmado: false, lat: null, lng: null, precision_gps_m: null, dap_cm: 35, altura_m: 8, copa_m: 4,
  etapa: 'Adulto', interferencia: 'Ninguna', interferencia_otra: '', observaciones: [], notas: '',
  ...valoresBioticosIniciales,
};

const mensaje = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, campo: string) =>
  r.error?.issues.find((issue) => issue.path[0] === campo)?.message;

describe('agentes bióticos en el formulario de inspección', () => {
  const schema = crearInspeccionFormSchema(catalogos);

  it('una visita sin agentes es válida', () => {
    expect(schema.safeParse(visita).success).toBe(true);
  });

  it('si se marca un insecto o una enfermedad, pide la parte afectada y la severidad', () => {
    const r = schema.safeParse({ ...visita, insectos: 'arrieras' });
    expect(mensaje(r, 'insectos_parte')).toBe('Indica la parte afectada.');
    expect(mensaje(r, 'insectos_sev')).toBe('Elige la severidad.');
    expect(schema.safeParse({ ...visita, enfermedad: 'fungica', enfermedad_parte: 'hojas', enfermedad_sev: 2 }).success).toBe(true);
  });

  it('la muestra de laboratorio necesita un código sin espacios', () => {
    expect(mensaje(schema.safeParse({ ...visita, muestra_lab: true }), 'cod_muestra_lab')).toBe('Escribe el código con que rotulaste la muestra.');
    expect(mensaje(schema.safeParse({ ...visita, muestra_lab: true, cod_muestra_lab: 'IE 001' }), 'cod_muestra_lab'))
      .toBe('Usa de 3 a 40 letras, números o guiones, sin espacios.');
    expect(schema.safeParse({ ...visita, muestra_lab: true, cod_muestra_lab: 'IE001-0003-M1' }).success).toBe(true);
  });

  it('las hemiparásitas necesitan el porcentaje de copa, de 1 a 100', () => {
    expect(mensaje(schema.safeParse({ ...visita, hemiparasitas: 'pajarito' }), 'pct_hemiparasitas')).toBe('Indica qué porcentaje de la copa cubren.');
    expect(schema.safeParse({ ...visita, hemiparasitas: 'cuscuta', pct_hemiparasitas: 120 }).success).toBe(false);
    expect(schema.safeParse({ ...visita, hemiparasitas: 'cuscuta', pct_hemiparasitas: 30 }).success).toBe(true);
  });
});

describe('envío de los agentes', () => {
  it('no manda la parte, la severidad ni el código de un agente que no se marcó', () => {
    const p = payloadBiotico({ ...valoresBioticosIniciales, insectos_parte: 'hojas', insectos_sev: 3, cod_muestra_lab: 'x', bejucos: 2, epifitas: ['musgos', 'bromelias', 'musgos'] });
    expect(p).toMatchObject({ insectos: null, insectos_parte: null, insectos_sev: null, cod_muestra_lab: null, bejucos: 2 });
    expect(p.epifitas).toEqual(['bromelias', 'musgos']);
    expect(payloadBiotico({ ...valoresBioticosIniciales, muestra_lab: true, cod_muestra_lab: ' ie001-0001-m1 ' }).cod_muestra_lab).toBe('IE001-0001-M1');
    expect(inspeccionPayloadSchema.safeParse({
      lat: null, lng: null, precision_gps_m: null, dap_cm: 30, altura_m: 8, copa_m: 4, etapa: 'Adulto', interferencia: 'Ninguna',
      interferencia_otra: null, observaciones: [], notas: null, ...p,
    }).success).toBe(true);
  });

  it('el registro del árbol acepta los agentes y los valida igual', () => {
    const arbol = {
      institucion_id: 'sj', zona: 'Patio central', lat: 10.46, lng: -73.25, especie_id: 1, dap_cm: 30, altura_m: 8, copa_m: 4,
      etapa: 'Adulto', interferencia: 'Ninguna', observaciones: [],
    };
    expect(arbolCreatePayloadSchema.safeParse(arbol).success).toBe(true);
    expect(arbolCreatePayloadSchema.safeParse({ ...arbol, enfermedad: 'viral' }).success).toBe(false);
    expect(arbolCreatePayloadSchema.safeParse({ ...arbol, epifitas: ['orquideas'], bejucos: 1 }).success).toBe(true);
    // lo que arma el formulario para la API (con nulos en lo que no se marcó) también pasa la revisión previa
    const conAgentes = { ...arbol, ...payloadBiotico({ ...valoresBioticosIniciales, insectos: 'chupadores', insectos_parte: 'hojas', insectos_sev: 2, muestra_lab: true, cod_muestra_lab: 'IE001-M1' }) };
    expect(arbolCreatePayloadSchema.safeParse(conAgentes).success).toBe(true);
    expect(arbolCreatePayloadSchema.safeParse({ ...arbol, ...payloadBiotico(valoresBioticosIniciales) }).success).toBe(true);
  });
});

describe('resumen para el historial y la ficha', () => {
  it('describe solo lo que se registró', () => {
    expect(resumenBiotico({ insectos: null, muestra_lab: false, bejucos: 0, epifitas: [] })).toEqual([]);
    const lineas = resumenBiotico({
      insectos: 'chupadores', insectos_parte: 'hojas', insectos_sev: 2, hemiparasitas: 'pajarito', pct_hemiparasitas: 12.5,
      muestra_lab: true, cod_muestra_lab: 'IE001-0003-M1', bejucos: 3, epifitas: ['bromelias', 'liquenes'],
    });
    expect(lineas).toEqual([
      { etiqueta: 'Insectos', valor: 'Chupadores en hojas, severidad 2 (moderada)' },
      { etiqueta: 'Muestra de laboratorio', valor: 'IE001-0003-M1' },
      { etiqueta: 'Hemiparásitas', valor: 'Pajarito o muérdago (Loranthaceae), 12,5 % de la copa' },
      { etiqueta: 'Bejucos', valor: '51 a 75 % del individuo (3)' },
      { etiqueta: 'Epífitas', valor: 'Bromelias, Líquenes' },
    ]);
  });
});
