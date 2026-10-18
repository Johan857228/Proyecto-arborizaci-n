"""Privacidad de menores y derechos sobre los datos (Ley 1581 de 2012, Decreto 1377 de 2013).

- Política de tratamiento: cada persona acepta la versión vigente.
- Alias: cómo aparece cada quien en los rankings (sin alias, con sus iniciales).
- Autorización del acudiente: firmada en la app (el acudiente escribe su nombre) o un formato
  físico escaneado que sube el docente. Siempre se confirma que se escuchó al estudiante.
- Derechos: descargar mis datos y pedir consulta, rectificación, supresión o revocatoria, con
  los plazos de la ley (10 días hábiles las consultas, 15 los reclamos).
- Anonimización de egresados (administrador).
"""
import uuid
from datetime import date, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator, model_validator

import datos
import db
from auth import Perfil, perfil_actual, revisor_actual
from comun import BUCKET_FOTOS, MAX_FOTO_BYTES, POLITICA_VERSION, a_fecha_hora, ahora, leer_foto, url_firmada

router = APIRouter(prefix="/privacidad", tags=["Privacidad"])

Parentesco = Literal["madre", "padre", "acudiente", "otro"]
TipoSolicitud = Literal["consulta", "rectificacion", "supresion", "revocatoria"]
# Ley 1581: consultas en 10 días hábiles (art. 14) y reclamos en 15 (art. 15).
PLAZO_DIAS_HABILES: dict[str, int] = {"consulta": 10, "rectificacion": 15, "supresion": 15, "revocatoria": 15}
COLUMNAS_CONSENTIMIENTO = (
    "id, usuario_id, institucion_id, acudiente_nombre, acudiente_documento, parentesco, acudiente_contacto, "
    "metodo, documento_path, estudiante_escuchado, version_politica, registrado_por, creado_en, revocado_en"
)
COLUMNAS_SOLICITUD = "id, usuario_id, institucion_id, tipo, detalle, estado, respuesta, creado_en, atendida_en"


def _normalizar(texto: str) -> str:
    return " ".join(texto.split())


def sumar_dias_habiles(desde: date, dias: int) -> date:
    """Fecha límite contando solo de lunes a viernes (los festivos no se descuentan)."""
    fecha = desde
    while dias > 0:
        fecha += timedelta(days=1)
        if fecha.weekday() < 5:
            dias -= 1
    return fecha


