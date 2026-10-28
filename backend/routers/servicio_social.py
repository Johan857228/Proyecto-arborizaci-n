"""Servicio social estudiantil obligatorio con horas verificadas (migración 009).

Bitácora del estudiante de 10.° y 11.°: sus inspecciones confirmadas cuentan solas y las demás
actividades (siembra, riego, jornada…) las registra con foto y las aprueba un docente. El
docente ve quién va atrasado; cuando alguien completa la meta, la institución emite el
certificado en PDF con código y QR de verificación. Reglas de cálculo: servicios/servicio_social.py.
"""
import html
import os
import secrets
import uuid
from datetime import date, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator, model_validator

import db
from auth import Perfil, perfil_actual, revisor_actual
from comun import BUCKET_FOTOS, MAX_FOTO_BYTES, ahora, fecha_local, hoy, leer_foto, traer_todo, url_firmada
from schemas import LAT_MAX, LAT_MIN, LNG_MAX, LNG_MIN
from servicios import servicio_social as ss
from servicios.certificado_pdf import certificado_pdf, codigo_legible, fecha_larga, horas_texto

router = APIRouter(tags=["Servicio social"])

TipoActividad = Literal["siembra", "riego", "mantenimiento", "jornada", "educacion", "otra"]
EstadoActividad = Literal["pendiente", "aprobada", "rechazada"]
EstadoServicio = Literal["al_dia", "atrasado", "completo"]
MAX_DIAS_ATRAS = 90
VIGENCIA_ENLACE_S = 600
ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I para no confundirlos


def _falta_migracion(error: APIError) -> bool:
    return str(getattr(error, "code", "") or "") in ("PGRST205", "42P01", "42703", "PGRST204")


def _o_vacio(consulta, defecto):
    """Ejecuta la consulta; sin la migración 009 devuelve `defecto`."""
    try:
        return consulta()
    except APIError as error:
        if _falta_migracion(error):
            return defecto
        raise


# ===================================== Modelos =====================================
class HorasTipo(BaseModel):
    tipo: str
    etiqueta: str
    horas: float


class ActividadOut(BaseModel):
    id: str
    estudiante_id: str
    estudiante_nombre: str | None = None
    curso_nombre: str | None = None
    tipo: TipoActividad
    etiqueta: str
    fecha: date
    horas: float
    descripcion: str
    arbol_id: str | None = None
    lat: float | None = None
    lng: float | None = None
    foto_url: str | None = None
    estado: EstadoActividad
    comentario: str | None = None
    revisado_en: datetime | None = None
    creado_en: datetime


class CertificadoOut(BaseModel):
    id: str
    codigo: str
    estudiante_id: str
    estudiante_nombre: str
    curso_nombre: str | None = None
    horas: float
    meta_horas: float
    periodo_inicio: date
    periodo_fin: date
    firmante_nombre: str
    firmante_cargo: str
    emitido_en: datetime
    anulado_en: datetime | None = None
    anulado_motivo: str | None = None


class ResumenCorto(BaseModel):
    estudiante_id: str
    nombre: str
    curso_id: str | None = None
    curso_nombre: str | None = None
    grado: int | None = None
    en_servicio: bool
    motivo: str | None = None
    meta: float
    horas_aprobadas: float = 0
    horas_pendientes: float = 0
    horas_esperadas: float = 0
    estado: EstadoServicio | None = None
    periodo_inicio: date | None = None
    periodo_fin: date | None = None
    certificado: CertificadoOut | None = None


class ResumenOut(ResumenCorto):
    horas_por_inspeccion: float
    por_tipo: list[HorasTipo] = []
    fuera_del_tope: float = 0
    inspecciones_contadas: int = 0
    actividades: list[ActividadOut] = []
    no_permitidas: str = ss.NO_PERMITIDAS


