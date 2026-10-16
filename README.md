# Inventario Arbóreo Escolar — Backend (FastAPI) + Frontend (Expo)

Repositorio único que contiene el backend y el frontend del proyecto, cada uno en su propia carpeta.

```
Proyecto-arborizaci-n/
├── backend/         # API en FastAPI (Python) conectada a Supabase
├── frontend/        # App en Expo + React Native + TypeScript (web, Android e iOS)
├── .gitignore
└── README.md
```

## Requisitos previos

- Python 3.10+ instalado
- Node.js (versión LTS) y npm instalados
- Las claves del proyecto de Supabase (las comparte el equipo backend)

## Cómo levantar el backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux

pip install -r requerimientos.txt
uvicorn main:app --reload
```

Antes de arrancarlo, copia `backend/.env.example` como `backend/.env` y completa las claves de Supabase
(ver [Variables de entorno](#variables-de-entorno)).

**Base de datos:** aplica una vez, en Supabase → SQL Editor y en este orden,
`backend/sql/001_fase1_modulos.sql`, `backend/sql/002_fase2_metas_escenarios.sql`,
`backend/sql/003_validaciones.sql` y `backend/sql/004_agentes_bioticos.sql`. Las dos primeras crean
las tablas de inspecciones, revisión, intervenciones, cursos, presupuestos, configuración, metas y
escenarios sin borrar datos; la tercera agrega en la base los mismos límites que validan el
formulario y la API (medidas máximas, coordenadas dentro de Colombia y largo de los textos "Otra"),
y la cuarta agrega a cada inspección las variables de agentes bióticos FB-01 a FB-06. Después asigna
el rol de administrador a tu cuenta (instrucciones al final del primer archivo y en
[`backend/README_backend.md`](backend/README_backend.md#migraciones-de-la-base-de-datos)).

El backend queda disponible en `http://127.0.0.1:8000` (documentación interactiva en `/docs`).
Pruebas: `python -m pytest -q` (usan un Supabase falso, no necesitan claves). Más detalles en
[`backend/README_backend.md`](backend/README_backend.md).

## Cómo levantar el frontend

```bash
cd frontend
npm install
npm run web
```

La versión web queda disponible en `http://localhost:3000`. Para Android o iOS usa `npm start`
(abre el servidor de Expo para Expo Go o un emulador). Más detalles en
[`frontend/README.md`](frontend/README.md).

Antes de subir cambios del frontend:

```bash
npm run typecheck
npm run lint
npm test
```

La primera vez, arranca Expo una vez (`npm run web`) antes de `npm run typecheck`: Expo genera
`expo-env.d.ts`, que trae los tipos de los archivos CSS y no se sube a Git.

Si clonas el proyecto en una carpeta cuyo nombre tiene paréntesis (por ejemplo `Nueva carpeta (7)`),
`npm test` y `npm run lint` fallan por cómo jest-expo y ESLint leen esas rutas en Windows. Usa una carpeta
sin paréntesis.

## Flujo de trabajo del equipo

- Cada tarea se trabaja en su propia rama: `feature/backend-...` o `feature/frontend-...`.
- Nadie sube `venv/`, `node_modules/` ni `frontend/.expo/` — cada persona los genera localmente a partir de `requerimientos.txt` y `package.json`.
- En el frontend, los paquetes se agregan con `npx expo install <paquete>` (elige versiones compatibles con el SDK de Expo), no con `npm install <paquete>`.
- Los cambios se integran a `main` mediante Pull Request, revisados por al menos un compañero.
- Si el backend cambia la forma de los datos que devuelve (modelos Pydantic), avisar al equipo de frontend antes de mergear.

## Variables de entorno

Cada carpeta (`backend/` y `frontend/`) maneja su propio archivo `.env` (no se sube a Git), basado en su `.env.example`.

`backend/.env` (obligatorio):

```
SUPABASE_URL=https://TU_ID.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_KEY=sb_secret_...
CORS_ORIGINS=
URL_FRONTEND=
```

`CORS_ORIGINS` es opcional: cualquier puerto de `localhost` y `127.0.0.1` ya está permitido.
`URL_FRONTEND` es la dirección pública del frontend; el enlace del correo que confirma una cuenta
nueva lleva ahí (sin ella, Supabase usa la Site URL del proyecto).

`frontend/.env` (opcional): solo hace falta para probar en un teléfono físico, apuntando a la IP del computador:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000
```

## Despliegue

| Parte | Dónde | Dirección |
|---|---|---|
| Frontend (Expo web) | Vercel, proyecto `inventario-arboreo` | https://inventario-arboreo.vercel.app |
| Backend (FastAPI) | Railway, proyecto `inventario-arboreo`, servicio `backend` | https://backend-production-2f7d.up.railway.app |
| Base de datos, Auth y fotos | Supabase, proyecto `inventario-arboreo` | migraciones `backend/sql/001` → `002` → `003` → `004` ya aplicadas |

Variables configuradas:

- Railway (`backend`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `CORS_ORIGINS`
  (los dominios de Vercel) y `URL_FRONTEND`. El arranque y la comprobación de salud (`/salud`) están en
  `backend/railway.json`.
- Vercel: `EXPO_PUBLIC_API_URL` con la dirección del backend. Se lee al compilar, así que si cambia hay
  que volver a desplegar el frontend. La compilación y las rutas dinámicas están en `frontend/vercel.json`.

Para publicar cambios desde una copia local con las CLI (`vercel login` y `railway login` una vez):

```bash
cd backend && railway up --service backend
cd frontend && vercel deploy --prod
```

Las cuentas se crean en Supabase → Authentication → Users → Add user. Al crearlas, la base les genera
el perfil como estudiante sin institución, y un administrador les asigna rol, institución y curso en la
app, en Módulos → Usuarios.
