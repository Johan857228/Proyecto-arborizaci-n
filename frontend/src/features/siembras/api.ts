import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import {
  asistenteSchema,
  controlSchema,
  descargaSchema,
  jornadaDetalleSchema,
  jornadaSchema,
  resumenGeneralSchema,
  siembraSchema,
  type EstadoControl,
  type Hito,
  type Organizador,
  type PadrinoTipo,
  type RolAsistente,
} from '@/features/siembras/schemas';
import { api, enviarValidado, getValidado } from '@/services/api/client';
import { abrirDescarga } from '@/shared/utils/descarga';

export interface DatosJornada {
  nombre: string;
  fecha: string;
  lugar: string | null;
  organizador: Organizador;
  oficial: boolean;
  area_de_vida: string | null;
  patrocinador: string | null;
  institucion_id?: string;
}

export interface DatosPlanta {
  especie_id: number | null;
  especie_otra: string | null;
  lat: number;
  lng: number;
  precision_gps_m: number | null;
  fecha: string;
  vivero: string | null;
  vivero_registro_ica: string | null;
  altura_inicial_cm: number | null;
  padrino_tipo: PadrinoTipo;
  padrino_curso_id: string | null;
  padrino_usuario_id: string | null;
  padrino_nombre: string | null;
}

export interface DatosControl {
  hito_meses: Hito | null;
  fecha: string;
  estado: EstadoControl;
  altura_cm: number | null;
  mantenimiento: boolean;
  observaciones: string | null;
}

export interface DatosAsistente {
  usuario_id?: string;
  nombre_externo?: string;
  rol: RolAsistente;
  arboles_sembrados: number | null;
  autoriza_certificado: boolean;
}

export const siembrasService = {
  jornadas: (institucionId?: string) => getValidado('/siembras/jornadas', z.array(jornadaSchema), { institucion_id: institucionId }),
  jornada: (id: string) => getValidado(`/siembras/jornadas/${id}`, jornadaDetalleSchema),
  resumen: (institucionId?: string) => getValidado('/siembras/resumen', resumenGeneralSchema, { institucion_id: institucionId }),
  crearJornada: (datos: DatosJornada) => enviarValidado('post', '/siembras/jornadas', datos, jornadaSchema),
  editarJornada: (id: string, cambios: Partial<DatosJornada>) => enviarValidado('patch', `/siembras/jornadas/${id}`, cambios, jornadaSchema),
  borrarJornada: async (id: string) => {
    await api.delete(`/siembras/jornadas/${id}`);
  },
  registrarPlanta: (jornadaId: string, datos: DatosPlanta) => enviarValidado('post', `/siembras/jornadas/${jornadaId}/plantas`, datos, siembraSchema),
  borrarPlanta: async (id: string) => {
    await api.delete(`/siembras/plantas/${id}`);
  },
  registrarControl: (siembraId: string, datos: DatosControl) => enviarValidado('post', `/siembras/plantas/${siembraId}/controles`, datos, controlSchema),
  borrarControl: async (id: string) => {
    await api.delete(`/siembras/controles/${id}`);
  },
  asistentes: (jornadaId: string) => getValidado(`/siembras/jornadas/${jornadaId}/asistentes`, z.array(asistenteSchema)),
  guardarAsistentes: (jornadaId: string, asistentes: DatosAsistente[]) =>
    enviarValidado('put', `/siembras/jornadas/${jornadaId}/asistentes`, { asistentes }, z.array(asistenteSchema)),
  lista: (jornadaId: string, formato: 'pdf' | 'csv') => enviarValidado('post', `/siembras/jornadas/${jornadaId}/lista`, { formato }, descargaSchema),
  exportar: (datos: { formato: 'geojson' | 'csv'; jornada_id?: string; institucion_id?: string }) =>
    enviarValidado('post', '/siembras/exportar', datos, descargaSchema),
};

// La raíz 'siembras' se guarda en el teléfono: los controles de campo se consultan sin señal.
export function useJornadas(institucionId?: string, enabled = true) {
  return useQuery({ queryKey: ['siembras', 'jornadas', institucionId ?? 'propia'], queryFn: () => siembrasService.jornadas(institucionId), enabled });
}

export function useJornada(id: string, enabled = true) {
  return useQuery({ queryKey: ['siembras', 'jornada', id], queryFn: () => siembrasService.jornada(id), enabled });
}

export function useResumenSiembras(institucionId?: string, enabled = true) {
  return useQuery({ queryKey: ['siembras', 'resumen', institucionId ?? 'propia'], queryFn: () => siembrasService.resumen(institucionId), enabled, retry: false });
}

export function useAsistentes(jornadaId: string, enabled = true) {
  return useQuery({ queryKey: ['siembras', 'asistentes', jornadaId], queryFn: () => siembrasService.asistentes(jornadaId), enabled });
}

function useRefrescar() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['siembras'] });
    void queryClient.invalidateQueries({ queryKey: ['prae'] });
  };
}

export function useCrearJornada() {
  const refrescar = useRefrescar();
  return useMutation({ mutationFn: siembrasService.crearJornada, onSuccess: refrescar });
}

export function useEditarJornada() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Partial<DatosJornada> }) => siembrasService.editarJornada(id, cambios),
    onSuccess: refrescar,
  });
}

export function useBorrarJornada() {
  const refrescar = useRefrescar();
  return useMutation({ mutationFn: siembrasService.borrarJornada, onSuccess: refrescar });
}

export function useRegistrarPlanta() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ jornadaId, datos }: { jornadaId: string; datos: DatosPlanta }) => siembrasService.registrarPlanta(jornadaId, datos),
    onSuccess: refrescar,
  });
}

export function useBorrarPlanta() {
  const refrescar = useRefrescar();
  return useMutation({ mutationFn: siembrasService.borrarPlanta, onSuccess: refrescar });
}

export function useRegistrarControl() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ siembraId, datos }: { siembraId: string; datos: DatosControl }) => siembrasService.registrarControl(siembraId, datos),
    onSuccess: refrescar,
  });
}

export function useBorrarControl() {
  const refrescar = useRefrescar();
  return useMutation({ mutationFn: siembrasService.borrarControl, onSuccess: refrescar });
}

export function useGuardarAsistentes() {
  const queryClient = useQueryClient();
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ jornadaId, asistentes }: { jornadaId: string; asistentes: DatosAsistente[] }) => siembrasService.guardarAsistentes(jornadaId, asistentes),
    onSuccess: (guardados, { jornadaId }) => {
      // La respuesta ya es la lista guardada: se muestra sin esperar la recarga.
      queryClient.setQueryData(['siembras', 'asistentes', jornadaId], guardados);
      refrescar();
    },
  });
}

/** Genera un archivo en el servidor y abre la descarga. */
export function useDescargaSiembras() {
  return useMutation({
    mutationFn: async (pedir: () => Promise<z.infer<typeof descargaSchema>>) => {
      const archivo = await pedir();
      await abrirDescarga(archivo.url);
      return archivo;
    },
  });
}
