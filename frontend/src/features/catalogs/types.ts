export interface Especie {
  id: number;
  nombre_comun: string;
  nombre_cientifico: string;
}

export interface Institucion {
  id: string;
  nombre: string;
  nombre_corto: string;
  prefijo: string;
  lat: number;
  lng: number;
}

export type GrupoObservacion = 'follaje' | 'tronco' | 'raiz' | 'plagas';

export interface ObservacionCatalogo {
  codigo: string;
  grupo: GrupoObservacion;
  etiqueta: string;
  orden: number;
}

export interface Catalogos {
  especies: Especie[];
  instituciones: Institucion[];
  observaciones: ObservacionCatalogo[];
}