import { useState } from 'react';
import * as Location from 'expo-location';

export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export function useCaptureLocation() {
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function capture() {
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Permite el acceso a ubicación para continuar.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const result = {
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        accuracy: current.coords.accuracy,
      };
      setLocation(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo obtener el GPS.');
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { location, loading, error, capture };
}