import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import {
  alertaSchema,
  contactosSchema,
  riesgoArbolSchema,
  type ContactosForm,
  type MedioAviso,
} from '@/features/riesgo/schemas';
import { enviarValidado, getValidado } from '@/services/api/client';

export type FiltroAlertas = 'abiertas' | 'cerradas' | 'todas';

export type AccionAlerta =
  | { tipo: 'confirmar'; comentario?: string }
  | { tipo: 'descartar'; motivo: string }
  | { tipo: 'aviso'; medio: MedioAviso }
  | { tipo: 'atender'; nota: string; intervencionId?: string };

export const riesgoService = {
  delArbol: (arbolId: string) => getValidado(`/arboles/${arbolId}/riesgo`, riesgoArbolSchema),
  alertas: (estado: FiltroAlertas, institucionId?: string) =>
    getValidado('/alertas', z.array(alertaSchema), { estado, institucion_id: institucionId }),
  accion: (alertaId: string, accion: AccionAlerta) => {
    const cuerpo =
      accion.tipo === 'confirmar' ? { comentario: accion.comentario || null }
        : accion.tipo === 'descartar' ? { motivo: accion.motivo }
          : accion.tipo === 'aviso' ? { medio: accion.medio }
            : { nota: accion.nota, intervencion_id: accion.intervencionId ?? null };
    return enviarValidado('post', `/alertas/${alertaId}/${accion.tipo}`, cuerpo, alertaSchema);
  },
  contactos: (institucionId: string) => getValidado(`/instituciones/${institucionId}/contactos`, contactosSchema),
  guardarContactos: (institucionId: string, contactos: ContactosForm) =>
    enviarValidado('put', `/instituciones/${institucionId}/contactos`, contactos, contactosSchema),
};

export function useRiesgoArbol(arbolId: string) {
  return useQuery({ queryKey: ['arbol', arbolId, 'riesgo'], queryFn: () => riesgoService.delArbol(arbolId) });
}

export function useAlertas(estado: FiltroAlertas, institucionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['alertas', estado, institucionId ?? 'todas'],
    queryFn: () => riesgoService.alertas(estado, institucionId),
    enabled,
  });
}

export function useAccionAlerta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertaId, accion }: { alertaId: string; accion: AccionAlerta }) => riesgoService.accion(alertaId, accion),
    onSuccess: async (alerta) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['alertas'] }),
        queryClient.invalidateQueries({ queryKey: ['arbol', alerta.arbol_id, 'riesgo'] }),
      ]);
    },
  });
}

export function useContactos(institucionId: string | undefined) {
  return useQuery({
    queryKey: ['contactos', institucionId],
    queryFn: () => riesgoService.contactos(institucionId as string),
    enabled: Boolean(institucionId),
    staleTime: 10 * 60_000,
  });
}

export function useGuardarContactos(institucionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactos: ContactosForm) => riesgoService.guardarContactos(institucionId, contactos),
    onSuccess: (contactos) => queryClient.setQueryData(['contactos', institucionId], contactos),
  });
}
