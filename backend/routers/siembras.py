"""Siembras con seguimiento de supervivencia (migración 013). Reglas: servicios/siembras.py.

- Jornadas y plántulas: las ve la institución; las registran sus docentes y el administrador.
- Controles: cualquier persona de la institución (los estudiantes pueden hacer el monitoreo).
- Asistentes: solo docentes y administrador, porque llevan nombres de estudiantes. La lista para
  el certificado Siembra Vida Buen Ciudadano solo incluye a quien tiene la autorización registrada
  para entregar su nombre a la alcaldía; la app no expide el certificado.
- Exportar: GeoJSON o CSV de las plántulas, sin datos de personas, para la alcaldía o la CAR.
"""
from datetime import date, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator, model_validator

import db
from auth import Perfil, perfil_actual, revisor_actual
from comun import BUCKET_FOTOS, ahora, hoy, traer_todo
from routers.mapa import origenes_guardados
from servicios import exportacion
from servicios import mapa as reglas_mapa
from servicios import siembras as reglas
from servicios.exportacion import Campo
from servicios.pdf import Documento, fecha_larga
from servicios.servicio_social import iniciales

router = APIRouter(prefix="/siembras", tags=["Siembras"])

Organizador = Literal["colegio", "alcaldia", "autoridad_ambiental", "empresa", "otro"]
EstadoControl = Literal["viva_buena", "viva_regular", "muerta", "no_encontrada"]
PadrinoTipo = Literal["curso", "estudiante", "docente", "familia", "empresa", "otro"]
RolAsistente = Literal["estudiante", "docente", "acudiente", "voluntario", "otro"]
Hito = Literal[3, 6, 12, 24]
VIGENCIA_ENLACE_S = 600
ORGANIZADORES = {"colegio": "El colegio", "alcaldia": "Alcaldía", "autoridad_ambiental": "Autoridad ambiental",
                 "empresa": "Empresa", "otro": "Otro"}
ROLES = {"estudiante": "Estudiante", "docente": "Docente", "acudiente": "Acudiente", "voluntario": "Voluntario", "otro": "Otro"}


def _texto(v):
    if isinstance(v, str):
        v = " ".join(v.split())
    return v or None


def _en_colombia(lat: float, lng: float):
    if not (-4.3 <= lat <= 13.5 and -82 <= lng <= -66.8):
        raise ValueError("Las coordenadas deben estar en Colombia")


# ===================================== Modelos =====================================
class JornadaCampos(BaseModel):
    nombre: str | None = Field(default=None, min_length=3, max_length=120)
    fecha: date | None = None
    lugar: str | None = Field(default=None, max_length=160)
    organizador: Organizador | None = None
    oficial: bool | None = Field(default=None, description="Jornada oficial (alcaldía o autoridad ambiental), cuenta para el certificado")
    area_de_vida: str | None = Field(default=None, max_length=160)
    patrocinador: str | None = Field(default=None, max_length=120)
    notas: str | None = Field(default=None, max_length=1000)

    @field_validator("nombre", "lugar", "area_de_vida", "patrocinador", "notas", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)


class JornadaIn(JornadaCampos):
    nombre: str = Field(min_length=3, max_length=120)
    fecha: date
    organizador: Organizador = "colegio"
    oficial: bool = False
    institucion_id: str | None = Field(default=None, max_length=64, description="Solo administradores")


class SiembraIn(BaseModel):
    especie_id: int | None = None
    especie_otra: str | None = Field(default=None, min_length=2, max_length=80)
    lat: float
    lng: float
    precision_gps_m: float | None = Field(default=None, ge=0, le=500)
    fecha: date | None = Field(default=None, description="Vacía = la fecha de la jornada")
    vivero: str | None = Field(default=None, max_length=120)
    vivero_registro_ica: str | None = Field(default=None, max_length=40)
    altura_inicial_cm: float | None = Field(default=None, ge=1, le=500)
    padrino_tipo: PadrinoTipo = "curso"
    padrino_curso_id: UUID | None = None
    padrino_usuario_id: UUID | None = None
    padrino_nombre: str | None = Field(default=None, min_length=2, max_length=120)
    reemplaza_id: UUID | None = None
    notas: str | None = Field(default=None, max_length=500)

    @field_validator("especie_otra", "vivero", "vivero_registro_ica", "padrino_nombre", "notas", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)

    @model_validator(mode="after")
    def _coherente(self):
        _en_colombia(self.lat, self.lng)
        if self.especie_id is None and not self.especie_otra:
            raise ValueError("Elige la especie o escribe cuál es")
        if self.padrino_tipo == "curso" and not self.padrino_curso_id:
            raise ValueError("Elige el curso padrino")
        if self.padrino_tipo in ("estudiante", "docente") and not self.padrino_usuario_id:
            raise ValueError("Elige la persona que apadrina")
        if self.padrino_tipo in ("familia", "empresa", "otro") and not self.padrino_nombre:
            raise ValueError("Escribe quién apadrina la plántula")
        if self.padrino_tipo in ("curso", "estudiante", "docente"):
            self.padrino_nombre = None  # el nombre de un estudiante nunca se escribe a mano
        return self


class ControlIn(BaseModel):
    hito_meses: Hito | None = Field(default=None, description="3, 6, 12 o 24; vacío = control extra")
    fecha: date
    estado: EstadoControl
    altura_cm: float | None = Field(default=None, ge=1, le=3000)
    mantenimiento: bool = Field(default=False, description="Se regó, se deshierbó o se protegió")
    observaciones: str | None = Field(default=None, max_length=500)

    @field_validator("observaciones", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)


