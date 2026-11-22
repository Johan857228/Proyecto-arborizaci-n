import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { api, enviarValidado, getValidado, validar } from '@/services/api/client';

/** "Otra" no es una zona guardada: siempre está disponible y el nombre va aparte (zona_otra). */
export const ZONA_OTRA = 'Otra';
/** Las de siempre: se usan mientras cargan las de la institución o si falta la migración 016. */
export const ZONAS_POR_DEFECTO = ['Patio central', 'Entrada principal', 'Zona deportiva', 'Bloques académicos'];

export const zonaSchema = z.object({
  id: z.string().nullable(),
  nombre: z.string(),
  orden: z.number().int(),
  arboles: z.number().int(),
  cursos: z.number().int(),
});
export type ZonaInstitucion = z.infer<typeof zonaSchema>;

export const zonasInstitucionSchema = z.object({
  institucion_id: z.string(),
  /** false si falta la migración 016: se ven las de siempre y no se pueden cambiar. */
  editable: z.boolean(),
  puede_editar: z.boolean(),
  zonas: z.array(zonaSchema),
});
export type ZonasInstitucion = z.infer<typeof zonasInstitucionSchema>;

const ruta = (institucionId: string) => `/instituciones/${encodeURIComponent(institucionId)}/zonas`;

export const zonasService = {
  listar: (institucionId: string) => getValidado(ruta(institucionId), zonasInstitucionSchema),
  crear: (institucionId: string, nombre: string) => enviarValidado('post', ruta(institucionId), { nombre }, zonasInstitucionSchema),
  renombrar: (id: string, nombre: string) => enviarValidado('patch', `/zonas/${id}`, { nombre }, zonasInstitucionSchema),
  borrar: async (id: string, moverA?: string) => {
    const { data } = await api.delete<unknown>(`/zonas/${id}`, { params: moverA ? { mover_a: moverA } : undefined });
    return validar(zonasInstitucionSchema, data);
  },
};

export function useZonas(institucionId?: string) {
  return useQuery({
    queryKey: ['zonas', institucionId],
    queryFn: () => zonasService.listar(institucionId ?? ''),
    enabled: Boolean(institucionId),
    staleTime: 5 * 60_000,
  });
}

/** Nombres para elegir en un formulario: las zonas de la institución y, al final, "Otra". */
export function nombresDeZonas(datos?: ZonasInstitucion) {
  return [...(datos?.zonas.map((zona) => zona.nombre) ?? ZONAS_POR_DEFECTO), ZONA_OTRA];
}

export function useEditarZonas() {
  // Un cambio de nombre o un borrado también cambia árboles y cursos: se refresca todo.
  const refrescar = useRefrescarTodo();
  return {
    crear: useMutation({
      mutationFn: ({ institucionId, nombre }: { institucionId: string; nombre: string }) => zonasService.crear(institucionId, nombre),
      onSuccess: refrescar,
    }),
    renombrar: useMutation({
      mutationFn: ({ id, nombre }: { id: string; nombre: string }) => zonasService.renombrar(id, nombre),
      onSuccess: refrescar,
    }),
    borrar: useMutation({
      mutationFn: ({ id, moverA }: { id: string; moverA?: string }) => zonasService.borrar(id, moverA),
      onSuccess: refrescar,
    }),
  };
}
