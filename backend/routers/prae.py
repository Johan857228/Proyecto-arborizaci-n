"""PRAE digital: expediente anual del Proyecto Ambiental Escolar con plan de acción, evidencias,
evaluaciones e informe en PDF (migración 010). Reglas e informe: servicios/prae.py.

Lo ve toda la institución; lo editan sus docentes y el administrador.
"""
import uuid
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator, model_validator

import db
from auth import Perfil, perfil_actual, revisor_actual
from comun import BUCKET_FOTOS, MAX_FOTO_BYTES, ahora, fecha_local, hoy, leer_foto, url_firmada
from routers import reportes
from routers import siembras as router_siembras
from routers.servicio_social import resumenes_institucion
from servicios import indicadores
from servicios import prae as reglas
from servicios import siembras as reglas_siembras

router = APIRouter(prefix="/prae", tags=["PRAE"])

Tema = Literal["arbolado", "residuos", "agua", "energia", "biodiversidad", "otro"]
EstadoAccion = Literal["pendiente", "en_curso", "cumplida", "cancelada"]
TipoEvidencia = Literal["foto", "enlace", "nota"]
Instancia = Literal["consejo_directivo", "secretaria", "comite", "otra"]
EstadoPrae = Literal["formulacion", "en_ejecucion", "evaluacion_parcial", "evaluado"]
VIGENCIA_ENLACE_S = 600


def _texto(v):
    if isinstance(v, str):
        v = v.strip()
    return v or None


# ===================================== Modelos =====================================
class PraeIn(BaseModel):
    institucion_id: str = Field(min_length=1, max_length=64)
    anio: int = Field(ge=2000, le=2100)
    tema: Tema
    tema_otro: str | None = Field(default=None, max_length=80)
    titulo: str = Field(min_length=5, max_length=150)
    problema: str = Field(min_length=10, max_length=2000)

    @field_validator("tema_otro", "titulo", "problema", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)

    @model_validator(mode="after")
    def _reglas(self):
        if self.anio > hoy().year + 1:
            raise ValueError("El PRAE se crea para el año en curso o el siguiente")
        if self.tema == "otro" and not self.tema_otro:
            raise ValueError("Escribe el tema del PRAE")
        if self.tema != "otro":
            self.tema_otro = None
        return self


