export type EstadoArbol = 'sano' | 'riesgo' | 'critico';
export type { ArbolResumen } from '@/shared/types/entities';

export interface Estadisticas {
  total: number;
  por_estado: Record<string, number>;
  por_institucion: { prefijo: string; nombre_corto: string; total: number }[];
  por_etapa: Record<string, number>;
  especies_frecuentes: { nombre_comun: string; total: number }[];
  promedios: { dap_cm: number | null; altura_m: number | null; copa_m: number | null };
  totales_ambientales: {
    biomasa_total_kg: number;
    carbono_kg: number;
    co2_kg: number;
    o2_kg: number;
  };
}