class ActividadIn(BaseModel):
    tipo: TipoActividad
    fecha: date
    horas: float = Field(gt=0, le=ss.MAX_HORAS_DIA)
    descripcion: str = Field(min_length=10, max_length=500)
    arbol_id: UUID | None = None
    lat: float | None = Field(default=None, ge=LAT_MIN, le=LAT_MAX)
    lng: float | None = Field(default=None, ge=LNG_MIN, le=LNG_MAX)

    @field_validator("descripcion", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("horas")
    @classmethod
    def _media_hora(cls, v: float) -> float:
        if round(v * 2) != v * 2:
            raise ValueError("Registra las horas en medias horas (0,5; 1; 1,5…)")
        return v

    @model_validator(mode="after")
    def _reglas(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Envía latitud y longitud juntas, o ninguna de las dos")
        dia = hoy()
        if self.fecha > dia:
            raise ValueError("La fecha no puede ser futura")
        if self.fecha < dia - timedelta(days=MAX_DIAS_ATRAS):
            raise ValueError(f"Solo se registran actividades de los últimos {MAX_DIAS_ATRAS} días")
        return self


class RevisionIn(BaseModel):
    comentario: str | None = Field(default=None, max_length=500)


class RechazoIn(BaseModel):
    motivo: str = Field(min_length=5, max_length=500)

    @field_validator("motivo", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return v.strip() if isinstance(v, str) else v


class ParametrosOut(BaseModel):
    institucion_id: str
    meta_horas: float = ss.META_POR_DEFECTO
    horas_por_inspeccion: float = ss.HORAS_POR_INSPECCION


class ParametrosIn(BaseModel):
    meta_horas: float = Field(ge=1, le=400)
    horas_por_inspeccion: float = Field(ge=0, le=ss.MAX_HORAS_DIA)


class CertificadoIn(BaseModel):
    estudiante_id: UUID
    firmante_nombre: str = Field(min_length=3, max_length=120, description="Rector(a) que firma")
    firmante_cargo: str = Field(default="Rector(a)", min_length=3, max_length=80)
    autorizado_por_rectoria: bool = Field(description="Quien emite confirma que rectoría autorizó la emisión")

    @field_validator("firmante_nombre", "firmante_cargo", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return v.strip() if isinstance(v, str) else v


class DescargaOut(BaseModel):
    url: str
    nombre: str
    vence_en_segundos: int


class VerificacionOut(BaseModel):
    valido: bool
    codigo: str
    estado: Literal["vigente", "anulado"]
    estudiante: str  # iniciales: es información pública de un menor de edad
    institucion: str
    horas: float
    periodo_inicio: date
    periodo_fin: date
    firmante_nombre: str
    firmante_cargo: str
    emitido_en: datetime
    anulado_en: datetime | None = None


# ===================================== Datos =====================================
def _perfil_de(usuario_id: str) -> dict:
    filas = (
        db.get_admin().table("perfiles").select("usuario_id, nombre, rol, institucion_id, curso_id, activo")
        .eq("usuario_id", usuario_id).execute().data
    )
    if not filas:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    return filas[0]


def _cursos(institucion_id: str | None) -> dict[str, dict]:
    q = db.get_admin().table("cursos").select("*")
    if institucion_id:
        q = q.eq("institucion_id", institucion_id)
    return {str(c["id"]): c for c in q.execute().data}


def parametros_de(institucion_id: str | None) -> dict:
    if not institucion_id:
        return ParametrosOut(institucion_id="").model_dump()
    filas = _o_vacio(
        lambda: db.get_admin().table("servicio_social_parametros").select("*").eq("institucion_id", institucion_id).execute().data,
        [],
    )
    fila = filas[0] if filas else {}
    return {
        "institucion_id": institucion_id,
        "meta_horas": float(fila.get("meta_horas") or ss.META_POR_DEFECTO),
        "horas_por_inspeccion": float(fila["horas_por_inspeccion"]) if fila.get("horas_por_inspeccion") is not None else ss.HORAS_POR_INSPECCION,
    }


def _inspecciones_de(usuario_ids: list[str]) -> list[dict]:
    if not usuario_ids:
        return []
    return traer_todo(
        db.get_admin(), "inspecciones", "id, arbol_id, inspector_id, fecha, origen, estado_revision",
        filtros=[("in_", ("inspector_id", usuario_ids))],
    )


def _actividades_de(usuario_ids: list[str]) -> list[dict]:
    if not usuario_ids:
        return []
    return _o_vacio(
        lambda: db.get_admin().table("actividades_servicio").select("*").in_("estudiante_id", usuario_ids)
        .order("fecha", desc=True).execute().data,
        [],
    )


def _certificados_vigentes(usuario_ids: list[str]) -> dict[str, dict]:
    if not usuario_ids:
        return {}
    filas = _o_vacio(
        lambda: db.get_admin().table("certificados_servicio").select("*").in_("estudiante_id", usuario_ids)
        .is_("anulado_en", "null").execute().data,
        [],
    )
    return {str(f["estudiante_id"]): f for f in filas}


def _fecha(valor) -> date:
    return valor if isinstance(valor, date) else date.fromisoformat(str(valor)[:10])


def _actividad_out(a: dict, nombres: dict[str, dict] | None = None, cursos: dict[str, dict] | None = None, con_foto: bool = True) -> dict:
    perfil = (nombres or {}).get(str(a["estudiante_id"]), {})
    curso = (cursos or {}).get(str(perfil.get("curso_id")), {}) if perfil else {}
    return {
        **{k: a.get(k) for k in ("tipo", "horas", "descripcion", "lat", "lng", "estado", "comentario", "revisado_en", "creado_en")},
        "id": str(a["id"]),
        "estudiante_id": str(a["estudiante_id"]),
        "estudiante_nombre": perfil.get("nombre"),
        "curso_nombre": curso.get("nombre"),
        "etiqueta": ss.TIPOS[a["tipo"]],
        "fecha": _fecha(a["fecha"]),
        "arbol_id": str(a["arbol_id"]) if a.get("arbol_id") else None,
        "foto_url": url_firmada(db.get_admin(), a["foto_path"]) if con_foto and a.get("foto_path") else None,
    }


def _resumen(perfil: dict, curso: dict | None, params: dict, inspecciones: list[dict], actividades: list[dict],
             certificado: dict | None, dia: date, detalle: bool) -> dict:
    meta = params["meta_horas"]
    base = {
        "estudiante_id": str(perfil["usuario_id"]),
        "nombre": perfil["nombre"],
        "curso_id": str(curso["id"]) if curso else None,
        "curso_nombre": curso.get("nombre") if curso else None,
        "grado": ss.grado_de_curso(curso),
        "meta": meta,
        "horas_por_inspeccion": params["horas_por_inspeccion"],
        "certificado": certificado,
    }
    if perfil["rol"] != "estudiante":
        return {**base, "en_servicio": False, "motivo": "El servicio social lo prestan los estudiantes de 10.° y 11.°"}
    if not curso:
        return {**base, "en_servicio": False, "motivo": "Aún no tienes curso asignado. Pídele a tu docente que te agregue."}
    if base["grado"] not in ss.GRADOS_SERVICIO:
        return {**base, "en_servicio": False, "motivo": "El servicio social se presta en 10.° y 11.°. Tu curso no es de esos grados."}

    inicio, fin = ss.periodo(base["grado"], int(curso["anio"]))
    confirmadas, por_revisar = ss.horas_de_inspecciones(inspecciones, perfil["usuario_id"], params["horas_por_inspeccion"], inicio, fin, fecha_local)
    propias = [a for a in actividades if str(a["estudiante_id"]) == str(perfil["usuario_id"]) and inicio <= _fecha(a["fecha"]) <= fin]

    def como_item(a):
        return {"fecha": _fecha(a["fecha"]), "horas": float(a["horas"]), "tipo": a["tipo"]}

    aprobadas = ss.sumar(confirmadas + [como_item(a) for a in propias if a["estado"] == "aprobada"])
    pendientes = ss.sumar(por_revisar + [como_item(a) for a in propias if a["estado"] == "pendiente"])
    esperadas = ss.horas_esperadas(meta, inicio, min(dia, fin))
    resumen = {
        **base,
        "en_servicio": True,
        "horas_aprobadas": aprobadas["total"],
        "horas_pendientes": pendientes["total"],
        "horas_esperadas": esperadas,
        "estado": ss.estado(aprobadas["total"], meta, esperadas),
        "periodo_inicio": inicio,
        "periodo_fin": fin,
        "por_tipo": [{"tipo": t, "etiqueta": ss.TIPOS[t], "horas": h} for t, h in aprobadas["por_tipo"].items()],
        "fuera_del_tope": aprobadas["fuera_del_tope"],
        "inspecciones_contadas": len(confirmadas),
    }
    if detalle:
        resumen["actividades"] = [_actividad_out(a) for a in propias]
    return resumen


def _gestiona(perfil: Perfil, institucion_id: str | None):
    if not perfil.gestiona(institucion_id):
        raise HTTPException(status_code=403, detail="Solo docentes de la institución y el administrador")


def _resumen_de(estudiante_id: str, dia: date, detalle: bool = True) -> dict:
    est = _perfil_de(estudiante_id)
    cursos = _cursos(est.get("institucion_id"))
    curso = cursos.get(str(est.get("curso_id"))) if est.get("curso_id") else None
    return _resumen(
        est, curso, parametros_de(est.get("institucion_id")), _inspecciones_de([estudiante_id]),
        _actividades_de([estudiante_id]), _certificados_vigentes([estudiante_id]).get(estudiante_id), dia, detalle,
    )


# ================================== Estudiante ==================================
@router.get("/servicio-social/resumen", response_model=ResumenOut)
def resumen(estudiante_id: UUID | None = None, perfil: Perfil = Depends(perfil_actual)):
    """Horas del estudiante (las propias si no se indica otro): aprobadas, por revisar, esperadas
    a la fecha, por tipo de actividad y bitácora."""
    uid = str(estudiante_id or perfil.usuario_id)
    if uid != perfil.usuario_id:
        _gestiona(perfil, _perfil_de(uid).get("institucion_id"))
    return _resumen_de(uid, hoy())


@router.post("/servicio-social/actividades", response_model=ActividadOut, status_code=201)
def registrar_actividad(d: ActividadIn, perfil: Perfil = Depends(perfil_actual)):
    """El estudiante registra una actividad de servicio social. Queda pendiente hasta que un
    docente la apruebe; la foto de evidencia se sube después con /foto."""
    r = _resumen_de(perfil.usuario_id, hoy(), detalle=True)
    if not r["en_servicio"]:
        raise HTTPException(status_code=403, detail=r["motivo"])
    if not (r["periodo_inicio"] <= d.fecha <= r["periodo_fin"]):
        raise HTTPException(status_code=422, detail="La fecha está fuera de tu periodo de servicio social")
    ese_dia = sum(a["horas"] for a in r["actividades"] if a["fecha"] == d.fecha and a["estado"] != "rechazada")
    if ese_dia + d.horas > ss.MAX_HORAS_DIA:
        raise HTTPException(status_code=422, detail=f"Ese día ya registraste {horas_texto(ese_dia)} h: el máximo es {horas_texto(ss.MAX_HORAS_DIA)} h por día")
    if d.arbol_id:
        arbol = db.get_admin().table("arboles").select("id, institucion_id").eq("id", str(d.arbol_id)).execute().data
        if not arbol or arbol[0]["institucion_id"] != perfil.institucion_id:
            raise HTTPException(status_code=422, detail="El árbol no es de tu institución")
    fila = {
        "estudiante_id": perfil.usuario_id,
        "institucion_id": perfil.institucion_id,
        "tipo": d.tipo,
        "fecha": d.fecha.isoformat(),
        "horas": d.horas,
        "descripcion": d.descripcion,
        "arbol_id": str(d.arbol_id) if d.arbol_id else None,
        "lat": d.lat,
        "lng": d.lng,
    }
    creada = db.get_admin().table("actividades_servicio").insert(fila).execute().data[0]
    return _actividad_out(creada)


@router.post("/servicio-social/actividades/{actividad_id}/foto", response_model=ActividadOut)
def subir_foto_actividad(actividad_id: UUID, archivo: UploadFile = File(...), perfil: Perfil = Depends(perfil_actual)):
    """Foto de evidencia de la actividad (JPG, PNG o WebP de máximo 5 MB, sin metadatos)."""
    contenido, tipo_real, extension = leer_foto(archivo, MAX_FOTO_BYTES)
    admin = db.get_admin()
    filas = admin.table("actividades_servicio").select("*").eq("id", str(actividad_id)).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    actividad = filas[0]
    if str(actividad["estudiante_id"]) != perfil.usuario_id:
        raise HTTPException(status_code=403, detail="Solo quien registró la actividad puede agregarle la foto")
    if actividad["estado"] != "pendiente":
        raise HTTPException(status_code=409, detail="La actividad ya fue revisada")
    ruta = f"servicio/{perfil.usuario_id}/{actividad_id}/{uuid.uuid4().hex}.{extension}"
    admin.storage.from_(BUCKET_FOTOS).upload(ruta, contenido, {"content-type": tipo_real})
    anterior = actividad.get("foto_path")
    actualizada = admin.table("actividades_servicio").update({"foto_path": ruta}).eq("id", str(actividad_id)).execute().data[0]
    if anterior:
        try:
            admin.storage.from_(BUCKET_FOTOS).remove([anterior])
        except Exception:
            pass
    return _actividad_out(actualizada)


# ==================================== Docente ====================================
@router.get("/servicio-social/estudiantes", response_model=list[ResumenCorto])
def estudiantes(
    institucion_id: str | None = Query(None, max_length=64),
    curso_id: UUID | None = None,
    perfil: Perfil = Depends(revisor_actual),
):
    """Estudiantes de 10.° y 11.° con sus horas: primero los atrasados, luego los que van al día
    (de menos a más horas) y al final los que ya completaron."""
    if not perfil.es_admin:
        institucion_id = perfil.institucion_id
    if not institucion_id:
        raise HTTPException(status_code=422, detail="Elige una institución")
    return resumenes_institucion(institucion_id, str(curso_id) if curso_id else None)


def resumenes_institucion(institucion_id: str, curso_id: str | None = None) -> list[dict]:
    """Resumen de cada estudiante de 10.° y 11.° de la institución (sin bitácora), en el orden de la lista."""
    cursos = _cursos(institucion_id)
    if curso_id:
        cursos = {k: v for k, v in cursos.items() if k == curso_id}
    en_grado = {k: c for k, c in cursos.items() if ss.grado_de_curso(c) in ss.GRADOS_SERVICIO}
    perfiles = [
        p for p in db.get_admin().table("perfiles").select("usuario_id, nombre, rol, institucion_id, curso_id, activo")
        .eq("institucion_id", institucion_id).eq("rol", "estudiante").execute().data
        if p["activo"] and str(p.get("curso_id")) in en_grado
    ]
    ids = [str(p["usuario_id"]) for p in perfiles]
    inspecciones, actividades = _inspecciones_de(ids), _actividades_de(ids)
    certificados = _certificados_vigentes(ids)
    params, dia = parametros_de(institucion_id), hoy()
    filas = [
        _resumen(p, en_grado[str(p["curso_id"])], params, inspecciones, actividades, certificados.get(str(p["usuario_id"])), dia, False)
        for p in perfiles
    ]
    orden = {"atrasado": 0, "al_dia": 1, "completo": 2}
    filas.sort(key=lambda f: (orden.get(f.get("estado"), 3), f["horas_aprobadas"], f["nombre"].lower()))
    return filas


@router.get("/servicio-social/actividades/pendientes", response_model=list[ActividadOut])
def actividades_pendientes(institucion_id: str | None = Query(None, max_length=64), perfil: Perfil = Depends(revisor_actual)):
    """Actividades por aprobar, de la más antigua a la más reciente."""
    if not perfil.es_admin:
        institucion_id = perfil.institucion_id
    def consulta():
        q = db.get_admin().table("actividades_servicio").select("*").eq("estado", "pendiente")
        if institucion_id:
            q = q.eq("institucion_id", institucion_id)
        return q.order("creado_en").limit(300).execute().data
    filas = _o_vacio(consulta, [])
    ids = sorted({str(a["estudiante_id"]) for a in filas})
    nombres = {
        str(p["usuario_id"]): p
        for p in (db.get_admin().table("perfiles").select("usuario_id, nombre, curso_id").in_("usuario_id", ids).execute().data if ids else [])
    }
    cursos = _cursos(institucion_id)
    return [_actividad_out(a, nombres, cursos) for a in filas]


def _actividad_revisable(perfil: Perfil, actividad_id: str) -> dict:
    filas = db.get_admin().table("actividades_servicio").select("*").eq("id", actividad_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    actividad = filas[0]
    _gestiona(perfil, actividad["institucion_id"])
    if actividad["estado"] != "pendiente":
        raise HTTPException(status_code=409, detail="La actividad ya fue revisada")
    return actividad


def _revisar(perfil: Perfil, actividad_id: str, estado_: str, comentario: str | None) -> dict:
    admin = db.get_admin()
    actualizadas = (
        admin.table("actividades_servicio")
        .update({"estado": estado_, "revisado_por": perfil.usuario_id, "revisado_en": ahora().isoformat(), "comentario": comentario})
        .eq("id", actividad_id).eq("estado", "pendiente").execute().data
    )
    if not actualizadas:
        raise HTTPException(status_code=409, detail="La actividad ya fue revisada por otra persona")
    return _actividad_out(actualizadas[0])


@router.post("/servicio-social/actividades/{actividad_id}/aprobar", response_model=ActividadOut)
def aprobar_actividad(actividad_id: UUID, d: RevisionIn, perfil: Perfil = Depends(revisor_actual)):
    """El docente aprueba la actividad: sus horas pasan a contar. Necesita la foto de evidencia."""
    actividad = _actividad_revisable(perfil, str(actividad_id))
    if not actividad.get("foto_path"):
        raise HTTPException(status_code=409, detail="La actividad aún no tiene foto de evidencia")
    return _revisar(perfil, str(actividad_id), "aprobada", (d.comentario or "").strip() or None)


@router.post("/servicio-social/actividades/{actividad_id}/rechazar", response_model=ActividadOut)
def rechazar_actividad(actividad_id: UUID, d: RechazoIn, perfil: Perfil = Depends(revisor_actual)):
    """Rechaza la actividad con un motivo que ve el estudiante."""
    _actividad_revisable(perfil, str(actividad_id))
    return _revisar(perfil, str(actividad_id), "rechazada", d.motivo)


@router.get("/servicio-social/parametros/{institucion_id}", response_model=ParametrosOut)
def ver_parametros(institucion_id: str, perfil: Perfil = Depends(perfil_actual)):
    if not perfil.es_admin and perfil.institucion_id != institucion_id:
        raise HTTPException(status_code=403, detail="Solo puedes ver los parámetros de tu institución")
    return parametros_de(institucion_id)


@router.put("/servicio-social/parametros/{institucion_id}", response_model=ParametrosOut)
def guardar_parametros(institucion_id: str, d: ParametrosIn, perfil: Perfil = Depends(revisor_actual)):
    """Meta de horas (80 por defecto) y horas que vale cada inspección confirmada."""
    _gestiona(perfil, institucion_id)
    fila = {"institucion_id": institucion_id, **d.model_dump(), "actualizado_por": perfil.usuario_id, "actualizado_en": ahora().isoformat()}
    db.get_admin().table("servicio_social_parametros").upsert(fila, on_conflict="institucion_id").execute()
    return parametros_de(institucion_id)


# ================================== Certificados ==================================
def _url_verificacion(request: Request, codigo: str) -> str:
    base = os.environ.get("URL_PUBLICA_API", "").strip().rstrip("/")
    if not base:
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
        base = f"{proto}://{host}"
    return f"{base}/verificar/{codigo}"


def _institucion(institucion_id: str) -> dict:
    admin = db.get_admin()
    try:
        filas = admin.table("instituciones").select("id, nombre, codigo_dane, municipio").eq("id", institucion_id).execute().data
    except APIError:  # sin la migración 006 no hay código DANE
        filas = admin.table("instituciones").select("id, nombre").eq("id", institucion_id).execute().data
    return filas[0] if filas else {"id": institucion_id, "nombre": institucion_id}


def _descarga(certificado: dict) -> dict:
    nombre = f"certificado-servicio-social-{certificado['codigo']}.pdf"
    firmada = db.get_admin().storage.from_(BUCKET_FOTOS).create_signed_url(certificado["pdf_path"], VIGENCIA_ENLACE_S, {"download": nombre})
    url = firmada.get("signedURL") or firmada.get("signedUrl")
    if not url:
        raise HTTPException(status_code=502, detail="No se pudo preparar la descarga. Intenta de nuevo.")
    return {"url": url, "nombre": nombre, "vence_en_segundos": VIGENCIA_ENLACE_S}


@router.post("/servicio-social/certificados", response_model=CertificadoOut, status_code=201)
def emitir_certificado(d: CertificadoIn, request: Request, perfil: Perfil = Depends(revisor_actual)):
    """Prepara el certificado en PDF de quien completó la meta. Lo emite un docente de la
    institución o el administrador, con autorización de rectoría y el nombre de quien firma."""
    if not d.autorizado_por_rectoria:
        raise HTTPException(status_code=422, detail="Confirma que rectoría autorizó la emisión del certificado")
    r = _resumen_de(str(d.estudiante_id), hoy(), detalle=False)
    est = _perfil_de(str(d.estudiante_id))
    _gestiona(perfil, est.get("institucion_id"))
    if not r["en_servicio"]:
        raise HTTPException(status_code=409, detail=r["motivo"])
    if r["certificado"]:
        raise HTTPException(status_code=409, detail="Ya tiene un certificado vigente: anúlalo para emitir otro")
    if r["horas_aprobadas"] < r["meta"]:
        raise HTTPException(status_code=409, detail=f"Aún no completa la meta: lleva {horas_texto(r['horas_aprobadas'])} de {horas_texto(r['meta'])} horas")

    codigo = "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(10))
    institucion = _institucion(est["institucion_id"])
    emitido = hoy()
    pdf = certificado_pdf({
        "institucion": institucion["nombre"],
        "codigo_dane": institucion.get("codigo_dane"),
        "municipio": institucion.get("municipio"),
        "estudiante": est["nombre"],
        "curso": r["curso_nombre"],
        "horas": r["horas_aprobadas"],
        "meta": r["meta"],
        "detalle": [(ss.TIPOS[t["tipo"]], t["horas"]) for t in r["por_tipo"]],
        "inicio": r["periodo_inicio"],
        "fin": min(r["periodo_fin"], emitido),
        "firmante": d.firmante_nombre,
        "cargo": d.firmante_cargo,
        "emitido": emitido,
        "codigo": codigo,
    }, _url_verificacion(request, codigo))
    ruta = f"certificados/{est['institucion_id']}/{codigo}.pdf"
    admin = db.get_admin()
    admin.storage.from_(BUCKET_FOTOS).upload(ruta, pdf, {"content-type": "application/pdf", "upsert": "true"})
    fila = {
        "codigo": codigo,
        "estudiante_id": str(d.estudiante_id),
        "institucion_id": est["institucion_id"],
        "estudiante_nombre": est["nombre"],
        "curso_nombre": r["curso_nombre"],
        "horas": r["horas_aprobadas"],
        "meta_horas": r["meta"],
        "detalle": {t["tipo"]: t["horas"] for t in r["por_tipo"]},
        "periodo_inicio": r["periodo_inicio"].isoformat(),
        "periodo_fin": min(r["periodo_fin"], emitido).isoformat(),
        "firmante_nombre": d.firmante_nombre,
        "firmante_cargo": d.firmante_cargo,
        "emitido_por": perfil.usuario_id,
        "pdf_path": ruta,
    }
    try:
        return admin.table("certificados_servicio").insert(fila).execute().data[0]
    except APIError as error:
        try:
            admin.storage.from_(BUCKET_FOTOS).remove([ruta])
        except Exception:
            pass
        if str(getattr(error, "code", "")) == "23505":
            raise HTTPException(status_code=409, detail="Ya tiene un certificado vigente: anúlalo para emitir otro")
        raise


@router.get("/servicio-social/certificados", response_model=list[CertificadoOut])
def listar_certificados(institucion_id: str | None = Query(None, max_length=64), perfil: Perfil = Depends(revisor_actual)):
    if not perfil.es_admin:
        institucion_id = perfil.institucion_id
    def consulta():
        q = db.get_admin().table("certificados_servicio").select("*")
        if institucion_id:
            q = q.eq("institucion_id", institucion_id)
        return q.order("emitido_en", desc=True).limit(500).execute().data
    return _o_vacio(consulta, [])


def _certificado(certificado_id: str) -> dict:
    filas = db.get_admin().table("certificados_servicio").select("*").eq("id", certificado_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Certificado no encontrado")
    return filas[0]


@router.get("/servicio-social/certificados/{certificado_id}/descarga", response_model=DescargaOut)
def descargar_certificado(certificado_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    """Enlace temporal (10 minutos) al PDF. Lo pueden descargar el estudiante y los docentes de su institución."""
    c = _certificado(str(certificado_id))
    if str(c["estudiante_id"]) != perfil.usuario_id and not perfil.gestiona(c["institucion_id"]):
        raise HTTPException(status_code=403, detail="No puedes descargar este certificado")
    return _descarga(c)


@router.post("/servicio-social/certificados/{certificado_id}/anular", response_model=CertificadoOut)
def anular_certificado(certificado_id: UUID, d: RechazoIn, perfil: Perfil = Depends(revisor_actual)):
    """Anula un certificado (p. ej. para corregir el nombre). La verificación lo mostrará anulado."""
    c = _certificado(str(certificado_id))
    _gestiona(perfil, c["institucion_id"])
    if c.get("anulado_en"):
        raise HTTPException(status_code=409, detail="El certificado ya estaba anulado")
    return db.get_admin().table("certificados_servicio").update({
        "anulado_por": perfil.usuario_id, "anulado_en": ahora().isoformat(), "anulado_motivo": d.motivo,
    }).eq("id", str(certificado_id)).execute().data[0]


# =============================== Verificación pública ===============================
def _verificacion(codigo: str) -> dict | None:
    codigo = codigo.strip().upper().replace("-", "")
    if len(codigo) != 10 or any(c not in ALFABETO_CODIGO for c in codigo):
        return None
    filas = _o_vacio(lambda: db.get_admin().table("certificados_servicio").select("*").eq("codigo", codigo).execute().data, [])
    if not filas:
        return None
    c = filas[0]
    return {
        "valido": not c.get("anulado_en"),
        "codigo": c["codigo"],
        "estado": "anulado" if c.get("anulado_en") else "vigente",
        "estudiante": ss.iniciales(c["estudiante_nombre"]),
        "institucion": _institucion(c["institucion_id"])["nombre"],
        "horas": float(c["horas"]),
        "periodo_inicio": _fecha(c["periodo_inicio"]),
        "periodo_fin": _fecha(c["periodo_fin"]),
        "firmante_nombre": c["firmante_nombre"],
        "firmante_cargo": c["firmante_cargo"],
        "emitido_en": c["emitido_en"],
        "anulado_en": c.get("anulado_en"),
    }


@router.get("/servicio-social/verificar/{codigo}", response_model=VerificacionOut)
def verificar_json(codigo: str):
    """Verificación pública (sin sesión). Muestra las iniciales del estudiante, no su nombre."""
    v = _verificacion(codigo)
    if not v:
        raise HTTPException(status_code=404, detail="No hay un certificado con ese código")
    return v


PAGINA = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Verificación de certificado · Arbolado Escolar</title>
<style>
body{{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F6F4EC;color:#13261C}}
main{{max-width:560px;margin:0 auto;padding:32px 16px}}
.marca{{color:#166534;font-weight:800;letter-spacing:.02em}}
.tarjeta{{background:#fff;border:1px solid #E8E4D8;border-radius:16px;padding:24px;margin-top:16px}}
.estado{{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:700;font-size:14px}}
.ok{{background:#E5F1E4;color:#166534}}.mal{{background:#FEE2E2;color:#B91C1C}}
dl{{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:20px 0 0}}dt{{color:#5A6258}}dd{{margin:0;font-weight:600}}
p.nota{{color:#5A6258;font-size:13px;line-height:1.5}}
</style></head><body><main><div class="marca">Arbolado Escolar</div>
<div class="tarjeta">{contenido}</div>
<p class="nota">Certificado de servicio social estudiantil obligatorio (Resolución 4210 de 1996). La app prepara el
certificado a partir de la bitácora validada por docentes; lo expide la institución educativa. Por tratarse de
datos de menores de edad, aquí solo se muestran las iniciales del estudiante.</p></main></body></html>"""


@router.get("/verificar/{codigo}", response_class=HTMLResponse, include_in_schema=False)
def verificar_html(codigo: str):
    """Página a la que lleva el QR del certificado."""
    v = _verificacion(codigo)
    if not v:
        contenido = ('<span class="estado mal">No encontrado</span><h1>No hay un certificado con ese código</h1>'
                     f"<p>Revisa el código: <strong>{html.escape(codigo[:20])}</strong></p>")
        return HTMLResponse(PAGINA.format(contenido=contenido), status_code=404)
    e = html.escape
    estado_ = ('<span class="estado ok">Certificado válido</span>' if v["valido"]
               else f'<span class="estado mal">Certificado anulado el {e(fecha_larga(fecha_local(v["anulado_en"])))}</span>')
    filas = [
        ("Código", codigo_legible(v["codigo"])),
        ("Estudiante", v["estudiante"]),
        ("Institución", v["institucion"]),
        ("Horas", f"{horas_texto(v['horas'])} horas"),
        ("Periodo", f"{fecha_larga(v['periodo_inicio'])} a {fecha_larga(v['periodo_fin'])}"),
        ("Firma", f"{v['firmante_nombre']}, {v['firmante_cargo']}"),
        ("Emitido", fecha_larga(fecha_local(v["emitido_en"]))),
    ]
    contenido = estado_ + "<dl>" + "".join(f"<dt>{e(k)}</dt><dd>{e(str(val))}</dd>" for k, val in filas) + "</dl>"
    return HTMLResponse(PAGINA.format(contenido=contenido))
