import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { avanceSchema, cursoDetalleSchema, cursoSchema, type Zona } from '@/features/courses/schemas';
import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { api, enviarValidado, getValidado } from '@/services/api/client';

export const cursosService = {
  listar: (institucionId?: string) => getValidado('/cursos', z.array(cursoSchema), { institucion_id: institucionId }),
  detalle: (id: string) => getValidado(`/cursos/${id}`, cursoDetalleSchema),
  avance: (id: string, desde?: string, hasta?: string) => getValidado(`/cursos/${id}/avance`, avanceSchema, { desde, hasta }),
  crear: (datos: { institucion_id: string; nombre: string; anio: number; zonas: Zona[]; docente_id?: string | null }) =>
    enviarValidado('post', '/cursos', datos, cursoDetalleSchema),
  editar: (id: string, cambios: { nombre?: string; anio?: number; docente_id?: string | null; activo?: boolean }) =>
    enviarValidado('patch', `/cursos/${id}`, cambios, cursoDetalleSchema),
  zonas: (id: string, zonas: Zona[]) => enviarValidado('put', `/cursos/${id}/zonas`, { zonas }, cursoDetalleSchema),
  borrar: async (id: string) => {
    await api.delete(`/cursos/${id}`);
  },
};

export function useCursos(institucionId?: string) {
  return useQuery({ queryKey: ['cursos', institucionId ?? 'todas'], queryFn: () => cursosService.listar(institucionId) });
}

export function useCurso(id: string) {
  return useQuery({ queryKey: ['cursos', 'detalle', id], queryFn: () => cursosService.detalle(id) });
}

export function useAvanceCurso(id: string, desde?: string, hasta?: string) {
  return useQuery({ queryKey: ['cursos', 'avance', id, desde, hasta], queryFn: () => cursosService.avance(id, desde, hasta) });
}

export function useGuardarCurso() {
  const refrescar = useRefrescarTodo();
  return {
    crear: useMutation({ mutationFn: cursosService.crear, onSuccess: refrescar }),
    editar: useMutation({
      mutationFn: ({ id, cambios }: { id: string; cambios: Parameters<typeof cursosService.editar>[1] }) => cursosService.editar(id, cambios),
      onSuccess: refrescar,
    }),
    zonas: useMutation({
      mutationFn: ({ id, zonas }: { id: string; zonas: Zona[] }) => cursosService.zonas(id, zonas),
      onSuccess: refrescar,
    }),
    borrar: useMutation({ mutationFn: cursosService.borrar, onSuccess: refrescar }),
  };
}
