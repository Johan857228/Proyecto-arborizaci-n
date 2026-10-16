"""Identificación con IA: sugerencias de especie, etapa, interferencias y estado fitosanitario
a partir de las fotos del registro. La lógica y las reglas están en servicios/ia.py."""
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

import db
from auth import Sesion, usuario_actual
from comun import MAX_FOTO_BYTES, leer_foto
from servicios import ia

router = APIRouter(prefix="/ia", tags=["IA"])

# Cada análisis cuesta saldo de la cuenta de Anthropic: se limita por usuario (en memoria; se
# reinicia con el servidor).
MAX_ANALISIS_POR_HORA = 30
_uso: dict[str, deque[float]] = defaultdict(deque)


def _registrar_uso(usuario_id: str) -> None:
    ahora = time.monotonic()
    recientes = _uso[usuario_id]
    while recientes and ahora - recientes[0] > 3600:
        recientes.popleft()
    if len(recientes) >= MAX_ANALISIS_POR_HORA:
        raise HTTPException(
            status_code=429,
            detail=f"Llegaste al máximo de {MAX_ANALISIS_POR_HORA} análisis por hora. Intenta más tarde.",
        )
    recientes.append(ahora)


@router.get("/estado")
def estado(sesion: Sesion = Depends(usuario_actual)):
    """Si la identificación con IA está activada en este servidor y con qué modelo."""
    return {"disponible": ia.configurada(), "modelo": ia.MODELO}


@router.post("/analizar-foto", response_model=ia.AnalisisOut)
def analizar_foto(
    general: UploadFile = File(..., description="Foto general del árbol"),
    detalle: UploadFile | None = File(None, description="Foto de detalle (opcional)"),
    sesion: Sesion = Depends(usuario_actual),
):
    """Analiza la foto general (y la de detalle, si se envía) y devuelve sugerencias limitadas
    a los catálogos. No guarda nada: el formulario decide qué aplicar."""
    if not ia.configurada():
        raise HTTPException(
            status_code=503,
            detail="La identificación con IA no está activada: falta ANTHROPIC_API_KEY en el .env del backend.",
        )
    fotos = [leer_foto(general, MAX_FOTO_BYTES)[:2]]
    if detalle is not None:
        fotos.append(leer_foto(detalle, MAX_FOTO_BYTES)[:2])

    _registrar_uso(sesion.user_id)

    admin = db.get_admin()  # catálogos públicos
    especies = admin.table("especies").select("id, nombre_comun, nombre_cientifico").execute().data
    observaciones = admin.table("observaciones_catalogo").select("codigo, grupo, etiqueta").execute().data

    try:
        analisis = ia.analizar(fotos, especies, observaciones)
    except ia.ErrorIA as error:
        raise HTTPException(status_code=error.estado, detail=error.mensaje)

    depurado = ia.depurar(analisis, {e["id"] for e in especies}, {o["codigo"] for o in observaciones})
    return ia.AnalisisOut(**depurado.model_dump(), modelo=ia.MODELO)
