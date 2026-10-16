import { create } from 'zustand';

import type { Session } from '@/features/auth/types';
import { queryClient } from '@/services/api/queryClient';
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

export const useAuthStore = create<AuthState>((set) => ({
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
    await clearStoredSession();
    // Los datos en caché pertenecen al usuario que sale: no deben verse en la siguiente sesión.
    queryClient.clear();
    set({ session: null, hydrated: true, sessionExpired: false, aviso: aviso ?? null });
  },
  expire: async () => {
    await clearStoredSession();
    queryClient.clear();
    set({ session: null, hydrated: true, sessionExpired: true, aviso: null });
  },
}));