class AsistenteIn(BaseModel):
    usuario_id: UUID | None = None
    nombre_externo: str | None = Field(default=None, min_length=3, max_length=120)
    rol: RolAsistente = "estudiante"
    arboles_sembrados: int | None = Field(default=None, ge=0, le=200)
    autoriza_certificado: bool = Field(default=False, description="Hay autorización para entregar el nombre a la alcaldía")

    @field_validator("nombre_externo", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _texto(v)

    @model_validator(mode="after")
    def _una_persona(self):
        if (self.usuario_id is None) == (self.nombre_externo is None):
            raise ValueError("Cada asistente es una cuenta de la app o un nombre escrito, no las dos cosas")
        if self.nombre_externo and self.rol == "estudiante":
            raise ValueError("Los estudiantes se agregan con su cuenta de la app")
        return self


class AsistentesIn(BaseModel):
    asistentes: list[AsistenteIn] = Field(max_length=400)


class ListaIn(BaseModel):
    formato: Literal["pdf", "csv"] = "pdf"


class ExportarIn(BaseModel):
    formato: Literal["geojson", "csv"]
    jornada_id: UUID | None = None
    institucion_id: str | None = Field(default=None, max_length=64, description="Solo administradores")


class PorHito(BaseModel):
    hito_meses: int
    debidas: int
    conocidas: int
    vivas: int
    pendientes: int
    supervivencia_pct: float | None = None


class ResumenOut(BaseModel):
    sembradas: int
    nativas: int
    pct_nativas: float | None = None
    evaluadas: int
    vivas: int
    muertas: int
    supervivencia_pct: float | None = None
    controles_pendientes: int
    controles_vencidos: int
    completaron_2_anios: int
    por_hito: list[PorHito]


class ConteoAsistentes(BaseModel):
    total: int
    estudiantes: int
    con_autorizacion: int


class JornadaOut(BaseModel):
    id: str
    institucion_id: str
    nombre: str
    fecha: date
    lugar: str | None = None
    organizador: Organizador
    oficial: bool
    area_de_vida: str | None = None
    patrocinador: str | None = None
    notas: str | None = None
    resumen: ResumenOut
    asistentes: ConteoAsistentes
    puede_editar: bool


class Siguiente(BaseModel):
    hito_meses: int
    fecha: date
    estado: Literal["proximo", "pendiente", "vencido"]


class ControlOut(BaseModel):
    id: str
    hito_meses: int | None = None
    fecha: date
    estado: EstadoControl
    altura_cm: float | None = None
    mantenimiento: bool
    observaciones: str | None = None
    puede_borrar: bool


class SiembraOut(BaseModel):
    id: str
    jornada_id: str
    institucion_id: str
    especie_id: int | None = None
    especie: str
    nombre_cientifico: str | None = None
    origen: Literal["nativa", "exotica"] | None = None
    lat: float
    lng: float
    precision_gps_m: float | None = None
    fecha: date
    vivero: str | None = None
    vivero_registro_ica: str | None = None
    altura_inicial_cm: float | None = None
    padrino_tipo: PadrinoTipo
    padrino: str | None = Field(default=None, description="Curso, persona (alias o iniciales para quien no es docente) o nombre")
    reemplaza_id: str | None = None
    notas: str | None = None
    estado: Literal["viva", "muerta", "sin_control"]
    controles: list[ControlOut]
    siguiente: Siguiente | None = None


class JornadaDetalle(JornadaOut):
    siembras: list[SiembraOut]


class AsistenteOut(BaseModel):
    id: str
    usuario_id: str | None = None
    nombre: str
    rol: RolAsistente
    curso: str | None = None
    arboles_sembrados: int | None = None
    autoriza_certificado: bool
    autorizacion_registrada_en: datetime | None = None


class ProximoOut(Siguiente):
    siembra_id: str
    jornada_id: str
    jornada: str
    especie: str


class GrupoOut(BaseModel):
    id: str
    nombre: str
    fecha: date | None = None
    resumen: ResumenOut


class ResumenGeneralOut(BaseModel):
    total: ResumenOut
    por_jornada: list[GrupoOut]
    por_sede: list[GrupoOut]
    proximos: list[ProximoOut]


class DescargaOut(BaseModel):
    url: str
    nombre: str
    vence_en_segundos: int
    filas: int


# ==================================== Consultas ====================================
def _institucion(perfil: Perfil, institucion_id: str | None, obligatoria: bool = False) -> str | None:
    elegida = (institucion_id or perfil.institucion_id) if perfil.es_admin else perfil.institucion_id
    if not elegida and (obligatoria or not perfil.es_admin):
        raise HTTPException(status_code=422, detail="Elige una institución" if perfil.es_admin else "Tu cuenta no tiene institución asignada")
    if elegida and not db.get_admin().table("instituciones").select("id").eq("id", elegida).execute().data:
        raise HTTPException(status_code=404, detail="Institución no encontrada")
    return elegida


def _ver(perfil: Perfil, institucion_id: str):
    if not perfil.es_admin and perfil.institucion_id != institucion_id:
        raise HTTPException(status_code=403, detail="Solo puedes ver las siembras de tu institución")


def _gestionar(perfil: Perfil, institucion_id: str):
    if not perfil.gestiona(institucion_id):
        raise HTTPException(status_code=403, detail="Solo los docentes de la institución y el administrador registran siembras")


def _uno(tabla: str, fila_id: str, nombre: str) -> dict:
    filas = db.get_admin().table(tabla).select("*").eq("id", fila_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail=f"{nombre} no encontrada")
    return filas[0]


def _especies() -> dict[str, dict]:
    guardados, _ = origenes_guardados()
    return {
        str(e["id"]): {**e, "origen": reglas_mapa.origen_de(e.get("nombre_cientifico"), guardados.get(str(e["id"])))}
        for e in db.get_admin().table("especies").select("id, nombre_comun, nombre_cientifico").execute().data
    }


def _por_id(tabla: str, columna: str, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    filas: list[dict] = []
    for inicio in range(0, len(ids), 100):
        filas += traer_todo(db.get_admin(), tabla, filtros=[("in_", (columna, ids[inicio:inicio + 100]))])
    return filas


def _datos(institucion_id: str | None = None, jornada_id: str | None = None):
    """Jornadas, plántulas y controles de una institución (o todas) o de una jornada."""
    admin = db.get_admin()
    if jornada_id:
        jornadas = [_uno("jornadas_siembra", jornada_id, "Jornada")]
    else:
        filtros = [("eq", ("institucion_id", institucion_id))] if institucion_id else []
        jornadas = traer_todo(admin, "jornadas_siembra", filtros=filtros)
    siembras = _por_id("siembras", "jornada_id", [str(j["id"]) for j in jornadas])
    controles: dict[str, list[dict]] = {}
    for c in _por_id("controles_siembra", "siembra_id", [str(s["id"]) for s in siembras]):
        controles.setdefault(str(c["siembra_id"]), []).append(c)
    return jornadas, siembras, controles


def _origenes(siembras: list[dict], especies: dict[str, dict]) -> dict[str, str | None]:
    return {str(s["id"]): (especies.get(str(s.get("especie_id"))) or {}).get("origen") for s in siembras}


def _conteo_asistentes(jornada_ids: list[str]) -> dict[str, dict]:
    conteos = {j: {"total": 0, "estudiantes": 0, "con_autorizacion": 0} for j in jornada_ids}
    for a in _por_id("asistentes_jornada", "jornada_id", jornada_ids):
        c = conteos[str(a["jornada_id"])]
        c["total"] += 1
        c["estudiantes"] += a["rol"] == "estudiante"
        c["con_autorizacion"] += bool(a.get("autoriza_certificado"))
    return conteos


def _jornada_out(j: dict, siembras: list[dict], controles, origenes, conteo: dict, perfil: Perfil) -> dict:
    return {
        **{k: j.get(k) for k in ("institucion_id", "nombre", "fecha", "lugar", "organizador", "oficial", "area_de_vida", "patrocinador", "notas")},
        "id": str(j["id"]),
        "resumen": reglas.resumen(siembras, controles, origenes, hoy()),
        "asistentes": conteo,
        "puede_editar": perfil.gestiona(j["institucion_id"]),
    }


def _nombres(usuario_ids: list[str], perfil: Perfil, institucion_id: str) -> dict[str, str]:
    """Nombre real para docentes y administradores; alias o iniciales para los demás."""
    filas = _por_id("perfiles", "usuario_id", usuario_ids)
    ve_nombre = perfil.gestiona(institucion_id)
    return {
        str(p["usuario_id"]): p["nombre"] if ve_nombre or p.get("rol") != "estudiante"
        else (p.get("alias") or iniciales(p["nombre"]))
        for p in filas
    }


def _siembras_out(siembras: list[dict], controles, especies, perfil: Perfil, institucion_id: str) -> list[dict]:
    cursos = {str(c["id"]): c["nombre"] for c in _por_id("cursos", "id", sorted({str(s["padrino_curso_id"]) for s in siembras if s.get("padrino_curso_id")}))}
    personas = _nombres(sorted({str(s["padrino_usuario_id"]) for s in siembras if s.get("padrino_usuario_id")}), perfil, institucion_id)
    puede = perfil.gestiona(institucion_id)
    salida = []
    for s in sorted(siembras, key=lambda x: (str(x["fecha"]), str(x.get("creado_en") or ""))):
        e = especies.get(str(s.get("especie_id"))) or {}
        propios = reglas._ordenados(controles.get(str(s["id"]), []))
        padrino = {"curso": cursos.get(str(s.get("padrino_curso_id"))), "estudiante": personas.get(str(s.get("padrino_usuario_id"))),
                   "docente": personas.get(str(s.get("padrino_usuario_id")))}.get(s["padrino_tipo"], s.get("padrino_nombre"))
        salida.append({
            **{k: s.get(k) for k in ("especie_id", "lat", "lng", "precision_gps_m", "fecha", "vivero", "vivero_registro_ica",
                                     "altura_inicial_cm", "padrino_tipo", "notas", "institucion_id")},
            "id": str(s["id"]), "jornada_id": str(s["jornada_id"]),
            "especie": e.get("nombre_comun") or s.get("especie_otra") or "Sin especie",
            "nombre_cientifico": e.get("nombre_cientifico"), "origen": e.get("origen"), "padrino": padrino,
            "reemplaza_id": str(s["reemplaza_id"]) if s.get("reemplaza_id") else None,
            "estado": reglas.estado_actual(propios),
            "controles": [{**{k: c.get(k) for k in ("hito_meses", "fecha", "estado", "altura_cm", "observaciones")},
                           "id": str(c["id"]), "mantenimiento": bool(c.get("mantenimiento")),
                           "puede_borrar": puede or str(c.get("registrado_por")) == perfil.usuario_id} for c in propios],
            "siguiente": reglas.siguiente_control(s, propios, hoy()),
        })
    return salida


def _subir(ruta: str, contenido: bytes, tipo: str, nombre: str) -> str:
    almacen = db.get_admin().storage.from_(BUCKET_FOTOS)
    almacen.upload(ruta, contenido, {"content-type": tipo, "upsert": "true"})
    firmada = almacen.create_signed_url(ruta, VIGENCIA_ENLACE_S, {"download": nombre})
    url = firmada.get("signedURL") or firmada.get("signedUrl")
    if not url:
        raise HTTPException(status_code=502, detail="No se pudo preparar la descarga. Intenta de nuevo.")
    return url


# ===================================== Jornadas =====================================
@router.get("/jornadas", response_model=list[JornadaOut])
def listar_jornadas(institucion_id: str | None = Query(None, max_length=64), perfil: Perfil = Depends(perfil_actual)):
    """Jornadas de siembra, de la más reciente a la más antigua, con su supervivencia."""
    institucion = _institucion(perfil, institucion_id)
    jornadas, siembras, controles = _datos(institucion)
    especies = _especies()
    por_jornada = reglas.agrupar(siembras, "jornada_id")
    conteos = _conteo_asistentes([str(j["id"]) for j in jornadas])
    origenes = _origenes(siembras, especies)
    jornadas.sort(key=lambda j: str(j["fecha"]), reverse=True)
    return [_jornada_out(j, por_jornada.get(str(j["id"]), []), controles, origenes, conteos[str(j["id"])], perfil) for j in jornadas]


@router.post("/jornadas", response_model=JornadaOut, status_code=201)
def crear_jornada(d: JornadaIn, perfil: Perfil = Depends(revisor_actual)):
    institucion = _institucion(perfil, d.institucion_id, obligatoria=True)
    _gestionar(perfil, institucion)
    if d.fecha > hoy() + timedelta(days=366):
        raise HTTPException(status_code=422, detail="La jornada no puede ser a más de un año")
    fila = {**d.model_dump(exclude={"institucion_id"}, mode="json"), "institucion_id": institucion, "creado_por": perfil.usuario_id}
    creada = db.get_admin().table("jornadas_siembra").insert(fila).execute().data[0]
    return _jornada_out(creada, [], {}, {}, {"total": 0, "estudiantes": 0, "con_autorizacion": 0}, perfil)


@router.get("/jornadas/{jornada_id}", response_model=JornadaDetalle)
def ver_jornada(jornada_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    """La jornada con sus plántulas, sus controles y el próximo control de cada una."""
    jornadas, siembras, controles = _datos(jornada_id=str(jornada_id))
    j = jornadas[0]
    _ver(perfil, j["institucion_id"])
    especies = _especies()
    conteo = _conteo_asistentes([str(j["id"])])[str(j["id"])]
    return {**_jornada_out(j, siembras, controles, _origenes(siembras, especies), conteo, perfil),
            "siembras": _siembras_out(siembras, controles, especies, perfil, j["institucion_id"])}


@router.patch("/jornadas/{jornada_id}", response_model=JornadaOut)
def editar_jornada(jornada_id: UUID, d: JornadaCampos, perfil: Perfil = Depends(revisor_actual)):
    j = _uno("jornadas_siembra", str(jornada_id), "Jornada")
    _gestionar(perfil, j["institucion_id"])
    cambios = d.model_dump(include=d.model_fields_set, mode="json")
    if "nombre" in cambios and not cambios["nombre"]:
        raise HTTPException(status_code=422, detail="La jornada necesita un nombre")
    for clave in ("fecha", "organizador", "oficial"):
        if clave in cambios and cambios[clave] is None:
            cambios.pop(clave)
    db.get_admin().table("jornadas_siembra").update({**cambios, "actualizado_en": ahora().isoformat()}).eq("id", str(jornada_id)).execute()
    return ver_jornada(jornada_id, perfil)


@router.delete("/jornadas/{jornada_id}", status_code=204)
def borrar_jornada(jornada_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    """Solo una jornada sin plántulas (para no perder el seguimiento)."""
    j = _uno("jornadas_siembra", str(jornada_id), "Jornada")
    _gestionar(perfil, j["institucion_id"])
    if db.get_admin().table("siembras").select("id").eq("jornada_id", str(jornada_id)).limit(1).execute().data:
        raise HTTPException(status_code=409, detail="La jornada tiene plántulas registradas: quítalas primero")
    db.get_admin().table("jornadas_siembra").delete().eq("id", str(jornada_id)).execute()
    return Response(status_code=204)


# ===================================== Plántulas =====================================
def _validar_planta(d: SiembraIn, j: dict) -> dict:
    admin = db.get_admin()
    fecha = d.fecha or (j["fecha"] if isinstance(j["fecha"], date) else date.fromisoformat(str(j["fecha"])[:10]))
    if fecha > hoy():
        raise HTTPException(status_code=422, detail="La fecha de siembra no puede ser futura: registra la plántula el día que se siembra")
    if d.especie_id is not None and not admin.table("especies").select("id").eq("id", d.especie_id).execute().data:
        raise HTTPException(status_code=422, detail="Esa especie no está en el catálogo")
    if d.padrino_curso_id:
        cursos = admin.table("cursos").select("institucion_id").eq("id", str(d.padrino_curso_id)).execute().data
        if not cursos or cursos[0]["institucion_id"] != j["institucion_id"]:
            raise HTTPException(status_code=422, detail="El curso padrino no es de la institución")
    if d.padrino_usuario_id:
        personas = admin.table("perfiles").select("institucion_id, rol").eq("usuario_id", str(d.padrino_usuario_id)).execute().data
        if not personas or personas[0]["institucion_id"] != j["institucion_id"]:
            raise HTTPException(status_code=422, detail="La persona padrino no es de la institución")
        if personas[0]["rol"] != d.padrino_tipo and not (d.padrino_tipo == "docente" and personas[0]["rol"] == "administrador"):
            raise HTTPException(status_code=422, detail=f"Esa persona no es {d.padrino_tipo}")
    if d.reemplaza_id:
        anterior = admin.table("siembras").select("institucion_id").eq("id", str(d.reemplaza_id)).execute().data
        if not anterior or anterior[0]["institucion_id"] != j["institucion_id"]:
            raise HTTPException(status_code=422, detail="La plántula que se reemplaza no es de la institución")
    fila = d.model_dump(mode="json", exclude={"fecha"})
    return {**fila, "fecha": fecha.isoformat()}


@router.post("/jornadas/{jornada_id}/plantas", response_model=SiembraOut, status_code=201)
def registrar_planta(jornada_id: UUID, d: SiembraIn, perfil: Perfil = Depends(revisor_actual)):
    """Registra una plántula sembrada con sus coordenadas, especie, vivero y padrino."""
    j = _uno("jornadas_siembra", str(jornada_id), "Jornada")
    _gestionar(perfil, j["institucion_id"])
    fila = {**_validar_planta(d, j), "jornada_id": str(jornada_id), "institucion_id": j["institucion_id"], "creado_por": perfil.usuario_id}
    creada = db.get_admin().table("siembras").insert(fila).execute().data[0]
    return _siembras_out([creada], {}, _especies(), perfil, j["institucion_id"])[0]


@router.patch("/plantas/{siembra_id}", response_model=SiembraOut)
def editar_planta(siembra_id: UUID, d: SiembraIn, perfil: Perfil = Depends(revisor_actual)):
    s = _uno("siembras", str(siembra_id), "Plántula")
    _gestionar(perfil, s["institucion_id"])
    j = _uno("jornadas_siembra", str(s["jornada_id"]), "Jornada")
    if d.reemplaza_id and str(d.reemplaza_id) == str(siembra_id):
        raise HTTPException(status_code=422, detail="Una plántula no se reemplaza a sí misma")
    db.get_admin().table("siembras").update(_validar_planta(d, j)).eq("id", str(siembra_id)).execute()
    _, siembras, controles = _datos(jornada_id=str(s["jornada_id"]))
    return next(x for x in _siembras_out(siembras, controles, _especies(), perfil, s["institucion_id"]) if x["id"] == str(siembra_id))


@router.delete("/plantas/{siembra_id}", status_code=204)
def borrar_planta(siembra_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    s = _uno("siembras", str(siembra_id), "Plántula")
    _gestionar(perfil, s["institucion_id"])
    db.get_admin().table("siembras").delete().eq("id", str(siembra_id)).execute()
    return Response(status_code=204)


@router.post("/plantas/{siembra_id}/controles", response_model=ControlOut, status_code=201)
def registrar_control(siembra_id: UUID, d: ControlIn, perfil: Perfil = Depends(perfil_actual)):
    """Control de supervivencia. Lo puede hacer cualquier persona de la institución."""
    s = _uno("siembras", str(siembra_id), "Plántula")
    _ver(perfil, s["institucion_id"])
    sembrada = date.fromisoformat(str(s["fecha"])[:10])
    if d.fecha > hoy():
        raise HTTPException(status_code=422, detail="La fecha del control no puede ser futura")
    if d.fecha < sembrada:
        raise HTTPException(status_code=422, detail="El control no puede ser anterior a la siembra")
    if d.hito_meses and d.fecha < reglas.vencimiento(s, d.hito_meses) - timedelta(days=reglas.DIAS_ANTES):
        raise HTTPException(status_code=422, detail=f"Aún no es tiempo del control de {d.hito_meses} meses: se hace desde el "
                                                    f"{fecha_larga(reglas.vencimiento(s, d.hito_meses) - timedelta(days=reglas.DIAS_ANTES))}")
    admin = db.get_admin()
    if d.hito_meses and admin.table("controles_siembra").select("id").eq("siembra_id", str(siembra_id)).eq("hito_meses", d.hito_meses).execute().data:
        raise HTTPException(status_code=409, detail=f"Ya hay un control de {d.hito_meses} meses para esta plántula")
    fila = {**d.model_dump(mode="json"), "siembra_id": str(siembra_id), "registrado_por": perfil.usuario_id}
    c = admin.table("controles_siembra").insert(fila).execute().data[0]
    return {**{k: c.get(k) for k in ("hito_meses", "fecha", "estado", "altura_cm", "observaciones")},
            "id": str(c["id"]), "mantenimiento": bool(c.get("mantenimiento")), "puede_borrar": True}


@router.delete("/controles/{control_id}", status_code=204)
def borrar_control(control_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    c = _uno("controles_siembra", str(control_id), "Control")
    s = _uno("siembras", str(c["siembra_id"]), "Plántula")
    if not (perfil.gestiona(s["institucion_id"]) or str(c.get("registrado_por")) == perfil.usuario_id):
        raise HTTPException(status_code=403, detail="Solo quien registró el control o un docente pueden quitarlo")
    db.get_admin().table("controles_siembra").delete().eq("id", str(control_id)).execute()
    return Response(status_code=204)


# ===================================== Asistentes =====================================
def _asistentes(jornada_id: str) -> list[dict]:
    filas = traer_todo(db.get_admin(), "asistentes_jornada", filtros=[("eq", ("jornada_id", jornada_id))])
    personas = {str(p["usuario_id"]): p for p in _por_id("perfiles", "usuario_id", sorted({str(a["usuario_id"]) for a in filas if a.get("usuario_id")}))}
    cursos = {str(c["id"]): c["nombre"] for c in _por_id("cursos", "id", sorted({str(p["curso_id"]) for p in personas.values() if p.get("curso_id")}))}
    salida = []
    for a in filas:
        p = personas.get(str(a.get("usuario_id"))) or {}
        salida.append({
            "id": str(a["id"]), "usuario_id": str(a["usuario_id"]) if a.get("usuario_id") else None,
            "nombre": p.get("nombre") or a.get("nombre_externo") or "—", "rol": a["rol"],
            "curso": cursos.get(str(p.get("curso_id"))) if p else None, "arboles_sembrados": a.get("arboles_sembrados"),
            "autoriza_certificado": bool(a.get("autoriza_certificado")), "autorizacion_registrada_en": a.get("autorizacion_registrada_en"),
        })
    orden = {"docente": 0, "estudiante": 1}
    return sorted(salida, key=lambda a: (orden.get(a["rol"], 2), a["curso"] or "", a["nombre"]))


@router.get("/jornadas/{jornada_id}/asistentes", response_model=list[AsistenteOut])
def ver_asistentes(jornada_id: UUID, perfil: Perfil = Depends(revisor_actual)):
    """Quiénes asistieron (con nombres): solo docentes de la institución y el administrador."""
    j = _uno("jornadas_siembra", str(jornada_id), "Jornada")
    _gestionar(perfil, j["institucion_id"])
    return _asistentes(str(jornada_id))


@router.put("/jornadas/{jornada_id}/asistentes", response_model=list[AsistenteOut])
def guardar_asistentes(jornada_id: UUID, d: AsistentesIn, perfil: Perfil = Depends(revisor_actual)):
    """Reemplaza la lista de asistentes. Marcar la autorización de un estudiante significa que el
    acudiente firmó la entrega de su nombre a la alcaldía; el soporte queda en la institución."""
    j = _uno("jornadas_siembra", str(jornada_id), "Jornada")
    _gestionar(perfil, j["institucion_id"])
    ids = [str(a.usuario_id) for a in d.asistentes if a.usuario_id]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=422, detail="Una persona aparece dos veces en la lista")
    personas = {str(p["usuario_id"]): p for p in _por_id("perfiles", "usuario_id", ids)}
    anteriores = {str(a.get("usuario_id") or a.get("nombre_externo")): a
                  for a in traer_todo(db.get_admin(), "asistentes_jornada", filtros=[("eq", ("jornada_id", str(jornada_id)))])}
    filas = []
    marca = ahora().isoformat()
    for a in d.asistentes:
        rol = a.rol
        if a.usuario_id:
            p = personas.get(str(a.usuario_id))
            if not p or p.get("institucion_id") != j["institucion_id"]:
                raise HTTPException(status_code=422, detail="Hay personas que no son de la institución")
            rol = "estudiante" if p["rol"] == "estudiante" else "docente"
        previa = anteriores.get(str(a.usuario_id or a.nombre_externo)) or {}
        ya_autorizada = bool(previa.get("autoriza_certificado"))
        filas.append({
            "jornada_id": str(jornada_id), "usuario_id": str(a.usuario_id) if a.usuario_id else None,
            "nombre_externo": a.nombre_externo, "rol": rol, "arboles_sembrados": a.arboles_sembrados,
            "autoriza_certificado": a.autoriza_certificado,
            "autorizacion_registrada_por": (previa.get("autorizacion_registrada_por") if ya_autorizada else perfil.usuario_id) if a.autoriza_certificado else None,
            "autorizacion_registrada_en": (previa.get("autorizacion_registrada_en") if ya_autorizada else marca) if a.autoriza_certificado else None,
        })
    admin = db.get_admin()
    admin.table("asistentes_jornada").delete().eq("jornada_id", str(jornada_id)).execute()
    if filas:
        admin.table("asistentes_jornada").insert(filas).execute()
    return _asistentes(str(jornada_id))


def _porcentaje(valor: float) -> str:
    return f"{valor:.1f}".replace(".", ",").replace(",0", "") + " %"


def lista_pdf(j: dict, institucion: str, incluidos: list[dict], sin_autorizacion: int, resumen: dict, generado: date) -> bytes:
    doc = Documento(f"Arbolado Escolar · Lista de asistentes · {j['nombre']}")
    doc.portada(f"Lista de asistentes · {j['nombre']}", f"{institucion} · {fecha_larga(date.fromisoformat(str(j['fecha'])[:10]))}")
    doc.campo("Lugar", j.get("lugar"))
    doc.campo("Organiza", ORGANIZADORES[j["organizador"]] + (f" · Patrocina: {j['patrocinador']}" if j.get("patrocinador") else ""))
    doc.campo("Jornada oficial", ("Sí" if j.get("oficial") else "No")
              + (f" · Área de Vida: {j['area_de_vida']}" if j.get("area_de_vida") else ""))
    nativas = f" ({_porcentaje(resumen['pct_nativas'])} de especies nativas)" if resumen.get("pct_nativas") is not None else ""
    doc.campo("Plántulas registradas en la app", f"{resumen['sembradas']}{nativas}, cada una con sus coordenadas.")
    doc.parrafo("La app no expide el certificado Siembra Vida Buen Ciudadano: lo expide la autoridad municipal con su registro "
                "de participantes en jornadas oficiales (Ley 2173 de 2021, art. 4, parágrafo 4).", tamano=9.5, color=(0.353, 0.384, 0.345))
    doc.seccion("Asistentes")
    filas = [[str(i), a["nombre"], ROLES[a["rol"]], a.get("curso") or "—",
              "—" if a.get("arboles_sembrados") is None else str(a["arboles_sembrados"]), "", ""]
             for i, a in enumerate(incluidos, start=1)]
    if filas:
        doc.tabla(["N.°", "Nombre", "Rol", "Curso", "Árboles", "Documento", "Firma"], filas, [0.06, 0.3, 0.12, 0.1, 0.1, 0.16, 0.16],
                  alto_minimo=26)
    else:
        doc.parrafo("No hay asistentes con autorización registrada.")
    if sin_autorizacion:
        doc.parrafo(f"{sin_autorizacion} {'persona más asistió' if sin_autorizacion == 1 else 'personas más asistieron'} y no "
                    f"{'está' if sin_autorizacion == 1 else 'están'} en la lista porque no hay autorización registrada para "
                    "entregar su nombre a la alcaldía (en menores de edad, la da el acudiente).", tamano=9.5)
    doc.parrafo("El documento de identidad lo escribe cada participante en este formato; la app no lo guarda.", tamano=9, color=(0.353, 0.384, 0.345))
    doc.firmas(["Docente responsable", "Representante de la alcaldía o autoridad ambiental"])
    return doc.pdf(f"Lista de asistentes · {j['nombre']}")


@router.post("/jornadas/{jornada_id}/lista", response_model=DescargaOut)
def lista_asistentes(jornada_id: UUID, d: ListaIn, perfil: Perfil = Depends(revisor_actual)):
    """Lista para la alcaldía (certificado Siembra Vida Buen Ciudadano): solo quienes tienen la
    autorización registrada; los demás se cuentan sin nombre."""
    jornadas, siembras, controles = _datos(jornada_id=str(jornada_id))
    j = jornadas[0]
    _gestionar(perfil, j["institucion_id"])
    todos = _asistentes(str(jornada_id))
    incluidos = [a for a in todos if a["autoriza_certificado"]]
    institucion = db.get_admin().table("instituciones").select("nombre").eq("id", j["institucion_id"]).execute().data[0]["nombre"]
    base = f"asistentes-{str(j['fecha'])[:10]}"
    if d.formato == "pdf":
        resumen = reglas.resumen(siembras, controles, _origenes(siembras, _especies()), hoy())
        contenido = lista_pdf(j, institucion, incluidos, len(todos) - len(incluidos), resumen, hoy())
        tipo, nombre = "application/pdf", f"{base}.pdf"
    else:
        campos = [Campo(n, n[:10].upper(), "texto", n) for n in ("nombre", "rol", "curso", "arboles_sembrados", "jornada", "fecha", "lugar", "institucion")]
        filas = [{"nombre": a["nombre"], "rol": ROLES[a["rol"]], "curso": a.get("curso"), "arboles_sembrados": a.get("arboles_sembrados"),
                  "jornada": j["nombre"], "fecha": str(j["fecha"])[:10], "lugar": j.get("lugar"), "institucion": institucion} for a in incluidos]
        contenido, tipo, nombre = exportacion.a_csv(filas, campos), "text/csv", f"{base}.csv"
    url = _subir(f"siembras/{perfil.usuario_id}/{jornada_id}.{d.formato}", contenido, tipo, nombre)
    return {"url": url, "nombre": nombre, "vence_en_segundos": VIGENCIA_ENLACE_S, "filas": len(incluidos)}


# ===================================== Resumen =====================================
@router.get("/resumen", response_model=ResumenGeneralOut)
def resumen(institucion_id: str | None = Query(None, max_length=64), perfil: Perfil = Depends(perfil_actual)):
    """Supervivencia total, por jornada y por sede, y los controles por hacer."""
    institucion = _institucion(perfil, institucion_id)
    jornadas, siembras, controles = _datos(institucion)
    por_jornada = reglas.agrupar(siembras, "jornada_id")
    por_sede = reglas.agrupar(siembras, "institucion_id")
    nombres_jornada = {str(j["id"]): j["nombre"] for j in jornadas}
    sedes = {str(i["id"]): i["nombre"] for i in db.get_admin().table("instituciones").select("id, nombre").execute().data}
    especies = _especies()
    origenes = _origenes(siembras, especies)
    por_id = {str(s["id"]): s for s in siembras}
    proximos = [
        {**p, "jornada": nombres_jornada.get(p["jornada_id"], "—"),
         "especie": (especies.get(str(por_id[p["siembra_id"]].get("especie_id"))) or {}).get("nombre_comun") or por_id[p["siembra_id"]].get("especie_otra") or "—"}
        for p in reglas.proximos(siembras, controles, hoy())
    ]
    return {
        "total": reglas.resumen(siembras, controles, origenes, hoy()),
        "por_jornada": [{"id": str(j["id"]), "nombre": j["nombre"], "fecha": j["fecha"],
                         "resumen": reglas.resumen(por_jornada.get(str(j["id"]), []), controles, origenes, hoy())}
                        for j in sorted(jornadas, key=lambda j: str(j["fecha"]), reverse=True)],
        "por_sede": [{"id": i, "nombre": sedes.get(i, i), "resumen": reglas.resumen(lista, controles, origenes, hoy())}
                     for i, lista in sorted(por_sede.items())],
        "proximos": proximos,
    }


# ===================================== Exportar =====================================
CAMPOS_SIEMBRAS: list[Campo] = [
    Campo("id", "ID", "texto", "Identificador de la plántula", largo=36),
    Campo("jornada", "JORNADA", "texto", "Nombre de la jornada de siembra"),
    Campo("fecha_siembra", "F_SIEMBRA", "fecha", "Fecha de siembra (AAAA-MM-DD)", largo=10),
    Campo("institucion", "INSTITUC", "texto", "Institución o sede"),
    Campo("especie", "ESPECIE", "texto", "Nombre común"),
    Campo("nombre_cientifico", "CIENTIF", "texto", "Nombre científico"),
    Campo("origen", "ORIGEN", "texto", "nativa, exotica o vacío si no está clasificada", largo=10),
    Campo("lat", "LAT", "numero", "Latitud WGS84", "grados", largo=12, decimales=7),
    Campo("lng", "LNG", "numero", "Longitud WGS84", "grados", largo=12, decimales=7),
    Campo("precision_gps_m", "PREC_GPS", "numero", "Precisión del GPS", "m", largo=8, decimales=1),
    Campo("vivero", "VIVERO", "texto", "Vivero de origen"),
    Campo("vivero_registro_ica", "REG_ICA", "texto", "Registro ICA del vivero", largo=40),
    Campo("padrino_tipo", "PADRINO_T", "texto", "Quién apadrina: curso, estudiante, docente, familia, empresa u otro", largo=12),
    Campo("padrino", "PADRINO", "texto", "Curso o empresa padrino (los nombres de personas no se exportan)"),
    Campo("estado", "ESTADO", "texto", "viva, muerta o sin_control según el último control", largo=12),
    Campo("ultimo_control", "ULT_CTRL", "fecha", "Fecha del último control", largo=10),
    *[Campo(f"control_{h}m", f"CTRL_{h}M", "texto", f"Estado en el control de los {h} meses", largo=14) for h in reglas.HITOS],
]


@router.post("/exportar", response_model=DescargaOut)
def exportar(d: ExportarIn, perfil: Perfil = Depends(revisor_actual)):
    """Plántulas en GeoJSON (para la base de datos geográfica de la alcaldía o la CAR) o CSV.
    No lleva nombres de personas."""
    if d.jornada_id:
        jornadas, siembras, controles = _datos(jornada_id=str(d.jornada_id))
        _ver(perfil, jornadas[0]["institucion_id"])
    else:
        jornadas, siembras, controles = _datos(_institucion(perfil, d.institucion_id))
    especies = _especies()
    nombres_jornada = {str(j["id"]): j["nombre"] for j in jornadas}
    sedes = {str(i["id"]): i["nombre"] for i in db.get_admin().table("instituciones").select("id, nombre").execute().data}
    cursos = {str(c["id"]): c["nombre"] for c in _por_id("cursos", "id", sorted({str(s["padrino_curso_id"]) for s in siembras if s.get("padrino_curso_id")}))}
    filas = []
    for s in sorted(siembras, key=lambda x: (str(x["fecha"]), str(x["id"]))):
        e = especies.get(str(s.get("especie_id"))) or {}
        propios = reglas._ordenados(controles.get(str(s["id"]), []))
        por_hito = {c.get("hito_meses"): c["estado"] for c in propios if c.get("hito_meses")}
        padrino = cursos.get(str(s.get("padrino_curso_id"))) if s["padrino_tipo"] == "curso" else (s.get("padrino_nombre") if s["padrino_tipo"] == "empresa" else None)
        filas.append({
            "id": str(s["id"]), "jornada": nombres_jornada.get(str(s["jornada_id"])), "fecha_siembra": str(s["fecha"])[:10],
            "institucion": sedes.get(str(s["institucion_id"])), "especie": e.get("nombre_comun") or s.get("especie_otra"),
            "nombre_cientifico": e.get("nombre_cientifico"), "origen": e.get("origen"), "lat": s["lat"], "lng": s["lng"],
            "precision_gps_m": s.get("precision_gps_m"), "vivero": s.get("vivero"), "vivero_registro_ica": s.get("vivero_registro_ica"),
            "padrino_tipo": s["padrino_tipo"], "padrino": padrino, "estado": reglas.estado_actual(propios),
            "ultimo_control": str(propios[-1]["fecha"])[:10] if propios else None,
            **{f"control_{h}m": por_hito.get(h) for h in reglas.HITOS},
        })
    if d.formato == "geojson":
        contenido, tipo, extension = exportacion.a_geojson(filas, CAMPOS_SIEMBRAS), "application/geo+json", "geojson"
    else:
        contenido, tipo, extension = exportacion.a_csv(filas, CAMPOS_SIEMBRAS), "text/csv", "csv"
    nombre = f"siembras-{hoy().isoformat()}.{extension}"
    url = _subir(f"siembras/{perfil.usuario_id}/plantulas.{extension}", contenido, tipo, nombre)
    return {"url": url, "nombre": nombre, "vence_en_segundos": VIGENCIA_ENLACE_S, "filas": len(filas)}
