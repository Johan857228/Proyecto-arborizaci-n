import { onlineManager } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * ¿Hay conexión con el servidor? La app no usa un módulo nativo de red: lo sabe por las
 * peticiones. Si una falla sin respuesta (sin señal, servidor caído o tiempo agotado) se marca
 * "sin conexión" y desde ahí se pregunta a /salud cada 15 s, y al volver a abrir la app, hasta
 * que responda. Cualquier respuesta del servidor la vuelve a marcar "con conexión".
 *
 * El estado vive en onlineManager de React Query: sin conexión, las consultas se pausan y las
 * pantallas siguen mostrando lo último que se guardó en el teléfono en vez de un error.
 * En web, el navegador además avisa con los eventos online/offline.
 */
const INTERVALO_PRUEBA_MS = 15_000;

export function esErrorDeRed(error: unknown): boolean {
  return isAxiosError(error) && !error.response && error.code !== 'ERR_CANCELED';
}

export function hayConexion(): boolean {
  return onlineManager.isOnline();
}

export function marcarSinConexion() {
  if (onlineManager.isOnline()) onlineManager.setOnline(false);
}

export function marcarConConexion() {
  if (!onlineManager.isOnline()) onlineManager.setOnline(true);
}

/** Avisa cada vez que cambia el estado de la conexión. Devuelve la función para dejar de oír. */
export function alCambiarConexion(oyente: (enLinea: boolean) => void): () => void {
  return onlineManager.subscribe(oyente);
}

/** true mientras haya conexión; la pantalla se vuelve a dibujar cuando cambia. */
export function useHayConexion() {
  return useSyncExternalStore(alCambiarConexion, hayConexion, () => true);
}

/** Mientras no haya conexión, prueba el servidor cada 15 s y al volver la app al frente.
 *  Devuelve la función para detener la vigilancia. */
export function vigilarConexion(probar: () => Promise<unknown>): () => void {
  let temporizador: ReturnType<typeof setInterval> | undefined;
  let probando = false;

  async function prueba() {
    if (probando || onlineManager.isOnline()) return;
    probando = true;
    try {
      await probar();
      marcarConConexion();
    } catch {
      // Sigue sin conexión; se vuelve a intentar en el siguiente turno.
    } finally {
      probando = false;
    }
  }

  function programar(enLinea: boolean) {
    if (enLinea) {
      if (temporizador) clearInterval(temporizador);
      temporizador = undefined;
    } else {
      temporizador ??= setInterval(() => void prueba(), INTERVALO_PRUEBA_MS);
    }
  }

  const dejarDeOir = onlineManager.subscribe(programar);
  const appState = AppState.addEventListener('change', (estado) => {
    if (estado === 'active') void prueba();
  });
  programar(onlineManager.isOnline());

  return () => {
    dejarDeOir();
    appState.remove();
    if (temporizador) clearInterval(temporizador);
  };
}
