import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ArbolEnCola } from '@/features/sincronizacion/cola';
import { guardarArbolParaDespues } from '@/features/sincronizacion/colaStore';
import { fotosRegistroSchema } from '@/features/trees/schemas';
import { photosService } from '@/features/trees/services/photosService';
import { treesService } from '@/features/trees/services/treesService';
import { ApiContractError } from '@/services/api/client';
import { esErrorDeRed, hayConexion } from '@/services/offline/conexion';
import type { ArbolResumen } from '@/shared/types/entities';
import { nuevoId } from '@/shared/utils/id';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';

export type RegistrationResult =
  | { estado: 'enviado'; tree: ArbolResumen; photoError?: unknown; fotosEnCola?: number }
  /** Sin conexión: quedó guardado en el teléfono y se envía solo cuando vuelva la señal. */
  | { estado: 'en_cola'; registro: ArbolEnCola };

/** Para reconocer el registro en la lista de pendientes (especie, institución y zona). */
export interface EtiquetaRegistro {
  titulo: string;
  detalle: string;
}

export function useRegisterTree() {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  async function submit(values: ArbolCrear, photos: FotoLocal[], etiqueta: EtiquetaRegistro): Promise<RegistrationResult> {
    const validatedPhotos = fotosRegistroSchema.safeParse(photos);
    if (!validatedPhotos.success) {
      throw new ApiContractError('Revisa las fotografías: agrega una vista general y respeta formato y tamaño permitidos.');
    }
    // Cada envío lleva su id_cliente: si se corta y se repite desde la cola, no se duplica.
    const idCliente = nuevoId();
    const fotos = validatedPhotos.data.map((foto) => ({ ...foto, id: nuevoId() }));
    const guardarParaDespues = async (pendientes = fotos, creado?: ArbolResumen) =>
      guardarArbolParaDespues({
        idCliente,
        payload: values,
        fotos: pendientes,
        ...etiqueta,
        registroId: creado?.id,
        codigo: creado?.codigo,
      });

    setIsPending(true);
    try {
      if (!hayConexion()) return { estado: 'en_cola', registro: await guardarParaDespues() };

      let tree: ArbolResumen;
      try {
        tree = await treesService.create(values, { idCliente, capturadoEn: new Date().toISOString() });
      } catch (error) {
        // Sin señal (o se agotó el tiempo): se guarda para enviarlo después. Si el servidor alcanzó
        // a guardarlo, el reenvío con el mismo id_cliente devuelve ese mismo árbol.
        if (esErrorDeRed(error)) return { estado: 'en_cola', registro: await guardarParaDespues() };
        throw error;
      }

      for (let i = 0; i < fotos.length; i += 1) {
        try {
          await photosService.upload(tree.id, fotos[i], fotos[i].id);
        } catch (photoError) {
          if (esErrorDeRed(photoError)) {
            const pendientes = fotos.slice(i);
            await guardarParaDespues(pendientes, tree);
            return { estado: 'enviado', tree, fotosEnCola: pendientes.length };
          }
          return { estado: 'enviado', tree, photoError };
        }
      }
      return { estado: 'enviado', tree };
    } finally {
      setIsPending(false);
      void queryClient.invalidateQueries();
    }
  }

  return { submit, isPending };
}
