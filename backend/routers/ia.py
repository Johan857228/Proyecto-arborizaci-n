"""Identificación con IA: sugerencias de especie, etapa, interferencias y estado fitosanitario
a partir de las fotos del registro. La lógica y las reglas están en servicios/ia.py.

Cada análisis queda anotado (sin las fotos) con la especie sugerida, la confianza, los tokens y
el costo. Cuando el árbol se guarda con esa sugerencia se enlaza, y así se mide qué tan bien
acierta la IA (servicios/precision_ia.py)."""
import os
import time
from collections import defaultdict, deque
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from postgrest.exceptions import APIError

import db
from auth import Perfil, Sesion, admin_actual, perfil_actual, usuario_actual
from comun import MAX_FOTO_BYTES, inicio_del_dia, leer_foto, traer_todo
from servicios import ia
from servicios import precision_ia
from servicios.mapa import origen_de

router = APIRouter(prefix="/ia", tags=["IA"])

# Cada análisis cuesta saldo de la cuenta de Anthropic: se limita por usuario (en memoria; se
# reinicia con el servidor).
MAX_ANALISIS_POR_HORA = 30
_uso: dict[str, deque[float]] = defaultdict(deque)
LOTE_IN = 100


def _falta_migracion(error: APIError) -> bool:
    return str(getattr(error, "code", "") or "") in ("PGRST205", "42P01", "42703", "PGRST204")


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


def _trm() -> float | None:
    """Pesos por dólar para mostrar el costo en pesos (IA_TRM en el .env); sin ella, solo dólares."""
    try:
        valor = float(os.environ.get("IA_TRM", "") or 0)
    except ValueError:
        return None
    return valor if valor > 0 else None


def _analizar(general: UploadFile, detalle: UploadFile | None, usuario_id: str):
    """Valida las fotos, cobra el cupo y llama a la IA. Devuelve (análisis depurado, consumo, fotos)."""
    if not ia.configurada():
        raise HTTPException(
            status_code=503,
            detail="La identificación con IA no está activada: falta ANTHROPIC_API_KEY en el .env del backend.",
        )
    fotos = [leer_foto(general, MAX_FOTO_BYTES)[:2]]
    if detalle is not None:
        fotos.append(leer_foto(detalle, MAX_FOTO_BYTES)[:2])

    _registrar_uso(usuario_id)

    admin = db.get_admin()  # catálogos públicos
    especies = admin.table("especies").select("id, nombre_comun, nombre_cientifico").execute().data
    observaciones = admin.table("observaciones_catalogo").select("codigo, grupo, etiqueta").execute().data

    try:
        analisis, consumo = ia.analizar(fotos, especies, observaciones)
    except ia.ErrorIA as error:
        raise HTTPException(status_code=error.estado, detail=error.mensaje)

    depurado = ia.depurar(analisis, {e["id"] for e in especies}, {o["codigo"] for o in observaciones})
    return depurado, consumo, len(fotos)


def _anotar(perfil: Perfil, tipo: str, analisis: ia.AnalisisIA, consumo: ia.Consumo, fotos: int,
            especie_real_id: int | None = None) -> str | None:
    """Guarda el análisis (sin fotos). Si falta la migración 015 no se anota y el análisis sigue."""
    fila = {
        "usuario_id": perfil.usuario_id, "institucion_id": perfil.institucion_id, "tipo": tipo,
        "modelo": consumo.modelo[:80], "fotos": fotos, "es_arbol": analisis.es_arbol, "calidad_foto": analisis.calidad_foto,
        "especie_sugerida_id": analisis.especie.especie_id,
        "nombre_probable": (analisis.especie.nombre_probable or "")[:120] or None,
        "confianza": analisis.especie.confianza, "especie_real_id": especie_real_id,
        "tokens_entrada": consumo.tokens_entrada, "tokens_salida": consumo.tokens_salida,
        "tokens_cache_lectura": consumo.tokens_cache_lectura, "tokens_cache_escritura": consumo.tokens_cache_escritura,
        "costo_usd": consumo.costo_usd, "duracion_ms": consumo.duracion_ms,
    }
    try:
        filas = db.get_admin().table("analisis_ia").insert(fila).execute().data
    except APIError as error:
        if _falta_migracion(error):
            return None
        raise
    return str(filas[0]["id"]) if filas else None


def enlazar_analisis(analisis_id: str, arbol_id: str, usuario_id: str) -> None:
    """Enlaza el análisis al árbol que se guardó con sus sugerencias. Solo el de la misma persona,
    de campo y sin árbol todavía; si no se puede, el registro del árbol sigue igual."""
    admin = db.get_admin()
    try:
        filas = admin.table("analisis_ia").select("id, usuario_id, tipo, arbol_id").eq("id", analisis_id).execute().data
        if not filas:
            return
        fila = filas[0]
        if str(fila.get("usuario_id")) != str(usuario_id) or fila.get("tipo") != "campo" or fila.get("arbol_id"):
            return
        admin.table("analisis_ia").update({"arbol_id": arbol_id}).eq("id", analisis_id).execute()
    except APIError:
        return


