import { describe, expect, it } from '@jest/globals';

import { avisosDeSiembra, catalogoSchema, filtrarEspecies, ordenDeConsulta, type EspecieCatalogo } from '@/features/especies/schemas';
import { formatUsd, precisionSchema, textoTasa } from '@/features/ia/precision';
import { modulosPara } from '@/features/modules/modulos';
import type { MiPerfil } from '@/features/perfil/schemas';
import { arbolCreatePayloadSchema } from '@/features/trees/schemas';

const FUENTE = { clave: 'catalogo', titulo: 'Catálogo de Plantas y Líquenes de Colombia', editor: 'Universidad Nacional de Colombia',
  version: '1.3', doi: '10.15472/7avdhn', publicado: '2023-09-11', encontrada: true, registro_url: 'https://www.gbif.org/species/166200062',
  dato: 'Nativa; registrada en 17 departamentos (incluido Cesar).' };

const FICHA = {
  nombre_consultado: 'Tabebuia rosea', nombre_aceptado: 'Tabebuia rosea', coincidencia: 'exacta' as const, en_catalogo: true,
  departamentos: ['Cesar'], en_cesar: true, forma_de_vida: 'Árbol', origen: 'nativa' as const, estatus: null, invasora: false,
  riesgo_invasion: null, amenaza: null, bosque_seco: true, bosque_seco_cesar: true, avisos: [], fuentes: [FUENTE],
  consultado_en: '2026-10-28T10:00:00-05:00', veda: null, veda_url: null, veda_registrada_en: null,
};

function especie(id: number, nombre: string, cambios: Partial<EspecieCatalogo> = {}): EspecieCatalogo {
  return { id, nombre_comun: nombre, nombre_cientifico: null, origen: null, origen_fuente: null, arboles: 0, ficha: null, ...cambios };
}

const ESPECIES = [
  especie(1, 'Mango', { nombre_cientifico: 'Mangifera indica', origen: 'exotica', origen_fuente: 'app', arboles: 12 }),
  especie(2, 'Roble morado', { nombre_cientifico: 'Tabebuia rosea', origen: 'nativa', origen_fuente: 'oficial', arboles: 4, ficha: FICHA }),
  especie(3, 'Caoba', { nombre_cientifico: 'Swietenia macrophylla', origen: 'nativa', arboles: 1,
    ficha: { ...FICHA, bosque_seco_cesar: false, amenaza: 'CR', veda: 'Resolución 0316 de 1974' } }),
  especie(4, 'Retamo espinoso', { nombre_cientifico: 'Ulex europaeus', origen: 'exotica', ficha: { ...FICHA, origen: 'exotica', invasora: true, bosque_seco_cesar: false } }),
];

function perfil(rol: MiPerfil['rol']): MiPerfil {
  return { usuario_id: 'u1', nombre: 'Prueba', correo: null, rol, institucion_id: 'sj', curso_id: null, activo: true,
    institucion_nombre: null, curso_nombre: null, foto_url: null, portada_url: null } as MiPerfil;
}

describe('catálogo de especies con fuente oficial', () => {
  it('filtra por categoría oficial y busca sin tildes ni mayúsculas', () => {
    const ids = (filtro: Parameters<typeof filtrarEspecies>[1], texto = '') => filtrarEspecies(ESPECIES, filtro, texto).map((e) => e.id);
    expect(ids('todas')).toEqual([1, 2, 3, 4]);
    expect(ids('nativas')).toEqual([2, 3]);
    expect(ids('bosque_seco')).toEqual([2]);
    expect(ids('amenazadas')).toEqual([3]);
    expect(ids('invasoras')).toEqual([4]);
    expect(ids('veda')).toEqual([3]);
    expect(ids('sin_ficha')).toEqual([1]);
    expect(ids('todas', 'TABEBUIA')).toEqual([2]);
    expect(ids('todas', 'mangó')).toEqual([1]);
  });

  it('consulta primero las especies sin ficha y las más sembradas', () => {
    expect(ordenDeConsulta(ESPECIES).map((e) => e.id)).toEqual([1, 2, 3, 4]);
    expect(ordenDeConsulta([ESPECIES[2], ESPECIES[1], especie(9, 'Ceiba', { arboles: 30 })]).map((e) => e.id)).toEqual([9, 2, 3]);
  });

  it('avisa al sembrar una invasora, una amenazada o una en veda', () => {
    expect(avisosDeSiembra(undefined)).toEqual([]);
    expect(avisosDeSiembra({ invasora: false, amenaza: null, en_veda: false })).toEqual([]);
    const avisos = avisosDeSiembra({ invasora: true, amenaza: 'VU', en_veda: true });
    expect(avisos.map((a) => a.tono)).toEqual(['error', 'info', 'warning']);
    expect(avisos[1].texto).toContain('vulnerable');
  });

  it('acepta la respuesta del backend', () => {
    const catalogo = {
      especies: ESPECIES,
      resumen: { especies: 4, con_ficha: 3, nativas: 2, exoticas: 2, invasoras: 1, amenazadas: 1, en_veda: 1, bosque_seco_cesar: 1,
        arboles: 17, pct_arboles_nativos: 29.4, arboles_bosque_seco_cesar: 4, arboles_invasoras: 0 },
      listas: [{ clave: 'catalogo', titulo: FUENTE.titulo, editor: FUENTE.editor }],
      editable: true, migracion_pendiente: false,
    };
    expect(catalogoSchema.safeParse(catalogo).success).toBe(true);
    const mala = { ...catalogo, especies: [{ ...ESPECIES[1], ficha: { ...FICHA, amenaza: 'LC' } }] };
    expect(catalogoSchema.safeParse(mala).success).toBe(false);
  });

  it('todos ven el catálogo; la precisión de la IA es solo del administrador', () => {
    for (const rol of ['estudiante', 'docente', 'administrador'] as const) {
      expect(modulosPara(perfil(rol)).some((m) => m.clave === 'especies')).toBe(true);
    }
    expect(modulosPara(perfil('administrador')).some((m) => m.clave === 'precision_ia')).toBe(true);
    expect(modulosPara(perfil('docente')).some((m) => m.clave === 'precision_ia')).toBe(false);
    expect(modulosPara(perfil('territorial')).map((m) => m.clave)).toEqual(['territorial']);
  });
});

