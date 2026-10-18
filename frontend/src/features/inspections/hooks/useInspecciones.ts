import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefrescarTodo } from '@/features/perfil/hooks/usePerfil';
import type { InspeccionPayload } from '@/features/inspections/schemas';
import { inspeccionesService } from '@/features/inspections/services/inspeccionesService';
import { guardarInspeccionParaDespues } from '@/features/sincronizacion/colaStore';
import type { FotoLocal } from '@/features/trees/types';
import { esErrorDeRed, hayConexion } from '@/services/offline/conexion';
import { nuevoId } from '@/shared/utils/id';

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
  /** Sin id: no había conexión y la inspección quedó guardada en el teléfono. */
  inspeccionId?: string;
  fotosFallidas: number;
  /** Fotos que no subieron por falta de señal: quedaron en el teléfono y se envían solas. */
  fotosEnCola: number;
  error?: unknown;
}

/** Guarda la inspección y luego sus fotos. Si una foto falla, la inspección queda guardada
 *  y se informa cuántas fotos faltaron (se pueden volver a subir desde el detalle). Sin conexión,
 *  todo queda en el teléfono y se envía después (sincronizacion/colaStore.ts).
 *  `etiqueta` identifica la visita en la lista de registros por enviar. */
export function useRegistrarInspeccion(arbolId: string, etiqueta: { titulo: string; detalle: string }) {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: async ({ payload, fotos }: { payload: InspeccionPayload; fotos: FotoLocal[] }): Promise<ResultadoRegistro> => {
      const idCliente = nuevoId();
      const conId = fotos.map((foto) => ({ ...foto, id: nuevoId() }));
      const guardarParaDespues = (pendientes = conId, registroId?: string) =>
        guardarInspeccionParaDespues({ idCliente, arbolId, payload, fotos: pendientes, ...etiqueta, registroId });

      if (!hayConexion()) {
        await guardarParaDespues();
        return { fotosFallidas: 0, fotosEnCola: conId.length };
      }
      let inspeccion: { id: string };
      try {
        inspeccion = await inspeccionesService.crear(arbolId, payload, { idCliente, capturadoEn: new Date().toISOString() });
      } catch (causa) {
        if (!esErrorDeRed(causa)) throw causa;
        await guardarParaDespues();
        return { fotosFallidas: 0, fotosEnCola: conId.length };
      }
      let fotosFallidas = 0;
      let error: unknown;
      for (let i = 0; i < conId.length; i += 1) {
        try {
          await inspeccionesService.subirFoto(inspeccion.id, conId[i], conId[i].id);
        } catch (causa) {
          if (esErrorDeRed(causa)) {
            const pendientes = conId.slice(i);
            await guardarParaDespues(pendientes, inspeccion.id);
            return { inspeccionId: inspeccion.id, fotosFallidas, fotosEnCola: pendientes.length, error };
          }
          fotosFallidas += 1;
          error = causa;
        }
      }
      return { inspeccionId: inspeccion.id, fotosFallidas, fotosEnCola: 0, error };
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
