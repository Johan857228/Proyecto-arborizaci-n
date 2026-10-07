"""Punto de entrada del backend: arma la aplicación FastAPI.

Ejecutar en desarrollo (desde la carpeta backend):
    uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import Settings, get_settings
from app.core.database import Base, crear_engine, crear_sesiones
from app.infrastructure.database import models  # noqa: F401  (registra las tablas)
from app.infrastructure.storage.fotos import AlmacenFotos
from app.presentation.api.routes import arboles, auth, catalogos, salud, usuarios
from app.presentation.middleware.errores import registrar_manejadores
from seeds.catalogos import cargar_catalogos
from seeds.usuarios import crear_admin_inicial


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    prefijo = settings.api_prefix.rstrip("/")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.storage_path.mkdir(parents=True, exist_ok=True)
        app.state.almacen = AlmacenFotos(settings.storage_path)
        engine = crear_engine(settings.url_base_datos)
        app.state.engine = engine
        app.state.sesiones = crear_sesiones(engine)
        # Mientras no haya migraciones con Alembic, las tablas que falten se crean al arrancar.
        Base.metadata.create_all(engine)
        with app.state.sesiones() as db:
            cargar_catalogos(db)
            contrasena = settings.admin_password.get_secret_value() if settings.admin_password else None
            crear_admin_inicial(db, settings.admin_email, contrasena)
        yield
        engine.dispose()

    app = FastAPI(
        title="Inventario Arbóreo Escolar - API",
        version="0.2.0",
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
    registrar_manejadores(app)

    for modulo in (salud, auth, usuarios, catalogos, arboles):
        app.include_router(modulo.router, prefix=prefijo)

    @app.get("/", include_in_schema=False)
    def raiz():
        return RedirectResponse(f"{prefijo}/docs")

    return app


app = create_app()