class PraeEditar(BaseModel):
    tema: Tema | None = None
    tema_otro: str | None = Field(default=None, max_length=80)
    titulo: str | None = Field(default=None, min_length=5, max_length=150)
    problema: str | None = Field(default=None, min_length=10, max_length=2000)
    diagnostico: str | None = Field(default=None, max_length=5000)
    objetivo_general: str | None = Field(default=None, max_length=1000)
    objetivos_especificos: list[str] | None = Field(default=None, max_length=10)
    comite: str | None = Field(default=None, max_length=2000)

    @field_validator("tema_otro", "titulo", "problema", "diagnostico", "objetivo_general", "comite", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)

    @field_validator("objetivos_especificos")
    @classmethod
    def _objetivos(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        limpios = [o.strip() for o in v if o and o.strip()]
        if any(len(o) > 300 for o in limpios):
            raise ValueError("Cada objetivo específico tiene máximo 300 caracteres")
        return limpios


class CopiarIn(BaseModel):
    anio: int = Field(ge=2000, le=2100)


class AccionIn(BaseModel):
    titulo: str = Field(min_length=3, max_length=150)
    descripcion: str | None = Field(default=None, max_length=1000)
    responsable: str | None = Field(default=None, max_length=120)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    estado: EstadoAccion = "pendiente"
    indicador: str | None = Field(default=None, max_length=300)
    meta: str | None = Field(default=None, max_length=300)

    @field_validator("titulo", "descripcion", "responsable", "indicador", "meta", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)

    @model_validator(mode="after")
    def _fechas(self):
        if self.fecha_inicio and self.fecha_fin and self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha final no puede ser anterior a la inicial")
        return self


class AccionEditar(BaseModel):
    titulo: str | None = Field(default=None, min_length=3, max_length=150)
    descripcion: str | None = Field(default=None, max_length=1000)
    responsable: str | None = Field(default=None, max_length=120)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    estado: EstadoAccion | None = None
    indicador: str | None = Field(default=None, max_length=300)
    meta: str | None = Field(default=None, max_length=300)

    @field_validator("titulo", "descripcion", "responsable", "indicador", "meta", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)


class EvidenciaIn(BaseModel):
    tipo: TipoEvidencia
    titulo: str = Field(min_length=3, max_length=150)
    descripcion: str | None = Field(default=None, max_length=1000)
    url: str | None = Field(default=None, max_length=500)
    fecha: date
    accion_id: UUID | None = None

    @field_validator("titulo", "descripcion", "url", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)

    @model_validator(mode="after")
    def _reglas(self):
        if self.fecha > hoy():
            raise ValueError("La fecha no puede ser futura")
        if self.tipo == "enlace" and not (self.url and self.url.startswith("https://")):
            raise ValueError("El enlace debe empezar por https://")
        if self.tipo != "enlace":
            self.url = None
        return self


class EvaluacionIn(BaseModel):
    instancia: Instancia
    fecha: date
    acta: str | None = Field(default=None, max_length=60)
    cumplimiento_pct: int | None = Field(default=None, ge=0, le=100)
    logros: str | None = Field(default=None, max_length=2000)
    dificultades: str | None = Field(default=None, max_length=2000)
    recomendaciones: str | None = Field(default=None, max_length=2000)
    participantes: str | None = Field(default=None, max_length=500)

    @field_validator("acta", "logros", "dificultades", "recomendaciones", "participantes", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)

    @model_validator(mode="after")
    def _reglas(self):
        if self.fecha > hoy():
            raise ValueError("La fecha de la evaluación no puede ser futura")
        if not (self.logros or self.dificultades or self.recomendaciones):
            raise ValueError("Escribe al menos los logros, las dificultades o las recomendaciones")
        return self


class AccionOut(BaseModel):
    id: str
    titulo: str
    descripcion: str | None = None
    responsable: str | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    estado: EstadoAccion
    indicador: str | None = None
    meta: str | None = None
    vencida: bool = False


class EvidenciaOut(BaseModel):
    id: str
    tipo: TipoEvidencia
    titulo: str
    descripcion: str | None = None
    url: str | None = None
    foto_url: str | None = None
    fecha: date
    accion_id: str | None = None
    creado_en: datetime


class EvaluacionOut(BaseModel):
    id: str
    instancia: Instancia
    fecha: date
    acta: str | None = None
    cumplimiento_pct: int | None = None
    logros: str | None = None
    dificultades: str | None = None
    recomendaciones: str | None = None
    participantes: str | None = None
    creado_en: datetime


class ResumenAcciones(BaseModel):
    total: int
    pendiente: int
    en_curso: int
    cumplida: int
    cancelada: int
    pct_cumplidas: float | None = None


class PraeOut(BaseModel):
    id: str
    institucion_id: str
    anio: int
    tema: Tema
    tema_otro: str | None = None
    titulo: str
    problema: str
    diagnostico: str | None = None
    objetivo_general: str | None = None
    objetivos_especificos: list[str] = []
    comite: str | None = None
    estado: EstadoPrae
    evaluaciones_faltantes: list[Instancia]
    resumen_acciones: ResumenAcciones
    acciones: list[AccionOut]
    evidencias: list[EvidenciaOut]
    evaluaciones: list[EvaluacionOut]
    puede_editar: bool
    actualizado_en: datetime


class AnioOut(BaseModel):
    id: str
    anio: int
    titulo: str
    tema: Tema
    estado: EstadoPrae


class DescargaOut(BaseModel):
    url: str
    nombre: str
    vence_en_segundos: int


# ===================================== Datos =====================================
def _prae(prae_id: str) -> dict:
    filas = db.get_admin().table("prae").select("*").eq("id", prae_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="PRAE no encontrado")
    return filas[0]


def _puede_ver(perfil: Perfil, institucion_id: str):
    if not perfil.es_admin and perfil.institucion_id != institucion_id:
        raise HTTPException(status_code=403, detail="Solo puedes ver el PRAE de tu institución")


def _editable(perfil: Perfil, prae_id: str) -> dict:
    prae = _prae(prae_id)
    if not perfil.gestiona(prae["institucion_id"]):
        raise HTTPException(status_code=403, detail="Solo los docentes de la institución y el administrador editan el PRAE")
    return prae


def _hijos(tabla: str, prae_ids: list[str], orden: str) -> list[dict]:
    if not prae_ids:
        return []
    return db.get_admin().table(tabla).select("*").in_("prae_id", prae_ids).order(orden).execute().data


def _accion_out(a: dict, dia: date) -> dict:
    fin = a.get("fecha_fin")
    vencida = bool(fin) and a["estado"] in ("pendiente", "en_curso") and date.fromisoformat(str(fin)[:10]) < dia
    return {**a, "id": str(a["id"]), "vencida": vencida}


def _evidencia_out(e: dict) -> dict:
    return {
        **e,
        "id": str(e["id"]),
        "accion_id": str(e["accion_id"]) if e.get("accion_id") else None,
        "foto_url": url_firmada(db.get_admin(), e["foto_path"]) if e.get("foto_path") else None,
    }


def _armar(prae: dict, perfil: Perfil) -> dict:
    pid = str(prae["id"])
    acciones = sorted(_hijos("prae_acciones", [pid], "orden"), key=lambda a: (a.get("orden") or 0, str(a.get("creado_en"))))
    evidencias = _hijos("prae_evidencias", [pid], "fecha")
    evaluaciones = _hijos("prae_evaluaciones", [pid], "fecha")
    dia = hoy()
    instancias = {e["instancia"] for e in evaluaciones}
    return {
        **prae,
        "id": pid,
        "objetivos_especificos": prae.get("objetivos_especificos") or [],
        "estado": reglas.estado(acciones, evaluaciones),
        "evaluaciones_faltantes": [i for i in reglas.EVALUACIONES_OBLIGATORIAS if i not in instancias],
        "resumen_acciones": reglas.resumen_acciones(acciones),
        "acciones": [_accion_out(a, dia) for a in acciones],
        "evidencias": [_evidencia_out(e) for e in evidencias],
        "evaluaciones": [{**e, "id": str(e["id"])} for e in evaluaciones],
        "puede_editar": perfil.gestiona(prae["institucion_id"]),
    }


def _institucion_de(perfil: Perfil, institucion_id: str | None) -> str:
    institucion_id = institucion_id or perfil.institucion_id
    if not institucion_id:
        raise HTTPException(status_code=422, detail="Elige una institución")
    _puede_ver(perfil, institucion_id)
    return institucion_id


# ===================================== Expediente =====================================
@router.get("", response_model=PraeOut | None)
def ver(institucion_id: str | None = Query(None, max_length=64), anio: int | None = Query(None, ge=2000, le=2100),
        perfil: Perfil = Depends(perfil_actual)):
    """El PRAE de la institución en el año (por defecto, el año en curso). Sin expediente devuelve null."""
    institucion_id = _institucion_de(perfil, institucion_id)
    filas = (
        db.get_admin().table("prae").select("*").eq("institucion_id", institucion_id).eq("anio", anio or hoy().year)
        .execute().data
    )
    return _armar(filas[0], perfil) if filas else None


@router.get("/anios", response_model=list[AnioOut])
def anios(institucion_id: str | None = Query(None, max_length=64), perfil: Perfil = Depends(perfil_actual)):
    """Los PRAE de la institución, del más reciente al más antiguo, con su estado."""
    institucion_id = _institucion_de(perfil, institucion_id)
    filas = db.get_admin().table("prae").select("id, anio, titulo, tema").eq("institucion_id", institucion_id).order("anio", desc=True).execute().data
    ids = [str(f["id"]) for f in filas]
    acciones, evaluaciones = _hijos("prae_acciones", ids, "orden"), _hijos("prae_evaluaciones", ids, "fecha")
    return [
        {**f, "id": str(f["id"]), "estado": reglas.estado(
            [a for a in acciones if str(a["prae_id"]) == str(f["id"])],
            [e for e in evaluaciones if str(e["prae_id"]) == str(f["id"])],
        )}
        for f in filas
    ]


@router.post("", response_model=PraeOut, status_code=201)
def crear(d: PraeIn, perfil: Perfil = Depends(revisor_actual)):
    if not perfil.gestiona(d.institucion_id):
        raise HTTPException(status_code=403, detail="Solo los docentes de la institución y el administrador crean el PRAE")
    fila = {**d.model_dump(), "creado_por": perfil.usuario_id}
    try:
        creado = db.get_admin().table("prae").insert(fila).execute().data[0]
    except APIError as error:
        if str(getattr(error, "code", "")) == "23505":
            raise HTTPException(status_code=409, detail=f"La institución ya tiene el PRAE de {d.anio}")
        raise
    return _armar(creado, perfil)


@router.patch("/{prae_id}", response_model=PraeOut)
def editar(prae_id: UUID, d: PraeEditar, perfil: Perfil = Depends(revisor_actual)):
    prae = _editable(perfil, str(prae_id))
    cambios = {k: v for k, v in d.model_dump().items() if k in d.model_fields_set}
    if not cambios:
        raise HTTPException(status_code=422, detail="No hay cambios para guardar")
    for campo in ("titulo", "problema", "tema"):
        if campo in cambios and not cambios[campo]:
            raise HTTPException(status_code=422, detail=f"El campo {campo} no puede quedar vacío")
    tema = cambios.get("tema", prae["tema"])
    tema_otro = cambios.get("tema_otro", prae.get("tema_otro"))
    if tema == "otro" and not tema_otro:
        raise HTTPException(status_code=422, detail="Escribe el tema del PRAE")
    if tema != "otro":
        cambios["tema_otro"] = None
    cambios["actualizado_en"] = ahora().isoformat()
    actualizado = db.get_admin().table("prae").update(cambios).eq("id", str(prae_id)).execute().data[0]
    return _armar(actualizado, perfil)


def _mover_anio(valor, diferencia: int) -> str | None:
    if not valor:
        return None
    d = date.fromisoformat(str(valor)[:10])
    try:
        return d.replace(year=d.year + diferencia).isoformat()
    except ValueError:  # 29 de febrero en un año que no es bisiesto
        return d.replace(year=d.year + diferencia, day=28).isoformat()


@router.post("/{prae_id}/copiar", response_model=PraeOut, status_code=201)
def copiar(prae_id: UUID, d: CopiarIn, perfil: Perfil = Depends(revisor_actual)):
    """Empieza el PRAE de otro año a partir de este: problema, diagnóstico, objetivos, comité y el
    plan de acción (con las fechas corridas y todas las acciones pendientes). Sin evidencias ni evaluaciones."""
    origen = _editable(perfil, str(prae_id))
    if d.anio == origen["anio"]:
        raise HTTPException(status_code=422, detail="Elige otro año")
    if d.anio > hoy().year + 1:
        raise HTTPException(status_code=422, detail="El PRAE se crea para el año en curso o el siguiente")
    admin = db.get_admin()
    nuevo = {k: origen.get(k) for k in ("institucion_id", "tema", "tema_otro", "titulo", "problema", "diagnostico", "objetivo_general", "objetivos_especificos", "comite")}
    try:
        creado = admin.table("prae").insert({**nuevo, "anio": d.anio, "creado_por": perfil.usuario_id}).execute().data[0]
    except APIError as error:
        if str(getattr(error, "code", "")) == "23505":
            raise HTTPException(status_code=409, detail=f"La institución ya tiene el PRAE de {d.anio}")
        raise
    diferencia = d.anio - origen["anio"]
    acciones = _hijos("prae_acciones", [str(prae_id)], "orden")
    if acciones:
        admin.table("prae_acciones").insert([
            {
                "prae_id": creado["id"], "titulo": a["titulo"], "descripcion": a.get("descripcion"), "responsable": a.get("responsable"),
                "fecha_inicio": _mover_anio(a.get("fecha_inicio"), diferencia), "fecha_fin": _mover_anio(a.get("fecha_fin"), diferencia),
                "indicador": a.get("indicador"), "meta": a.get("meta"), "orden": a.get("orden") or 0, "estado": "pendiente",
            }
            for a in acciones if a["estado"] != "cancelada"
        ]).execute()
    return _armar(creado, perfil)


# ================================== Plan de acción ==================================
def _accion(accion_id: str) -> dict:
    filas = db.get_admin().table("prae_acciones").select("*").eq("id", accion_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Acción no encontrada")
    return filas[0]


@router.post("/{prae_id}/acciones", response_model=AccionOut, status_code=201)
def crear_accion(prae_id: UUID, d: AccionIn, perfil: Perfil = Depends(revisor_actual)):
    _editable(perfil, str(prae_id))
    orden = len(_hijos("prae_acciones", [str(prae_id)], "orden"))
    fila = {**d.model_dump(mode="json"), "prae_id": str(prae_id), "orden": orden}
    return _accion_out(db.get_admin().table("prae_acciones").insert(fila).execute().data[0], hoy())


@router.patch("/acciones/{accion_id}", response_model=AccionOut)
def editar_accion(accion_id: UUID, d: AccionEditar, perfil: Perfil = Depends(revisor_actual)):
    accion = _accion(str(accion_id))
    _editable(perfil, str(accion["prae_id"]))
    cambios = {k: v for k, v in d.model_dump(mode="json").items() if k in d.model_fields_set}
    if not cambios:
        raise HTTPException(status_code=422, detail="No hay cambios para guardar")
    if "titulo" in cambios and not cambios["titulo"]:
        raise HTTPException(status_code=422, detail="Escribe el nombre de la acción")
    if "estado" in cambios and not cambios["estado"]:
        raise HTTPException(status_code=422, detail="Indica el estado de la acción")
    inicio = cambios.get("fecha_inicio", accion.get("fecha_inicio"))
    fin = cambios.get("fecha_fin", accion.get("fecha_fin"))
    if inicio and fin and str(fin)[:10] < str(inicio)[:10]:
        raise HTTPException(status_code=422, detail="La fecha final no puede ser anterior a la inicial")
    actualizada = db.get_admin().table("prae_acciones").update(cambios).eq("id", str(accion_id)).execute().data[0]
    return _accion_out(actualizada, hoy())


@router.delete("/acciones/{accion_id}", status_code=204)
def borrar_accion(accion_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    accion = _accion(str(accion_id))
    _editable(perfil, str(accion["prae_id"]))
    db.get_admin().table("prae_acciones").delete().eq("id", str(accion_id)).execute()
    return Response(status_code=204)


# ==================================== Evidencias ====================================
def _evidencia(evidencia_id: str) -> dict:
    filas = db.get_admin().table("prae_evidencias").select("*").eq("id", evidencia_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
    return filas[0]


@router.post("/{prae_id}/evidencias", response_model=EvidenciaOut, status_code=201)
def crear_evidencia(prae_id: UUID, d: EvidenciaIn, perfil: Perfil = Depends(revisor_actual)):
    """Evidencia del PRAE: una nota, un enlace (acta, video, publicación) o una foto (que se sube después con /foto)."""
    _editable(perfil, str(prae_id))
    if d.accion_id and str(_accion(str(d.accion_id))["prae_id"]) != str(prae_id):
        raise HTTPException(status_code=422, detail="La acción no es de este PRAE")
    fila = {**d.model_dump(mode="json"), "prae_id": str(prae_id), "creado_por": perfil.usuario_id}
    return _evidencia_out(db.get_admin().table("prae_evidencias").insert(fila).execute().data[0])


@router.post("/evidencias/{evidencia_id}/foto", response_model=EvidenciaOut)
def subir_foto_evidencia(evidencia_id: UUID, archivo: UploadFile = File(...), perfil: Perfil = Depends(revisor_actual)):
    contenido, tipo_real, extension = leer_foto(archivo, MAX_FOTO_BYTES)
    evidencia = _evidencia(str(evidencia_id))
    prae = _editable(perfil, str(evidencia["prae_id"]))
    if evidencia["tipo"] != "foto":
        raise HTTPException(status_code=409, detail="Esta evidencia no es una foto")
    admin = db.get_admin()
    ruta = f"prae/{prae['institucion_id']}/{prae['anio']}/{uuid.uuid4().hex}.{extension}"
    admin.storage.from_(BUCKET_FOTOS).upload(ruta, contenido, {"content-type": tipo_real})
    actualizada = admin.table("prae_evidencias").update({"foto_path": ruta}).eq("id", str(evidencia_id)).execute().data[0]
    if evidencia.get("foto_path"):
        try:
            admin.storage.from_(BUCKET_FOTOS).remove([evidencia["foto_path"]])
        except Exception:
            pass
    return _evidencia_out(actualizada)


@router.delete("/evidencias/{evidencia_id}", status_code=204)
def borrar_evidencia(evidencia_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    evidencia = _evidencia(str(evidencia_id))
    _editable(perfil, str(evidencia["prae_id"]))
    admin = db.get_admin()
    admin.table("prae_evidencias").delete().eq("id", str(evidencia_id)).execute()
    if evidencia.get("foto_path"):
        try:
            admin.storage.from_(BUCKET_FOTOS).remove([evidencia["foto_path"]])
        except Exception:
            pass
    return Response(status_code=204)


# =================================== Evaluaciones ===================================
@router.post("/{prae_id}/evaluaciones", response_model=EvaluacionOut, status_code=201)
def crear_evaluacion(prae_id: UUID, d: EvaluacionIn, perfil: Perfil = Depends(revisor_actual)):
    """Registra la evaluación del consejo directivo, la Secretaría de Educación o el comité, con su acta."""
    _editable(perfil, str(prae_id))
    fila = {**d.model_dump(mode="json"), "prae_id": str(prae_id), "registrado_por": perfil.usuario_id}
    creada = db.get_admin().table("prae_evaluaciones").insert(fila).execute().data[0]
    return {**creada, "id": str(creada["id"])}


@router.delete("/evaluaciones/{evaluacion_id}", status_code=204)
def borrar_evaluacion(evaluacion_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    filas = db.get_admin().table("prae_evaluaciones").select("id, prae_id").eq("id", str(evaluacion_id)).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    _editable(perfil, str(filas[0]["prae_id"]))
    db.get_admin().table("prae_evaluaciones").delete().eq("id", str(evaluacion_id)).execute()
    return Response(status_code=204)


# ================================ Indicadores e informe ================================
def _indicadores(perfil: Perfil, prae: dict) -> dict:
    """Datos del arbolado, de las alertas de riesgo y del servicio social de la institución en el año del PRAE."""
    anio, institucion_id = int(prae["anio"]), prae["institucion_id"]
    desde, hasta = date(anio, 1, 1), min(date(anio, 12, 31), hoy())
    if hasta < desde:
        hasta = desde
    base, dias = reportes.cargar_datos(db.cliente_de_usuario(perfil.sesion.token), institucion_id)
    rep = indicadores.calcular(base, desde, hasta, dias)
    participantes = {
        i["inspector_id"] for i in base.inspecciones
        if i.get("inspector_id") and i["estado_revision"] != "anulada" and desde <= (fecha_local(i["fecha"]) or desde) <= hasta
    }
    resultado = {
        "periodo": {"desde": desde, "hasta": hasta},
        "arbolado": {
            "total_arboles": rep["inventario"]["total_arboles"],
            "registrados_periodo": rep["inventario"]["registrados_periodo"],
            "por_estado": rep["riesgo"]["por_estado"],
            "pct_riesgo_o_critico": rep["riesgo"]["pct_riesgo_o_critico"],
            "co2_kg": rep["inventario"]["totales_ambientales"]["co2_kg"],
            "inspecciones_periodo": rep["productividad"]["inspecciones_periodo"],
            "confirmadas": rep["productividad"]["confirmadas"],
            "arboles_inspeccionados_periodo": rep["cobertura"]["arboles_inspeccionados_periodo"],
            "cobertura_pct": rep["cobertura"]["cobertura_pct"],
            "intervenciones_ejecutadas": rep["intervenciones"]["ejecutadas_periodo"],
            "participantes": len(participantes),
        },
        "alertas": None,
        "servicio_social": None,
        "pedagogia": None,
        "siembras": None,
    }
    try:
        alertas = db.get_admin().table("alertas_riesgo").select("estado, creada_en").eq("institucion_id", institucion_id).execute().data
        del_anio = [a for a in alertas if (fecha_local(a["creada_en"]) or desde).year == anio]
        resultado["alertas"] = {
            "total": len(del_anio),
            "abiertas": sum(1 for a in del_anio if a["estado"] in ("por_confirmar", "confirmada")),
            "atendidas": sum(1 for a in del_anio if a["estado"] == "atendida"),
            "descartadas": sum(1 for a in del_anio if a["estado"] == "descartada"),
        }
    except APIError:
        pass  # sin la migración 008
    try:
        estudiantes = resumenes_institucion(institucion_id)
        resultado["servicio_social"] = {
            "estudiantes": len(estudiantes),
            "completaron": sum(1 for e in estudiantes if e.get("estado") == "completo"),
            "horas_aprobadas": round(sum(e.get("horas_aprobadas", 0) for e in estudiantes), 1),
        }
    except APIError:
        pass  # sin la migración 009
    try:
        clases = (
            db.get_admin().table("clases_guia").select("guia_id, fecha, asistentes").eq("institucion_id", institucion_id)
            .gte("fecha", desde.isoformat()).lte("fecha", hasta.isoformat()).execute().data
        )
        resultado["pedagogia"] = {
            "clases": len(clases),
            "guias": len({c["guia_id"] for c in clases}),
            "asistentes": sum(c.get("asistentes") or 0 for c in clases),
        }
    except APIError:
        pass  # sin la migración 012
    try:
        jornadas, plantas, controles = router_siembras._datos(institucion_id)
        del_anio = [s for s in plantas if str(s["fecha"])[:4] == str(anio)]
        res = reglas_siembras.resumen(del_anio, controles, router_siembras._origenes(del_anio, router_siembras._especies()), hoy())
        resultado["siembras"] = {
            "jornadas": sum(1 for j in jornadas if str(j["fecha"])[:4] == str(anio)),
            "sembradas": res["sembradas"], "pct_nativas": res["pct_nativas"],
            "evaluadas": res["evaluadas"], "supervivencia_pct": res["supervivencia_pct"],
        }
    except APIError:
        pass  # sin la migración 013
    return resultado


class IndicadoresOut(BaseModel):
    periodo: dict
    arbolado: dict
    alertas: dict | None = None
    servicio_social: dict | None = None
    pedagogia: dict | None = Field(default=None, description="Clases dictadas con las guías de Arbolado Escolar en el año")
    siembras: dict | None = Field(default=None, description="Jornadas y plántulas sembradas en el año, nativas y supervivencia")


@router.get("/{prae_id}/indicadores", response_model=IndicadoresOut)
def ver_indicadores(prae_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    prae = _prae(str(prae_id))
    _puede_ver(perfil, prae["institucion_id"])
    return _indicadores(perfil, prae)


def _institucion(institucion_id: str) -> dict:
    admin = db.get_admin()
    try:
        filas = admin.table("instituciones").select("id, nombre, codigo_dane, municipio").eq("id", institucion_id).execute().data
    except APIError:  # sin la migración 006 no hay código DANE
        filas = admin.table("instituciones").select("id, nombre").eq("id", institucion_id).execute().data
    return filas[0] if filas else {"id": institucion_id, "nombre": institucion_id}


@router.post("/{prae_id}/informe", response_model=DescargaOut)
def informe(prae_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    """Genera el informe anual en PDF (expediente, plan, evidencias, indicadores y evaluaciones)
    y devuelve un enlace de descarga de 10 minutos."""
    prae = _prae(str(prae_id))
    _puede_ver(perfil, prae["institucion_id"])
    armado = _armar(prae, perfil)
    pdf = reglas.informe_pdf(
        armado, _institucion(prae["institucion_id"]), armado["acciones"], armado["evidencias"], armado["evaluaciones"],
        _indicadores(perfil, prae), hoy(),
    )
    ruta = f"prae/{prae['institucion_id']}/{prae['anio']}/informe-prae-{prae['anio']}.pdf"
    nombre = f"informe-prae-{prae['anio']}.pdf"
    almacen = db.get_admin().storage.from_(BUCKET_FOTOS)
    almacen.upload(ruta, pdf, {"content-type": "application/pdf", "upsert": "true"})
    firmada = almacen.create_signed_url(ruta, VIGENCIA_ENLACE_S, {"download": nombre})
    url = firmada.get("signedURL") or firmada.get("signedUrl")
    if not url:
        raise HTTPException(status_code=502, detail="No se pudo preparar la descarga. Intenta de nuevo.")
    return {"url": url, "nombre": nombre, "vence_en_segundos": VIGENCIA_ENLACE_S}
