export type Zona =
  | 'Patio central'
  | 'Entrada principal'
  | 'Zona deportiva'
  | 'Bloques académicos'
  | 'Otra';
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
}

export interface PaginaInventario extends FiltrosInventario {
  limite: number;
  desplazamiento: number;
}

export interface ArbolCrear {
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
}

export interface FotoLocal {
  tipo: TipoFoto;
  uri: string;
  name: string;
  mimeType: TipoMimeFoto;
  sizeBytes: number;
}