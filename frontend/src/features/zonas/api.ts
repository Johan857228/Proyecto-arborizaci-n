import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import { api, enviarValidado, getValidado, validar } from '@/services/api/client';

/** "Otra" no es una zona guardada: siempre está disponible y el nombre va aparte (zona_otra). */
export const ZONA_OTRA = 'Otra';
/** Las de siempre: se usan mientras cargan las de la institución o si falta la migración 016. */
export const ZONAS_POR_DEFECTO = ['Patio central', 'Entrada principal', 'Zona deportiva', 'Bloques académicos'];

export const TIPOS_ZONA = ['patio', 'cancha', 'salones', 'biblioteca', 'entrada', 'parqueadero', 'otro'] as const;
export type TipoZona = (typeof TIPOS_ZONA)[number];

/** Etiqueta y color de cada tipo en el plano. Colores fijos: van sobre el mapa, que siempre es claro. */
export const ESTILO_TIPO: Record<TipoZona, { etiqueta: string; color: string }> = {
  patio: { etiqueta: 'Patio o zona verde', color: '#2E9D5B' },
  cancha: { etiqueta: 'Cancha', color: '#D9822B' },
  salones: { etiqueta: 'Salones', color: '#5B6CC2' },
  biblioteca: { etiqueta: 'Biblioteca', color: '#8E5BB5' },
  entrada: { etiqueta: 'Entrada', color: '#C2475B' },
  parqueadero: { etiqueta: 'Parqueadero', color: '#6B7280' },
  otro: { etiqueta: 'Otro', color: '#0F8C8C' },
};

/** [latitud, longitud] de cada esquina del área dibujada. */
export const contornoSchema = z.array(z.tuple([z.number(), z.number()]));
export type Contorno = z.infer<typeof contornoSchema>;

export const zonaSchema = z.object({
  id: z.string().nullable(),
  nombre: z.string(),
  // Opcionales para seguir leyendo un backend anterior al plano del colegio.
  tipo: z.enum(TIPOS_ZONA).catch('patio').default('patio'),
  contorno: contornoSchema.nullable().catch(null).default(null),
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
  crear: (institucionId: string, nombre: string, tipo: TipoZona) =>
    enviarValidado('post', ruta(institucionId), { nombre, tipo }, zonasInstitucionSchema),
  editar: (id: string, cambios: { nombre?: string; tipo?: TipoZona }) => enviarValidado('patch', `/zonas/${id}`, cambios, zonasInstitucionSchema),
  dibujar: (id: string, contorno: Contorno | null) => enviarValidado('put', `/zonas/${id}/contorno`, { contorno }, zonasInstitucionSchema),
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
      mutationFn: ({ institucionId, nombre, tipo }: { institucionId: string; nombre: string; tipo: TipoZona }) =>
        zonasService.crear(institucionId, nombre, tipo),
      onSuccess: refrescar,
    }),
    editar: useMutation({
      mutationFn: ({ id, ...cambios }: { id: string; nombre?: string; tipo?: TipoZona }) => zonasService.editar(id, cambios),
      onSuccess: refrescar,
    }),
    dibujar: useMutation({
      mutationFn: ({ id, contorno }: { id: string; contorno: Contorno | null }) => zonasService.dibujar(id, contorno),
      onSuccess: refrescar,
    }),
    borrar: useMutation({
      mutationFn: ({ id, moverA }: { id: string; moverA?: string }) => zonasService.borrar(id, moverA),
      onSuccess: refrescar,
    }),
  };
}
