import json

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.application.dto.registro import FiltrosArboles, FotoRecibida
from app.application.use_cases import arboles as casos
from app.core.exceptions import ErrorValidacion, NoEncontrado
from app.domain.enums import EstadoSanitario, TipoFoto
from app.domain.services.validaciones import FOTO_MAX_BYTES
from app.infrastructure.database.models import FotoModel, UsuarioModel
from app.infrastructure.storage.fotos import AlmacenFotos
from app.presentation.api.dependencies import get_almacen, get_db, puede_dar_de_baja, puede_registrar, puede_ver
from app.presentation.api.schemas.arboles import (
    ArbolResponse,
    BajaRequest,
    ListaArboles,
    ObservacionResponse,
    ResumenResponse,
    arbol_response,
    arbol_resumen,
    observacion_response,
)

router = APIRouter(tags=["Árboles"])

EJEMPLO_DATOS = """```json
{
  "institucion_id": "sj",
  "zona": "patio_central",
  "zona_otra": null,
  "latitud": 10.463722,
  "longitud": -73.253981,
  "fecha_hora": "2026-10-07T10:24:00-05:00",
  "especie_id": 1,
  "dap_cm": 45.5,
  "altura_m": 12.5,
  "copa_m": 8.4,
  "etapa": "adulto",
  "interferencia": "ninguna",
  "interferencia_otra": null,
  "observaciones": ["f_clorosis", "p_pulgones"]
}
```
En lugar de `dap_cm` se puede enviar `cap_cm` (circunferencia medida con cinta)."""


def _prefijo(request: Request) -> str:
    return request.app.state.settings.api_prefix.rstrip("/")


def _leer_datos(datos: str) -> dict:
    try:
        valor = json.loads(datos)
    except json.JSONDecodeError:
        valor = None
    if not isinstance(valor, dict):
        raise ErrorValidacion({"datos": "El campo datos debe ser un objeto JSON válido."})
    return valor


def _leer_fotos(
    completo: UploadFile | None, detalle: UploadFile | None, extras: list[UploadFile] | None
) -> list[FotoRecibida]:
    # Se lee un byte más del límite: alcanza para saber si el archivo es demasiado grande
    # sin cargar en memoria un archivo enorme.
    recibidas = [(TipoFoto.COMPLETO, completo), (TipoFoto.DETALLE, detalle)]
    recibidas += [(TipoFoto.EXTRA, extra) for extra in extras or []]
    return [
        FotoRecibida(tipo, archivo.filename, archivo.file.read(FOTO_MAX_BYTES + 1))
        for tipo, archivo in recibidas
        if archivo is not None and archivo.filename
    ]


@router.post(
    "/arboles",
    status_code=201,
    response_model=ArbolResponse,
    summary="Registrar un árbol nuevo",
    description=(
        "Roles: admin y registrador. Se envía como `multipart/form-data`: el campo `datos` con el JSON "
        "del formulario y las fotos en `foto_completo`, `foto_detalle` y `fotos_extra` (hasta 3). "
        "El sistema asigna el código y calcula el estado sanitario y los valores ambientales.\n\n" + EJEMPLO_DATOS
    ),
)
def crear_arbol(
    request: Request,
    datos: str = Form(...),
    foto_completo: UploadFile | None = File(None),
    foto_detalle: UploadFile | None = File(None),
    fotos_extra: list[UploadFile] | None = File(None),
    usuario: UsuarioModel = Depends(puede_registrar),
    db: Session = Depends(get_db),
    almacen: AlmacenFotos = Depends(get_almacen),
):
    fotos = _leer_fotos(foto_completo, foto_detalle, fotos_extra)
    arbol = casos.crear_arbol(db, almacen, _leer_datos(datos), fotos, usuario)
    return arbol_response(arbol, _prefijo(request))


