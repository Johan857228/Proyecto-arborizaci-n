import { create } from 'zustand';

import type { Session } from '@/features/auth/types';
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
  hydrate: () => Promise<void>;
  setSession: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
  expire: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  hydrated: false,
  sessionExpired: false,
  hydrate: async () => {
    try {
      set({ session: await readStoredSession(), hydrated: true });
    } catch {
      set({ session: null, hydrated: true });
    }
  },
  setSession: async (session) => {
    await writeStoredSession(session);
    set({ session, hydrated: true, sessionExpired: false });
  },
  signOut: async () => {
    await clearStoredSession();
    set({ session: null, hydrated: true, sessionExpired: false });
  },
  expire: async () => {
    await clearStoredSession();
    set({ session: null, hydrated: true, sessionExpired: true });
  },
}));
