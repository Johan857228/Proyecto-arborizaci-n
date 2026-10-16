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
```

`CORS_ORIGINS` es opcional: cualquier puerto de `localhost` y `127.0.0.1` ya está permitido.

`frontend/.env` (opcional): solo hace falta para probar en un teléfono físico, apuntando a la IP del computador:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000
```
