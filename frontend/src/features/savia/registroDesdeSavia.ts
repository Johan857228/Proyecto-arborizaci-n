import { create } from 'zustand';

import type { AnalisisIA } from '@/features/ia/schemas';
import type { FotoLocal } from '@/features/trees/types';

/** Lo que Savia ya sabe de un árbol cuando la persona toca "Registrar este árbol": la foto que
 *  analizó y el análisis. El formulario de registro lo toma una sola vez al abrirse. */
export interface RegistroDesdeSavia {
  foto: FotoLocal;
  analisis: AnalisisIA;
}

interface Estado {
  pendiente: RegistroDesdeSavia | null;
  dejar: (registro: RegistroDesdeSavia) => void;
  tomar: () => RegistroDesdeSavia | null;
}

export const useRegistroDesdeSavia = create<Estado>((set, get) => ({
  pendiente: null,
  dejar: (registro) => set({ pendiente: registro }),
  tomar: () => {
    const registro = get().pendiente;
    set({ pendiente: null });
    return registro;
  },
}));
