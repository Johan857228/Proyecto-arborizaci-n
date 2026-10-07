# Mi Proyecto — Backend (FastAPI) + Frontend (React)

Repositorio único que contiene el backend y el frontend del proyecto, cada uno en su propia carpeta.

```
mi-proyecto/
├── backend/        # API en FastAPI (Python)
├── frontend/        # Interfaz en React
├── .gitignore
└── README.md
```

## Requisitos previos

- Python 3.12+ instalado (o Docker Desktop para levantar el backend con `docker compose`)
- Node.js y npm instalados

## Cómo levantar el backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux

copy .env.example .env        # Windows (en macOS/Linux: cp .env.example .env)
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

El backend queda disponible en `http://127.0.0.1:8000` (documentación interactiva en `/api/docs`). Los detalles de configuración están en [backend/README.md](backend/README.md).

Con Docker (backend + PostgreSQL en un solo paso):

```bash
cd backend
copy .env.example .env        # completa POSTGRES_PASSWORD
docker compose up --build -d
```

Para mostrar la app en celulares con GPS (requiere HTTPS) hay un modo de presentación con túnel HTTPS: `docker compose --profile presentacion up -d`. Los pasos están en [backend/README.md](backend/README.md#https-necesario-para-el-gps).

## Cómo levantar el frontend

```bash
cd frontend
npm install
npm start
```

El frontend queda disponible normalmente en `http://localhost:3000`.

## Flujo de trabajo del equipo

- Cada tarea se trabaja en su propia rama: `feature/backend-...` o `feature/frontend-...`.
- Nadie sube `venv/` ni `node_modules/` — cada persona los genera localmente a partir de `requirements.txt` y `package.json`.
- Los cambios se integran a `main` mediante Pull Request, revisados por al menos un compañero.
- Si el backend cambia la forma de los datos que devuelve (modelos Pydantic), avisar al equipo de frontend antes de mergear.

## Variables de entorno

Cada carpeta (`backend/` y `frontend/`) maneja su propio archivo `.env`, que no se sube a Git. Cada una trae una plantilla sin secretos, `.env.example`, que se copia como `.env` y se completa:

- `backend/.env.example`: base de datos, `JWT_SECRET`, CORS y carpeta de fotos. La lista completa está en [backend/README.md](backend/README.md).
- `frontend/.env.example`: dirección de la API. Como el frontend usa Vite, las variables deben empezar por `VITE_` (no `REACT_APP_`):

```
VITE_API_URL=http://localhost:8000/api
```

Nunca escribas contraseñas ni secretos en los `.env.example`, porque esos sí se suben a Git.