# ==================================== Modelos =====================================
class ConsentimientoBase(BaseModel):
    usuario_id: UUID | None = Field(default=None, description="Estudiante; vacío = la propia cuenta")
    acudiente_nombre: str = Field(min_length=3, max_length=120)
    acudiente_documento: str = Field(pattern=r"^[0-9A-Za-z-]{4,20}$")
    parentesco: Parentesco
    acudiente_contacto: str | None = Field(default=None, max_length=120)
    estudiante_escuchado: bool

    @field_validator("acudiente_nombre", mode="before")
    @classmethod
    def _limpiar_nombre(cls, v):
        return _normalizar(v) if isinstance(v, str) else v

    @field_validator("acudiente_contacto", mode="before")
    @classmethod
    def _limpiar_contacto(cls, v):
        return (v.strip() or None) if isinstance(v, str) else v

    @field_validator("estudiante_escuchado")
    @classmethod
    def _escuchado(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Confirma que se escuchó la opinión del estudiante (Decreto 1377, art. 12)")
        return v


class ConsentimientoFirma(ConsentimientoBase):
    """El acudiente firma en la app escribiendo su nombre completo."""

    firma: str = Field(min_length=3, max_length=120)
    autoriza_tratamiento: bool

    @field_validator("firma", mode="before")
    @classmethod
    def _limpiar_firma(cls, v):
        return _normalizar(v) if isinstance(v, str) else v

    @model_validator(mode="after")
    def _firma_coincide(self):
        if not self.autoriza_tratamiento:
            raise ValueError("El acudiente debe autorizar el tratamiento de los datos")
        if self.firma.casefold() != self.acudiente_nombre.casefold():
            raise ValueError("La firma debe ser el nombre completo del acudiente, igual que arriba")
        return self


class ConsentimientoOut(BaseModel):
    id: str
    usuario_id: str
    acudiente_nombre: str
    acudiente_documento: str = Field(description="Solo los últimos 4 caracteres")
    parentesco: str
    metodo: Literal["firma_app", "documento"]
    estudiante_escuchado: bool
    version_politica: str
    creado_en: str
    revocado_en: str | None = None
    documento_url: str | None = None


class EstadoOut(BaseModel):
    politica_vigente: str
    politica_aceptada: str | None = None
    politica_aceptada_en: str | None = None
    alias: str | None = None
    requiere_consentimiento: bool
    consentimiento: ConsentimientoOut | None = None


class AliasIn(BaseModel):
    alias: str | None = Field(default=None, max_length=30)

    @field_validator("alias", mode="before")
    @classmethod
    def _limpiar(cls, v):
        if not isinstance(v, str):
            return v
        v = _normalizar(v)
        return v or None

    @field_validator("alias")
    @classmethod
    def _seguro(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v) < 3:
            raise ValueError("El alias debe tener al menos 3 caracteres")
        if "@" in v or sum(c.isdigit() for c in v) >= 7:
            raise ValueError("El alias no puede tener correos ni números de teléfono o documento")
        if not all(c.isalnum() or c in " ._-" for c in v):
            raise ValueError("Usa solo letras, números, espacios, puntos o guiones")
        return v


class SolicitudIn(BaseModel):
    tipo: TipoSolicitud
    detalle: str = Field(min_length=5, max_length=1000)

    @field_validator("detalle", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return v.strip() if isinstance(v, str) else v


class SolicitudOut(BaseModel):
    id: str
    usuario_id: str
    nombre: str | None = None
    tipo: TipoSolicitud
    detalle: str
    estado: Literal["pendiente", "atendida", "rechazada"]
    respuesta: str | None = None
    creado_en: str
    atendida_en: str | None = None
    fecha_limite: str
    vencida: bool


class SolicitudRespuesta(BaseModel):
    estado: Literal["atendida", "rechazada"]
    respuesta: str = Field(min_length=5, max_length=1000)


class EstudianteConsentimiento(BaseModel):
    usuario_id: str
    nombre: str
    curso_id: str | None = None
    estado: Literal["vigente", "sin_autorizacion", "revocada"]
    consentimiento: ConsentimientoOut | None = None


# ==================================== Apoyo =======================================
def _consentimiento_out(fila: dict, con_documento: bool = False) -> ConsentimientoOut:
    documento = str(fila.get("acudiente_documento") or "")
    url = None
    if con_documento and fila.get("documento_path"):
        url = url_firmada(db.get_admin(), fila["documento_path"])
    return ConsentimientoOut(
        id=str(fila["id"]),
        usuario_id=str(fila["usuario_id"]),
        acudiente_nombre=fila["acudiente_nombre"],
        acudiente_documento=("•" * max(0, len(documento) - 4)) + documento[-4:],
        parentesco=fila["parentesco"],
        metodo=fila["metodo"],
        estudiante_escuchado=bool(fila["estudiante_escuchado"]),
        version_politica=fila["version_politica"],
        creado_en=str(fila["creado_en"]),
        revocado_en=fila.get("revocado_en"),
        documento_url=url,
    )


def _vigente(filas: list[dict]) -> dict | None:
    """La autorización más reciente que no fue revocada."""
    vigentes = [f for f in filas if not f.get("revocado_en")]
    return max(vigentes, key=lambda f: str(f["creado_en"])) if vigentes else None


def _solicitud_out(fila: dict, nombres: dict[str, str] | None = None) -> SolicitudOut:
    creada = a_fecha_hora(fila["creado_en"]).date()
    limite = sumar_dias_habiles(creada, PLAZO_DIAS_HABILES[fila["tipo"]])
    return SolicitudOut(
        id=str(fila["id"]),
        usuario_id=str(fila["usuario_id"]),
        nombre=(nombres or {}).get(str(fila["usuario_id"])),
        tipo=fila["tipo"],
        detalle=fila["detalle"],
        estado=fila.get("estado") or "pendiente",
        respuesta=fila.get("respuesta"),
        creado_en=str(fila["creado_en"]),
        atendida_en=fila.get("atendida_en"),
        fecha_limite=limite.isoformat(),
        vencida=(fila.get("estado") or "pendiente") == "pendiente" and ahora().date() > limite,
    )


def _perfil_objetivo(cliente, perfil: Perfil, usuario_id: UUID | None) -> dict:
    """Perfil del estudiante al que se le registra la autorización. Para otra persona, solo el
    docente de su institución o un administrador."""
    if usuario_id is None or str(usuario_id) == perfil.usuario_id:
        return {"usuario_id": perfil.usuario_id, "institucion_id": perfil.institucion_id, "rol": perfil.rol}
    filas = cliente.table("perfiles").select("usuario_id, institucion_id, rol").eq("usuario_id", str(usuario_id)).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not perfil.gestiona(filas[0].get("institucion_id")):
        raise HTTPException(status_code=403, detail="Solo el docente de su institución o un administrador puede registrar esta autorización")
    return filas[0]


def _estado(cliente, perfil: Perfil) -> EstadoOut:
    filas = (
        cliente.table("perfiles").select("alias, politica_version, politica_aceptada_en")
        .eq("usuario_id", perfil.usuario_id).execute().data
    )
    propio = filas[0] if filas else {}
    consentimientos = (
        cliente.table("consentimientos").select(COLUMNAS_CONSENTIMIENTO).eq("usuario_id", perfil.usuario_id).execute().data
    )
    vigente = _vigente(consentimientos)
    return EstadoOut(
        politica_vigente=POLITICA_VERSION,
        politica_aceptada=propio.get("politica_version"),
        politica_aceptada_en=propio.get("politica_aceptada_en"),
        alias=propio.get("alias"),
        requiere_consentimiento=perfil.rol == "estudiante",
        consentimiento=_consentimiento_out(vigente) if vigente else None,
    )


# =============================== Estado, política y alias ===============================
@router.get("/estado", response_model=EstadoOut)
def estado(perfil: Perfil = Depends(perfil_actual)):
    """Política aceptada, alias y autorización del acudiente de quien llama."""
    return _estado(db.cliente_de_usuario(perfil.sesion.token), perfil)


@router.post("/politica", response_model=EstadoOut)
def aceptar_politica(perfil: Perfil = Depends(perfil_actual)):
    """Acepta la versión vigente de la política de tratamiento de datos."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    cliente.table("perfiles").update(
        {"politica_version": POLITICA_VERSION, "politica_aceptada_en": ahora().isoformat()}
    ).eq("usuario_id", perfil.usuario_id).execute()
    return _estado(cliente, perfil)


@router.put("/alias", response_model=EstadoOut)
def cambiar_alias(d: AliasIn, perfil: Perfil = Depends(perfil_actual)):
    """Alias para los rankings. Sin alias, los demás estudiantes ven solo las iniciales."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    cliente.table("perfiles").update({"alias": d.alias}).eq("usuario_id", perfil.usuario_id).execute()
    return _estado(cliente, perfil)


# ============================== Autorización del acudiente ==============================
@router.post("/consentimientos", response_model=ConsentimientoOut, status_code=201)
def firmar_consentimiento(d: ConsentimientoFirma, perfil: Perfil = Depends(perfil_actual)):
    """Autorización firmada en la app: el acudiente, presente, escribe su nombre completo."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    objetivo = _perfil_objetivo(cliente, perfil, d.usuario_id)
    fila = cliente.table("consentimientos").insert({
        "usuario_id": objetivo["usuario_id"],
        "institucion_id": objetivo.get("institucion_id"),
        "acudiente_nombre": d.acudiente_nombre,
        "acudiente_documento": d.acudiente_documento,
        "parentesco": d.parentesco,
        "acudiente_contacto": d.acudiente_contacto,
        "metodo": "firma_app",
        "firma": d.firma,
        "estudiante_escuchado": d.estudiante_escuchado,
        "autoriza_tratamiento": True,
        "version_politica": POLITICA_VERSION,
        "registrado_por": perfil.usuario_id,
    }).execute().data[0]
    return _consentimiento_out({"creado_en": ahora().isoformat(), **fila})


@router.post("/consentimientos/documento", response_model=ConsentimientoOut, status_code=201)
def subir_consentimiento(
    usuario_id: UUID = Form(...),
    acudiente_nombre: str = Form(...),
    acudiente_documento: str = Form(...),
    parentesco: Parentesco = Form(...),
    estudiante_escuchado: bool = Form(...),
    acudiente_contacto: str | None = Form(None),
    archivo: UploadFile = File(..., description="Foto del formato firmado (JPG, PNG o WebP)"),
    perfil: Perfil = Depends(revisor_actual),
):
    """Formato físico firmado por el acudiente: lo fotografía y lo sube el docente."""
    datos_form = ConsentimientoBase(
        usuario_id=usuario_id, acudiente_nombre=acudiente_nombre, acudiente_documento=acudiente_documento,
        parentesco=parentesco, acudiente_contacto=acudiente_contacto, estudiante_escuchado=estudiante_escuchado,
    )
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    objetivo = _perfil_objetivo(cliente, perfil, datos_form.usuario_id)
    contenido, tipo_real, extension = leer_foto(archivo, MAX_FOTO_BYTES)
    ruta = f"consentimientos/{objetivo['usuario_id']}/{uuid.uuid4().hex}.{extension}"
    admin = db.get_admin()
    admin.storage.from_(BUCKET_FOTOS).upload(ruta, contenido, {"content-type": tipo_real})
    try:
        fila = cliente.table("consentimientos").insert({
            "usuario_id": objetivo["usuario_id"],
            "institucion_id": objetivo.get("institucion_id"),
            "acudiente_nombre": datos_form.acudiente_nombre,
            "acudiente_documento": datos_form.acudiente_documento,
            "parentesco": datos_form.parentesco,
            "acudiente_contacto": datos_form.acudiente_contacto,
            "metodo": "documento",
            "documento_path": ruta,
            "estudiante_escuchado": True,
            "autoriza_tratamiento": True,
            "version_politica": POLITICA_VERSION,
            "registrado_por": perfil.usuario_id,
        }).execute().data[0]
    except Exception:
        try:  # no dejar el archivo huérfano
            admin.storage.from_(BUCKET_FOTOS).remove([ruta])
        except Exception:
            pass
        raise
    return _consentimiento_out({"creado_en": ahora().isoformat(), **fila}, con_documento=True)


@router.post("/consentimientos/{consentimiento_id}/revocar", response_model=ConsentimientoOut)
def revocar_consentimiento(consentimiento_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    """Revoca una autorización (la propia persona, el docente de su institución o un administrador)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    filas = cliente.table("consentimientos").select(COLUMNAS_CONSENTIMIENTO).eq("id", str(consentimiento_id)).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Autorización no encontrada")
    fila = filas[0]
    if str(fila["usuario_id"]) != perfil.usuario_id and not perfil.gestiona(fila.get("institucion_id")):
        raise HTTPException(status_code=403, detail="No puedes revocar esta autorización")
    if fila.get("revocado_en"):
        raise HTTPException(status_code=409, detail="La autorización ya estaba revocada")
    cambios = {"revocado_en": ahora().isoformat(), "revocado_por": perfil.usuario_id}
    cliente.table("consentimientos").update(cambios).eq("id", str(consentimiento_id)).execute()
    return _consentimiento_out({**fila, **cambios})


@router.get("/estudiantes", response_model=list[EstudianteConsentimiento])
def estudiantes(institucion_id: str | None = None, perfil: Perfil = Depends(revisor_actual)):
    """Estudiantes de la institución con el estado de su autorización (docente: la suya)."""
    if not perfil.es_admin:
        institucion_id = perfil.institucion_id
    if not institucion_id:
        raise HTTPException(status_code=422, detail="Elige una institución")
    if not perfil.gestiona(institucion_id):
        raise HTTPException(status_code=403, detail="No gestionas esta institución")
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    alumnos = [
        f for f in cliente.table("perfiles").select("usuario_id, nombre, rol, curso_id, activo")
        .eq("institucion_id", institucion_id).execute().data
        if f["rol"] == "estudiante" and f.get("activo", True)
    ]
    por_usuario: dict[str, list[dict]] = {}
    for c in cliente.table("consentimientos").select(COLUMNAS_CONSENTIMIENTO).eq("institucion_id", institucion_id).execute().data:
        por_usuario.setdefault(str(c["usuario_id"]), []).append(c)
    resultado = []
    for a in sorted(alumnos, key=lambda f: f["nombre"].lower()):
        propias = por_usuario.get(str(a["usuario_id"]), [])
        vigente = _vigente(propias)
        estado_c = "vigente" if vigente else ("revocada" if propias else "sin_autorizacion")
        resultado.append(EstudianteConsentimiento(
            usuario_id=str(a["usuario_id"]), nombre=a["nombre"], curso_id=a.get("curso_id"), estado=estado_c,
            consentimiento=_consentimiento_out(vigente, con_documento=True) if vigente else None,
        ))
    return resultado


# =================================== Mis datos ====================================
@router.get("/mis-datos")
def mis_datos(perfil: Perfil = Depends(perfil_actual)):
    """Copia de los datos personales de quien llama (derecho de consulta, Ley 1581 art. 14)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    estado_actual = _estado(cliente, perfil)
    inspecciones = [
        {"id": str(i["id"]), "arbol_id": str(i["arbol_id"]), "fecha": str(i["fecha"]), "estado_revision": i["estado_revision"]}
        for i in datos.inspecciones(cliente) if i.get("inspector_id") == perfil.usuario_id
    ]
    arboles = cliente.table("arboles").select("id, codigo, registrado_en").eq("registrado_por", perfil.usuario_id).execute().data
    solicitudes = cliente.table("solicitudes_datos").select(COLUMNAS_SOLICITUD).eq("usuario_id", perfil.usuario_id).execute().data
    consentimientos = cliente.table("consentimientos").select(COLUMNAS_CONSENTIMIENTO).eq("usuario_id", perfil.usuario_id).execute().data
    return {
        "generado_en": ahora().isoformat(),
        "responsable": "La institución educativa a la que perteneces; Arbolado Escolar actúa como encargado.",
        "perfil": {
            "usuario_id": perfil.usuario_id,
            "nombre": perfil.nombre,
            "correo": perfil.correo or perfil.sesion.email,
            "rol": perfil.rol,
            "institucion_id": perfil.institucion_id,
            "curso_id": perfil.curso_id,
            "alias": estado_actual.alias,
            "politica_aceptada": estado_actual.politica_aceptada,
            "politica_aceptada_en": estado_actual.politica_aceptada_en,
            "tiene_foto_de_perfil": bool(perfil.sesion.metadatos_app.get("foto_path")),
        },
        "autorizaciones_del_acudiente": [_consentimiento_out(c).model_dump() for c in consentimientos],
        "arboles_registrados": arboles,
        "inspecciones": inspecciones,
        "solicitudes": [_solicitud_out(s).model_dump() for s in solicitudes],
        "finalidades": [
            "Registrar y revisar el inventario de árboles de la institución.",
            "Asignar el trabajo de campo por curso y medir el avance.",
            "Calcular puntos y logros; en los rankings los demás estudiantes ven tu alias o tus iniciales.",
            "Generar reportes de la institución sin datos personales de estudiantes.",
        ],
    }


# ============================ Consultas y reclamos ============================
@router.post("/solicitudes", response_model=SolicitudOut, status_code=201)
def crear_solicitud(d: SolicitudIn, perfil: Perfil = Depends(perfil_actual)):
    """Consulta, rectificación, supresión o revocatoria; la atiende el docente o el administrador."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    fila = cliente.table("solicitudes_datos").insert({
        "usuario_id": perfil.usuario_id,
        "institucion_id": perfil.institucion_id,
        "tipo": d.tipo,
        "detalle": d.detalle,
    }).execute().data[0]
    return _solicitud_out({"estado": "pendiente", "creado_en": ahora().isoformat(), **fila})


