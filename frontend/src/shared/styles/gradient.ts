import { Platform, type ViewStyle } from 'react-native';

/**
 * Fondo con degradado CSS. En web React Native Web pasa `backgroundImage` tal cual al navegador;
 * en Android e iOS (nueva arquitectura) se usa `experimental_backgroundImage`.
 */
export function gradient(css: string): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
}
