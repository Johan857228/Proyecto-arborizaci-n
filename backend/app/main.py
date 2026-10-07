"""Punto de entrada del backend: arma la aplicación FastAPI.

Ejecutar en desarrollo (desde la carpeta backend):
    uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import Settings, get_settings
from app.core.database import crear_engine, crear_sesiones
from app.presentation.api.routes import salud


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    prefijo = settings.api_prefix.rstrip("/")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.storage_path.mkdir(parents=True, exist_ok=True)
        engine = crear_engine(settings.url_base_datos)
        app.state.engine = engine
        app.state.sesiones = crear_sesiones(engine)
        yield
        engine.dispose()

    app = FastAPI(
        title="Inventario Arbóreo Escolar - API",
        version="0.1.0",
        docs_url=f"{prefijo}/docs",
        redoc_url=f"{prefijo}/redoc",
        openapi_url=f"{prefijo}/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings

    origenes = settings.lista_cors
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origenes,
        # Los navegadores no aceptan credenciales con el comodín *.
        allow_credentials="*" not in origenes,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(salud.router, prefix=prefijo)

    @app.get("/", include_in_schema=False)
    def raiz():
        return RedirectResponse(f"{prefijo}/docs")

    return app


app = create_app()
