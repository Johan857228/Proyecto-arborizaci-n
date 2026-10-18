"""Riesgo de caída: el tamizaje de cada inspección, las alertas de categoría alta o inminente y
los contactos de emergencia de cada sede (migración 008).

Es un tamizaje, no un dictamen: una alerta la confirma o la descarta un docente o el
administrador, que también deja constancia del aviso a rectoría. Sin la migración 008 la
categoría se calcula igual (para orientar a quien inspecciona) pero no se guarda.
"""
import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator

import db
from auth import Perfil, perfil_actual, revisor_actual
from comun import ahora, portadas_de_arboles, traer_todo
from schemas import CategoriaRiesgo, ResultadoTamizaje, Tamizaje
from servicios.riesgo_caida import ACCIONES, CATEGORIAS_CON_ALERTA, evaluar_tamizaje, mayor

router = APIRouter(tags=["Riesgo de caída"])

ABIERTAS = ("por_confirmar", "confirmada")
EstadoAlerta = Literal["por_confirmar", "confirmada", "descartada", "atendida"]
MedioAviso = Literal["whatsapp", "correo", "llamada", "en_persona", "otro"]


def _falta_migracion(error: APIError) -> bool:
    return str(getattr(error, "code", "") or "") in ("PGRST205", "42P01")


def _lotes(ids: list[str], tam: int = 100):
    """Partes de una lista de ids para filtros `in` que no alarguen demasiado la URL."""
    for inicio in range(0, len(ids), tam):
        yield ids[inicio:inicio + tam]


def alertas_abiertas(institucion_id: str | None = None) -> dict[str, str]:
    """Estado de la alerta abierta de cada árbol (por_confirmar o confirmada). Sin la
    migración 008 no hay alertas."""
    filtros = [("in_", ("estado", list(ABIERTAS)))]
    if institucion_id:
        filtros.append(("eq", ("institucion_id", institucion_id)))
    try:
        filas = traer_todo(db.get_admin(), "alertas_riesgo", "id, arbol_id, estado", filtros=filtros)
    except APIError as error:
        if _falta_migracion(error):
            return {}
        raise
    return {str(f["arbol_id"]): f["estado"] for f in filas}


# ===================================== Modelos =====================================
class TamizajeArbol(ResultadoTamizaje):
    inspeccion_id: str
    creado_en: datetime


class AlertaOut(BaseModel):
    id: str
    arbol_id: str
    codigo: str
    nombre_comun: str
    zona: str
    zona_otra: str | None = None
    institucion_id: str
    nombre_corto: str
    inspeccion_id: str
    categoria: Literal["alto", "inminente"]
    estado: EstadoAlerta
    motivos: list[str]
    accion: str
    creada_en: datetime
    actualizada_en: datetime | None = None
    revisada_en: datetime | None = None
    comentario_revision: str | None = None
    rectoria_avisada_en: datetime | None = None
    rectoria_medio: MedioAviso | None = None
    atendida_en: datetime | None = None
    nota_cierre: str | None = None
    intervencion_id: str | None = None
    foto_url: str | None = None
    # Categoría del último tamizaje del árbol: puede haber bajado después de abrir la alerta.
    categoria_actual: CategoriaRiesgo | None = None


class RiesgoArbolOut(BaseModel):
    tamizaje: TamizajeArbol | None = None
    alerta: AlertaOut | None = None


class ConfirmarIn(BaseModel):
    comentario: str | None = Field(default=None, max_length=500)