describe('precisión y costo de la IA', () => {
  const tasa = (aciertos: number, n: number, ic95: [number, number] | null = null) =>
    ({ n, aciertos, pct: n ? Math.round((1000 * aciertos) / n) / 10 : null, ic95 });

  it('muestra el porcentaje con su intervalo y el costo sin redondear a cero', () => {
    expect(textoTasa(tasa(8, 10, [49, 94.3]))).toBe('80 % (IC 95 %: 49–94 %)');
    expect(textoTasa(tasa(0, 0))).toBe('—');
    expect(formatUsd(0.03)).toBe('US$0,03');
    expect(formatUsd(0.00316)).toBe('US$0,0032');
    expect(formatUsd(12.5)).toBe('US$12,50');
    expect(formatUsd(null)).toBe('—');
  });

  it('acepta la respuesta del backend', () => {
    const t = tasa(2, 3, [20.8, 93.9]);
    const respuesta = {
      desde: null, modelo_actual: 'claude-opus-5-5', tarifa: '2026-10', general: t, muestra_pequena: true, muestra_minima: 30,
      cobertura: tasa(3, 3), al_sugerir: t, por_tipo: { campo: tasa(1, 1), prueba: tasa(1, 2) },
      por_confianza: { alta: t, media: tasa(0, 0), baja: tasa(0, 0) }, por_origen: { nativa: tasa(0, 1), exotica: tasa(2, 2) },
      bosque_seco_cesar: { ...tasa(0, 1), especies: 1 },
      por_especie: [{ ...tasa(2, 2), especie_id: 1, nombre_comun: 'Mango', nombre_cientifico: 'Mangifera indica', origen: 'exotica', bosque_seco_cesar: false }],
      confusiones: [{ real: 'Roble morado', sugerida: 'Mango', veces: 1 }],
      fuera: { sin_arbol: 0, por_revisar: 1, anulados: 0, sin_especie: 0 },
      costo: { analisis: 3, fotos: 3, sin_precio: 0, total_usd: 0.09, por_analisis_usd: 0.03, por_foto_usd: 0.03, trm: 4000,
        por_foto_cop: 120, total_cop: 360, tokens_entrada_promedio: 3000, tokens_salida_promedio: 900, duracion_mediana_s: 4,
        por_modelo: [{ modelo: 'claude-opus-5-5', analisis: 3, total_usd: 0.09 }] },
    };
    expect(precisionSchema.safeParse(respuesta).success).toBe(true);
  });

  it('el registro del árbol lleva el análisis de la IA solo si es un id válido', () => {
    const arbol = { institucion_id: 'sj', zona: 'Patio central', lat: 10.46, lng: -73.25, especie_id: 1, dap_cm: 30, altura_m: 8,
      copa_m: 4, etapa: 'Adulto', interferencia: 'Ninguna', observaciones: [] };
    expect(arbolCreatePayloadSchema.safeParse(arbol).success).toBe(true);
    expect(arbolCreatePayloadSchema.safeParse({ ...arbol, ia_analisis_id: '8d5f2c3e-1b4a-4c6d-9e8f-0a1b2c3d4e5f' }).success).toBe(true);
    expect(arbolCreatePayloadSchema.safeParse({ ...arbol, ia_analisis_id: 'id-nuevo' }).success).toBe(false);
  });
});