@router.get("/solicitudes", response_model=list[SolicitudOut])
def listar_solicitudes(
    alcance: Literal["mias", "institucion"] = "mias",
    institucion_id: str | None = None,
    perfil: Perfil = Depends(perfil_actual),
):
    """Mis solicitudes, o las de la institución (docente: la suya; administrador: la elegida o todas)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    consulta = cliente.table("solicitudes_datos").select(COLUMNAS_SOLICITUD)
    nombres: dict[str, str] = {}
    if alcance == "mias":
        consulta = consulta.eq("usuario_id", perfil.usuario_id)
    else:
        if not perfil.es_revisor:
            raise HTTPException(status_code=403, detail="Esta función es solo para docentes y administradores")
        if not perfil.es_admin:
            institucion_id = perfil.institucion_id
        if institucion_id:
            consulta = consulta.eq("institucion_id", institucion_id)
        nombres = {str(f["usuario_id"]): f["nombre"] for f in cliente.table("perfiles").select("usuario_id, nombre").execute().data}
    filas = consulta.order("creado_en", desc=True).execute().data
    return [_solicitud_out(f, nombres) for f in filas]


@router.patch("/solicitudes/{solicitud_id}", response_model=SolicitudOut)
def responder_solicitud(solicitud_id: UUID, d: SolicitudRespuesta, perfil: Perfil = Depends(revisor_actual)):
    """Marca una solicitud como atendida o rechazada, con la respuesta para la persona."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    filas = cliente.table("solicitudes_datos").select(COLUMNAS_SOLICITUD).eq("id", str(solicitud_id)).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    fila = filas[0]
    if not perfil.gestiona(fila.get("institucion_id")):
        raise HTTPException(status_code=403, detail="No gestionas la institución de esta solicitud")
    if (fila.get("estado") or "pendiente") != "pendiente":
        raise HTTPException(status_code=409, detail="La solicitud ya fue respondida")
    cambios = {"estado": d.estado, "respuesta": d.respuesta.strip(), "atendida_en": ahora().isoformat(), "atendida_por": perfil.usuario_id}
    cliente.table("solicitudes_datos").update(cambios).eq("id", str(solicitud_id)).execute()
    return _solicitud_out({**fila, **cambios})


