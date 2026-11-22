import type { PayloadBiotico } from '@/features/inspections/bioticos';
import type { Tamizaje } from '@/features/riesgo/reglas';

/** Las zonas las define cada institución (features/zonas); "Otra" lleva el nombre en zona_otra. */
export type Zona = string;
export type Etapa = 'Plántula' | 'Juvenil' | 'Adulto' | 'Senescente';
export type Interferencia =
  | 'Ninguna'
  | 'Levantamiento de pisos'
  | 'Afectación de muros'
  | 'Cables eléctricos'
  | 'Otra infraestructura';
export type TipoFoto = 'completo' | 'detalle' | 'adicional';
export type TipoMimeFoto = 'image/jpeg' | 'image/png' | 'image/webp';

export interface FiltrosInventario {
  institucionId?: string;
  estado?: 'sano' | 'riesgo' | 'critico';
  especie?: string;
  zona?: Zona;
  /** Texto que se busca en el servidor: código, especie (común o científica) y zona. */
  q?: string;
  /** Solo los árboles que registró esta persona (por alumno, o "mis registros"). */
  registradoPor?: string;
}

export interface PaginaInventario extends FiltrosInventario {
  limite: number;
  desplazamiento: number;
}

export interface ArbolCrear extends Partial<PayloadBiotico> {
  institucion_id: string;
  zona: Zona;
  zona_otra?: string | null;
  lat: number;
  lng: number;
  especie_id: number;
  dap_cm: number;
  altura_m: number;
  copa_m: number;
  etapa: Etapa;
  interferencia: Interferencia;
  interferencia_otra?: string | null;
  observaciones: string[];
  precision_gps_m?: number | null;
  notas?: string;
  tamizaje?: Tamizaje;
  ia_analisis_id?: string;
}

export interface FotoLocal {
  tipo: TipoFoto;
  uri: string;
  name: string;
  mimeType: TipoMimeFoto;
  sizeBytes: number;
}