@router.get("/arboles", response_model=ListaArboles, summary="Listar árboles")
def listar_arboles(
    institucion: str | None = Query(None, description="Id de la institución"),
    estado_sanitario: EstadoSanitario | None = None,
    buscar: str = Query("", description="Código, nombre común o científico (sin importar tildes)"),
    incluir_bajas: bool = False,
    desde: int = Query(0, ge=0),
    limite: int = Query(40, ge=1, le=200),
    _: UsuarioModel = Depends(puede_ver),
    db: Session = Depends(get_db),
):
    filtros = FiltrosArboles(institucion, estado_sanitario, buscar, incluir_bajas, desde, limite)
    pagina, total, conteos = casos.listar_arboles(db, filtros)
    return ListaArboles(
        total=total, desde=desde, limite=limite, conteos=conteos, items=[arbol_resumen(a) for a in pagina]
    )


@router.get("/arboles/{codigo}", response_model=ArbolResponse, summary="Detalle de un árbol")
def detalle_arbol(codigo: str, request: Request, _: UsuarioModel = Depends(puede_ver), db: Session = Depends(get_db)):
    return arbol_response(casos.consultar_arbol(db, codigo), _prefijo(request))


@router.get(
    "/arboles/{codigo}/observaciones",
    response_model=list[ObservacionResponse],
    summary="Historial de visitas (de la más antigua a la más reciente)",
)
def historial(codigo: str, request: Request, _: UsuarioModel = Depends(puede_ver), db: Session = Depends(get_db)):
    prefijo = _prefijo(request)
    return [observacion_response(o, prefijo) for o in casos.consultar_arbol(db, codigo).observaciones]


@router.post(
    "/arboles/{codigo}/observaciones",
    status_code=201,
    response_model=ArbolResponse,
    summary="Registrar una visita nueva a un árbol",
    description="Roles: admin y registrador. Igual que registrar un árbol, sin institución, zona ni especie.",
)
def registrar_visita(
    codigo: str,
    request: Request,
    datos: str = Form(...),
    foto_completo: UploadFile | None = File(None),
    foto_detalle: UploadFile | None = File(None),
    fotos_extra: list[UploadFile] | None = File(None),
    usuario: UsuarioModel = Depends(puede_registrar),
    db: Session = Depends(get_db),
    almacen: AlmacenFotos = Depends(get_almacen),
):
    fotos = _leer_fotos(foto_completo, foto_detalle, fotos_extra)
    arbol = casos.registrar_visita(db, almacen, codigo, _leer_datos(datos), fotos, usuario)
    return arbol_response(arbol, _prefijo(request))


@router.post(
    "/arboles/{codigo}/baja",
    response_model=ArbolResponse,
    summary="Dar de baja un árbol (solo admin)",
    description="El árbol conserva su historial, pero deja de aparecer en la lista y no admite visitas nuevas.",
)
def dar_de_baja(
    codigo: str,
    datos: BajaRequest,
    request: Request,
    _: UsuarioModel = Depends(puede_dar_de_baja),
    db: Session = Depends(get_db),
):
    casos.dar_de_baja(db, codigo, datos.motivo)
    return arbol_response(casos.consultar_arbol(db, codigo), _prefijo(request))


@router.get("/fotos/{foto_id}", response_class=FileResponse, summary="Archivo de una fotografía")
def ver_foto(
    foto_id: int,
    _: UsuarioModel = Depends(puede_ver),
    db: Session = Depends(get_db),
    almacen: AlmacenFotos = Depends(get_almacen),
):
    foto = db.get(FotoModel, foto_id)
    ruta = almacen.ruta(foto.ruta) if foto else None
    if ruta is None or not ruta.is_file():
        raise NoEncontrado(f"No existe la foto {foto_id}.")
    return FileResponse(ruta, media_type=foto.mime)


@router.get("/reportes/resumen", response_model=ResumenResponse, summary="Totales por estado sanitario")
def resumen(_: UsuarioModel = Depends(puede_ver), db: Session = Depends(get_db)):
    return casos.resumen(db)
