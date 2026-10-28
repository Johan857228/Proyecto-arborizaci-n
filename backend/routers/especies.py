"""Catálogo de especies con fuente oficial (migración 015): nativa o exótica, invasora,
amenazada, en veda y de bosque seco, con la versión y el DOI de cada lista.

El administrador consulta las listas oficiales (servicios/fuentes_oficiales.py) y registra la
veda con su norma; todos pueden ver la ficha. Al consultar, el origen oficial también queda en
`especies.origen` (migración 011), que es el que usan el mapa, las siembras y el PRAE."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator

import datos
import db
from auth import Perfil, admin_actual, perfil_actual
from comun import ahora, es_columna_faltante, traer_todo
from servicios import fuentes_oficiales as fuentes
from servicios.mapa import EXOTICA, NATIVA, origen_sugerido

router = APIRouter(prefix="/especies", tags=["Catálogo de especies"])

Origen = Literal["nativa", "exotica"]
MIGRACION = "Falta aplicar la migración 015 (catálogo con fuente oficial) en Supabase"


def _falta_migracion(error: APIError) -> bool:
    return str(getattr(error, "code", "") or "") in ("PGRST205", "42P01")


# ===================================== Modelos =====================================
class FuenteOut(BaseModel):
    clave: str
    titulo: str
    editor: str
    version: str | None = None
    doi: str | None = None
    publicado: str | None = None
    encontrada: bool
    registro_url: str | None = None
    dato: str


class FichaOut(BaseModel):
    nombre_consultado: str
    nombre_aceptado: str | None = None
    coincidencia: Literal["exacta", "sinonimo", "no_encontrada"]
    en_catalogo: bool
    departamentos: list[str]
    en_cesar: bool
    forma_de_vida: str | None = None
    origen: Origen | None = None
    estatus: Literal["cultivada", "naturalizada", "trasplantada"] | None = None
    invasora: bool | None = None
    riesgo_invasion: str | None = None
    amenaza: Literal["CR", "EN", "VU"] | None = None
    bosque_seco: bool
    bosque_seco_cesar: bool = Field(description="Nativa, de bosque seco y registrada en el Cesar")
    avisos: list[str]
    fuentes: list[FuenteOut]
    consultado_en: str | None = None
    veda: str | None = None
    veda_url: str | None = None
    veda_registrada_en: str | None = None


class EspecieCatalogoOut(BaseModel):
    id: int
    nombre_comun: str
    nombre_cientifico: str | None = None
    origen: Origen | None = None
    origen_fuente: Literal["oficial", "administrador", "app"] | None = Field(
        default=None, description="oficial: listas del SiB; administrador: lo cambió a mano; app: lista del backend")
    arboles: int = Field(description="Árboles de esa especie que ve quien consulta")
    ficha: FichaOut | None = None


class ResumenCatalogo(BaseModel):
    especies: int
    con_ficha: int
    nativas: int
    exoticas: int
    invasoras: int
    amenazadas: int
    en_veda: int
    bosque_seco_cesar: int
    arboles: int
    pct_arboles_nativos: float | None = None
    arboles_bosque_seco_cesar: int
    arboles_invasoras: int


class ListaOut(BaseModel):
    clave: str
    titulo: str
    editor: str


class CatalogoOut(BaseModel):
    especies: list[EspecieCatalogoOut]
    resumen: ResumenCatalogo
    listas: list[ListaOut]
    editable: bool = Field(description="True si quien pide puede consultar fuentes y registrar vedas")
    migracion_pendiente: bool


class VedaIn(BaseModel):
    veda: str | None = Field(default=None, min_length=3, max_length=300, description="Norma que establece la veda; vacío la quita")
    veda_url: str | None = Field(default=None, max_length=300, pattern=r"^https?://\S+$")

    @field_validator("veda", "veda_url", mode="before")
    @classmethod
    def _limpiar(cls, v):
        if isinstance(v, str):
            v = " ".join(v.split())
        return v or None


# ==================================== Consultas ====================================
def fichas_por_especie() -> tuple[dict[int, dict], bool]:
    """Ficha oficial de cada especie y si la tabla existe."""
    try:
        filas = traer_todo(db.get_admin(), "especies_fuente_oficial", orden="especie_id")
    except APIError as error:
        if _falta_migracion(error):
            return {}, False
        raise
    return {int(f["especie_id"]): f for f in filas}, True


def marcas(ficha: dict | None) -> dict:
    """Lo que /catalogos lleva de la ficha para avisar al sembrar o intervenir."""
    if not ficha:
        return {}
    return {"invasora": ficha.get("invasora"), "amenaza": ficha.get("amenaza"), "en_veda": bool(ficha.get("veda"))}


def _ficha_out(f: dict | None) -> dict | None:
    if not f:
        return None
    return {**f, "departamentos": f.get("departamentos") or [], "avisos": f.get("avisos") or [],
            "fuentes": f.get("fuentes") or [], "bosque_seco_cesar": fuentes.bosque_seco_del_cesar(f),
            **{k: str(f[k]) if f.get(k) is not None else None for k in ("consultado_en", "veda_registrada_en")}}


def _origen(especie: dict, ficha: dict | None) -> tuple[str | None, str | None]:
    guardado, oficial = especie.get("origen"), (ficha or {}).get("origen")
    if guardado in (NATIVA, EXOTICA):
        return guardado, "oficial" if guardado == oficial else "administrador"
    if oficial:
        return oficial, "oficial"
    sugerido = origen_sugerido(especie.get("nombre_cientifico"))
    return sugerido, "app" if sugerido else None


def _entrada(especie: dict, ficha: dict | None, arboles: int) -> dict:
    origen, fuente = _origen(especie, ficha)
    return {"id": especie["id"], "nombre_comun": especie["nombre_comun"], "nombre_cientifico": especie.get("nombre_cientifico"),
            "origen": origen, "origen_fuente": fuente, "arboles": arboles, "ficha": _ficha_out(ficha)}


def _especie(especie_id: int) -> dict:
    filas = db.get_admin().table("especies").select("*").eq("id", especie_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Especie no encontrada")
    return filas[0]


def _resumen(entradas: list[dict]) -> dict:
    def cuenta(condicion) -> int:
        return sum(1 for e in entradas if condicion(e))

    def arboles(condicion) -> int:
        return sum(e["arboles"] for e in entradas if condicion(e))

    def ficha(e) -> dict:
        return e["ficha"] or {}

    total = arboles(lambda e: True)
    nativos = arboles(lambda e: e["origen"] == NATIVA)
    return {
        "especies": len(entradas),
        "con_ficha": cuenta(lambda e: e["ficha"] is not None),
        "nativas": cuenta(lambda e: e["origen"] == NATIVA),
        "exoticas": cuenta(lambda e: e["origen"] == EXOTICA),
        "invasoras": cuenta(lambda e: ficha(e).get("invasora") is True),
        "amenazadas": cuenta(lambda e: ficha(e).get("amenaza") is not None),
        "en_veda": cuenta(lambda e: bool(ficha(e).get("veda"))),
        "bosque_seco_cesar": cuenta(lambda e: ficha(e).get("bosque_seco_cesar") is True),
        "arboles": total,
        "pct_arboles_nativos": round(100 * nativos / total, 1) if total else None,
        "arboles_bosque_seco_cesar": arboles(lambda e: ficha(e).get("bosque_seco_cesar") is True),
        "arboles_invasoras": arboles(lambda e: ficha(e).get("invasora") is True),
    }


# ===================================== Rutas =====================================
@router.get("/catalogo", response_model=CatalogoOut)
def ver_catalogo(perfil: Perfil = Depends(perfil_actual)):
    """Las especies del catálogo con su ficha oficial y cuántos árboles de cada una ve quien
    consulta (su institución; el administrador, todas)."""
    especies = db.get_admin().table("especies").select("*").order("nombre_comun").execute().data
    fichas, con_tabla = fichas_por_especie()
    conteo: dict[int, int] = {}
    if perfil.es_admin or perfil.institucion_id:
        cliente = db.cliente_de_usuario(perfil.sesion.token)
        for a in datos.arboles(cliente, None if perfil.es_admin else perfil.institucion_id):
            if a.get("especie_id") is not None:
                conteo[int(a["especie_id"])] = conteo.get(int(a["especie_id"]), 0) + 1
    entradas = [_entrada(e, fichas.get(int(e["id"])), conteo.get(int(e["id"]), 0)) for e in especies]
    return {
        "especies": entradas,
        "resumen": _resumen(entradas),
        "listas": [{"clave": x.clave, "titulo": x.titulo, "editor": x.editor} for x in fuentes.LISTAS],
        "editable": perfil.es_admin and con_tabla,
        "migracion_pendiente": not con_tabla,
    }


@router.post("/{especie_id}/fuente-oficial", response_model=EspecieCatalogoOut)
def consultar_fuente_oficial(especie_id: int, perfil: Perfil = Depends(admin_actual)):
    """Consulta las listas oficiales en GBIF y guarda la ficha con la versión y el DOI de cada
    lista (solo administradores). La veda registrada se conserva."""
    especie = _especie(especie_id)
    try:
        ficha = fuentes.consultar(especie.get("nombre_cientifico"))
    except fuentes.ErrorFuente as error:
        raise HTTPException(status_code=error.estado, detail=error.mensaje)

    admin = db.get_admin()
    fila = {"especie_id": especie_id, **ficha, "consultado_en": ahora().isoformat(), "consultado_por": perfil.usuario_id}
    try:
        guardada = admin.table("especies_fuente_oficial").upsert(fila, on_conflict="especie_id").execute().data[0]
    except APIError as error:
        if _falta_migracion(error):
            raise HTTPException(status_code=409, detail=MIGRACION)
        raise
    if ficha["origen"] and especie.get("origen") != ficha["origen"]:
        try:
            admin.table("especies").update({"origen": ficha["origen"]}).eq("id", especie_id).execute()
            especie = {**especie, "origen": ficha["origen"]}
        except APIError as error:
            if not es_columna_faltante(error):  # sin la migración 011 el origen queda solo en la ficha
                raise
    return _entrada(especie, guardada, 0)


@router.put("/{especie_id}/veda", response_model=EspecieCatalogoOut)
def registrar_veda(especie_id: int, d: VedaIn, perfil: Perfil = Depends(admin_actual)):
    """Registra (o quita) la veda de la especie con la norma que la establece."""
    especie = _especie(especie_id)
    admin = db.get_admin()
    try:
        existe = admin.table("especies_fuente_oficial").select("especie_id").eq("especie_id", especie_id).execute().data
    except APIError as error:
        if _falta_migracion(error):
            raise HTTPException(status_code=409, detail=MIGRACION)
        raise
    if not existe:
        raise HTTPException(status_code=409, detail="Consulta primero las fuentes oficiales de esta especie")
    cambios = {"veda": d.veda, "veda_url": d.veda_url if d.veda else None,
               "veda_registrada_por": perfil.usuario_id if d.veda else None,
               "veda_registrada_en": ahora().isoformat() if d.veda else None}
    guardada = admin.table("especies_fuente_oficial").update(cambios).eq("especie_id", especie_id).execute().data[0]
    return _entrada(especie, guardada, 0)
