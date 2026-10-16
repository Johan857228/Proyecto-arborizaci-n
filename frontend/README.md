# Frontend — Inventario arbóreo escolar

Aplicación Expo + React Native + TypeScript. El formulario de inicio de sesión
consume `POST /auth/login` y envía `email` y `password`; la sesión recibida se
almacena en SecureStore en Android/iOS y en `sessionStorage` durante la pestaña
actual en web.

## Ejecutar para desarrollo web

1. Inicia el backend desde `backend` siguiendo sus instrucciones.
2. En otra terminal:

   ```powershell
   cd frontend
   npm install
   npm run web
   ```

La app web abre en `http://localhost:3000`, puerto permitido por la configuración
CORS local habitual de la API. Si se personaliza `CORS_ORIGINS` en la configuración
del backend, agrega también ese origen.

## URL de la API

Sin `EXPO_PUBLIC_API_URL`, el frontend usa:

- Web/iOS simulator: `http://127.0.0.1:8000`
- Emulador Android: `http://10.0.2.2:8000`

Para un teléfono físico, crea `frontend/.env` basado en `.env.example` y asigna
`EXPO_PUBLIC_API_URL` a la IP local del computador, por ejemplo
`http://192.168.1.20:8000`. El computador y el teléfono deben estar en la misma red.

## Inventario y registro de árboles

El inventario consume `GET /arboles` con filtros y paginación, y obtiene las
opciones permitidas desde `GET /catalogos`. El formulario valida los campos en
tiempo real y al guardar; también valida las referencias contra esos catálogos.
El árbol se envía a `POST /arboles` sin código: el código que se muestra después
de guardar es el devuelto por el servidor. Las fotografías se validan antes de
crear el registro según los metadatos disponibles del selector y se envían por
`POST /arboles/{id}/fotos`, donde el servidor vuelve a validar el archivo.

La capa `TreesGateway` separa las pantallas del transporte HTTP para facilitar
la adaptación a futuros contratos. El frontend no genera datos de ejemplo ni
simula inspecciones históricas: esas funciones requieren que el backend publique
sus contratos y endpoints antes de conectarlas.

## Iniciar sesión

El frontend no contiene usuarios ni contraseñas. En modo SQLite temporal, utiliza
las credenciales de demostración configuradas por el backend (por defecto,
`demo@arboles.local` / `demo123`); la pantalla las muestra solo cuando `/salud`
informa que el almacenamiento es temporal. En modo Supabase utiliza las cuentas
creadas por el equipo backend.

La contraseña no se guarda. En web la sesión termina al cerrar la pestaña; en
dispositivos móviles se usa el almacenamiento seguro del sistema.

## Validar cambios

```powershell
npm run typecheck
npm run lint
npm test
```

Las pruebas usan Jest con el preset `jest-expo` y viven en carpetas `__tests__/`
junto al código que prueban. `npm run test:watch` las vuelve a ejecutar al guardar.

En un clon nuevo, arranca Expo una vez (`npm run web`) antes de `npm run typecheck`:
Expo genera `expo-env.d.ts` con los tipos de los archivos CSS (no se sube a Git).

El modo SQLite y sus fotos son provisionales y pertenecen al backend. No uses la
cuenta de demostración ni los datos locales para información real o producción.
