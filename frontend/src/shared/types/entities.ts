export interface Session {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number | null;
  user_id: string;
  email: string | null;
}

export type EstadoArbol = 'sano' | 'riesgo' | 'critico';

export interface ArbolResumen {
  id: string;
  codigo: string;
  institucion_id: string;
  prefijo: string;
  nombre_corto: string;
  zona: string;
  zona_otra: string | null;
  lat: number;
  lng: number;
  nombre_comun: string;
  nombre_cientifico: string;
  dap_cm: number;
  altura_m: number;
  copa_m: number;
  etapa: string;
  interferencia: string;
  interferencia_otra: string | null;
  registrado_en: string;
  n_observaciones: number;
  estado: EstadoArbol;
}