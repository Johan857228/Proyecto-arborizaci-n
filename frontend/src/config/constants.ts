import { Platform } from 'react-native';

const localApiUrl = Platform.select({
  android: 'http://10.0.2.2:8000',
  default: 'http://127.0.0.1:8000',
});

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || localApiUrl;
export const SESSION_STORAGE_KEY = 'arbolado.session.v1';

export const palette = {
  ink: '#18372E',
  forest: '#245B45',
  leaf: '#B6D86B',
  canvas: '#F4F5F0',
  paper: '#FFFFFF',
  muted: '#68766F',
  line: '#DCE3DB',
  amber: '#C8873A',
  red: '#B74F43',
};