import { useMutation } from '@tanstack/react-query';

import { authService } from '@/features/auth/services/authService';
import { useAuthStore } from '@/features/auth/store';

export function useLogin() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: authService.login,
    onSuccess: setSession,
  });
}