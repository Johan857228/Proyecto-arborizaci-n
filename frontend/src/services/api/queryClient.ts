import { QueryClient } from '@tanstack/react-query';

// Sin conexión las consultas se pausan y muestran lo último guardado (services/offline). Las
// acciones no se pausan: fallan enseguida con el aviso de conexión, salvo registrar árboles e
// inspecciones, que se guardan en el teléfono para enviarse después.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: { retry: false, networkMode: 'always' },
  },
});