import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { sincronizarAhora, useColaStore } from '@/features/sincronizacion/colaStore';
import { alCambiarConexion } from '@/services/offline/conexion';
import { guardarConsultasAlCambiar, restaurarConsultas } from '@/services/offline/consultasGuardadas';

const INTERVALO_ENVIO_MS = 60_000;
const ESPERA_MAXIMA_RESTAURAR_MS = 1500;

/** Carga la cola de la cuenta abierta y la envía al abrir la app, al volver la conexión, al
 *  volver la app al frente y cada minuto mientras quede algo pendiente. */
export function useSincronizacionAutomatica(usuarioId: string | undefined) {
  useEffect(() => {
    if (!usuarioId) {
      useColaStore.getState().descargar();
      return;
    }
    void useColaStore.getState().cargar(usuarioId).then(() => sincronizarAhora());
  }, [usuarioId]);

  useEffect(() => {
    const dejarDeOir = alCambiarConexion((enLinea) => {
      if (enLinea) void sincronizarAhora();
    });
    const appState = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizarAhora();
    });
    const temporizador = setInterval(() => void sincronizarAhora(), INTERVALO_ENVIO_MS);
    return () => {
      dejarDeOir();
      appState.remove();
      clearInterval(temporizador);
    };
  }, []);
}

/** Carga la copia de las consultas guardada en el teléfono y la mantiene al día. Devuelve true
 *  cuando ya se puede mostrar la app (nunca la detiene más de 1,5 s). */
export function useConsultasGuardadas(usuarioId: string | undefined) {
  const queryClient = useQueryClient();
  const [restaurada, setRestaurada] = useState<string>();

  useEffect(() => {
    if (!usuarioId) return;
    let vigente = true;
    const listo = () => {
      if (vigente) setRestaurada(usuarioId);
    };
    const limite = setTimeout(listo, ESPERA_MAXIMA_RESTAURAR_MS);
    void restaurarConsultas(queryClient, usuarioId).finally(() => {
      clearTimeout(limite);
      listo();
    });
    const dejarDeGuardar = guardarConsultasAlCambiar(queryClient, usuarioId);
    return () => {
      vigente = false;
      clearTimeout(limite);
      dejarDeGuardar();
    };
  }, [queryClient, usuarioId]);

  return !usuarioId || restaurada === usuarioId;
}
