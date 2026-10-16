import type { Catalogos } from '@/features/catalogs/types';
import type { AnalisisIA, Confianza } from '@/features/ia/schemas';
import {
  COBERTURA_BEJUCOS,
  ENFERMEDADES,
  EPIFITAS,
  HEMIPARASITAS,
  INSECTOS,
  PARTES,
  SEVERIDAD,
} from '@/features/inspections/bioticos';
import type { ArbolFormInput } from '@/features/trees/schemas';

/** Una sugerencia lista para mostrar. `valores` son los campos del formulario que se llenan al
 *  aplicarla (las listas se suman a lo ya marcado); null si es solo informativa. */
export interface SugerenciaIA {
  id: string;
  campo: string;
  valor: string;
  confianza: Confianza;
  razon: string;
  valores: Partial<ArbolFormInput> | null;
}

function parteYSeveridad(parte: keyof typeof PARTES, severidad: number) {
  return `en ${PARTES[parte].toLowerCase()} · severidad ${severidad} (${SEVERIDAD[severidad]?.toLowerCase()})`;
}

/** Convierte el análisis de la IA en sugerencias para el formulario de registro, en el orden en
 *  que aparecen los campos. */
export function sugerenciasDeAnalisis(analisis: AnalisisIA, catalogos: Catalogos): SugerenciaIA[] {
  const sugerencias: SugerenciaIA[] = [];
  if (!analisis.es_arbol) return sugerencias;

  const { especie } = analisis;
  const enCatalogo = catalogos.especies.find((item) => item.id === especie.especie_id);
  if (enCatalogo) {
    sugerencias.push({
      id: 'especie',
      campo: 'Especie',
      valor: `${enCatalogo.nombre_comun} (${enCatalogo.nombre_cientifico})`,
      confianza: especie.confianza,
      razon: especie.razon,
      valores: { especie_id: enCatalogo.id },
    });
  } else if (especie.nombre_probable) {
    sugerencias.push({
      id: 'especie',
      campo: 'Especie (no está en el catálogo)',
      valor: especie.nombre_probable,
      confianza: especie.confianza,
      razon: `${especie.razon} Pide al docente que la agregue al catálogo.`,
      valores: null,
    });
  }

  if (analisis.etapa.valor) {
    sugerencias.push({
      id: 'etapa',
      campo: 'Etapa de desarrollo',
      valor: analisis.etapa.valor,
      confianza: analisis.etapa.confianza,
      razon: analisis.etapa.razon,
      valores: { etapa: analisis.etapa.valor },
    });
  }

  if (analisis.interferencia.valor) {
    sugerencias.push({
      id: 'interferencia',
      campo: 'Interferencia',
      valor: analisis.interferencia.valor,
      confianza: analisis.interferencia.confianza,
      razon: analisis.interferencia.razon,
      valores: { interferencia: analisis.interferencia.valor },
    });
  }

  for (const observacion of analisis.observaciones) {
    const item = catalogos.observaciones.find(({ codigo }) => codigo === observacion.codigo);
    if (!item) continue;
    sugerencias.push({
      id: `obs:${item.codigo}`,
      campo: 'Observación',
      valor: item.etiqueta,
      confianza: observacion.confianza,
      razon: observacion.razon,
      valores: { observaciones: [item.codigo] },
    });
  }

  const { insectos, enfermedad, hemiparasitas, bejucos, epifitas } = analisis;
  if (insectos) {
    sugerencias.push({
      id: 'insectos',
      campo: 'Insectos (FB-01)',
      valor: `${INSECTOS[insectos.tipo].nombre} ${parteYSeveridad(insectos.parte, insectos.severidad)}`,
      confianza: insectos.confianza,
      razon: insectos.razon,
      valores: { insectos: insectos.tipo, insectos_parte: insectos.parte, insectos_sev: insectos.severidad },
    });
  }
  if (enfermedad) {
    sugerencias.push({
      id: 'enfermedad',
      campo: 'Enfermedad (FB-02)',
      valor: `${ENFERMEDADES[enfermedad.tipo].nombre} ${parteYSeveridad(enfermedad.parte, enfermedad.severidad)}`,
      confianza: enfermedad.confianza,
      razon: enfermedad.razon,
      valores: { enfermedad: enfermedad.tipo, enfermedad_parte: enfermedad.parte, enfermedad_sev: enfermedad.severidad },
    });
  }
  if (hemiparasitas) {
    const porcentaje = String(hemiparasitas.pct_copa).replace('.', ',');
    sugerencias.push({
      id: 'hemiparasitas',
      campo: 'Hemiparásitas (FB-04)',
      valor: `${HEMIPARASITAS[hemiparasitas.tipo].nombre} · ${porcentaje} % de la copa`,
      confianza: hemiparasitas.confianza,
      razon: hemiparasitas.razon,
      valores: { hemiparasitas: hemiparasitas.tipo, pct_hemiparasitas: hemiparasitas.pct_copa },
    });
  }
  if (bejucos) {
    sugerencias.push({
      id: 'bejucos',
      campo: 'Bejucos (FB-05)',
      valor: `${COBERTURA_BEJUCOS[bejucos.nivel]} del individuo`,
      confianza: bejucos.confianza,
      razon: bejucos.razon,
      valores: { bejucos: bejucos.nivel },
    });
  }
  if (epifitas && epifitas.tipos.length > 0) {
    sugerencias.push({
      id: 'epifitas',
      campo: 'Epífitas (FB-06)',
      valor: epifitas.tipos.map((tipo) => EPIFITAS[tipo]).join(', '),
      confianza: epifitas.confianza,
      razon: epifitas.razon,
      valores: { epifitas: epifitas.tipos },
    });
  }
  return sugerencias;
}

/** Valor nuevo de un campo al aplicar una sugerencia: las listas se suman sin repetir. */
export function combinarValor(actual: unknown, sugerido: unknown) {
  if (Array.isArray(actual) && Array.isArray(sugerido)) return [...new Set([...actual, ...sugerido])];
  return sugerido;
}
