import { create } from 'zustand';

import type { Session } from '@/features/auth/types';
import { queryClient } from '@/services/api/queryClient';
import { borrarConsultas } from '@/services/offline/consultasGuardadas';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/services/storage/sessionStorage';

interface AuthState {
  session: Session | null;
  hydrated: boolean;
  /** true cuando la sesión terminó porque el servidor rechazó el token (expiró). */
  sessionExpired: boolean;
  /** Otro motivo de cierre para mostrar en el inicio de sesión (p. ej. cuenta desactivada). */
  aviso: string | null;
  hydrate: () => Promise<void>;
  setSession: (session: Session) => Promise<void>;
  signOut: (aviso?: string) => Promise<void>;
  expire: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  hydrated: false,
  sessionExpired: false,
  aviso: null,
  hydrate: async () => {
    try {
      set({ session: await readStoredSession(), hydrated: true });
    } catch {
      set({ session: null, hydrated: true });
    }
  },
  setSession: async (session) => {
    await writeStoredSession(session);
    set({ session, hydrated: true, sessionExpired: false, aviso: null });
  },
  signOut: async (aviso) => {
    const usuarioId = get().session?.user_id;
    await clearStoredSession();
    // Los datos en caché pertenecen al usuario que sale: no deben verse en la siguiente sesión.
    // Tampoco su copia en el teléfono. Lo que tenga sin enviar se queda guardado con su cuenta.
    queryClient.clear();
    if (usuarioId) await borrarConsultas(usuarioId);
    set({ session: null, hydrated: true, sessionExpired: false, aviso: aviso ?? null });
  },
  expire: async () => {
    const usuarioId = get().session?.user_id;
    await clearStoredSession();
    queryClient.clear();
    if (usuarioId) await borrarConsultas(usuarioId);
    set({ session: null, hydrated: true, sessionExpired: true, aviso: null });
  },
}));