# ============================ Anonimización de egresados ============================
@router.post("/anonimizar/{usuario_id}")
def anonimizar(usuario_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    """Anonimiza la cuenta de un egresado: nombre genérico, sin correo, alias ni fotos, inactiva y
    sin acceso. Sus inspecciones y registros se conservan para la historia del arbolado."""
    if not perfil.es_admin:
        raise HTTPException(status_code=403, detail="Solo un administrador puede anonimizar cuentas")
    uid = str(usuario_id)
    if uid == perfil.usuario_id:
        raise HTTPException(status_code=422, detail="No puedes anonimizar tu propia cuenta")
    admin = db.get_admin()
    filas = admin.table("perfiles").select("usuario_id").eq("usuario_id", uid).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    admin.table("perfiles").update({
        "nombre": f"Exalumno {uid[:6]}",
        "correo": None,
        "alias": None,
        "curso_id": None,
        "activo": False,
    }).eq("usuario_id", uid).execute()
    # Fotos de perfil y portada; luego se bloquea el acceso (el correo queda solo en Supabase Auth).
    usuario = admin.auth.admin.get_user_by_id(uid).user
    metadatos = dict(getattr(usuario, "app_metadata", None) or {})
    rutas = [r for r in (metadatos.get("foto_path"), metadatos.get("portada_path")) if isinstance(r, str) and r.startswith(f"perfiles/{uid}/")]
    if rutas:
        try:
            admin.storage.from_(BUCKET_FOTOS).remove(rutas)
        except Exception:
            pass
    admin.auth.admin.update_user_by_id(uid, {
        "app_metadata": {"foto_path": None, "portada_path": None},
        "user_metadata": {"nombre": None},
        "ban_duration": "876000h",
    })
    return {"usuario_id": uid, "anonimizado": True}
