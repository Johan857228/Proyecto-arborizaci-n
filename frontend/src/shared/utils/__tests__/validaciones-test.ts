import { describe, expect, it } from '@jest/globals';
import { loginSchema } from '@/features/auth/schemas';
import { describeApiDetail } from '@/shared/utils/apiErrors';
import { distanceKm, isInColombia } from '@/shared/utils/geo';

describe('describeApiDetail', () => {
  it('devuelve el texto cuando el servidor envía un mensaje propio', () => {
    expect(describeApiDetail('Árbol no encontrado')).toBe('Árbol no encontrado');
  });

  it('convierte la lista de errores 422 de FastAPI en un texto con campos legibles', () => {
    const detalle = [
      { loc: ['body', 'altura_m'], msg: 'Input should be less than or equal to 25', type: 'less_than_equal' },
      { loc: ['body', 'dap_cm'], msg: 'Input should be greater than 0', type: 'greater_than' },
    ];
    expect(describeApiDetail(detalle)).toBe('El servidor rechazó estos datos: altura, diámetro del tronco. Revísalos e intenta de nuevo.');
  });

  it('usa el mensaje del backend en las validaciones del formulario completo', () => {
    const detalle = [{ loc: ['body'], msg: "Value error, Si la zona es 'Otra', escribe cuál en zona_otra" }];
    expect(describeApiDetail(detalle)).toContain("Si la zona es 'Otra', escribe cuál en zona_otra");
  });

  it('no devuelve texto para respuestas sin detalle', () => {
    expect(describeApiDetail(undefined)).toBeNull();
  });
});

describe('geo', () => {
  it('reconoce coordenadas dentro y fuera de Colombia', () => {
    expect(isInColombia(10.4631, -73.2532)).toBe(true); // Valledupar
    expect(isInColombia(0, 0)).toBe(false);
    expect(isInColombia(40.4168, -3.7038)).toBe(false); // Madrid
  });

  it('calcula la distancia entre dos puntos en km', () => {
    // Valledupar → Barranquilla: cerca de 200 km en línea recta.
    const km = distanceKm({ lat: 10.4631, lng: -73.2532 }, { lat: 10.9685, lng: -74.7813 });
    expect(km).toBeGreaterThan(170);
    expect(km).toBeLessThan(190);
  });
});

describe('loginSchema', () => {
  it('quita espacios y mayúsculas del correo antes de validarlo', () => {
    const resultado = loginSchema.safeParse({ email: '  Docente@Colegio.edu.co ', password: 'secreto' });
    expect(resultado.success).toBe(true);
    expect(resultado.data?.email).toBe('docente@colegio.edu.co');
  });
});
