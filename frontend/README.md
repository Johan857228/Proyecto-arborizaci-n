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

Al registrar un árbol el backend crea su primera inspección; después se abre su
ficha con el estado actual, los cálculos ambientales, las recomendaciones, las
intervenciones y el historial de inspecciones.

## Módulos y pantallas

Todas las respuestas del backend se validan con Zod antes de usarlas
(`getValidado` / `enviarValidado` en `services/api/client.ts`).

| Ruta | Módulo | Quién la ve |
|---|---|---|
| `/` | Inicio: estado del arbolado, revisión pendiente, puntos y accesos según el rol | Todos |
| `/modules` | Todos los módulos agrupados (también en la barra de navegación) | Todos |
| `/trees`, `/trees/new`, `/trees/[id]` | Inventario, registro y ficha del árbol | Todos |
| `/trees/[id]/inspect`, `/inspections/[id]` | Inspección de seguimiento y su detalle | Todos |
| `/review` | Revisión: confirmar o anular inspecciones pendientes | Docente, admin |
| `/interventions`, `/trees/[id]/intervention` | Intervenciones y recomendaciones | Todos (registrar: docente, admin) |
| `/courses`, `/courses/[id]` | Cursos, zonas asignadas, integrantes y avance | Todos (gestionar: docente, admin) |
| `/budgets`, `/budgets/[id]` | Presupuestos por periodo y proyecciones | Docente, admin |
| `/settings`, `/settings/method-new` | Parámetros, versiones del método y costos | Docente (consulta), admin |
| `/progress` | Puntos, niveles, rachas, logros y rankings | Todos |
| `/reports` | Indicadores de inventario, riesgo, cobertura, productividad e intervenciones | Todos |
| `/goals` | Metas institucionales y su avance | Todos (registrar: admin) |
| `/scenarios` | Escenarios presupuestales | Docente, admin |
| `/users`, `/profile` | Usuarios y perfil propio | Docente/admin · todos |

Los permisos de la interfaz solo ocultan lo que no corresponde: quien decide es
el backend (y el RLS de Supabase). La lista de módulos y quién ve cada uno está en
`features/modules/modulos.ts`; la usan el inicio, la pantalla `/modules` y la
barra de navegación.

Los formularios aplican los mismos límites que la API y la base de datos: las
medidas y el GPS de la inspección de seguimiento siguen las reglas del registro
del árbol, y los montos tienen el tope que acepta el backend. Si aun así la API
rechaza un dato, `describeApiDetail` (`shared/utils/apiErrors.ts`) muestra en
español qué campos revisar.

## Iniciar sesión

El frontend no contiene usuarios ni contraseñas: usa las cuentas creadas en
Supabase Auth. El rol, la institución y el curso de cada cuenta se ven en
`/profile` y los asigna el administrador.

La contraseña no se guarda. En web la sesión termina al cerrar la pestaña; en
dispositivos móviles se usa el almacenamiento seguro del sistema. Cuando el
token vence (una hora), la app lo renueva sola con `POST /auth/refresh`; si no
puede, cierra la sesión y lo avisa en la pantalla de inicio.

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

Si la carpeta del proyecto tiene paréntesis en el nombre (por ejemplo
`Nueva carpeta (7)`), jest-expo y ESLint no resuelven bien las rutas en Windows:
clona el proyecto en una carpeta sin paréntesis.