class DescartarIn(BaseModel):
    motivo: str = Field(min_length=5, max_length=500)

    @field_validator("motivo", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return v.strip() if isinstance(v, str) else v


class AvisoIn(BaseModel):
    medio: MedioAviso


class AtenderIn(BaseModel):
    nota: str = Field(min_length=5, max_length=500, description="Qué se hizo: poda, tala autorizada, área cercada…")
    intervencion_id: UUID | None = None

    @field_validator("nota", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return v.strip() if isinstance(v, str) else v


TELEFONO = re.compile(r"^[0-9 +()-]{3,20}$")
CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CAMPOS_CONTACTO = (
    "rectoria_nombre",
    "rectoria_telefono",
    "rectoria_correo",
    "gestion_riesgo_telefono",
    "autoridad_ambiental_nombre",
    "autoridad_ambiental_telefono",
)


class ContactosIn(BaseModel):
    rectoria_nombre: str | None = Field(default=None, max_length=120)
    rectoria_telefono: str | None = None
    rectoria_correo: str | None = Field(default=None, max_length=160)
    gestion_riesgo_telefono: str | None = None
    autoridad_ambiental_nombre: str | None = Field(default=None, max_length=120)
    autoridad_ambiental_telefono: str | None = None

    @field_validator(*CAMPOS_CONTACTO, mode="before")
    @classmethod
    def _vacio_es_nada(cls, v):
        if isinstance(v, str):
            v = v.strip()
        return v or None

    @field_validator("rectoria_telefono", "gestion_riesgo_telefono", "autoridad_ambiental_telefono")
    @classmethod
    def _telefono(cls, v: str | None) -> str | None:
        if v is not None and not TELEFONO.match(v):
            raise ValueError("Escribe solo el número (dígitos, espacios, + o -)")
        if v is not None and len(re.sub(r"\D", "", v)) < 3:
            raise ValueError("El número es muy corto")
        return v

    @field_validator("rectoria_correo")
    @classmethod
    def _correo(cls, v: str | None) -> str | None:
        if v is not None and not CORREO.match(v):
            raise ValueError("Escribe un correo válido")
        return v.lower() if v else v


class ContactosOut(ContactosIn):
    institucion_id: str
    actualizado_en: datetime | None = None


# ========================== Tamizaje (lo usa inspecciones.py) ==========================
def resultado(tamizaje: Tamizaje, altura_m: float | None, dap_cm: float | None) -> dict:
    return {**evaluar_tamizaje(tamizaje.model_dump(), altura_m, dap_cm), "respuestas": tamizaje.model_dump()}


def registrar_tamizaje(arbol: dict, inspeccion: dict, tamizaje: Tamizaje, usuario_id: str) -> dict:
    """Guarda el tamizaje de una inspección y, si la categoría es alta o inminente, abre la alerta
    del árbol (o actualiza la que ya está abierta). Devuelve el resultado."""
    r = resultado(tamizaje, inspeccion.get("altura_m"), inspeccion.get("dap_cm"))
    admin = db.get_admin()
    try:
        admin.table("tamizajes_riesgo").insert({
            "inspeccion_id": str(inspeccion["id"]),
            "arbol_id": str(arbol["id"]),
            "respuestas": r["respuestas"],
            "probabilidad": r["probabilidad"],
            "ocupacion": r["ocupacion"],
            "categoria": r["categoria"],
            "motivos": r["motivos"],
        }).execute()
    except APIError as error:
        if _falta_migracion(error):
            return r
        raise
    if r["categoria"] in CATEGORIAS_CON_ALERTA:
        _abrir_alerta(admin, arbol, str(inspeccion["id"]), r, usuario_id)
    return r


def _alerta_abierta(admin, arbol_id: str) -> dict | None:
    filas = admin.table("alertas_riesgo").select("*").eq("arbol_id", arbol_id).in_("estado", list(ABIERTAS)).limit(1).execute().data
    return filas[0] if filas else None


def _abrir_alerta(admin, arbol: dict, inspeccion_id: str, r: dict, usuario_id: str, intento: int = 0) -> None:
    abierta = _alerta_abierta(admin, str(arbol["id"]))
    if abierta:
        admin.table("alertas_riesgo").update({
            "categoria": mayor(abierta["categoria"], r["categoria"]),
            "inspeccion_id": inspeccion_id,
            "motivos": r["motivos"],
            "actualizada_en": ahora().isoformat(),
        }).eq("id", abierta["id"]).execute()
        return
    try:
        admin.table("alertas_riesgo").insert({
            "arbol_id": str(arbol["id"]),
            "institucion_id": arbol["institucion_id"],
            "inspeccion_id": inspeccion_id,
            "categoria": r["categoria"],
            "motivos": r["motivos"],
            "creada_por": usuario_id,
        }).execute()
    except APIError as error:
        # Otra inspección del mismo árbol abrió la alerta al mismo tiempo: se actualiza esa.
        if str(getattr(error, "code", "")) == "23505" and intento == 0:
            _abrir_alerta(admin, arbol, inspeccion_id, r, usuario_id, intento=1)
            return
        raise


def descartar_alertas_de_inspeccion(inspeccion_id: str, usuario_id: str) -> None:
    """Al anular una inspección, la alerta que abrió deja de tener sustento."""
    try:
        db.get_admin().table("alertas_riesgo").update({
            "estado": "descartada",
            "revisada_por": usuario_id,
            "revisada_en": ahora().isoformat(),
            "comentario_revision": "La inspección que la originó fue anulada",
            "actualizada_en": ahora().isoformat(),
        }).eq("inspeccion_id", inspeccion_id).in_("estado", list(ABIERTAS)).execute()
    except APIError as error:
        if not _falta_migracion(error):
            raise


def _resultado_de_fila(fila: dict) -> dict:
    return {
        "categoria": fila["categoria"],
        "probabilidad": fila["probabilidad"],
        "ocupacion": fila["ocupacion"],
        "motivos": fila.get("motivos") or [],
        "accion": ACCIONES[fila["categoria"]],
        "respuestas": fila["respuestas"],
    }


def tamizajes_de_inspecciones(inspeccion_ids: list[str]) -> dict[str, dict]:
    """Resultado del tamizaje de cada inspección (las que lo tienen)."""
    if not inspeccion_ids:
        return {}
    try:
        filas = db.get_admin().table("tamizajes_riesgo").select("*").in_("inspeccion_id", inspeccion_ids).execute().data
    except APIError as error:
        if _falta_migracion(error):
            return {}
        raise
    return {str(f["inspeccion_id"]): _resultado_de_fila(f) for f in filas}


def _tamizajes_vigentes(arbol_ids: list[str], columnas: str) -> dict[str, dict]:
    """El último tamizaje de cada árbol, sin contar los de inspecciones anuladas.

    Pide los árboles por lotes (el mapa puede pedir miles) y cada lote por páginas."""
    if not arbol_ids:
        return {}
    if columnas != "*":
        columnas = ", ".join(dict.fromkeys([*(c.strip() for c in columnas.split(",")), "inspeccion_id", "arbol_id", "creado_en"]))
    admin = db.get_admin()
    filas: list[dict] = []
    try:
        for lote in _lotes(sorted(set(arbol_ids))):
            filas += traer_todo(admin, "tamizajes_riesgo", columnas, filtros=[("in_", ("arbol_id", lote))], orden="inspeccion_id")
    except APIError as error:
        if _falta_migracion(error):
            return {}
        raise
    if not filas:
        return {}
    filas.sort(key=lambda f: str(f.get("creado_en") or ""), reverse=True)
    anuladas = {
        str(i["id"])
        for lote in _lotes(sorted({str(f["inspeccion_id"]) for f in filas}))
        for i in admin.table("inspecciones").select("id, estado_revision").in_("id", lote).execute().data
        if i["estado_revision"] == "anulada"
    }
    vigentes: dict[str, dict] = {}
    for f in filas:
        if str(f["inspeccion_id"]) not in anuladas:
            vigentes.setdefault(str(f["arbol_id"]), f)
    return vigentes


def categorias_actuales(arbol_ids: list[str]) -> dict[str, str]:
    """Categoría vigente de riesgo de caída de cada árbol (para la lista del inventario)."""
    return {a: f["categoria"] for a, f in _tamizajes_vigentes(arbol_ids, "inspeccion_id, arbol_id, categoria, creado_en").items()}


# ===================================== Alertas =====================================
def _armar_alertas(cliente, filas: list[dict]) -> list[dict]:
    if not filas:
        return []
    ids = sorted({str(f["arbol_id"]) for f in filas})
    arboles = {
        str(a["id"]): a
        for a in cliente.table("arboles_resumen").select("id, codigo, nombre_comun, zona, zona_otra, nombre_corto")
        .in_("id", ids).execute().data
    }
    portadas = portadas_de_arboles(cliente, ids)
    actuales = categorias_actuales(ids)
    resultado_ = []
    for f in filas:
        arbol = arboles.get(str(f["arbol_id"]))
        if not arbol:  # el usuario no puede ver ese árbol
            continue
        resultado_.append({
            **{k: f.get(k) for k in (
                "categoria", "estado", "creada_en", "actualizada_en", "revisada_en", "comentario_revision",
                "rectoria_avisada_en", "rectoria_medio", "atendida_en", "nota_cierre", "institucion_id",
            )},
            "id": str(f["id"]),
            "arbol_id": str(f["arbol_id"]),
            "inspeccion_id": str(f["inspeccion_id"]),
            "intervencion_id": str(f["intervencion_id"]) if f.get("intervencion_id") else None,
            "motivos": f.get("motivos") or [],
            "accion": ACCIONES[f["categoria"]],
            "codigo": arbol["codigo"],
            "nombre_comun": arbol["nombre_comun"],
            "zona": arbol["zona"],
            "zona_otra": arbol.get("zona_otra"),
            "nombre_corto": arbol["nombre_corto"],
            "foto_url": portadas.get(str(f["arbol_id"])),
            "categoria_actual": actuales.get(str(f["arbol_id"])),
        })
    return resultado_


def _alerta(alerta_id: str) -> dict:
    filas = db.get_admin().table("alertas_riesgo").select("*").eq("id", alerta_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    return filas[0]


def _puede_ver(perfil: Perfil, institucion_id: str) -> bool:
    return perfil.es_admin or perfil.institucion_id == institucion_id


def _gestionable(perfil: Perfil, alerta_id: str, estados: tuple[str, ...]) -> dict:
    alerta = _alerta(alerta_id)
    if not _puede_ver(perfil, alerta["institucion_id"]):
        raise HTTPException(status_code=403, detail="Solo puedes atender alertas de tu institución")
    if alerta["estado"] not in estados:
        raise HTTPException(status_code=409, detail="La alerta ya fue cerrada" if alerta["estado"] not in ABIERTAS else "La alerta ya fue confirmada")
    return alerta


def _actualizar(perfil: Perfil, alerta_id: str, cambios: dict) -> dict:
    db.get_admin().table("alertas_riesgo").update({**cambios, "actualizada_en": ahora().isoformat()}).eq("id", alerta_id).execute()
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    armadas = _armar_alertas(cliente, [_alerta(alerta_id)])
    if not armadas:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    return armadas[0]


@router.get("/alertas", response_model=list[AlertaOut])
def listar_alertas(
    estado: Literal["abiertas", "cerradas", "todas"] = "abiertas",
    institucion_id: str | None = Query(None, max_length=64),
    perfil: Perfil = Depends(perfil_actual),
):
    """Alertas de riesgo de caída, las inminentes primero y luego las más antiguas. Cada quien ve
    las de su institución; el administrador, todas o las de una institución."""
    if not perfil.es_admin:
        if not perfil.institucion_id:
            return []
        institucion_id = perfil.institucion_id
    try:
        q = db.get_admin().table("alertas_riesgo").select("*")
        if institucion_id:
            q = q.eq("institucion_id", institucion_id)
        if estado == "abiertas":
            q = q.in_("estado", list(ABIERTAS))
        elif estado == "cerradas":
            q = q.in_("estado", ["descartada", "atendida"])
        filas = q.order("creada_en").limit(500).execute().data
    except APIError as error:
        if _falta_migracion(error):
            return []
        raise
    filas.sort(key=lambda f: (f["estado"] not in ABIERTAS, f["categoria"] != "inminente", str(f["creada_en"])))
    return _armar_alertas(db.cliente_de_usuario(perfil.sesion.token), filas)


@router.get("/arboles/{arbol_id}/riesgo", response_model=RiesgoArbolOut)
def riesgo_del_arbol(arbol_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    """Último tamizaje vigente del árbol y su alerta abierta, si la hay."""
    vigente = _tamizajes_vigentes([str(arbol_id)], "*").get(str(arbol_id))
    tamizaje = {**_resultado_de_fila(vigente), "inspeccion_id": str(vigente["inspeccion_id"]), "creado_en": vigente["creado_en"]} if vigente else None
    alerta = None
    try:
        abierta = _alerta_abierta(db.get_admin(), str(arbol_id))
    except APIError as error:
        if not _falta_migracion(error):
            raise
        abierta = None
    if abierta and _puede_ver(perfil, abierta["institucion_id"]):
        armadas = _armar_alertas(db.cliente_de_usuario(perfil.sesion.token), [abierta])
        alerta = armadas[0] if armadas else None
    return RiesgoArbolOut(tamizaje=tamizaje, alerta=alerta)


@router.post("/alertas/{alerta_id}/confirmar", response_model=AlertaOut)
def confirmar_alerta(alerta_id: UUID, d: ConfirmarIn, perfil: Perfil = Depends(revisor_actual)):
    """Un docente o el administrador confirma que el riesgo es real."""
    _gestionable(perfil, str(alerta_id), ("por_confirmar",))
    return _actualizar(perfil, str(alerta_id), {
        "estado": "confirmada",
        "revisada_por": perfil.usuario_id,
        "revisada_en": ahora().isoformat(),
        "comentario_revision": (d.comentario or "").strip() or None,
    })


@router.post("/alertas/{alerta_id}/descartar", response_model=AlertaOut)
def descartar_alerta(alerta_id: UUID, d: DescartarIn, perfil: Perfil = Depends(revisor_actual)):
    """Descarta la alerta con un motivo (p. ej. la rama ya se retiró o el tamizaje se equivocó)."""
    _gestionable(perfil, str(alerta_id), ABIERTAS)
    return _actualizar(perfil, str(alerta_id), {
        "estado": "descartada",
        "revisada_por": perfil.usuario_id,
        "revisada_en": ahora().isoformat(),
        "comentario_revision": d.motivo,
    })


@router.post("/alertas/{alerta_id}/aviso", response_model=AlertaOut)
def registrar_aviso(alerta_id: UUID, d: AvisoIn, perfil: Perfil = Depends(revisor_actual)):
    """Deja constancia de que se avisó a rectoría y por qué medio."""
    _gestionable(perfil, str(alerta_id), ABIERTAS)
    return _actualizar(perfil, str(alerta_id), {
        "rectoria_avisada_por": perfil.usuario_id,
        "rectoria_avisada_en": ahora().isoformat(),
        "rectoria_medio": d.medio,
    })


@router.post("/alertas/{alerta_id}/atender", response_model=AlertaOut)
def atender_alerta(alerta_id: UUID, d: AtenderIn, perfil: Perfil = Depends(revisor_actual)):
    """Cierra la alerta cuando el riesgo se atendió. Si no se había confirmado, atenderla la confirma."""
    alerta = _gestionable(perfil, str(alerta_id), ABIERTAS)
    cambios = {
        "estado": "atendida",
        "atendida_por": perfil.usuario_id,
        "atendida_en": ahora().isoformat(),
        "nota_cierre": d.nota,
    }
    if d.intervencion_id:
        filas = db.get_admin().table("intervenciones").select("id, arbol_id").eq("id", str(d.intervencion_id)).execute().data
        if not filas or str(filas[0]["arbol_id"]) != str(alerta["arbol_id"]):
            raise HTTPException(status_code=422, detail="La intervención no es de este árbol")
        cambios["intervencion_id"] = str(d.intervencion_id)
    if alerta["estado"] == "por_confirmar":
        cambios.update({"revisada_por": perfil.usuario_id, "revisada_en": ahora().isoformat()})
    return _actualizar(perfil, str(alerta_id), cambios)


# =============================== Contactos de emergencia ===============================
@router.get("/instituciones/{institucion_id}/contactos", response_model=ContactosOut)
def ver_contactos(institucion_id: str, perfil: Perfil = Depends(perfil_actual)):
    """A quién avisar en la sede ante un riesgo de caída."""
    if not _puede_ver(perfil, institucion_id):
        raise HTTPException(status_code=403, detail="Solo puedes ver los contactos de tu institución")
    try:
        filas = db.get_admin().table("contactos_emergencia").select("*").eq("institucion_id", institucion_id).execute().data
    except APIError as error:
        if _falta_migracion(error):
            filas = []
        else:
            raise
    return filas[0] if filas else ContactosOut(institucion_id=institucion_id)


@router.put("/instituciones/{institucion_id}/contactos", response_model=ContactosOut)
def guardar_contactos(institucion_id: str, d: ContactosIn, perfil: Perfil = Depends(revisor_actual)):
    """Los docentes de la sede y el administrador mantienen los contactos al día."""
    if not _puede_ver(perfil, institucion_id):
        raise HTTPException(status_code=403, detail="Solo puedes editar los contactos de tu institución")
    fila = {
        "institucion_id": institucion_id,
        **d.model_dump(),
        "actualizado_por": perfil.usuario_id,
        "actualizado_en": ahora().isoformat(),
    }
    guardada = (
        db.get_admin().table("contactos_emergencia").upsert(fila, on_conflict="institucion_id").execute().data
    )
    return guardada[0] if guardada else fila
