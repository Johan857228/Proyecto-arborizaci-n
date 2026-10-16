import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import type { InspeccionPayload } from '@/features/inspections/schemas';
import { inspeccionesService } from '@/features/inspections/services/inspeccionesService';
import type { FotoLocal } from '@/features/trees/types';

export function useHistorial(arbolId: string) {
  return useQuery({ queryKey: ['arbol', arbolId, 'inspecciones'], queryFn: () => inspeccionesService.historial(arbolId) });
}

export function useInspeccion(inspeccionId: string) {
  return useQuery({ queryKey: ['inspeccion', inspeccionId], queryFn: () => inspeccionesService.detalle(inspeccionId) });
}

export function usePendientes(institucionId: string | undefined, pagina: number, enabled: boolean) {
  const limite = 20;
  return useQuery({
    queryKey: ['revision', institucionId ?? 'todas', pagina],
    queryFn: () => inspeccionesService.pendientes({ institucionId, limite, desplazamiento: pagina * limite }),
    enabled,
  });
}

interface ResultadoRegistro {
  inspeccionId: string;
  fotosFallidas: number;
  error?: unknown;
}

/** Guarda la inspección y luego sus fotos. Si una foto falla, la inspección queda guardada
 *  y se informa cuántas fotos faltaron (se pueden volver a subir desde el detalle). */
export function useRegistrarInspeccion(arbolId: string) {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: async ({ payload, fotos }: { payload: InspeccionPayload; fotos: FotoLocal[] }): Promise<ResultadoRegistro> => {
      const inspeccion = await inspeccionesService.crear(arbolId, payload);
      let fotosFallidas = 0;
      let error: unknown;
      for (const foto of fotos) {
        try {
          await inspeccionesService.subirFoto(inspeccion.id, foto);
        } catch (causa) {
          fotosFallidas += 1;
          error = causa;
        }
      }
      return { inspeccionId: inspeccion.id, fotosFallidas, error };
    },
    onSuccess: refrescar,
  });
}

export function useSubirFotoInspeccion(inspeccionId: string) {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: (foto: FotoLocal) => inspeccionesService.subirFoto(inspeccionId, foto),
    onSuccess: refrescar,
  });
}

export function useRevisar() {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: ({ inspeccionId, accion, texto }: { inspeccionId: string; accion: 'confirmar' | 'anular'; texto: string }) =>
      accion === 'confirmar'
        ? inspeccionesService.confirmar(inspeccionId, texto)
        : inspeccionesService.anular(inspeccionId, texto),
    onSuccess: refrescar,
  });
}
