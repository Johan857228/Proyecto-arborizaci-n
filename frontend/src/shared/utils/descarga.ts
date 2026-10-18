import { Linking, Platform } from 'react-native';

/** Abre un enlace de descarga (exportaciones, certificados). En web la descarga empieza sin salir
 *  de la app (el enlace trae Content-Disposition); en el teléfono se abre en el navegador, que la
 *  guarda en Descargas. */
export async function abrirDescarga(url: string) {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}