# ===================================== Rutas =====================================
@router.get("/estado")
def estado(sesion: Sesion = Depends(usuario_actual)):
    """Si la identificación con IA está activada en este servidor y con qué modelo."""
    return {"disponible": ia.configurada(), "modelo": ia.MODELO}


@router.post("/analizar-foto", response_model=ia.AnalisisOut)
def analizar_foto(
    general: UploadFile = File(..., description="Foto general del árbol"),
    detalle: UploadFile | None = File(None, description="Foto de detalle (opcional)"),
    perfil: Perfil = Depends(perfil_actual),
):
    """Analiza la foto general (y la de detalle, si se envía) y devuelve sugerencias limitadas
    a los catálogos. No guarda el árbol: el formulario decide qué aplicar."""
    depurado, consumo, fotos = _analizar(general, detalle, perfil.usuario_id)
    analisis_id = _anotar(perfil, "campo", depurado, consumo, fotos)
    return ia.AnalisisOut(**depurado.model_dump(), modelo=consumo.modelo, analisis_id=analisis_id)


@router.post("/prueba")
def probar_con_especie_conocida(
    especie_id: int = Form(..., gt=0, description="Especie que de verdad muestra la foto"),
    general: UploadFile = File(..., description="Foto general de un árbol de especie conocida"),
    detalle: UploadFile | None = File(None, description="Foto de detalle (opcional)"),
    perfil: Perfil = Depends(admin_actual),
):
    """Prueba a ciegas: la IA no sabe qué especie es. El resultado entra en la medición de
    precisión como tipo 'prueba' (solo administradores)."""
    if not db.get_admin().table("especies").select("id").eq("id", especie_id).execute().data:
        raise HTTPException(status_code=404, detail="Especie no encontrada")
    depurado, consumo, fotos = _analizar(general, detalle, perfil.usuario_id)
    analisis_id = _anotar(perfil, "prueba", depurado, consumo, fotos, especie_real_id=especie_id)
    if analisis_id is None:
        raise HTTPException(status_code=409, detail="Falta aplicar la migración 015 (precisión de la IA) en Supabase")
    sugerida = depurado.especie.especie_id
    return {
        "analisis_id": analisis_id, "especie_real_id": especie_id, "especie_sugerida_id": sugerida,
        "nombre_probable": depurado.especie.nombre_probable, "confianza": depurado.especie.confianza,
        "razon": depurado.especie.razon, "acierto": sugerida == especie_id, "es_arbol": depurado.es_arbol,
        "calidad_foto": depurado.calidad_foto, "modelo": consumo.modelo, "costo_usd": consumo.costo_usd,
    }


def _en_lotes(cliente, tabla: str, columnas: str, columna: str, valores: list[str], extra=()) -> list[dict]:
    filas: list[dict] = []
    for i in range(0, len(valores), LOTE_IN):
        filas += traer_todo(cliente, tabla, columnas, filtros=[("in_", (columna, valores[i:i + LOTE_IN])), *extra])
    return filas


@router.get("/precision")
def precision(
    desde: date | None = Query(None, description="Solo análisis desde esta fecha"),
    perfil: Perfil = Depends(admin_actual),
):
    """Qué tan bien acierta la IA con la especie (general, por confianza, por origen, en las nativas
    del bosque seco del Cesar y por especie) y cuánto cuesta cada foto. Solo administradores."""
    admin = db.get_admin()
    filtros = [("gte", ("creado_en", inicio_del_dia(desde).isoformat()))] if desde else []
    try:
        analisis = traer_todo(admin, "analisis_ia", filtros=filtros)
    except APIError as error:
        if _falta_migracion(error):
            raise HTTPException(status_code=409, detail="Falta aplicar la migración 015 (precisión de la IA) en Supabase")
        raise

    arbol_ids = sorted({str(a["arbol_id"]) for a in analisis if a.get("arbol_id")})
    especie_arbol = {str(f["id"]): f.get("especie_id") for f in _en_lotes(admin, "arboles", "id, especie_id", "id", arbol_ids)}
    revision = {str(f["arbol_id"]): f.get("estado_revision") for f in _en_lotes(
        admin, "inspecciones", "id, arbol_id, estado_revision", "arbol_id", arbol_ids, [("eq", ("origen", "registro"))])}

    especies = {int(e["id"]): e for e in admin.table("especies").select("*").execute().data}
    try:
        fichas = {int(f["especie_id"]): f for f in traer_todo(admin, "especies_fuente_oficial", orden="especie_id")}
    except APIError as error:
        if not _falta_migracion(error):
            raise
        fichas = {}
    origenes = {i: (fichas.get(i) or {}).get("origen") or origen_de(e.get("nombre_cientifico"), e.get("origen"))
                for i, e in especies.items()}

    return {
        "desde": desde.isoformat() if desde else None,
        "modelo_actual": ia.MODELO,
        "tarifa": ia.TARIFA_VIGENTE,
        **precision_ia.resumen(analisis, especie_arbol, revision, especies, fichas, origenes, _trm()),
    }
