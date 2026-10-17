import { useMutation } from '@tanstack/react-query';

import { authService } from '@/features/auth/services/authService';
import { useAuthStore } from '@/features/auth/store';

/** Registra la cuenta y, si Supabase entrega la sesión de inmediato, la guarda como el login. */
export function useRegistro() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: authService.register,
    onSuccess: async (respuesta) => {
      if (respuesta.sesion) await setSession(respuesta.sesion);
    },
  });
}
