import { describe, expect, it } from '@jest/globals';

import type { Catalogos } from '@/features/catalogs/types';
import { analisisIASchema, type AnalisisIA } from '@/features/ia/schemas';
import { combinarValor, sugerenciasDeAnalisis } from '@/features/ia/sugerencias';

const catalogos: Catalogos = {
  especies: [{ id: 1, nombre_comun: 'Mango', nombre_cientifico: 'Mangifera indica' }],
  instituciones: [],
  observaciones: [{ codigo: 'f_manchas', grupo: 'follaje', etiqueta: 'Manchas en hojas', orden: 1 }],
};

// Respuesta tal como la envía POST /ia/analizar-foto.
const respuesta = {
  es_arbol: true,
  calidad_foto: 'buena',
  resumen: 'Mango adulto con manchas en las hojas.',
  especie: { especie_id: 1, nombre_probable: null, confianza: 'alta', razon: 'Hojas lanceoladas.' },
  etapa: { valor: 'Adulto', confianza: 'media', razon: 'Copa desarrollada.' },
  interferencia: { valor: 'Ninguna', confianza: 'alta', razon: 'No se ve infraestructura.' },
  observaciones: [
    { codigo: 'f_manchas', confianza: 'media', razon: 'Manchas oscuras.' },
    { codigo: 'no_existe', confianza: 'alta', razon: 'Fuera del catálogo.' },
  ],
  insectos: { tipo: 'chupadores', parte: 'hojas', severidad: 2, confianza: 'baja', razon: 'Hojas enrolladas.' },
  enfermedad: null,
  hemiparasitas: { tipo: 'pajarito', pct_copa: 12.5, confianza: 'media', razon: 'Matas con flores rojas.' },
  bejucos: null,
  epifitas: { tipos: ['bromelias'], confianza: 'alta', razon: 'Bromelias en las ramas.' },
  modelo: 'claude-opus-5-5',
};

function analisis(cambios: Partial<AnalisisIA> = {}): AnalisisIA {
  return analisisIASchema.parse({ ...respuesta, ...cambios });
}

describe('analisisIASchema', () => {
  it('acepta la respuesta del backend y rechaza valores fuera de escala', () => {
    expect(analisisIASchema.safeParse(respuesta).success).toBe(true);
    const fuera = { ...respuesta, insectos: { ...respuesta.insectos, severidad: 7 } };
    expect(analisisIASchema.safeParse(fuera).success).toBe(false);
  });
});

describe('sugerenciasDeAnalisis', () => {
  it('arma las sugerencias en el orden del formulario con los campos que llenan', () => {
    const sugerencias = sugerenciasDeAnalisis(analisis(), catalogos);
    expect(sugerencias.map((s) => s.id)).toEqual(['especie', 'etapa', 'interferencia', 'obs:f_manchas', 'insectos', 'hemiparasitas', 'epifitas']);
    expect(sugerencias[0]).toMatchObject({ valor: 'Mango (Mangifera indica)', valores: { especie_id: 1 } });
    expect(sugerencias.find((s) => s.id === 'insectos')).toMatchObject({
      valor: 'Chupadores en hojas · severidad 2 (moderada)',
      valores: { insectos: 'chupadores', insectos_parte: 'hojas', insectos_sev: 2 },
    });
    expect(sugerencias.find((s) => s.id === 'hemiparasitas')?.valor).toContain('12,5 % de la copa');
  });

  it('muestra como informativa una especie que no está en el catálogo', () => {
    const [especie] = sugerenciasDeAnalisis(
      analisis({ especie: { especie_id: null, nombre_probable: 'Guayacán', confianza: 'baja', razon: 'Flores amarillas.' } }),
      catalogos,
    );
    expect(especie).toMatchObject({ campo: 'Especie (no está en el catálogo)', valor: 'Guayacán', valores: null });
  });

  it('no sugiere nada si las fotos no muestran un árbol', () => {
    expect(sugerenciasDeAnalisis(analisis({ es_arbol: false }), catalogos)).toEqual([]);
  });
});

describe('combinarValor', () => {
  it('suma las listas sin repetir y reemplaza los demás valores', () => {
    expect(combinarValor(['f_manchas'], ['f_manchas', 't_grietas'])).toEqual(['f_manchas', 't_grietas']);
    expect(combinarValor('Juvenil', 'Adulto')).toBe('Adulto');
  });
});
