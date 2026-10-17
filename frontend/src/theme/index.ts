import * as SecureStore from 'expo-secure-store';
import { Appearance, Platform, StyleSheet } from 'react-native';
import { create } from 'zustand';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { temas, type NombreTema, type Tema } from '@/theme/temas';

export { temas, type NombreTema, type Paleta, type Tema } from '@/theme/temas';

/** Lo que elige la persona en su perfil: seguir al teléfono o fijar un tema. */
export type PreferenciaTema = 'sistema' | NombreTema;

const CLAVE = 'arbolado.tema.v1';

function esPreferencia(valor: unknown): valor is PreferenciaTema {
  return valor === 'sistema' || valor === 'claro' || valor === 'oscuro';
}

async function leerPreferencia(): Promise<PreferenciaTema> {
  try {
    const valor = Platform.OS === 'web' ? window.localStorage.getItem(CLAVE) : await SecureStore.getItemAsync(CLAVE);
    return esPreferencia(valor) ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

async function guardarPreferencia(valor: PreferenciaTema) {
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(CLAVE, valor);
    else await SecureStore.setItemAsync(CLAVE, valor);
  } catch {
    // Si no se puede guardar, el tema elegido dura hasta cerrar la app.
  }
}

/** En el teléfono también se avisa al sistema, para que el teclado, los selectores y los avisos
 *  nativos usen el mismo tema que la app. */
function aplicarAlSistema(valor: PreferenciaTema) {
  if (Platform.OS === 'web') return;
  Appearance.setColorScheme(valor === 'sistema' ? 'unspecified' : valor === 'oscuro' ? 'dark' : 'light');
}

interface TemaState {
  preferencia: PreferenciaTema;
  hidratado: boolean;
  hidratar: () => Promise<void>;
  elegir: (preferencia: PreferenciaTema) => Promise<void>;
}

export const useTemaStore = create<TemaState>((set) => ({
  preferencia: 'sistema',
  hidratado: false,
  hidratar: async () => {
    const preferencia = await leerPreferencia();
    aplicarAlSistema(preferencia);
    set({ preferencia, hidratado: true });
  },
  elegir: async (preferencia) => {
    aplicarAlSistema(preferencia);
    set({ preferencia });
    await guardarPreferencia(preferencia);
  },
}));

/** Tema en uso: el elegido o, con "sistema", el del teléfono o el navegador. */
export function useNombreTema(): NombreTema {
  const preferencia = useTemaStore((state) => state.preferencia);
  const sistema = useColorScheme();
  if (preferencia !== 'sistema') return preferencia;
  return sistema === 'dark' ? 'oscuro' : 'claro';
}

/** Colores, degradados, sombras y superficies del tema en uso. */
export function useTema(): Tema {
  return temas[useNombreTema()];
}

/**
 * Hojas de estilo que dependen del tema. Se crean una vez por tema (al cargar el módulo) y el hook
 * devuelve la del tema en uso, así que cambiar de tema vuelve a pintar la pantalla con sus colores:
 *
 *   const useStyles = crearEstilos(({ palette }) => ({ titulo: { color: palette.ink } }));
 *   function Pantalla() { const styles = useStyles(); … }
 */
export function crearEstilos<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  fabrica: (tema: Tema) => T & StyleSheet.NamedStyles<any>,
): () => T {
  const hojas: Record<NombreTema, T> = {
    claro: StyleSheet.create(fabrica(temas.claro)),
    oscuro: StyleSheet.create(fabrica(temas.oscuro)),
  };
  return function useEstilos() {
    return hojas[useNombreTema()];
  };
}
