import { create } from 'zustand';

/** Mensajes de una sola vez para mostrar en otra pantalla después de navegar
 *  (p. ej. "Inspección guardada" al volver a la ficha del árbol). */
interface AvisosState {
  avisos: Record<string, string>;
  avisar: (clave: string, aviso: string) => void;
  limpiar: (clave: string) => void;
}

export const useAvisos = create<AvisosState>((set) => ({
  avisos: {},
  avisar: (clave, aviso) => set((state) => ({ avisos: { ...state.avisos, [clave]: aviso } })),
  limpiar: (clave) =>
    set((state) => {
      const { [clave]: _quitado, ...resto } = state.avisos;
      return { avisos: resto };
    }),
}));
