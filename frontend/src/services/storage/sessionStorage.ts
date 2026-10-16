import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { SESSION_STORAGE_KEY } from '@/config/constants';
import type { Session } from '@/shared/types/entities';

export async function readStoredSession(): Promise<Session | null> {
  const value = Platform.OS === 'web'
    ? window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    : await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  if (!value) return null;

  try {
    return JSON.parse(value) as Session;
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function writeStoredSession(session: Session) {
  const value = JSON.stringify(session);
  if (Platform.OS === 'web') {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, value);
}

export async function clearStoredSession() {
  if (Platform.OS === 'web') {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}